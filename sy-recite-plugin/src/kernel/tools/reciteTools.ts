// recite MCP 工具实现（□3）：单工具 recite + action 枚举。查询免费（read_origin/
// list_exercises/get_grade/pro_status/echo），build_drill=Pro（按能力收费不分通道，
// 与 UI 的 AI 拆分同锁）。装配序列：dry 校验零副作用 → 进仿写模式（仅未进时）→ 删旧
// AI 锚点插新锚 → 节内打靶（锚点认领节标 R_TARGET，□2 统一出卷：锚点配考核段才成题）
// → 抽取文档重建（extractSpans 与前端共用；有旧=卷级原地更新保闪卡进度）；幂等=整场
// 重建（对齐 aiSplit 重跑+doExtract 卷级原地更新既有语义，2026-09-14 起同款）。
import { objectSchema, successResponse, errorResponse, wrapHandler, type ToolDefinition } from "./common";
import * as api from "../api";
import { checkRecitePro, proGuidance, readSettings } from "../activation";
import { extractSpans, contextBlocksToTarget, noteFitsHeading, derivedTitle, noteHeadingLevel, toReciteBlock, riffCardedIDs, unitReplaceOps, type ReciteBlock } from "../../extractCore";
import { parseAiGradeContent } from "../../aiGradeBlock";
import { paraHTML, emptyParaHTML, headingHTML } from "../blockHTML";

// IAL 身份键（spec 源=src/constants.ts「数据模型」节，勿改名——跨轮次识别只认 IAL；
// constants.ts 经 winHotkey 拽前端依赖链，kernel 侧本地声明同名值）
const R_START = "custom-recite-start";
const R_OLD = "custom-recite-old";
const R_EXTRACT = "custom-recite-extract";
const R_COMPARE = "custom-recite-compare";
const R_KEEP = "custom-recite-keep";
const R_NOTE = "custom-recite-note";
const R_REFS = "custom-recite-refs";
const R_AI = "custom-recite-ai";
const R_TARGET = "custom-recite-target";
const R_HINT = "custom-recite-hint";
const R_EMPTY = "custom-recite-empty-note";
const R_WRITTEN = "custom-recite-written";
const EXTRACT_TITLE = "抽取";
// 快速卡组 id（=siyuan 包 Constants.QUICK_DECK_ID，20230218211946-2kw8jgx；kernel 侧无
// 包常量通道本地声明同值——前端 FloatBar 制卡判态/摘卡同款）。摘卡传它=只摘快速卡组
const QUICK_DECK_ID = "20230218211946-2kw8jgx";
// 空锚点占位文案（kernel 无 i18n 通道——提示文案中文现状，同本文件 hint 字段）：落库纯视觉，
// readExtractDoc 出口按 R_EMPTY 属性归一空串，判卷走纯默写
const EMPTY_NOTE_TEXT = "（无提示 · 凭记忆默写）";
const AI_GRADE_FENCE = ";;;sy-recite-plugin/ai-grade";
const AI_SLUGS = ["recite", "imitate", "direction"];

type Attrs = Record<string, string>;

/** 读原文顶层流（文档序）：□1 起统一 toReciteBlock 三角色判定（与前端 identifyNotes 同源）；AI 锚点单独归类 */
async function readStream(docID: string): Promise<ReciteBlock[]> {
    const children = await api.getChildBlocks(docID);
    const rows = await api.rowsById(children.map(c => c.id), "markdown");
    const ials = await api.batchGetBlockAttrs(children.map(c => c.id)).catch(() => null);
    return children.map(c => {
        const ial: Attrs = ials?.[c.id] ?? {};
        return toReciteBlock(c.id, rows.get(c.id)?.markdown ?? "", {
            isOld: !!ial[R_OLD],
            isKeep: !!ial[R_KEEP],
            isTarget: !!ial[R_TARGET],
        });
    });
}

