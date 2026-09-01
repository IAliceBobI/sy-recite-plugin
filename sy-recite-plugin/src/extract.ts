import type { Plugin } from "siyuan";
import { siyuan } from "../../sy-tomato-plugin/src/libs/siyuanApi";
import { OpenSyFile2 } from "../../sy-tomato-plugin/src/libs/navUtils";
import { parseIAL } from "../../sy-tomato-plugin/src/libs/strUtils";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { DomParaBuilder, md2Divs } from "../../sy-tomato-plugin/src/libs/sydom";
import { RECITE_START, RECITE_EXTRACT, RECITE_NOTE, RECITE_REFS, RECITE_OLD, RECITE_COMPARE, EXTRACT_TITLE } from "./constants";

export type ReciteBlock = { id: string; markdown: string; isNote: boolean };
export type NoteGroup = { start: number; end: number; blocks: ReciteBlock[] };
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
    return ASSOC_NOTE_RE.test(noteMarkdown.trimStart());
}

/**
 * 按文档序取原文顶层块流（getChildBlocks 保文档序）。批注 = 无 custom-recite-old 原文标记
 * 且内容非空的块（与 CSS 染色判据同源；空块——打了回车没写字——不算批注，不进抽取文档）
 */
export async function identifyNotes(originID: string): Promise<ReciteBlock[]> {
    const children = await siyuan.getChildBlocks(originID);
    const rows = await siyuan.getRows(children.map(c => c.id), "ial,markdown", true, [], true);
    return children.map((c, i) => {
        const markdown = rows[i]?.markdown ?? "";
        return {
            id: c.id,
            markdown,
            isNote: !parseIAL(rows[i]?.ial ?? "")[RECITE_OLD] && !!markdown.trim(),
        };
    });
}

/**
 * 连续批注聚合：文档序上中间没有非空原文块（custom-recite-old）分隔的批注视为同一条总结。
 * 语义无损——两条批注间没有原文分隔时本就无法各自成立（后条 refs 必空），聚合是唯一自洽读法；
 * 也是敲错回车（想软换行敲了硬回车裂成两块）的安全网，用户无需改写块习惯。
 * 空块不算分隔（与 refs 过滤空块同源）；start/end 为组在 stream 里的覆盖区间（组内块可与空块交错）。
 */
export function groupNotes(stream: ReciteBlock[]): NoteGroup[] {
    const groups: NoteGroup[] = [];
    let prevNote = false;
    stream.forEach((b, i) => {
        if (b.isNote) {
            const last = groups[groups.length - 1];
            if (prevNote) {
                last.blocks.push(b);
                last.end = i;
            } else {
                groups.push({ start: i, end: i, blocks: [b] });
            }
            prevNote = true;
        } else if (b.markdown.trim()) {
            prevNote = false;
        }
    });
    return groups;
}

/**
 * 衍生文档标题：类型前缀·原文标题后缀（文档树/搜索里一眼可辨归属）；取不到原文标题退回裸前缀。
 * 标题里的 / 替换为全角——它是 hpath 分隔符，裸用会把标题拆成多层路径。
 */
