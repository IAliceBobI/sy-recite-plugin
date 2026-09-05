import type { Plugin } from "siyuan";
import { Dialog } from "siyuan";
import { mount, unmount } from "svelte";
import { newID } from "stonev5-utils";
import { siyuan } from "../../sy-tomato-plugin/src/libs/siyuanApi";
import { DestroyManager } from "../../sy-tomato-plugin/src/libs/destroyer";
import { events } from "../../sy-tomato-plugin/src/libs/Events";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { RECITE_EXTRACT, RECITE_COMPARE } from "./constants";
import { readExtractDoc, fetchOriginMarkdown, isAssociation } from "./extract";
import DiffDialog from "./DiffDialog.svelte";

/**
 * 默写查错（2026-08-26，机器 diff 弹窗）：与 AI 判卷分工——机器管逐字（错/漏/多），
 * AI 管语义与结构。抽取/对比浮条「默写查错」→ 复用 readExtractDoc + fetchOriginMarkdown
 * 实时取「原文 vs 复述」，手写 LCS（零新依赖；句级几十~几百字 O(n·m) 足够快）逐字（中文）
 * /逐词（英文）比对，行级按句读切分对齐，弹插件自渲染 Dialog（不写任何内容进文档，即看即走）。
 * 视觉口径：原文行绿下划线 = 原文有而复述没写对/漏写的；复述行红删除线 = 写错的/多余的；
 * 标点差异降级轻标（古诗词字对标点不同不算错，不计入统计，相似度也只按内容 token 算）。
 */

// ---------- 文本清洗与分词 ----------

