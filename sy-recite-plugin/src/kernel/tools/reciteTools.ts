// recite MCP 工具实现（□3）：单工具 recite + action 枚举。查询免费（read_origin/
// list_exercises/get_grade/pro_status/echo），build_drill=Pro（按能力收费不分通道，
// 与 UI 的 AI 拆分同锁）。装配序列=□2 设计定稿：dry 校验零副作用 → 进仿写模式（仅未进时）
// → 删旧 AI 锚点插新锚 → 抽取文档单事务重建；幂等=整场重建（对齐 aiSplit 重跑+doExtract
// 单例删建既有语义）。
import { objectSchema, successResponse, errorResponse, wrapHandler, type ToolDefinition } from "./common";
import * as api from "../api";
import { checkRecitePro, proGuidance, readSettings } from "../activation";
import { groupNotes, originBlocksForGroups, keepBlocksForGroups, noteFitsHeading, derivedTitle, noteHeadingLevel, type ReciteBlock } from "../../extractCore";
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
const EXTRACT_TITLE = "抽取";
const AI_GRADE_FENCE = ";;;sy-recite-plugin/ai-grade";
const AI_SLUGS = ["recite", "imitate", "direction"];

type Attrs = Record<string, string>;

/** 读原文顶层流（文档序）：批注=无 old 标记且非空；AI 锚点单独归类；同 identifyNotes 判据 */
async function readStream(docID: string): Promise<ReciteBlock[]> {
    const children = await api.getChildBlocks(docID);
    const rows = await api.rowsById(children.map(c => c.id), "markdown");
    const ials = await api.batchGetBlockAttrs(children.map(c => c.id)).catch(() => null);
    return children.map(c => {
        const ial: Attrs = ials?.[c.id] ?? {};
        const markdown = rows.get(c.id)?.markdown ?? "";
        return {
            id: c.id,
            markdown,
            isNote: !ial[R_OLD] && !!markdown.trim(),
            isKeep: !!ial[R_KEEP],
            isTarget: !!ial[R_TARGET],
        };
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
        else if (b.isTarget) kind = "target";
        else if (!docAttrs[R_START]) kind = "original"; // 未进仿写模式：批注概念尚不存在，全显原文
        else if (b.isNote) kind = "note";
        else if (!b.markdown.trim()) kind = "empty";
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
    // 靶块文档走节选语义（前端 doExtractTargeted 分叉），kernel v1 不装配——原地拒绝
    if (children.some(c => ials[c.id]?.[R_TARGET])) {
        return errorResponse("该文档含「这段练」靶块（节选语义），暂不支持 MCP 装配，请在原文档前端抽取");
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
        const remain = children.slice(0, end).map(c => c.id);
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
            stream.push({ id: a.id, markdown: a.text, isNote: true });
        }
    };
    for (const c of children) {
        if (deletedSet.has(c.id)) continue;
        const ial: Attrs = ials[c.id] ?? {};
        const markdown = rows.get(c.id)?.markdown ?? "";
        // 本调用进过模式 → 基线块全部刚打上 old 标（批注身份只剩新锚点）；未进则用干相属性
        stream.push({
            id: c.id,
            markdown,
            isNote: enteredPractice ? false : !ial[R_OLD] && !!markdown.trim(),
            isKeep: !!ial[R_KEEP],
        });
        pushAnchorsOf(c.id);
    }
    // 挂在流首之前（after 指向首块前不存在——被重定向到 ""）的锚点兜底追加到流尾
    (anchorsByKey.get("") ?? []).forEach(a => stream.push({ id: a.id, markdown: a.text, isNote: true }));
    const groups = groupNotes(stream);
    if (!groups.length) return errorResponse("锚点插入后未识别到批注（异常状态，请 read_origin 检查）");
    const origins = originBlocksForGroups(stream, groups);
    const keeps = keepBlocksForGroups(stream, groups);
    const settings = await readSettings();
    const noteLevel = noteHeadingLevel(settings);
    // units 与回显 id 的配对记录：note 单元需要二轮挂 note/refs 属性
    const noteUnits: { refs: string }[] = [];
    const units: string[] = [];
    groups.forEach((g, gi) => {
        for (const k of keeps[gi]) {
            units.push(paraHTML(k.markdown, api.newNodeID()));
            noteUnits.push(null);
        }
        const md = g.blocks.map(b => b.markdown).join("\n");
        units.push(noteFitsHeading(md)
            ? headingHTML(md, noteLevel, api.newNodeID())
            : paraHTML(md, api.newNodeID()));
        noteUnits.push({ refs: origins[gi].map(b => b.id).join(",") });
        units.push(emptyParaHTML(api.newNodeID()));
        noteUnits.push(null);
    });
    for (const k of keeps[keeps.length - 1]) {
        units.push(paraHTML(k.markdown, api.newNodeID()));
        noteUnits.push(null);
    }

    const originInfo = await api.getBlockInfo(originID);
    const hpath = originInfo?.box ? await api.getHPathByID(originID, originInfo.box) : "";
    if (!originInfo?.box || !hpath) return errorResponse("未取到原文位置信息（请重试）");
    // 旧抽取子文档单例删除（连对比子树）；同名占用递增后缀（findReciteChildDoc 同语义）
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
    if (oldID) await api.removeDocByID(oldID);
    const extractID = await api.createDocWithMd(originInfo.box, `${hpath}/${name}`, "");
    const seed = (await api.getChildBlocks(extractID))[0]?.id;
    // 反序逐条 previousID=seed → 最终顺序=units 文档序；同事务删种子（insertUnitsDoc 同构）
    const ops: api.IOperation[] = units.slice().reverse().map(data => ({ action: "insert", data, previousID: seed }));
    if (seed) ops.push({ action: "delete", id: seed });
    else ops.splice(0, ops.length, ...units.map(data => ({ action: "insert", data, parentID: extractID })));
    const echoed = await api.transactions(ops);
    // 回显 id 与 units 对位：echoed 按提交序（=units 反序）返回 insert op 的真实块 id
    const realIDs = echoed.slice(0, units.length).map(op => op.id ?? "");
    const ordered = realIDs.slice().reverse(); // 还原文档序
    const attrOps = [] as api.IOperation[];
    noteUnits.forEach((nu, i) => {
        if (nu && ordered[i]) {
            attrOps.push({
                action: "setAttrs", id: ordered[i],
                data: JSON.stringify({ [R_NOTE]: "1", [R_REFS]: nu.refs }),
            });
        }
    });
    if (attrOps.length) await api.transactions(attrOps);
    await api.setBlockAttrs(extractID, { [R_EXTRACT]: originID });

    await siyuan.logger.info(`[kernel] build_drill origin=${originID} mode=${mode} inserted=${inserted.length} failed=${failed} skipped=${skipped} units=${groups.length} extract=${extractID} entered=${enteredPractice}`);
    return successResponse({
        originID,
        extractID,
        mode,
        anchorsInserted: inserted.length,
        anchorsFailed: failed,
        anchorsSkipped: skipped,
        practiceUnits: groups.length,
        enteredPractice,
        hint: "练习现场装配完成：抽取文档已重建，写位为空。对比/AI 判卷在前端抽取文档照常使用。",
    });
}

function localTS(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

const reciteDescription = [
    "仿写练习（读后重写训练）：读文档结构、查询练习与判卷数据、一键装配练习现场。",
    "典型流程：① read_origin 读原文顶层块流（含块 id 与既有锚点）→ 自行通读理解、按叙事节拍设计锚点",
    "→ ② build_drill 传入锚点数组装配现场（原文进仿写模式+插锚点+重建抽取文档）→ 用户在抽取文档写复述",
    "→ 前端对比/AI 判卷 → ③ get_grade 查判卷结果做精评。锚点文风三选一（mode）：recite=节拍名+关键词",
    "（不写完整句）；imitate=技法讲解；direction=剧情一句+情绪走向。查询全部免费；build_drill 是 Pro 能力，",
    "未激活时返回引导文案（可转述用户）。日期类参数支持 'today' 语义值。",
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