export function derivedTitle(prefix: string, originTitle: string): string {
    const t = originTitle?.trim().replaceAll("/", "／") ?? "";
    return t ? `${prefix}·${t}` : prefix;
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
    const rows = await siyuan.getRows(children.map(c => c.id), "ial,markdown", true, [], true);
    let entry: ExtractEntry = null;
    rows.forEach((r, i) => {
        const ial = parseIAL(r?.ial ?? "");
        const markdown = r?.markdown ?? "";
        if (ial[RECITE_NOTE]) {
            entry = {
                noteID: children[i].id,
                noteMarkdown: markdown,
                refs: (ial[RECITE_REFS] ?? "").split(",").filter(Boolean),
                writes: [],
            };
            entries.push(entry);
        } else if (entry && markdown.trim()) {
            entry.writes.push({ id: children[i].id, markdown });
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
 * heading 落库单行判据：批注 markdown 含软换行（\n）时保持段落形态——内核 heading 的
 * kramdown 序列化是单行文本语义，\n 与 <br> 落库时一律剥掉（2026-09-01 dev 实测三对照：
 * 段落 \n 存活、heading \n 剥、heading <br> 剥）。内容保真优先于大纲条目，多行题不进大纲。
 */
export function noteFitsHeading(markdown: string): boolean {
    return !markdown.includes("\n");
}

/**
 * 题目块 heading 化：md2Divs 产出的总结块原地改写为 h2 标题块——data-type/subtype/class
 * 三处就位，内容不动（段落与 heading 的 DOM 结构同构：外 div + 内 contenteditable div），
 * 批注行内格式原样保留，note/refs IAL 照旧。改写后自动接通思源官方大纲跳转与
 * 折叠收纳（视觉完全交给思源标题默认样式）；下游（readExtractDoc/writeZone/compare/判卷）
 * 只认 custom-recite-note 属性 + 平铺块流，heading 容器化不影响。
 */
export function noteBlockAsHeading(div: HTMLElement): HTMLElement {
    div.setAttribute("data-type", "NodeHeading");
    div.setAttribute("data-subtype", "h2");
    div.classList.remove("p");
    div.classList.add("h2");
    return div;
}

/**
 * 抽取：识别批注 → 删旧抽取子文档（连子树，对比文档随之消失）→ 建新抽取文档
 * （垂直练习单元：总结块 h2 标题块 + 其下写位空块，无原文——照着原文写复述等于抄答案，
 * DOM 事务直构）→ 打开。
 * 原文不进抽取文档，refs 溯源属性挂总结块上留给对比/判卷实时回查。
 * 不走 kramdown 整文解析（createDocWithMd 黑盒）：custom 属性直挂块、空块所见即所得、结构零魔法。
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
    const groups = groupNotes(stream);
    debugLog("recite.identify", `doc=${originID} blocks=${stream.length} noteBlocks=${stream.filter(b => b.isNote).length} groups=${groups.length}`, "recite");
    if (!groups.length) {
        await siyuan.pushMsg("未发现批注：仿写模式点亮后新插入的块才算批注", 3000);
        return;
    }
    // 垂直练习单元：总结块（软换行 \n 连接为一块，改写 h2 标题块，挂 note/refs 属性）+ 其下一个
    // 空段块写位——点开即可落笔，无需手动回车。refs 留给对比/判卷实时回查，抽取文档里看不到原文。
    let cursor = 0;
    const units = groups.flatMap(g => {
        const origin = stream.slice(cursor, g.start).filter(b => b.markdown.trim());
        cursor = g.end + 1;
        const md = g.blocks.map(b => b.markdown).join("\n");
        const note = md2Divs(md, {
            [RECITE_NOTE]: "1",
            [RECITE_REFS]: origin.map(b => b.id).join(","),
        } as AttrType);
        // 单行题目块 → h2（接通官方大纲跳转/折叠）；多行题保持段落，防内核 heading 单行序列化剥换行
        if (note[0] && noteFitsHeading(md)) noteBlockAsHeading(note[0]);
        return [...note.map(n => n.outerHTML), new DomParaBuilder().html()];
    });
    // box/路径/标题全走按 id 直查通道（getBlockInfo/getHPathByID 直读文件树）——SQL 有索引延迟，
    // 原文刚改名时会拿旧路径旧标题，把抽取文档建进幽灵文件夹
    const info = await siyuan.getBlockInfo(originID);
    const hpath = info?.box ? await siyuan.getHPathByID(originID, info.box) : "";
    if (!info?.box || !hpath) {
        await siyuan.pushMsg("未取到原文位置信息，请重试", 2500);
        return;
    }
    // 单例：删旧（连带其对比子文档）→ 建新（单事务原子成型）。标题带原文标题后缀
    const old = await findReciteChildDoc({ box: info.box, path: info.path, hpath }, derivedTitle(EXTRACT_TITLE, info.rootTitle), RECITE_EXTRACT, originID);
    if (old.id) await siyuan.removeDocByIDSiyuan(old.id);
    const extractID = await insertUnitsDoc(info.box, old.hpath, units, { [RECITE_EXTRACT]: originID } as AttrType);
    debugLog("recite.extract", `origin=${originID} extract=${extractID} groups=${groups.length} deletedOld=${old.id ?? "-"}`, "recite");
    await siyuan.pushMsg(`抽取完成：${groups.length} 条批注`, 2000);
    OpenSyFile2(plugin, extractID, "front");
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