async function readOrigin(input: Record<string, any>) {
    const docID = String(input.docID ?? "");
    if (!docID) return errorResponse("docID 必填：要读的原文档块 id");
    const info = await api.getBlockInfo(docID);
    if (!info?.rootID) return errorResponse("文档不存在（docID 非文档块 id？）");
    const docAttrs = await api.getBlockAttrs(docID);
    const stream = await readStream(docID);
    const ials = await api.batchGetBlockAttrs(stream.map(b => b.id)).catch(() => ({} as Record<string, Attrs>));
    const blocks = stream.map((b, i) => {
        const aiSlug = ials[b.id]?.[R_AI];
        let kind = "original";
        if (AI_SLUGS.includes(aiSlug)) kind = "ai-anchor";
        else if (b.role === "target") kind = "target";
        else if (!docAttrs[R_START]) kind = "original"; // 未进仿写模式：批注概念尚不存在，全显原文
        else if (b.role === "summary") kind = "note";
        else if (b.role === "none") kind = "empty";
        else kind = b.isOld ? "original" : "context"; // 上下文角色：存量=原文；挂 keep 的新写块=用户点名进语境
        return {
            index: i + 1,
            id: b.id,
            markdown: b.markdown.length > 500 ? b.markdown.slice(0, 500) + "…" : b.markdown,
            kind,
            ...(kind === "ai-anchor" ? { mode: aiSlug } : {}),
        };
    });
    return successResponse({
        docID,
        title: info.rootTitle ?? "",
        inPractice: !!docAttrs[R_START],
        hasTargets: stream.some(b => b.isTarget),
        blocks,
    });
}

async function listExercises() {
    const rows = await api.sql(`SELECT id, box, hpath, ial, updated FROM blocks WHERE type='d' AND ial LIKE '%${R_EXTRACT}="%' LIMIT 1000`);
    const items = [];
    for (const r of rows) {
        const m = (r.ial ?? "").match(new RegExp(`${R_EXTRACT}="([^"]+)"`));
        if (!m) continue;
        items.push({ originID: m[1], extractID: r.id, extractHpath: r.hpath ?? "", updated: r.updated ?? "" });
    }
    if (items.length) {
        const origins = await api.rowsById(items.map(i => i.originID), "content");
        items.forEach(i => { i.originTitle = origins.get(i.originID)?.content ?? ""; });
    }
    return successResponse({ exercises: items });
}

/** 入参三态自适应：origin/extract/compare 文档 id 均可 → 返回该练习场的判卷结果列表 */
async function getGrade(input: Record<string, any>) {
    const docID = String(input.docID ?? "");
    if (!docID) return errorResponse("docID 必填：原文/抽取/对比文档 id 均可");
    const attrs = await api.getBlockAttrs(docID);
    let compareID = "";
    if (attrs[R_COMPARE]) {
        // 入参即对比文档
        compareID = docID;
    } else {
        // origin 或抽取文档 → 先定位抽取文档，再找其对比子文档
        const extractID = attrs[R_EXTRACT] ? docID : await findDerivedDocID(docID);
        if (!extractID) return successResponse({ grades: [], note: "未找到练习抽取文档（还没有装配过练习现场）" });
        compareID = await findDerivedDocID(extractID, R_COMPARE);
        if (!compareID) return successResponse({ grades: [], note: "还没有对比文档（对比后判卷结果才会落盘）" });
    }
    const children = await api.getChildBlocks(compareID);
    const rows = await api.rowsById(children.map(c => c.id), "markdown");
    const grades = [];
    for (const c of children) {
        const md = rows.get(c.id)?.markdown ?? "";
        if (!md.startsWith(AI_GRADE_FENCE)) continue;
        // custom 块 SQL markdown 三行式：首行 fence+JSON 行+尾行闭合 ;;;（多余尾巴带进 JSON.parse 必炸 Extra data）
        const lines = md.split("\n");
        const body = lines[lines.length - 1].trim() === ";;;" ? lines.slice(1, -1) : lines.slice(1);
        const d = parseAiGradeContent(body.join("\n").trim());
        if (d) grades.push({ tone: d.tone, ts: d.ts, pose: d.pose ?? null, missed: d.missed ?? [], text: d.text });
    }
    return successResponse({ grades });
}

