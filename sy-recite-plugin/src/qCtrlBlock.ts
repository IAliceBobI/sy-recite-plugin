// □5（仿写上下文升级战役）单题就地对照——q-ctrl 控制块纯函数层（aiGradeBlock.ts 同构）。
// 设计拍板（handoff 2026-09-08-2022 □5 mini-spec）：入口=极简控制块，抽取时每题写位后插
// ;;;sy-recite-plugin/q-ctrl + 一行 JSON（tail-card 同款 id 引用形态，存储≈零；重抽跟
// 锚点/写位一起重建=幂等天然成立）。渲染器在 qCtrlRender.ts（本文件不 import extract，
// extract 反向 import 本文件做回填——避免循环依赖，anno-chat/ai-grade 家族同构分工）。
// 内核契约（exp/apirenew-report.md + 6811 实测 2026-09-08）：custom 块 DOM=
// data-type="NodeCustomBlock" + data-info="sy-recite-plugin/q-ctrl" + data-content=JSON，
// 事务 HTML 通道（BlockDOM2Tree）落盘围栏 kramdown 正确；content 含纯 ;;; 行拒写——
// JSON.stringify 单行天然满足。事务插入的块 id 一律被内核重生成（预挂 data-node-id
// 无效，两种 id 格式实测均被重置）——故控制块走「插后回填」拿真实锚点 id。
import { Constants } from "siyuan";
import { siyuan } from "../../sy-tomato-plugin/src/libs/siyuanApi";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { DomParaBuilder } from "../../sy-tomato-plugin/src/libs/sydom";
import { riffCardedIDs } from "./extractCore";
import { RECITE_NOTE, RECITE_KEEP, RECITE_HINT, RECITE_WRITTEN } from "./constants";

export const Q_CTRL_BLOCK_TYPE = "q-ctrl";
export const Q_CTRL_FENCE = ";;;sy-recite-plugin/q-ctrl";
/** data-info（内核 encodeCustomBlockInfo：encodeURIComponent 两段拼 /，本名无特殊字符即原样） */
const Q_CTRL_INFO = "sy-recite-plugin/q-ctrl";

export interface QCtrlData {
    v: 1;
    /** 锚点块 id（该题总结块，refs/题目都在它身上） */
    noteID: string;
}

export function buildQCtrlContent(noteID: string): string {
    return JSON.stringify({ v: 1, noteID });
}

/** 控制块宿主 HTML（事务 insert data 用）：DOM 构造让 outerHTML 自动转义 data-content 引号 */
export function buildQCtrlBlockDOM(noteID: string): string {
    const div = document.createElement("div");
    div.setAttribute("data-type", "NodeCustomBlock");
    div.setAttribute("data-info", Q_CTRL_INFO);
    div.setAttribute("data-content", buildQCtrlContent(noteID));
    return div.outerHTML;
}

/** 容错解析：坏 JSON/版本不符/noteID 缺失 → null（渲染层显占位） */
export function parseQCtrlContent(content: string): QCtrlData | null {
    let raw: unknown;
    try {
        raw = JSON.parse(content);
    } catch {
        return null;
    }
    if (typeof raw !== "object" || raw === null) return null;
    const o = raw as Record<string, unknown>;
    if (o.v !== 1 || typeof o.noteID !== "string" || !o.noteID.trim()) return null;
    return { v: 1, noteID: o.noteID };
}

/** readExtractDoc 的控制块判据：SQL/getChildBlocks 的 markdown 首行即围栏（6811 实测） */
export function isQCtrlMarkdown(markdown: string): boolean {
    return typeof markdown === "string" && markdown.startsWith(Q_CTRL_FENCE);
}

/** DOM 判据：块元素是否 q-ctrl 控制块宿主（writeZone 打标排除用） */
export function isQCtrlHost(el: Element): boolean {
    return !!el && el.getAttribute("data-type") === "NodeCustomBlock" && el.getAttribute("data-info") === Q_CTRL_INFO;
}

