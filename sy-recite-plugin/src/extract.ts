import type { Plugin } from "siyuan";
import { siyuan } from "../../sy-tomato-plugin/src/libs/siyuanApi";
import { OpenSyFile2 } from "../../sy-tomato-plugin/src/libs/navUtils";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { DomParaBuilder, md2Divs } from "../../sy-tomato-plugin/src/libs/sydom";
import { RECITE_START, RECITE_EXTRACT, RECITE_NOTE, RECITE_REFS, RECITE_OLD, RECITE_KEEP, RECITE_TARGET, RECITE_COMPARE, EXTRACT_TITLE } from "./constants";
import { backfillQCtrlBlocks, isQCtrlMarkdown } from "./qCtrlBlock";
// 结构层纯函数在 extractCore.ts（与 kernel 侧共用一份，2026-09-09 recite MCP □3 抽出）
import {
    groupNotes, originBlocksForGroups, keepBlocksForGroups,
    noteFitsHeading, derivedTitle, noteHeadingLevel,
} from "./extractCore";
import type { ReciteBlock } from "./extractCore";

// 老消费方（compare/RecConfPractice 等）仍从本文件取这些名字——re-export 保导入路径不破
export {
    groupNotes, originBlocksForGroups, keepBlocksForGroups,
    noteFitsHeading, derivedTitle, noteHeadingLevel,
} from "./extractCore";
export type { ReciteBlock, NoteGroup } from "./extractCore";
export type ExtractEntry = {
    noteID: string;
    noteMarkdown: string;
    refs: string[];           // 溯源锚（原文块 id），对比/判卷时实时回查（原文改了拿新文，删了占位标注）
    writes: { id: string; markdown: string }[]; // 总结块后的非空块（复述；写位空块占位不进）
};

/**
 * 联想题判据（联想练习，2026-08-26）：批注以「联想：」开头（全/半角冒号均可，兼容英文
 * idea:），其后任写题目词，如「联想：树 · 安全带 · 考试」。只认前缀不解析词表——批注原样
 * 进对比左栏与判卷【题目】，词义的理解交给 AI。抽取流程对联想题零改动（批注就是批注），
 * 语义分叉只在下游三个消费方：对比左栏=题目（compare）、默写查错只展示不统计（diffCheck，
 * 自由写作无逐字比对）、判卷走联想级 rubric（promptCopy）。
 */