/** 找 parentID 的衍生子文档（attr=value 相认），无则 null——findReciteChildDoc 的 kernel 版 */
async function findDerivedDocID(parentID: string, attr: string = R_EXTRACT): Promise<string | null> {
    const info = await api.getBlockInfo(parentID);
    if (!info?.box || !info?.path) return null;
    const files = await api.listDocsByPath(info.box, info.path);
    for (const f of files) {
        const a = await api.getBlockAttrs(f.id).catch(() => null);
        if (a?.[attr] === parentID) return f.id;
    }
    return null;
}

async function buildDrill(input: Record<string, any>) {
    // ── Pro 门（按能力收费不分通道：与 UI AI 拆分同锁；unpaid 返回 AI 可转述的引导）──
    const pro = await checkRecitePro();
    if (!pro.paid) {
        return {
            success: false,
            error: proGuidance(pro.reason),
            data: { needActivation: true, reason: pro.reason },
        };
    }
    // ── dry 校验（全量入参，零副作用）──
    const originID = String(input.originID ?? "");
    const mode = String(input.mode ?? "");
    if (!originID) return errorResponse("originID 必填：练习原文档的块 id");
    if (!AI_SLUGS.includes(mode)) return errorResponse(`mode 必须是 ${AI_SLUGS.join("/")}（复述/仿写/方向三文风）`);
    const rawAnchors = Array.isArray(input.anchors) ? input.anchors : [];
    if (!rawAnchors.length) return errorResponse("anchors 必填：[{after: 原文块id, text: 锚点文本}]，先 read_origin 拿顶层块 id");
    const info = await api.getBlockInfo(originID);
    if (!info?.rootID) return errorResponse("原文档不存在（originID 非文档块 id？）");
    const docAttrs = await api.getBlockAttrs(originID);
    if (docAttrs[R_EXTRACT] || docAttrs[R_COMPARE]) {
        return errorResponse("抽取/对比文档是练习产物，不能再作为练习原文");
    }
    const children = await api.getChildBlocks(originID);
    const childIds = new Set(children.map(c => c.id));
    const rows = await api.rowsById(children.map(c => c.id), "markdown");
    const ials = await api.batchGetBlockAttrs(children.map(c => c.id)).catch(() => ({} as Record<string, Attrs>));
    // 含手打靶块的文档不做 MCP 装配（装配=全新现场：考核布局由锚点认领节决定，与用户手打靶
    // 语义交叠）——原地拒绝，请在原文档前端抽取
    if (children.some(c => ials[c.id]?.[R_TARGET])) {
        return errorResponse("该文档已手打「这段练」考核段，暂不支持 MCP 装配（请清除靶标后重试，或在原文档前端抽取）");
    }
    const seen = new Set<string>();
    const anchors: { after: string; text: string }[] = [];
    let skipped = 0;
    for (const a of rawAnchors) {
        const after = String(a?.after ?? "");
        const text = String(a?.text ?? "").trim();
        if (!childIds.has(after) || !text || seen.has(after + "\u0000" + text)) { skipped++; continue; }
        seen.add(after + "\u0000" + text);
        anchors.push({ after, text });
    }
    if (!anchors.length) return errorResponse("没有有效锚点：after 必须是原文档当前顶层块 id（先 read_origin），text 非空");

    // ── 进仿写模式（仅未进时；重打会把批注错标成原文）──
    let enteredPractice = false;
    let empties: string[] = [];
    if (!docAttrs[R_START]) {
        let end = children.length;
        while (end > 0) {
            const md = rows.get(children[end - 1].id)?.markdown;
            if (md == null || md.trim()) break; // 拿不到 markdown 的块不碰，只删明确空串的
            end--;
        }
        empties = children.slice(end).map(c => c.id);
        if (empties.length) await api.transactions(empties.map(id => ({ action: "delete", id })));
        // written 块（前端温和退出标记的「练习时写的字」）跳过不打 old——保持总结身份、
        // 练习连续（与前端 enterPractice 同语义，防两处漂移；多轮装配场景 written 块常在）
        const remain = children.slice(0, end).filter(c => !ials[c.id]?.[R_WRITTEN]).map(c => c.id);
        if (remain.length) {
            await api.transactions(remain.map(id => ({ action: "setAttrs", id, data: JSON.stringify({ [R_OLD]: "1" }) })));
        }
        await api.setBlockAttrs(originID, { [R_START]: localTS() });
        enteredPractice = true;
    }

    // ── 删旧 AI 锚点（只认 custom-recite-ai 三模式值，手写批注永不动）──
    const oldAI = children.filter(c => AI_SLUGS.includes(ials[c.id]?.[R_AI])).map(c => c.id);
    if (oldAI.length) await api.transactions(oldAI.map(id => ({ action: "delete", id })));

    // ── 插新锚点（markdown 通道预置 id 被认领；同 after 多条链式顺插）──
    const inserted: { id: string; after: string; text: string }[] = [];
    let failed = 0;
    let prevAfter = "";
    let prevID = "";
    for (const a of anchors) {
        const target = a.after === prevAfter ? prevID : a.after;
        const id = await api.insertBlockAfter(`${a.text}\n{: id="${api.newNodeID()}"}`, target, "markdown").catch(() => "");
        if (id) {
            inserted.push({ id, after: a.after, text: a.text });
            prevAfter = a.after;
            prevID = id;
        } else {
            failed++;
        }
    }
    if (!inserted.length) {
        return errorResponse("锚点块插入全部失败（请重试或检查原文档状态）");
    }
    // 属性统一后挂（防打 custom 标记后 ~2s 内 insertBlock 竞态继承）：标模式 + 清 old（锚点是批注身份）
    await api.transactions(inserted.map(a => ({
        action: "setAttrs", id: a.id,
        data: JSON.stringify({ [R_AI]: mode, [R_OLD]: "" }),
    })));

    // ── 抽取流自构造（勿走 SQL 重读——刚插的块索引未落，markdown 读空会把新锚点看成非批注，
    // 2026-09-09 6808 实锤）：干相基线（children/markdown/ials）+ 本调用已知变更确定性推演 ──
    const deletedSet = new Set<string>(oldAI);
    if (enteredPractice) empties.forEach(id => deletedSet.add(id)); // 进模式时删过的尾部空块
    // 被删块（旧 AI 锚/尾部空块）上再挂锚=重定向到其前面最近的保留块（用户意图的位置近似）
    const retarget = new Map<string, string>();
    let lastKeepID = "";
    for (const c of children) {
        if (deletedSet.has(c.id)) { retarget.set(c.id, lastKeepID); continue; }
        lastKeepID = c.id;
    }
    const anchorsByKey = new Map<string, { id: string; text: string }[]>();
    for (const a of inserted) {
        const key = retarget.get(a.after) ?? a.after;
        if (!anchorsByKey.has(key)) anchorsByKey.set(key, []);
        anchorsByKey.get(key).push({ id: a.id, text: a.text });
    }
    const stream: ReciteBlock[] = [];
    const pushAnchorsOf = (baseID: string) => {
        for (const a of anchorsByKey.get(baseID) ?? []) {
            stream.push(toReciteBlock(a.id, a.text, {})); // AI 锚点=批注（总结角色）
        }
    };
    for (const c of children) {
        if (deletedSet.has(c.id)) continue;
        const ial: Attrs = ials[c.id] ?? {};
        const markdown = rows.get(c.id)?.markdown ?? "";
        // 本调用进过模式 → 基线块全部刚打上 old 标（批注身份只剩新锚点）；未进则用干相属性
        stream.push(toReciteBlock(c.id, markdown, {
            isOld: enteredPractice ? !ial[R_WRITTEN] : !!ial[R_OLD],
            isKeep: !!ial[R_KEEP],
        }));
        pushAnchorsOf(c.id);
    }
    // 挂在流首之前（after 指向首块前不存在——被重定向到 ""）的锚点兜底追加到流尾
    (anchorsByKey.get("") ?? []).forEach(a => stream.push(toReciteBlock(a.id, a.text, {})));

    // ── 节内打靶（□2 统一出卷：锚点要成题，须「考核段末后紧邻提示」配对）──
    // 锚点认领节=文首到最后一个锚定块：节内 context 块（原文，含 keep）打 R_TARGET（锚点插
    // 在锚定块紧后=段末后第一个块，配对成立）；手写批注不打（保持提示身份，卷里 hint 照抄）；
    // 最后一个锚定块之后的尾部原文不认领（照抄进卷尾——旧整篇语义末组吞尾 refs 的 hack 退役）
    const anchorAfterIDs = new Set([...anchorsByKey.keys()].filter(k => k));
    const targetIDs = new Set(contextBlocksToTarget(stream, anchorAfterIDs));
    if (targetIDs.size) {
        await api.transactions([...targetIDs].map(id => ({
            action: "setAttrs", id, data: JSON.stringify({ [R_TARGET]: "1", [R_KEEP]: "" }),
        })));
    }
    const marked = stream.map(b => targetIDs.has(b.id)
        ? { ...b, isTarget: true, role: "target" as const } : b);

    // ── 统一装配（extractSpans 与前端 doExtract 共用一份，防两处漂移）──
    const { spans, emptyNoteCount } = extractSpans(marked);
    const unitCount = spans.filter(s => s.kind === "unit").length;
    if (!unitCount) return errorResponse("认领节内没有可考核的原文块：锚点的 after 须指向原文块（指向总结/批注块认领不到考核内容）");
    const settings = await readSettings();
    const noteLevel = noteHeadingLevel(settings);
    // units 与回显 id 的配对记录：二轮挂 note/refs/keep/hint（事务插入的块 id 恒被内核重生成）
    type UnitAttr = { kind: "keep" } | { kind: "hint" } | { kind: "note"; refs: string; empty: boolean };
    const noteUnits: (UnitAttr | null)[] = [];
    const units: string[] = [];
    for (const span of spans) {
        if (span.kind === "copy" || span.kind === "hint") {
            for (const b of span.blocks) {
                units.push(paraHTML(b.markdown, api.newNodeID()));
                noteUnits.push(span.kind === "copy" ? { kind: "keep" } : { kind: "hint" });
            }
        } else {
            // 空锚点（notes 空，防御形态）：占位文案 heading + R_EMPTY 标记——前端 readExtractDoc
            // 出口归一空串，判卷走纯默写（与 doExtract 同数据契约）
            const text = span.notes.map(b => b.markdown).join("\n") || EMPTY_NOTE_TEXT;
            units.push(noteFitsHeading(text)
                ? headingHTML(text, noteLevel, api.newNodeID())
                : paraHTML(text, api.newNodeID()));
            noteUnits.push({ kind: "note", refs: span.targets.map(b => b.id).join(","), empty: !span.notes.length });
            units.push(emptyParaHTML(api.newNodeID()));
            noteUnits.push(null);
        }
    }

    const originInfo = await api.getBlockInfo(originID);
    const hpath = originInfo?.box ? await api.getHPathByID(originID, originInfo.box) : "";
    if (!originInfo?.box || !hpath) return errorResponse("未取到原文位置信息（请重试）");
    // ── 抽取文档重建：有旧=卷级原地更新（2026-09-14 闪卡继承，与前端 rebuildExtractDoc
    // 同语义防分叉）——清空子块重插新单元，文档块 id 不变 → 文档级卡与 FSRS 进度自动在；
    // 挂过卡的子块（用户手动加进抽取卷的卡；判卷块级卡在对比文档，其重建另有摘卡）先摘
    // 快速卡组防孤儿；对比子文档不再连带删（自管重建，旧保留无害——判卷结果保留上一轮，
    // 重新对比后覆盖）。无旧=建新（既有行为）。同名占用递增后缀 ──
    const files = await api.listDocsByPath(originInfo.box, originInfo.path);
    let oldID = "";
    let name = derivedTitle(EXTRACT_TITLE, originInfo.rootTitle ?? "");
    const occupants = new Map(files.map(f => [f.name, f.id]));
    for (const f of files) {
        const a = await api.getBlockAttrs(f.id).catch(() => null);
        if (a?.[R_EXTRACT] === originID) oldID = f.id;
    }
    for (let i = 1; i < 10; i++) {
        const occ = occupants.get(name);
        if (!occ || occ === oldID) break;
        name = `${derivedTitle(EXTRACT_TITLE, originInfo.rootTitle ?? "")}${i + 1}`;
    }
    let extractID: string;
    let echoed: api.IOperation[];
    if (oldID) {
        const oldChildren = await api.getChildBlocks(oldID);
        const oldIals = await api.batchGetBlockAttrs(oldChildren.map(c => c.id)).catch(() => ({} as Record<string, Attrs>));
        const carded = riffCardedIDs(oldChildren.map(c => c.id), oldIals, QUICK_DECK_ID);
        if (carded.length) await api.removeRiffCards(carded, QUICK_DECK_ID);
        // 单事务原子换卷：新单元锚首块插入+删全部旧子块（unitReplaceOps 与前端共用，
        // reverse 保 units 文档序；空文档防御=parentID 头插）
        echoed = await api.transactions(unitReplaceOps(units, oldChildren[0]?.id, oldID, oldChildren.map(c => c.id)));
        extractID = oldID;
        await syncExtractTitle(oldID, name); // 标题跟随（原文改名后重装配）
    } else {
        extractID = await api.createDocWithMd(originInfo.box, `${hpath}/${name}`, "");
        const seed = (await api.getChildBlocks(extractID))[0]?.id;
        // 同事务插单元+删种子（unitReplaceOps 与前端 insertUnitsDoc 共用）
        echoed = await api.transactions(unitReplaceOps(units, seed, extractID, seed ? [seed] : []));
    }
    // 回显 id 与 units 对位：原地事务混有 delete op，按 action 过滤只取 insert 的真实块 id
    //（回显按提交序=units 反序）；reverse 还原文档序
    const realIDs = echoed.filter(op => op.action === "insert").map(op => op.id ?? "");
    const ordered = realIDs.slice().reverse(); // 还原文档序
    const attrOps = [] as api.IOperation[];
    ordered.forEach((id, i) => {
        const nu = noteUnits[i];
        if (!nu || !id) return;
        // keep/hint 照抄块挂各自标记（readExtractDoc/writeZone/q-ctrl 据此隔离，不进复述——
        // 修复老装配 keep 照抄裸块被误读成 writes 卷进对比的既有 bug）；note 锚点挂 refs
        //（+R_EMPTY 空锚点标记）
        const attrs: Attrs = {};
        if (nu.kind === "keep") attrs[R_KEEP] = "1";
        else if (nu.kind === "hint") attrs[R_HINT] = "1";
        else {
            attrs[R_NOTE] = "1";
            attrs[R_REFS] = nu.refs;
            if (nu.empty) attrs[R_EMPTY] = "1";
        }
        attrOps.push({ action: "setAttrs", id, data: JSON.stringify(attrs) });
    });
    if (attrOps.length) await api.transactions(attrOps);
    await api.setBlockAttrs(extractID, { [R_EXTRACT]: originID });

    await siyuan.logger.info(`[kernel] build_drill origin=${originID} mode=${mode} inserted=${inserted.length} failed=${failed} skipped=${skipped} targets=${targetIDs.size} units=${unitCount} emptyNotes=${emptyNoteCount} extract=${extractID} rebuild=${oldID ? "inPlace" : "create"} entered=${enteredPractice}`);
    return successResponse({
        originID,
        extractID,
        mode,
        anchorsInserted: inserted.length,
        anchorsFailed: failed,
        anchorsSkipped: skipped,
        targetsMarked: targetIDs.size,
        practiceUnits: unitCount,
        emptyNotes: emptyNoteCount,
        enteredPractice,
        hint: "练习现场装配完成：锚点认领节已标记考核段、抽取文档已重建，写位为空。对比/AI 判卷在前端抽取文档照常使用；点「重新写」可补齐每题的单题对照面板。注意：本轮未重新对比前，get_grade 返回的是上一轮判卷结果。",
    });
}

