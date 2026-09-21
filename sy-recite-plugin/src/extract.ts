import { Constants, getAllEditor, type Plugin } from "siyuan";
import { siyuan } from "../../sy-tomato-plugin/src/libs/siyuanApi";
import { OpenSyFile2 } from "../../sy-tomato-plugin/src/libs/navUtils";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { DomParaBuilder, md2Divs } from "../../sy-tomato-plugin/src/libs/sydom";
import { RECITE_START, RECITE_EXTRACT, RECITE_NOTE, RECITE_REFS, RECITE_OLD, RECITE_KEEP, RECITE_TARGET, RECITE_HINT, RECITE_EMPTY_NOTE, RECITE_WRITTEN, RECITE_COMPARE, EXTRACT_TITLE } from "./constants";
import { backfillQCtrlBlocks, isQCtrlMarkdown, parseQCtrlContent } from "./qCtrlBlock";
// 结构层纯函数在 extractCore.ts（与 kernel 侧共用一份，2026-09-09 recite MCP □3 抽出）
import {
    extractSpans, noteFitsHeading, derivedTitle, noteHeadingLevel, toReciteBlock, riffCardedIDs, unitReplaceOps,
} from "./extractCore";
import type { ReciteBlock } from "./extractCore";

// 老消费方仍从本文件取这些名字——re-export 保导入路径不破（groupNotes 三件套已随 □2 统一
// 出卷退役自活路径，本体留在 extractCore 作 □4 老整篇文档迁移工具的结构基准）
export {
    noteFitsHeading, derivedTitle, noteHeadingLevel,
} from "./extractCore";
export type { ReciteBlock, NoteGroup } from "./extractCore";
export type ExtractEntry = {
    noteID: string;
    noteMarkdown: string;
    refs: string[];           // 溯源锚（原文块 id），对比/判卷时实时回查（原文改了拿新文，删了占位标注）
    writes: { id: string; markdown: string }[]; // 锚点后的非空块（复述；写位空块占位不进）
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
 * 按文档序取原文顶层块流（getChildBlocks 保文档序）。两角色判定（recitesimplify □1
 * 2026-09-20，判定序见 extractCore blockRole）：新写非空块默认上下文（散写在别处的字=
 * 照抄语境），题面身份不进角色——isNote=题面候选（非 old/keep/target 的非空块，段末后
 * 紧邻才由 extractSpans 位置配对升格）。空块——打了回车没写字——无角色，不进抽取文档。
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
        return toReciteBlock(c.id, rows[i]?.markdown ?? "", {
            isOld: !!ial[RECITE_OLD],
            isKeep: !!ial[RECITE_KEEP],
            isTarget: !!ial[RECITE_TARGET],
        });
    });
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
 * 抽取文档读数归一（readExtractDoc 的纯函数核心，□2 抽出）：顶层块流（id+markdown+IAL）→
 * entries。四个消费方（compare/diffCheck/判卷/提示词）全走 readExtractDoc 读数，在此一处
 * 隔离展示层：keep（copy span 照抄产物——原文语境与散写新块同挂）/hint（老卷子兼容判读：
 * 「总结」类型退役后新卷不再产 RECITE_HINT 块，存量老卷子的提示块照跳）/q-ctrl 控制块
 * 跳过；空锚点（RECITE_EMPTY_NOTE）noteMarkdown 归一空串——占位文案只是卷内视觉，判卷
 * 走纯默写。
 */