/** markdown 装饰剥壳（链接取文字、== ** * ~~ ` 剥壳、换行并空格），diff 只看纯文本 */
function md2plain(md: string): string {
    return md
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/(\*\*|==|~~|\*|`)/g, "")
        .replace(/\n+/g, " ")
        .trim();
}

const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const PUNCT_SET = new Set("，。、；：？！…—～·,.!?;:「」『』“”‘’\"'（）()《》〈〉【】[]{}");
/** 句读切行集（中文逗号句号/英文句点及同级）：equal 流里遇到即断行，两列自然对齐 */
const BREAK_SET = new Set("。！？；，、：,.!?;:");

type TokenKind = "content" | "punct" | "space";
type DiffToken = { text: string; kind: TokenKind };

/** 分词：中文按字、拉丁连续串按词（含内部撇号外的所有非标点非空白字符）、标点单字、空白成段 */
function tokenize(text: string): DiffToken[] {
    const tokens: DiffToken[] = [];
    let i = 0;
    while (i < text.length) {
        const ch = text[i];
        if (/\s/.test(ch)) {
            let j = i + 1;
            while (j < text.length && /\s/.test(text[j])) j++;
            tokens.push({ text: text.slice(i, j), kind: "space" });
            i = j;
        } else if (PUNCT_SET.has(ch)) {
            tokens.push({ text: ch, kind: "punct" });
            i++;
        } else if (CJK_RE.test(ch)) {
            tokens.push({ text: ch, kind: "content" });
            i++;
        } else {
            let j = i + 1;
            while (j < text.length && !/\s/.test(text[j]) && !PUNCT_SET.has(text[j]) && !CJK_RE.test(text[j])) j++;
            tokens.push({ text: text.slice(i, j), kind: "content" });
            i = j;
        }
    }
    return tokens;
}

// ---------- LCS diff（手写，零依赖）----------

type RawOp = { type: "match" | "del" | "ins"; ai: number; bi: number };

/** 标准 LCS 回溯出 match/del/ins 原始流（dp 后缀表自尾向头，走表方向输出编辑脚本） */
function walkLCS(A: DiffToken[], B: DiffToken[]): RawOp[] {
    const n = A.length, m = B.length;
    const w = m + 1;
    const dp = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            dp[i * w + j] = A[i].text === B[j].text
                ? dp[(i + 1) * w + j + 1] + 1
                : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
        }
    }
    const ops: RawOp[] = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
        if (A[i].text === B[j].text) {
            ops.push({ type: "match", ai: i, bi: j });
            i++; j++;
        } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) {
            ops.push({ type: "del", ai: i, bi: -1 });
            i++;
        } else {
            ops.push({ type: "ins", ai: -1, bi: j });
            j++;
        }
    }
    for (; i < n; i++) ops.push({ type: "del", ai: i, bi: -1 });
    for (; j < m; j++) ops.push({ type: "ins", ai: -1, bi: j });
    return ops;
}

// ---------- 面向渲染的数据模型 ----------

/** cls：eq=一致；miss=原文行绿下划线（漏写/被写错的正确字）；wrong=复述行红删除线（写错/多余）；punct=标点差异降级轻标 */
export type DiffSpan = { text: string; cls: "eq" | "miss" | "wrong" | "punct" };
export type DiffLine = { a: DiffSpan[]; b: DiffSpan[]; dirty: boolean }; // dirty=行内有内容级差异→微黄底
export type DiffEntryView = { note: string; lines: DiffLine[]; association?: boolean }; // association=联想题：只展示不统计
export type DiffSummary = { diffs: number; wrong: number; miss: number; extra: number; similarity: number }; // 相似度 0-100

type DiffOp =
    | { type: "equal"; tokens: DiffToken[] }
    | { type: "wrong"; a: DiffToken[]; b: DiffToken[] } // 成对替换（写错）
    | { type: "missing"; tokens: DiffToken[] }          // 原文有复述没有（漏写）
    | { type: "extra"; tokens: DiffToken[] };           // 复述有原文没有（多余）

/**
 * 单题 diff：origin/write 纯文本 → 行对齐渲染模型 + 统计。行切分在 diff 之后（按 equal 流里
 * 的句读断行），整句漏写时自然落成「原文行满绿、复述行空」的对齐行，不存在按序号配对错位问题。
 * matched/total = 内容 token 的匹配数/总数（标点不计），供多题汇总算总相似度。
 */
export function diffText(origin: string, write: string): { lines: DiffLine[]; summary: DiffSummary; matched: number; total: number } {
    const A = tokenize(origin);
    const B = tokenize(write);
    const raw = walkLCS(A, B);

    // 原始流合并：del/ins 相邻游程按位配对成 wrong（写错），剩余归 missing/extra
    const ops: DiffOp[] = [];
    let dels: DiffToken[] = [], inss: DiffToken[] = [];
    let eq: DiffToken[] = [];
    const flushDiff = () => {
        const pairs = Math.min(dels.length, inss.length);
        for (let k = 0; k < pairs; k++) ops.push({ type: "wrong", a: [dels[k]], b: [inss[k]] });
        if (dels.length > pairs) ops.push({ type: "missing", tokens: dels.slice(pairs) });
        if (inss.length > pairs) ops.push({ type: "extra", tokens: inss.slice(pairs) });
        dels = []; inss = [];
    };
    const flushEq = () => {
        if (eq.length) {
            ops.push({ type: "equal", tokens: eq });
            eq = [];
        }
    };
    raw.forEach(op => {
        if (op.type === "match") {
            flushDiff(); // 悬挂的 del/ins 先落盘，保住操作序
            eq.push(A[op.ai]);
        } else if (op.type === "del") {
            flushEq();
            dels.push(A[op.ai]);
        } else {
            flushEq();
            inss.push(B[op.bi]);
        }
    });
    flushEq();
    flushDiff();

    // 统计（标点不计入错/漏/多与相似度）
    const contentCount = (t: DiffToken[]) => t.reduce((n, x) => n + (x.kind === "content" ? 1 : 0), 0);
    const hasContent = (t: DiffToken[]) => t.some(x => x.kind === "content");
    let matched = 0, totalA = 0, totalB = 0, wrong = 0, miss = 0, extra = 0;
    A.forEach(t => { if (t.kind === "content") totalA++; });
    B.forEach(t => { if (t.kind === "content") totalB++; });
    ops.forEach(op => {
        if (op.type === "equal") matched += contentCount(op.tokens);
        else if (op.type === "wrong") {
            if (hasContent(op.a) || hasContent(op.b)) wrong++;
        } else if (op.type === "missing") miss += contentCount(op.tokens);
        else extra += contentCount(op.tokens);
    });

    // 行分组：equal 流按句读断行；相邻同 cls span 合并减少 DOM
    const lines: DiffLine[] = [];
    let aSpans: DiffSpan[] = [], bSpans: DiffSpan[] = [];
    let dirty = false;
    const addA = (s: DiffSpan) => {
        const last = aSpans[aSpans.length - 1];
        if (last && last.cls === s.cls) last.text += s.text;
        else aSpans.push(s);
    };
    const addB = (s: DiffSpan) => {
        const last = bSpans[bSpans.length - 1];
        if (last && last.cls === s.cls) last.text += s.text;
        else bSpans.push(s);
    };
    const closeLine = () => {
        if (!aSpans.length && !bSpans.length) return;
        lines.push({ a: aSpans, b: bSpans, dirty });
        aSpans = []; bSpans = []; dirty = false;
    };
    ops.forEach(op => {
        if (op.type === "equal") {
            op.tokens.forEach(tok => {
                addA({ text: tok.text, cls: "eq" });
                addB({ text: tok.text, cls: "eq" });
                if (tok.kind === "punct" && BREAK_SET.has(tok.text)) closeLine();
            });
        } else if (op.type === "wrong") {
            const ca = hasContent(op.a), cb = hasContent(op.b);
            addA({ text: op.a.map(t => t.text).join(""), cls: ca ? "miss" : "punct" });
            addB({ text: op.b.map(t => t.text).join(""), cls: cb ? "wrong" : "punct" });
            if (ca || cb) dirty = true;
        } else if (op.type === "missing") {
            const c = hasContent(op.tokens);
            addA({ text: op.tokens.map(t => t.text).join(""), cls: c ? "miss" : "punct" });
            if (c) dirty = true;
        } else {
            const c = hasContent(op.tokens);
            addB({ text: op.tokens.map(t => t.text).join(""), cls: c ? "wrong" : "punct" });
            if (c) dirty = true;
        }
    });
    closeLine();

    return {
        lines,
        summary: { diffs: wrong + miss + extra, wrong, miss, extra,
            similarity: totalA + totalB ? Math.min(100, Math.round((200 * matched) / (totalA + totalB))) : 100 },
        matched,
        total: totalA + totalB,
    };
}

// ---------- 弹窗入口（浮条按钮调用）----------

/**
 * 默写查错弹窗（抽取/对比浮条两处入口，docID 二义解析同 copyPrompt/aiGrade）：
 * 全部题目的原复述汇总成视图模型后一次性弹 Dialog；无复述不弹窗只提示。
 * Dialog 挂载照 Settings.openHelp 既有模式（Dialog + DestroyManager + mount，Esc/遮罩关闭）。
 */
export async function openDiffCheck(plugin: Plugin, docID: string) {
    if (!docID) return;
    let attrs = await siyuan.getBlockAttrs(docID);
    if (attrs?.[RECITE_COMPARE]) { // 对比文档浮条入口：跳到抽取文档取数据
        docID = attrs[RECITE_COMPARE];
        attrs = await siyuan.getBlockAttrs(docID);
    }
    if (!attrs?.[RECITE_EXTRACT]) {
        await siyuan.pushMsg("请在抽取/对比文档中点击「默写查错」", 2500);
        return;
    }
    const entries = await readExtractDoc(docID);
    if (!entries.length) {
        await siyuan.pushMsg("抽取文档里没有批注（旧版布局请先「重新写」）", 3000);
        return;
    }
    if (!entries.some(e => e.writes.length)) {
        const t: any = plugin?.i18n ?? {};
        await siyuan.pushMsg(t["查错·先写提示"] || "抽取文档里还没有复述，写完再查", 3000);
        return;
    }
    const views: DiffEntryView[] = [];
    let gWrong = 0, gMiss = 0, gExtra = 0, gMatched = 0, gTotal = 0;
    for (const e of entries) {
        // 联想题：自由联想写作无逐字比对——保留题号与题目展示、不跑 diff 不进统计（查错语义只属还原型练法）
        if (isAssociation(e.noteMarkdown)) {
            views.push({ note: md2plain(e.noteMarkdown), lines: [], association: true });
            continue;
        }
        const origin = (await fetchOriginMarkdown(e.refs)).map(md2plain).join(" ");
        const write = e.writes.map(w => md2plain(w.markdown)).join(" ");
        const r = diffText(origin, write);
        views.push({ note: md2plain(e.noteMarkdown), lines: r.lines });
        gWrong += r.summary.wrong;
        gMiss += r.summary.miss;
        gExtra += r.summary.extra;
        gMatched += r.matched;
        gTotal += r.total;
    }
    const summary: DiffSummary = {
        diffs: gWrong + gMiss + gExtra,
        wrong: gWrong, miss: gMiss, extra: gExtra,
        similarity: gTotal ? Math.min(100, Math.round((200 * gMatched) / gTotal)) : 100,
    };
    const t: any = plugin?.i18n ?? {};
    const dm = new DestroyManager();
    const host = newID();
    const dialog = new Dialog({
        title: t["默写查错"] || "默写查错",
        content: `<div id="${host}" style="height:100%"></div>`,
        width: events.isMobile ? "92vw" : "880px",
        height: events.isMobile ? "78vh" : "80vh",
        destroyCallback: () => dm.destroyBy("dialog"),
    });
    const comp = mount(DiffDialog, {
        target: dialog.element.querySelector("#" + host),
        props: { plugin, entries: views, summary },
    });
    dm.add("dialog", () => dialog.destroy());
    dm.add("svelte", () => unmount(comp));
    debugLog("recite.diffCheck", `extract=${docID} entries=${views.length} diffs=${summary.diffs} sim=${summary.similarity}`, "recite");
}