const ASSOC_NOTE_RE = /^(联想|idea)\s*[:：]/i;
export function isAssociation(noteMarkdown: string): boolean {
    // 剥 heading 前缀（review P1-2，2026-09-08）：单行批注自 v1.2.3 默认 heading 化，
    // SQL markdown 带 `###### ` 前缀——不剥则 heading 形态的联想锚点在 compare/diffCheck/
    // 判卷/提示词四消费方全部误判普通题（存量潜伏 bug，□5 面板与对比文档左右分叉暴露）
    return ASSOC_NOTE_RE.test(noteMarkdown.trimStart().replace(/^#{1,6}\s+/, ""));
}

/**
 * 按文档序取原文顶层块流（getChildBlocks 保文档序）。批注 = 无 custom-recite-old 原文标记
 * 且内容非空的块（与 CSS 染色判据同源；空块——打了回车没写字——不算批注，不进抽取文档）
 */
export async function identifyNotes(originID: string): Promise<ReciteBlock[]> {
    const children = await siyuan.getChildBlocks(originID);
    const rows = await siyuan.getRows(children.map(c => c.id), "markdown", true, [], true);
    // IAL 走 cache-first 属性 API 而非 SQL ial 列（reasoning review P1-2，2026-09-08）：
    // setBlockAttrs 返回前同步刷内核 IAL 缓存，blocks 表 ial 列却走异步索引队列（秒级窗）。
    // 期2 靶属性是抽取的模式开关（有靶→节选），SQL 读旧值会让刚打的靶静默回落整篇语义；
    // markdown 走 SQL 无此问题（块内容不经属性写入路径）
    const ials = await siyuan.batchGetBlockAttrs(children.map(c => c.id)).catch(() => null);
    return children.map((c, i) => {
        const ial = ials?.[c.id] ?? {};
        const markdown = rows[i]?.markdown ?? "";
        return {
            id: c.id,
            markdown,
            isNote: !ial[RECITE_OLD] && !!markdown.trim(),
            isKeep: !!ial[RECITE_KEEP],
            isTarget: !!ial[RECITE_TARGET],
        };
    });
}

/**
 * 每组 refs（原文溯源块）切片等结构判定见 extractCore.ts（groupNotes/originBlocksForGroups/
 * keepBlocksForGroups/noteFitsHeading/derivedTitle/noteHeadingLevel，与 kernel 共用）。
 */
/**
 * 节选语义靶整流切分（期2「这段练」，2026-09-08）：stream 含靶块时抽取文档的构建蓝图。
 * 模式隐式路由——靶的存在本身就是模式声明（无显式档位）：
 * - 连续靶块（滤空流上相邻）聚为一段；段配对 = 紧邻认领：段末后第一个非空块必须是批注
 *   （其后连续批注聚组，与整篇语义 groupNotes 同构）；首块是老原文/下一靶即无主——
 *   不越过原文去找远处的批注（那是别的段落的，「这段练」自动插的空总结位紧邻段末）；
 * - 配对段原位换 [锚点+写位]（锚点文本=批注组 markdown、refs=靶段块 id），配对批注不照抄；
 * - 其余非空块照抄（含 keep/未配对批注/无主靶段）——doExtract 渲染时统一挂 RECITE_KEEP
 *   （上下文块单一概念：不挂会被 readExtractDoc 误读成 writes 卷进对比）；
 * - 无主靶段照常显示不隐藏、不插写位；orphanCount 供「N 个靶还没有总结批注」提示。
 */
export type TargetSpan =
    | { kind: "copy"; blocks: ReciteBlock[] }
    | { kind: "unit"; targets: ReciteBlock[]; notes: ReciteBlock[] };

export function targetSpans(stream: ReciteBlock[]): { spans: TargetSpan[]; orphanCount: number } {
    const s = stream.filter(b => b.markdown.trim()); // 空块滤除与整篇语义同源
    // 靶段切分：滤空流上连续 isTarget 聚段（一次「这段练」多选/多块=一段；分两次打的相邻靶天然合并）
    const segs: { start: number; end: number }[] = [];
    for (let i = 0; i < s.length; i++) {
        if (s[i].isTarget) {
            const start = i;
            while (i < s.length && s[i].isTarget) i++;
            segs.push({ start, end: i - 1 });
        }
    }
    // 配对：窗口 = (段末, 下一段首) / (末段末, 文末)，取窗口内第一个批注并向后续到批注组末
    const paired = new Map<number, ReciteBlock[]>();
    let orphanCount = 0;
    segs.forEach((seg, gi) => {
        const winEnd = gi + 1 < segs.length ? segs[gi + 1].start : s.length;
        const notes: ReciteBlock[] = [];
        for (let j = seg.end + 1; j < winEnd && s[j].isNote; j++) notes.push(s[j]);
        if (notes.length) paired.set(gi, notes);
        else orphanCount++;
    });
    // 整流：照抄段与 [锚点+写位] 单元按文档序排布；配对批注跳过（已变锚点本体）
    const skipNote = new Set<string>();
    paired.forEach(notes => notes.forEach(n => skipNote.add(n.id)));
    const segOf: number[] = [];
    segs.forEach((seg, gi) => { for (let j = seg.start; j <= seg.end; j++) segOf[j] = gi; });
    const spans: TargetSpan[] = [];
    let copyBuf: ReciteBlock[] = [];
    const flush = () => {
        if (copyBuf.length) spans.push({ kind: "copy", blocks: copyBuf });
        copyBuf = [];
    };
    for (let j = 0; j < s.length; j++) {
        const gi = segOf[j] ?? -1;
        if (gi >= 0) {
            if (!paired.has(gi)) copyBuf.push(s[j]); // 无主靶：照常照抄不隐藏
            else if (j === segs[gi].end) {           // 配对段原位（段末）换 [锚点+写位]
                flush();
                spans.push({ kind: "unit", targets: s.slice(segs[gi].start, segs[gi].end + 1), notes: paired.get(gi) });
            }
        } else if (!skipNote.has(s[j].id)) {
            copyBuf.push(s[j]); // keep/未配对批注/老原文：照抄挂 keep
        }
    }
    flush();
    return { spans, orphanCount };
}

/**
 * 列父文档直接子文档（listDocsByPath 走文件树，无 SQL 索引延迟——快速连点也找得到上一轮
 * 刚建的文档），逐个 getBlockAttrs（直读 .sy IAL）验 attr=value。子文档通常个位数，N+1 可接受。
 */
async function findChildByIAL(box: string, parentPath: string, attr: string, value: string): Promise<{ id: string | null; files: RetListDocsByPathFile[] }> {
    const ret = await siyuan.listDocsByPath(box, parentPath).catch(() => null);
    const files = ret?.files ?? [];
    for (const f of files) {
        const attrs = await siyuan.getBlockAttrs(f.id).catch(() => null);
        if (attrs?.[attr] === value) return { id: f.id, files };
    }
    return { id: null, files };
}

/**
 * 找属于本插件（attr=value）的衍生子文档，返回 { id: 我们的旧文档 id（无则 null）, hpath: 可用的新建 hpath }。
 * 身份只认 IAL（value=原文/抽取文档 id，全局唯一）——标题带原文标题后缀会随原文改名/命名方案
 * 改版漂移，按标题拼 hpath 找会漏旧文档，单例破功留重复。同名占用（非我们的文档）递增后缀
 * （抽取2/抽取3…）最多试 10 次；占名者正是旧文档（随后将删）时直接复用其名。
 */
export async function findReciteChildDoc(parent: { box: string; path: string; hpath: string }, title: string, attr: string, value: string): Promise<{ id: string | null; hpath: string }> {
    const { id, files } = await findChildByIAL(parent.box, parent.path, attr, value);
    let name = title;
    for (let i = 1; i < 10; i++) {
        const occupant = files.find(f => f.name === name);
        if (!occupant || occupant.id === id) break;
        name = `${title}${i + 1}`;
    }
    return { id, hpath: `${parent.hpath}/${name}` };
}

/**
 * 读抽取文档结构（垂直布局）：顶层块流扁平遍历，custom-recite-note 块为总结锚点开 entry，
 * 其后到下一个锚点间的非空块=该条复述（写位空块占位不进）。旧版文档（v1 上方空行 / v2 row-col）
 * 在此读法下 writes 读不出 → 点「重新写」即迁移（消息文案有提示）。
 */
export async function readExtractDoc(extractID: string): Promise<ExtractEntry[]> {
    const entries: ExtractEntry[] = [];
    const children = await siyuan.getChildBlocks(extractID);
    const rows = await siyuan.getRows(children.map(c => c.id), "markdown", true, [], true);
    // IAL 同 identifyNotes 走 cache-first 属性 API（identifyNotes 注释同源）：抽取文档刚建
    // 完立刻对比/判卷时，SQL ial 列可能还没索引到 note/keep 标记
    const ials = await siyuan.batchGetBlockAttrs(children.map(c => c.id)).catch(() => null);
    let entry: ExtractEntry = null;
    children.forEach((c, i) => {
        const ial = ials?.[c.id] ?? {};
        const markdown = rows[i]?.markdown ?? "";
        // 上下文块（原文 keep 的复制，custom-recite-keep）：非锚点非复述，跳过——不进 writes，
        // compare/diffCheck/判卷/提示词四消费方全走本函数读数，在此一处隔离
        if (ial[RECITE_KEEP]) return;
        // 单题对照控制块（□5 q-ctrl）：每题写位后的 UI 块，同在此一处隔离（围栏判据，
        // 6811 实测 SQL markdown 首行即 ;;;sy-recite-plugin/q-ctrl）
        if (isQCtrlMarkdown(markdown)) return;
        if (ial[RECITE_NOTE]) {
            entry = {
                noteID: c.id,
                noteMarkdown: markdown,
                refs: (ial[RECITE_REFS] ?? "").split(",").filter(Boolean),
                writes: [],
            };
            entries.push(entry);
        } else if (entry && markdown.trim()) {
            entry.writes.push({ id: c.id, markdown });
        }
    });
    return entries;
}

/**
 * refs 实时回查原文块文本（对比左列 / 判卷【原文】共用）：原文改了拿新文；
 * 悬空（块已删）以占位标注，与 refs 等长返回保位置对齐。走 SQL 不走索引敏感接口。
 */
export async function fetchOriginMarkdown(refs: string[]): Promise<string[]> {
    if (!refs.length) return [];
    const rows = await siyuan.getRows(refs, "markdown", true, [], true);
    return rows.map(r => r?.markdown?.trim() || "（原文块已删除）");
}

/**
 * 建空文档并单事务插入练习单元 + 打文档属性，返回新文档 id。
 * 空 markdown 建文档自带一个种子空段块：单元锚定它之后插入（transInsertBlocksAfter 自带
 * reverse 保文档序），同事务删除种子——原子成型，失败不留半成品。
 */
export async function insertUnitsDoc(box: string, hpath: string, units: string[], attrs: AttrType): Promise<string> {
    const docID = await siyuan.createDocWithMd(box, hpath, "");
    const seed = (await siyuan.getChildBlocks(docID))[0]?.id;
    const ops = (seed
        ? siyuan.transInsertBlocksAfter(units, seed)
        // 无种子兜底：parentID 插入实测为头插，reverse 后依次头插 = 保持传入文档序
        : units.slice().reverse().map(data => ({ action: "insert", data, parentID: docID } as IOperation)))
        .concat(siyuan.transDeleteBlocks(seed ? [seed] : []));
    await siyuan.transactions(ops);
    await siyuan.setBlockAttrs(docID, attrs);
    return docID;
}

/**
 * heading 落库单行判据/题目标题级别收敛：见 extractCore.ts（noteFitsHeading/noteHeadingLevel）。
 */
/**
 * 题目块 heading 化：md2Divs 产出的总结块原地改写为 hN 标题块（级别可配默认 6=出厂，
 * 2026-09-01 用户「二级还是很巨大」）——data-type/subtype/class 三处就位，内容不动
 * （段落与 heading 的 DOM 结构同构：外 div + 内 contenteditable div），批注行内格式
 * 原样保留，note/refs IAL 照旧。改写后自动接通思源官方大纲跳转与折叠收纳（视觉完全
 * 交给思源标题默认样式）；下游（readExtractDoc/writeZone/compare/判卷）只认
 * custom-recite-note 属性 + 平铺块流，heading 容器化与级别均不影响。
 */
export function noteBlockAsHeading(div: HTMLElement, level: number = 6): HTMLElement {
    const sub = `h${noteHeadingLevel({ noteHeadingLevel: level })}`;
    div.setAttribute("data-type", "NodeHeading");
    div.setAttribute("data-subtype", sub);
    for (let i = 1; i <= 6; i++) div.classList.remove(`h${i}`); // 改级别不残留旧 class
    div.classList.remove("p");
    div.classList.add(sub);
    return div;
}

/**
 * 抽取：识别批注 → 删旧抽取子文档（连子树，对比文档随之消失）→ 建新抽取文档
 * （垂直练习单元：总结块 h2 标题块 + 其下写位空块，无原文——照着原文写复述等于抄答案，
 * DOM 事务直构）→ 打开。
 * 原文不进抽取文档，refs 溯源属性挂总结块上留给对比/判卷实时回查。
 * 不走 kramdown 整文解析（createDocWithMd 黑盒）：custom 属性直挂块、空块所见即所得、结构零魔法。
 * 期2 分叉：stream 有靶块（「这段练」）→ 节选语义（doExtractTargeted：整流照抄+靶段换
 * [锚点+写位]）；无靶 → 本函数整篇语义现状不动。
 */
export async function doExtract(plugin: Plugin, originID: string) {
    if (!originID) return;
    const attrs = await siyuan.getBlockAttrs(originID);
    const start = attrs?.[RECITE_START];
    if (!start) {
        await siyuan.pushMsg("该文档不在仿写模式（先点顶栏笔图标进入）", 2500);
        return;
    }
    const stream = await identifyNotes(originID);
    debugLog("recite.identify", `doc=${originID} blocks=${stream.length} noteBlocks=${stream.filter(b => b.isNote).length} targets=${stream.filter(b => b.isTarget).length}`, "recite");
    // 模式隐式路由（期2）：stream 有靶块 → 节选语义分叉；无靶 → 整篇语义现状不动
    if (stream.some(b => b.isTarget)) {
        await doExtractTargeted(plugin, originID, stream);
        return;
    }
    const groups = groupNotes(stream);
    if (!groups.length) {
        await siyuan.pushMsg("未发现批注：仿写模式点亮后新插入的块才算批注", 3000);
        return;
    }
    // 垂直练习单元：总结块（软换行 \n 连接为一块，改写 hN 标题块——级别跟设置项，挂 note/refs
    // 属性）+ 其下一个空段块写位——点开即可落笔，无需手动回车。refs 留给对比/判卷实时回查，抽取文档里看不到原文。
    // keep 上下文块（期1）：原文档 keep 块按文档序插进组前/文末——md2Divs 纯文本复制带格式，
    // 每块挂 custom-recite-keep（readExtractDoc 据此跳过，不进复述）；抽取时快照、原文改了重抽才更新。
    const noteLevel = noteHeadingLevel((plugin as any).settingCfg);
    const origins = originBlocksForGroups(stream, groups);
    const keeps = keepBlocksForGroups(stream, groups);
    const units = groups.flatMap((g, gi) => {
        const md = g.blocks.map(b => b.markdown).join("\n");
        const note = md2Divs(md, {
            [RECITE_NOTE]: "1",
            [RECITE_REFS]: origins[gi].map(b => b.id).join(","),
        } as AttrType);
        // 单行题目块 → hN（接通官方大纲跳转/折叠，级别跟设置项默认 H6）；多行题保持段落，防内核 heading 单行序列化剥换行
        if (note[0] && noteFitsHeading(md)) noteBlockAsHeading(note[0], noteLevel);
        return [...keepCopyHTML(keeps[gi]), ...note.map(n => n.outerHTML), new DomParaBuilder().html()];
    }).concat(keepCopyHTML(keeps[keeps.length - 1])); // 尾部 keep 追加在抽取文档末尾
    if (await rebuildExtractDoc(plugin, originID, units)) {
        await siyuan.pushMsg(`抽取完成：${groups.length} 条批注`, 2000);
    }
}

/**
 * 上下文块复制 HTML（期1 抽取共用层）：原文块 md2Divs 纯文本复制带格式，每块挂
 * custom-recite-keep（readExtractDoc 据此跳过，不进复述）；抽取时快照、原文改了重抽才更新。
 */
function keepCopyHTML(blocks: ReciteBlock[]): string[] {
    return blocks.flatMap(b => md2Divs(b.markdown).map(d => {
        d.setAttribute(RECITE_KEEP, "1");
        return d.outerHTML;
    }));
}

/**
 * 抽取文档单例重建共用尾段（整篇/节选两路径共享）：box/路径/标题全走按 id 直查通道
 * （getBlockInfo/getHPathByID 直读文件树）——SQL 有索引延迟，原文刚改名时会拿旧路径旧标题，
 * 把抽取文档建进幽灵文件夹。删旧（连带其对比子文档）→ 建新（单事务原子成型）。标题带原文标题后缀。
 * 返回 false=定位失败已提示（调用方跳过完成 toast），成功则已打开新文档。
 */
async function rebuildExtractDoc(plugin: Plugin, originID: string, units: string[]): Promise<boolean> {
    const info = await siyuan.getBlockInfo(originID);
    const hpath = info?.box ? await siyuan.getHPathByID(originID, info.box) : "";
    if (!info?.box || !hpath) {
        await siyuan.pushMsg("未取到原文位置信息，请重试", 2500);
        return false;
    }
    const old = await findReciteChildDoc({ box: info.box, path: info.path, hpath }, derivedTitle(EXTRACT_TITLE, info.rootTitle), RECITE_EXTRACT, originID);
    if (old.id) await siyuan.removeDocByIDSiyuan(old.id);
    const extractID = await insertUnitsDoc(info.box, old.hpath, units, { [RECITE_EXTRACT]: originID } as AttrType);
    // □5 控制块回填：事务插入的块 id 一律被内核重生成，前向引用拿不到——文档建成读
    // 真实锚点 id 后二轮事务插控制块（失败=无按钮不伤练习结构，重抽即恢复）
    const qUnits = await backfillQCtrlBlocks(extractID);
    debugLog("recite.extract", `origin=${originID} extract=${extractID} unitDOM=${units.length} qCtrl=${qUnits} deletedOld=${old.id ?? "-"}`, "recite");
    await OpenSyFile2(plugin, extractID, "front");
    return true;
}

/**
 * 节选语义抽取（期2「这段练」，2026-09-08）：targetSpans 切分整流——前文照抄 →
 * [锚点+写位] 原位换靶段 → 后文照抄；照抄块统一挂 RECITE_KEEP（上下文块单一概念，
 * readExtractDoc/对比/判卷过滤零分叉）；锚点 refs=靶段块 id（对比左栏实时回查原文）。
 * 全部靶无主（0 个练习单元）不建文档——与整篇语义「无批注不建」对齐，只提示。
 * 已知取舍（review P2-9 记录在案）：照抄保留原文块型——原文 heading 按原级进抽取文档，
 * 会主导其大纲/折叠层级（锚点默认 H6 可能居其下）；忠实语境优先，不动数据。
 */
async function doExtractTargeted(plugin: Plugin, originID: string, stream: ReciteBlock[]) {
    const { spans, orphanCount } = targetSpans(stream);
    const noteLevel = noteHeadingLevel((plugin as any).settingCfg);
    const units = spans.flatMap(span => {
        if (span.kind === "copy") return keepCopyHTML(span.blocks);
        const md = span.notes.map(b => b.markdown).join("\n");
        const note = md2Divs(md, {
            [RECITE_NOTE]: "1",
            [RECITE_REFS]: span.targets.map(b => b.id).join(","),
        } as AttrType);
        if (note[0] && noteFitsHeading(md)) noteBlockAsHeading(note[0], noteLevel);
        return [...note.map(n => n.outerHTML), new DomParaBuilder().html()];
    });
    const unitCount = spans.filter(s => s.kind === "unit").length;
    debugLog("recite.extract.targeted", `origin=${originID} spans=${spans.length} units=${unitCount} orphans=${orphanCount}`, "recite");
    if (!unitCount) {
        await siyuan.pushMsg(orphanCount > 1
            ? `${orphanCount} 个靶还没有总结批注：在靶段后写好总结再抽取`
            : "这个靶还没有总结批注：在靶段后写好总结再抽取", 3000);
        return;
    }
    if (await rebuildExtractDoc(plugin, originID, units)) {
        await siyuan.pushMsg(orphanCount
            ? `抽取完成：${unitCount} 段练习；${orphanCount} 个靶还没有总结批注（该段原文已照常保留）`
            : `抽取完成：${unitCount} 段练习`, 3000);
    }
}

/**
 * 找 originID 的旧抽取子文档 id（无则 null），只查不删——「删除练习」流程复用。
 * 从未生成过衍生文档 / SQL 取不到位置时静默返回 null（调用方跳过即可，不报错）。
 */
export async function findDerivedDocID(originID: string): Promise<string | null> {
    const info = await siyuan.getBlockInfo(originID);
    if (!info?.box || !info?.path) return null;
    return (await findChildByIAL(info.box, info.path, RECITE_EXTRACT, originID)).id;
}

/**
 * 重新写：抽取/对比文档浮条入口——复用 doExtract 的单例删建（删当前抽取文档连对比子树 →
 * 按原文当前批注重建全新空抽取），复述清零重新练习；与在原文档再点一次「抽取」完全同义，
 * 只是免导航回原文档。改过总结后再点，新抽取自然反映改动。不加 confirm——与再点「抽取」
 * 的既有语义一致（复述删了可从回收站找回）。
 */
export async function rewriteExtract(plugin: Plugin, extractID: string) {
    if (!extractID) return;
    let attrs = await siyuan.getBlockAttrs(extractID);
    if (attrs?.[RECITE_COMPARE]) { // 对比文档浮条/命令入口：先跳到抽取文档
        extractID = attrs[RECITE_COMPARE];
        attrs = await siyuan.getBlockAttrs(extractID);
    }
    const originID = attrs?.[RECITE_EXTRACT];
    if (!originID) {
        await siyuan.pushMsg("请在抽取/对比文档中点击「重新写」", 2500);
        return;
    }
    await doExtract(plugin, originID);
}