export function extractEntries(blocks: { id: string; markdown: string; ial?: Record<string, string> }[]): ExtractEntry[] {
    const entries: ExtractEntry[] = [];
    let entry: ExtractEntry = null;
    blocks.forEach(b => {
        const ial = b.ial ?? {};
        const markdown = b.markdown ?? "";
        // 照抄块（copy span 产物挂 keep——原文语境与散写新块）与提示块（老卷子 hint 产物——
        // 判读兼容保留，新卷不再产）：非锚点非复述，跳过——不进 writes，四消费方在此一处
        // 隔离；q-ctrl 控制块同判（围栏判据，6811 实测）；
        // written（□3 温和退出标记）同判跳过——正常链路不进卷子（copyHTML 重建不带属性），
        // 防御脏数据与 writeZone 判序同源
        if (ial[RECITE_KEEP] || ial[RECITE_HINT] || ial[RECITE_WRITTEN]) return;
        if (isQCtrlMarkdown(markdown)) return;
        if (ial[RECITE_NOTE]) {
            entry = {
                noteID: b.id,
                noteMarkdown: ial[RECITE_EMPTY_NOTE] ? "" : markdown,
                refs: (ial[RECITE_REFS] ?? "").split(",").filter(Boolean),
                writes: [],
            };
            entries.push(entry);
        } else if (entry && markdown.trim()) {
            entry.writes.push({ id: b.id, markdown });
        }
    });
    return entries;
}

/**
 * 读抽取文档结构（垂直布局）：顶层块流扁平遍历，custom-recite-note 块为总结锚点开 entry，
 * 其后到下一个锚点间的非空块=该条复述（写位空块占位不进）。旧版文档（v1 上方空行 / v2 row-col）
 * 在此读法下 writes 读不出 → 点「重新写」即迁移（消息文案有提示）。
 */