/** 最小注册面接口（siyuan 类型声明无 customBlockRenders，annoChatRender 同款结构化窄化） */
export interface CustomBlockPlugin {
    customBlockRenders?: Record<string, unknown>;
    i18n?: Record<string, string>;
}

let pluginRef: CustomBlockPlugin | null = null;

/** qCtrlRender 注册渲染器时回填 pluginRef（特性检测/i18n 共用，aiGradeRender 同款模式） */
export function markQCtrlPlugin(plugin: CustomBlockPlugin): void {
    pluginRef = plugin;
}

/** 特性检测：3.8.3+ 且渲染器已注册（回填判据；旧内核=围栏原文一行，不回填） */
export function supportsQCtrlBlock(): boolean {
    try {
        const renders = pluginRef?.customBlockRenders;
        return !!renders && typeof renders[Q_CTRL_BLOCK_TYPE] === "object";
    } catch {
        return false;
    }
}

/**
 * 回填区间扫描纯函数（backfillQCtrlBlocks 核心，单测面）：顶层块的 note/keep/hint 属性序列 →
 * 每题 [锚点id, 区间末块id]。区间末=锚点到下一锚点（或文末）之间最后一个非 keep/hint 块——
 * 抽取时刻即写位（空写位是区间末块；多行题续行在锚点后不破坏判定）；keep 段与 hint（卷子里
 * 的未升格提示，□2）在组前/组间/文末属区间外不挪落点（判定顺序 keep/hint 先，与
 * readExtractDoc 一致消灭未来分叉点，review P2-5）。
 * 锚点后无普通块（理论不发生——units 每题带写位）跳过该题。
 */
export function qCtrlAnchorTails(props: { id: string; note?: string | null; keep?: string | null; hint?: string | null; written?: string | null }[]): [string, string][] {
    const pairs: [string, string][] = [];
    let noteID: string | null = null;
    let tailID: string | null = null;
    const flush = () => {
        if (noteID && tailID) pairs.push([noteID, tailID]);
        noteID = null;
        tailID = null;
    };
    props.forEach(p => {
        if (p.keep || p.hint || p.written) return; // keep/hint/written：区间外不挪落点（三处同判）
        if (p.note) { flush(); noteID = p.id; } // 锚点：开新题（自己不算写位）
        else tailID = p.id;                     // 普通块（写位/复述/续行）：刷新区间末
    });
    flush();
    return pairs;
}

/**
 * 回填控制块：文档建成读真实锚点 id（事务插入的块 id 一律被内核重生成，前向引用拿不到），
 * 逐题在写位后插控制块（qCtrlAnchorTails 定位）。IAL 走 cache-first batchGetBlockAttrs
 * （identifyNotes 同源：文档刚建完 SQL ial 列有秒级索引窗）。单事务批量插。
 * 返回 [noteID, 壳块id][]（壳盘 id 取自事务响应 doOperations[].id，与 pairs 同序——
 * ws 回声上屏的壳 DOM 无 data-node-id，调用方按 noteID 对位补 id 修 delete 失明，
 * 2026-09-14 按钮叠影）；无题/失败返回空数组。
 */