function localTS(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** 原地更新后标题跟随：现名≠期望名（调用方已保证不撞名）时 rename——原删建路径自动
 *  带新标题，保留文档本体后需显式跟（与前端 extract.ts syncExtractTitle 同语义） */
async function syncExtractTitle(docID: string, wanted: string) {
    if (!wanted) return;
    const info = await api.getBlockInfo(docID).catch(() => null);
    if (info?.box && info.path && info.rootTitle !== wanted) {
        await api.renameDoc(info.box, info.path, wanted);
    }
}

const reciteDescription = [
    "仿写练习（读后重写训练）：读文档结构、查询练习与判卷数据、一键装配练习现场。",
    "典型流程：① read_origin 读原文顶层块流（含块 id 与既有锚点）→ 自行通读理解、按叙事节拍设计锚点",
    "→ ② build_drill 传入锚点数组装配练习现场（原文进仿写模式+锚点认领节自动标记考核段+重建抽取文档）",
    "→ 用户在抽取文档写复述 → 前端对比/AI 判卷 → ③ get_grade 查判卷结果做精评。锚点文风三选一（mode）：recite=节拍名+关键词",
    "（不写完整句）；imitate=技法讲解；direction=剧情一句+情绪走向。查询全部免费；build_drill 是 Pro 能力，",
    "未激活时返回引导文案（可转述用户）。日期类参数支持 'today' 语义值。",
    "read_origin 的 kind 词表：original=存量原文 / context=用户点名保留的新写块（照抄进卷不参与考核；",
    "build_drill 装配时锚点认领节内的原文块（含 context）会被标记为考核段，介意者调整锚点位置）",
    " / target=用户圈定的考核段 / note=用户写的总结 / ai-anchor=插件旧锚点 / empty=空块。",
].join("");

export function createReciteTool(): ToolDefinition {
    return {
        name: "recite",
        config: objectSchema(reciteDescription, {
            action: {
                type: "string",
                enum: ["read_origin", "list_exercises", "get_grade", "build_drill", "pro_status", "echo"],
                description: "read_origin=读原文顶层块流（拿块 id/既有锚点）；list_exercises=列全部练习现场；get_grade=查判卷结果；build_drill=装配练习现场（Pro）；pro_status=查激活态；echo=通道自检",
            },
            docID: {
                type: "string",
                description: "read_origin/get_grade 用：文档块 id（get_grade 接受原文/抽取/对比任一）",
            },
            originID: {
                type: "string",
                description: "build_drill 用：练习原文档块 id",
            },
            mode: {
                type: "string",
                enum: AI_SLUGS,
                description: "build_drill 锚点文风：recite=复述（节拍+关键词）/imitate=仿写（技法）/direction=方向（剧情+情绪）",
            },
            anchors: {
                type: "array",
                description: "build_drill 用：[{after: 原文顶层块 id（锚点插它后面）, text: 锚点文本}]，5~15 个为宜",
                items: {
                    type: "object",
                    properties: {
                        after: { type: "string", description: "锚点插到其后的原文块 id（read_origin 的 blocks[].id）" },
                        text: { type: "string", description: "锚点文本（按 mode 文风；不引原句）" },
                    },
                    required: ["after", "text"],
                },
            },
            message: {
                type: "string",
                description: "echo 用：回显文本，可省略",
            },
        }, ["action"]),
        handler: wrapHandler(async input => {
            switch (String(input.action ?? "")) {
                case "echo":
                    return successResponse({ echo: typeof input.message === "string" ? input.message : "pong", plugin: "sy-recite-plugin" });
                case "pro_status": {
                    const pro = await checkRecitePro();
                    return successResponse({ paid: pro.paid, reason: pro.reason });
                }
                case "read_origin": return await readOrigin(input);
                case "list_exercises": return await listExercises();
                case "get_grade": return await getGrade(input);
                case "build_drill": return await buildDrill(input);
                default:
                    return errorResponse(`未知 action：${input.action}（可用：read_origin/list_exercises/get_grade/build_drill/pro_status/echo）`);
            }
        }),
    };
}