export async function readExtractDoc(extractID: string): Promise<ExtractEntry[]> {
    const children = await siyuan.getChildBlocks(extractID);
    const rows = await siyuan.getRows(children.map(c => c.id), "markdown", true, [], true);
    // IAL 同 identifyNotes 走 cache-first 属性 API（identifyNotes 注释同源）：抽取文档刚建
    // 完立刻对比/判卷时，SQL ial 列可能还没索引到 note/keep 标记
    const ials = await siyuan.batchGetBlockAttrs(children.map(c => c.id)).catch(() => null);
    return extractEntries(children.map((c, i) => ({
        id: c.id,
        markdown: rows[i]?.markdown ?? "",
        ial: ials?.[c.id] ?? undefined,
    })));
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
 * 删/清衍生文档子块前，摘挂快速卡组卡的子块防孤儿（2026-09-14 闪卡继承）：抽取卷
 * 子块上的卡=用户原生菜单手动加的（判卷块级卡在对比文档——aiGradeRender 按 blockID
 * 制卡挂那里，对比重建同用本函数）。内核删块不清理 deck 数据（惰性过滤），显式清
 * 干净防 3.9.0 riff v2 重写风险。判卡走 IAL 直读（索引延迟假旧值禁 SQL）；
 * batchGetBlockAttrs 整体失败兜底=按无卡处理（孤儿由内核惰性过滤兜底）。返回摘卡数。
 */
export async function unCardChildren(docID: string): Promise<number> {
    const children = await siyuan.getChildBlocks(docID);
    const ids = children.map(c => c.id);
    const ials = await siyuan.batchGetBlockAttrs(ids).catch(() => null);
    const carded = riffCardedIDs(ids, ials, Constants.QUICK_DECK_ID);
    if (carded.length) {
        const r = await siyuan.removeRiffCards(carded, Constants.QUICK_DECK_ID);
        if (!r) debugLog("recite.extract", `riff remove no-echo blocks=${carded.length}（惰性过滤兜底）`, "recite");
    }
    return carded.length;
}

/**
 * 建空文档并单事务插入练习单元 + 打文档属性，返回新文档 id。
 * 空 markdown 建文档自带一个种子空段块：单元锚定它之后插入，同事务删除种子。
 */
export async function insertUnitsDoc(box: string, hpath: string, units: string[], attrs: AttrType): Promise<string> {
    const docID = await siyuan.createDocWithMd(box, hpath, "");
    const seed = (await siyuan.getChildBlocks(docID))[0]?.id;
    await siyuan.transactions(unitReplaceOps(units, seed, docID, seed ? [seed] : []));
    await siyuan.setBlockAttrs(docID, attrs);
    return docID;
}

/**
 * 卷级原地更新（闪卡继承，2026-09-14）：旧抽取文档不再删建——单事务清空子块重插新
 * 单元，文档块 id 不变 → IAL custom-riff-decks 不变 → 文档级卡与 FSRS 进度零搬运自动
 * 在（进度语义=卷级：改原文重出题、复习轮次延续，bear 拍板）。挂过卡的子块先摘快速
 * 卡组防孤儿。文档属性不动；对比子文档不连带删（自管重建，旧保留无害）。返回文档 id
 * （即入参），事务失败返回 null（调用方提示，勿进控制块回填与成功 toast——否则用户
 * 看到的「成功」其实是上轮旧卷）。已知取舍：摘卡与换卷事务非原子（事务回滚时子块卡
 * 已摘、块还在）——窗口极窄且仅子块级卡受影响，文档级卡不经此路。
 */
export async function replaceUnitsInPlace(docID: string, units: string[]): Promise<string | null> {
    const children = await siyuan.getChildBlocks(docID);
    await unCardChildren(docID);
    const ret = await siyuan.transactions(unitReplaceOps(units, children[0]?.id, docID, children.map(c => c.id)));
    if (!ret) return null;
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
 * 统一出卷（□2 出卷层，2026-09-13；recitesimplify □1 2026-09-20 题面位置化）：doExtract
 * 单一扫描语义——整篇/节选分叉退役，extractSpans（extractCore，kernel 共用）是抽取文档
 * 构建蓝图唯一路径：考核块（连续 target）聚段→段末原位换 [锚点+写位]（refs=段块 id，
 * 对比/判卷实时回查）；段末后紧邻的连续新写块升格为锚点（题面=位置）；无题面=空锚点
 * 占位（RECITE_EMPTY_NOTE，纯默写）照样出卷；其余块（原文语境+散写新块）一律照抄
 * （copyHTML 挂 keep 不染色——hint 面已随「总结」类型退役，老卷子 RECITE_HINT 判读保留
 * 在 extractEntries）。无考核段不出卷（提示改指「标记考核」——题面不再是出卷开关）。
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
    debugLog("recite.identify", `doc=${originID} blocks=${stream.length} notes=${stream.filter(b => b.isNote).length} targets=${stream.filter(b => b.isTarget).length} keeps=${stream.filter(b => b.isKeep).length}`, "recite");
    const { spans, emptyNoteCount } = extractSpans(stream);
    const say = (k: string, fb: string) => ((plugin as any)?.i18n?.[k] as string) || fb;
    const unitCount = spans.filter(s => s.kind === "unit").length;
    if (!unitCount) {
        await siyuan.pushMsg(say("抽取无考核提示", "还没有标记考核内容：选中要练的块点浮条「这段练」"), 3000);
        return;
    }
    const noteLevel = noteHeadingLevel((plugin as any).settingCfg);
    const units = spans.flatMap(span => {
        if (span.kind === "copy") return copyHTML(span.blocks);
        // unit：升格题面=锚点文本（单行 heading 化接通大纲跳转/折叠——noteFitsHeading/
        // noteBlockAsHeading 对位置化题面照用）；空锚点=空段落
        //（RECITE_EMPTY_NOTE 属性=纯默写题标记，readExtractDoc 出口归一空串——占位不漏下游；
        // 2026-09-15 起不落占位文案：锚点空段+写位空段相邻，写位有 writeZone 竖线可辨）
        if (!span.notes.length) {
            const div = new DomParaBuilder().build();
            div.setAttribute(RECITE_NOTE, "1");
            div.setAttribute(RECITE_REFS, span.targets.map(b => b.id).join(","));
            div.setAttribute(RECITE_EMPTY_NOTE, "1");
            return [div.outerHTML, new DomParaBuilder().html()];
        }
        const md = span.notes.map(b => b.markdown).join("\n");
        const note = md2Divs(md, {
            [RECITE_NOTE]: "1",
            [RECITE_REFS]: span.targets.map(b => b.id).join(","),
        } as AttrType);
        if (note[0] && noteFitsHeading(md)) noteBlockAsHeading(note[0], noteLevel);
        return [...note.map(n => n.outerHTML), new DomParaBuilder().html()];
    });
    debugLog("recite.extract", `origin=${originID} spans=${spans.length} units=${unitCount} emptyNotes=${emptyNoteCount}`, "recite");
    if (await rebuildExtractDoc(plugin, originID, units)) {
        await siyuan.pushMsg(emptyNoteCount
            ? say("抽取完成含默写", "抽取完成：{} 段练习（{} 段无提示，凭记忆默写）").replace("{}", String(unitCount)).replace("{}", String(emptyNoteCount))
            : say("抽取完成", "抽取完成：{} 段练习").replace("{}", String(unitCount)), 3000);
    }
}

/**
 * 原地重插后修本机已开视图（按钮叠影修复，2026-09-14）：内核对 NodeCustomBlock 的
 * insert 事务回显 HTML 不带 data-node-id（普通块带，09-14 6809 三步实测），已开页签经
 * ws 回声上屏的 q-ctrl 壳因此无 id——下轮「重新写」的 delete 回声按 [data-node-id=id]
 * 查 DOM 删不掉它们（盘已删、视觉残留叠影，reload 才恢复）。修法双通道：
 * ① 主通道=rootID 匹配的编辑器整建 reload（从盘重渲染，历史残留/多窗口一并清场）。
 *   getAllEditor() 返回 Protyle 类实例——自有字段恰为 {version, protyle}（Object.keys
 *   只见这两键），reload 等 API 在原型上：typeof 须在实例本体 ed 上探测；ed.protyle 是
 *   内层 IProtyle（block/element 在那层、任何版本都无 reload）——测错层会误诊「无此
 *   方法」（reasoning-glm review P1，2023-06 e6f727b96 起 reload 恒在）。tab.model 三层
 *   爬同环境恒空勿用。
 * ② 兜底（理论保留）=壳补真 id：backfill 事务响应 doOperations[].id 即各壳盘 id（与
 *   pairs 的 noteID 同序），按壳 data-content 里的 noteID 对位补 data-node-id，下一轮
 *   delete 回声恢复可删。延迟 400ms 让本轮 insert 回声先落 DOM。
 */
function reloadOpenViews(docID: string, shells: [string, string][]) {
    const idOf = new Map(shells);
    setTimeout(() => {
        let reloaded = 0, patched = 0;
        try {
            for (const ed of getAllEditor() as any[]) {
                const inner = ed?.protyle;
                const rootID = inner?.block?.rootID ?? ed?.block?.rootID;
                if (rootID !== docID) continue;
                if (typeof ed?.reload === "function") {
                    ed.reload(false);
                    reloaded++;
                    continue;
                }
                (inner?.element ?? ed?.element)?.querySelectorAll?.('[data-type="NodeCustomBlock"]:not([data-node-id])')?.forEach(s => {
                    const noteID = parseQCtrlContent(s.getAttribute("data-content") ?? "")?.noteID ?? "";
                    const id = idOf.get(noteID);
                    if (id) {
                        s.setAttribute("data-node-id", id);
                        patched++;
                    }
                });
            }
        } catch { /* getAllEditor 早期可空——本轮不修，下轮重写自愈 */ }
        debugLog("recite.extract", `reload views doc=${docID.slice(-8)} reloaded=${reloaded} patched=${patched}`, "recite");
    }, 400);
}

/**
 * 抽取文档单例重建共用尾段：box/路径/标题全走按 id 直查通道（getBlockInfo/getHPathByID
 * 直读文件树）——SQL 有索引延迟，原文刚改名时会拿旧路径旧标题，把抽取文档建进幽灵文件
 * 夹。有旧文档=卷级原地更新（闪卡继承，replaceUnitsInPlace）+ 标题跟随；无旧文档（首次
 * 抽取）建新走 insertUnitsDoc（单事务原子成型），行为不变。标题带原文标题后缀。
 * 返回 false=定位失败已提示（调用方跳过完成 toast），成功则已打开文档。
 */
async function rebuildExtractDoc(plugin: Plugin, originID: string, units: string[]): Promise<boolean> {
    const info = await siyuan.getBlockInfo(originID);
    const hpath = info?.box ? await siyuan.getHPathByID(originID, info.box) : "";
    if (!info?.box || !hpath) {
        await siyuan.pushMsg("未取到原文位置信息，请重试", 2500);
        return false;
    }
    const old = await findReciteChildDoc({ box: info.box, path: info.path, hpath }, derivedTitle(EXTRACT_TITLE, info.rootTitle), RECITE_EXTRACT, originID);
    let extractID: string | null = null;
    if (old.id) {
        extractID = await replaceUnitsInPlace(old.id, units);
        if (!extractID) {
            await siyuan.pushMsg("卷面重建失败，请重试", 2500);
            return false;
        }
        await syncExtractTitle(old.id, old.hpath);
    } else {
        extractID = await insertUnitsDoc(info.box, old.hpath, units, { [RECITE_EXTRACT]: originID } as AttrType);
    }
    // □5 控制块回填：事务插入的块 id 一律被内核重生成，前向引用拿不到——文档建成后读
    // 真实锚点 id 后二轮事务插控制块（失败=无按钮不伤练习结构，重抽即恢复）
    const qPairs = await backfillQCtrlBlocks(extractID);
    // 原地更新才需要修视图：旧卷 ws 上屏壳无 id，delete 回声删不掉（见 reloadOpenViews）；
    // 首次抽取是全新页签从盘渲染，壳 fresh 带 id 无此问题
    if (old.id) reloadOpenViews(extractID, qPairs);
    debugLog("recite.extract", `origin=${originID} extract=${extractID} unitDOM=${units.length} qCtrl=${qPairs.length} rebuild=${old.id ? `inPlace(${old.id})` : "create"}`, "recite");
    await OpenSyFile2(plugin, extractID, "front");
    return true;
}

/**
 * 原地更新后标题跟随：旧路径靠删建自动带新标题，保留文档本体后原文改名会让标题陈旧
 * ——现名 ≠ 期望名（findReciteChildDoc 算的 hpath 尾段，已保证不撞名）时 rename 跟随。
 * box/path 走 getBlockInfo 直读文件树（renameDocByID 内部过 SQL 有索引延迟，不用）。
 */
async function syncExtractTitle(docID: string, wantedHpath: string) {
    const wanted = wantedHpath.split("/").pop() ?? "";
    if (!wanted) return;
    const info = await siyuan.getBlockInfo(docID).catch(() => null);
    if (info?.box && info.path && info.rootTitle !== wanted) {
        await siyuan.renameDoc(info.box, info.path, wanted);
    }
}

/**
 * 照抄块复制 HTML（统一出卷共用层）：原文块与散写新块 md2Divs 纯文本复制带格式，每块挂
 * RECITE_KEEP——readExtractDoc/writeZone/q-ctrl 据此（或同判据）跳过，不进复述（照抄=
 * 语境，不染色不参与对比判卷）。抽取时快照、原文改了重抽才更新。hint 染色面已随「总结」
 * 类型退役（recitesimplify □1 2026-09-20）：老卷子的 RECITE_HINT 判读兼容在 extractEntries，
 * 不在此产新。
 */
function copyHTML(blocks: ReciteBlock[]): string[] {
    return blocks.flatMap(b => md2Divs(b.markdown).map(d => {
        d.setAttribute(RECITE_KEEP, "1");
        return d.outerHTML;
    }));
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
 * 重新写：抽取/对比文档浮条入口——复用 doExtract 的抽取文档重建（原地清空子块重插新
 * 单元：文档 id 不变=闪卡与进度继承，对比文档不连带删），复述清零重新练习；与在原文档
 * 再点一次「抽取」完全同义，只是免导航回原文档。改过总结后再点，新抽取自然反映改动。
 * 不加 confirm——与再点「抽取」的既有语义一致。
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