export async function backfillQCtrlBlocks(extractID: string): Promise<[string, string][]> {
    if (!supportsQCtrlBlock()) return []; // 旧内核：不回填（围栏形态可接受）
    const children = await siyuan.getChildBlocks(extractID).catch(() => []);
    if (!children.length) return [];
    const ials = await siyuan.batchGetBlockAttrs(children.map(c => c.id)).catch(() => null);
    if (!ials) return [];
    const pairs = qCtrlAnchorTails(children.map(c => {
        const ial = ials[c.id] ?? {};
        return { id: c.id, note: ial[RECITE_NOTE], keep: ial[RECITE_KEEP], hint: ial[RECITE_HINT], written: ial[RECITE_WRITTEN] };
    }));
    const ops: IOperation[] = pairs.flatMap(([noteID, tailID]) =>
        siyuan.transInsertBlocksAfter([buildQCtrlBlockDOM(noteID)], tailID));
    if (ops.length) {
        // siyuan.call 内核拒绝只返回 null 不 reject（仓内已知）——判空防「日志说回填了
        // 实际被吞」的假成功（review P2-2）
        const r = await siyuan.transactions(ops).catch(e => {
            debugLog("recite.q_ctrl", `backfill tx failed: ${e}`, "recite");
            return null;
        });
        if (!r) {
            debugLog("recite.q_ctrl", `backfill tx rejected extract=${extractID.slice(-8)} units=${ops.length}`, "recite");
            return [];
        }
        const ids = ((r as any[])[0]?.doOperations ?? []).map((o: any) => o?.id);
        // 事务中途回滚的响应仍带已填的悬空 id（内核 code 恒 0，review P2-2）——数量对
        // 不上弃整轮映射：宁可不修视图，不把不存在的块 id 补进 DOM
        if (ids.length !== ops.length) {
            debugLog("recite.q_ctrl", `backfill ids mismatch extract=${extractID.slice(-8)} ops=${ops.length} ids=${ids.length}（弃映射）`, "recite");
            return [];
        }
        const done = pairs.map(([noteID], i) => [noteID, ids[i]] as [string, string]).filter(([, id]) => !!id);
        debugLog("recite.q_ctrl", `backfill extract=${extractID.slice(-8)} blocks=${children.length} units=${ops.length} ids=${done.length}`, "recite");
        return done;
    }
    debugLog("recite.q_ctrl", `backfill extract=${extractID.slice(-8)} blocks=${children.length} units=0`, "recite");
    return [];
}

/**
 * 单题清空区间纯函数（□5 清空钮，2026-09-14）：noteID 锚点后到下一锚点（或文末）间的
 * 普通块=该题写位内容，整组删除即「清空重写」。keep/hint/written/q-ctrl 与
 * qCtrlAnchorTails / extractEntries 同判保留——语境、提示、控制块是卷面结构不是复述
 * （控制块被拖到别题区间也只认 fence 判据，不误删）。判序刻意与 extractEntries 不同：
 * note 先判再 keep——note+keep 双属性脏数据时按锚点封口（keep 先判会让区间吞穿下一题
 * = 过度删除，破坏性方向取保守），勿「对齐」改回。wrote=区间内有无非空内容（全空
 * 空写位=无可清，调用方提示不空转不发事务）；found=false=锚点不在流中（被删/标记被清/
 * 被裹进容器块），调用方按定位失败处理。
 */
export function qCtrlClearPlan(
    props: { id: string; markdown?: string | null; note?: string | null; keep?: string | null; hint?: string | null; written?: string | null }[],
    noteID: string,
): { deleteIDs: string[]; wrote: boolean; found: boolean } {
    const i = props.findIndex(p => p.id === noteID && !!p.note);
    if (i < 0) return { deleteIDs: [], wrote: false, found: false };
    const deleteIDs: string[] = [];
    let wrote = false;
    for (let j = i + 1; j < props.length; j++) {
        const p = props[j];
        if (p.note) break;                              // 下一锚点：区间封口（先于 keep，保守方向）
        if (p.keep || p.hint || p.written) continue;    // 卷面结构块：语境/提示/练习时写的
        if (isQCtrlMarkdown(p.markdown ?? "")) continue;
        deleteIDs.push(p.id);
        if ((p.markdown ?? "").replaceAll("\u200b", "").trim()) wrote = true; // 空块零宽空格显式滤
    }
    return { deleteIDs, wrote, found: true };
}

/**
 * 单题清空编排（□5，2026-09-14）：删该题区间普通块 + 锚点后重插一个空写位段——单事务
 * 原子成型（insert 锚定锚点、delete 收尾，与 unitReplaceOps 同款顺序），空写位=
 * DomParaBuilder 与抽取建卷同款形态。删前对被删块摘快速卡组卡（unCardChildren 同语义：
 * 块级卡孤儿防护；用户手动加进别的卡组的卡不动；文档级卡挂文档块不经子块流，天然不受
 * 影响）。读数走 getChildBlocks+getRows+batchGetBlockAttrs（readExtractDoc 同款通道；markdown
 * 树通道优先防索引窗，见函数体内注；IAL cache-first 防 SQL 索引延迟假旧值）。返回删除块数；
 * -1=定位/事务失败（调用方提示重试），0=区间无内容无可清。
 */
export async function clearQCtrlRegion(noteID: string): Promise<number> {
    const info = await siyuan.getBlockInfo(noteID).catch(() => null);
    if (!info?.rootID) return -1;
    const children = await siyuan.getChildBlocks(info.rootID).catch(() => []);
    if (!children.length) return -1;
    const ids = children.map(c => c.id);
    const rows = await siyuan.getRows(ids, "markdown", true, [], true).catch(() => null);
    const ials = await siyuan.batchGetBlockAttrs(ids).catch(() => null);
    // markdown 树通道优先（getChildBlocks 自带、免 SQL 索引延迟）：fence 判定与 wrote 判定
    // 都押在这里——SQL 行缺失窗内新插的 q-ctrl 块会判漏（fence 拿空串→误删控制块）、刚打
    // 完字的答案块会假阴性（toast「还没写」但内容在）。树字段旧内核缺失时落 SQL 兜底。
    const plan = qCtrlClearPlan(children.map((c, i) => ({
        id: c.id,
        markdown: c.markdown ?? rows?.[i]?.markdown ?? "",
        note: ials?.[c.id]?.[RECITE_NOTE],
        keep: ials?.[c.id]?.[RECITE_KEEP],
        hint: ials?.[c.id]?.[RECITE_HINT],
        written: ials?.[c.id]?.[RECITE_WRITTEN],
    })), noteID);
    if (!plan.found) return -1; // 锚点被删/标记被清/裹进容器块：定位失败，非「还没写」
    if (!plan.wrote) return 0;
    // 破坏性删前复核（IAL 读通道闪烁防护，09-14 remind □2 纪律）：deleteIDs 任一块复核出
    // note/keep/hint/written → 中止——首读闪空会把下一锚点/语境块误收进删除集
    const recheck = await siyuan.batchGetBlockAttrs(plan.deleteIDs).catch(() => null);
    if (recheck && plan.deleteIDs.some(id =>
        recheck[id]?.[RECITE_NOTE] || recheck[id]?.[RECITE_KEEP] || recheck[id]?.[RECITE_HINT] || recheck[id]?.[RECITE_WRITTEN])) {
        debugLog("recite.q_ctrl", `clear recheck mismatch note=${noteID.slice(-8)} — abort`, "recite");
        return -1;
    }
    const carded = riffCardedIDs(plan.deleteIDs, ials, Constants.QUICK_DECK_ID);
    if (carded.length) {
        // 摘卡与换写位事务非原子（replaceUnitsInPlace 同款取舍已备案：窗口极窄、仅子块级
        // 卡受影响、孤儿由内核惰性过滤兜底）
        const r = await siyuan.removeRiffCards(carded, Constants.QUICK_DECK_ID).catch(() => null);
        if (!r) debugLog("recite.q_ctrl", `clear riff remove no-echo blocks=${carded.length}（惰性过滤兜底）`, "recite");
    }
    const ops: IOperation[] = [
        ...siyuan.transInsertBlocksAfter([new DomParaBuilder().html()], noteID),
        ...siyuan.transDeleteBlocks(plan.deleteIDs),
    ];
    const ret = await siyuan.transactions(ops).catch(e => {
        debugLog("recite.q_ctrl", `clear tx failed: ${e}`, "recite");
        return null;
    });
    if (!ret) {
        debugLog("recite.q_ctrl", `clear tx rejected note=${noteID.slice(-8)} blocks=${plan.deleteIDs.length}`, "recite");
        return -1;
    }
    debugLog("recite.q_ctrl", `clear note=${noteID.slice(-8)} blocks=${plan.deleteIDs.length} carded=${carded.length}`, "recite");
    return plan.deleteIDs.length;
}
