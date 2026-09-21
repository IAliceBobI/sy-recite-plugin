/**
 * 抽取结构层纯函数（2026-09-09 recite MCP □3 抽出）：前端 extract.ts 与 kernel 侧
 * （goja 无 DOM/Lute）共用一份，防两处漂移。此处只放「流进流出」的结构判定——
 * 依赖 siyuan API/DOM 的（identifyNotes/md2Divs/单例重建）留在 extract.ts / kernel 各自实现。
 */
export type ReciteBlock = {
    id: string;
    markdown: string;
    isNote: boolean; // 题面候选（位置化题面的块级原料，见 toReciteBlock）；老消费方（groupNotes/配对窗口）照读
    isKeep?: boolean;
    isTarget?: boolean;
    isOld?: boolean; // 判据原料：custom-recite-old 直存（role 的输入，非输出）
    role: ReciteRole; // 角色统一判定（唯一事实源，判定序见 blockRole）
};
export type NoteGroup = { start: number; end: number; blocks: ReciteBlock[] };

// ---- 角色模型（2026-09-13 三角色战役 → 2026-09-20 recitesimplify □1 两角色简化）----
// "summary" 成员已随 kernel 侧死分支收编删除（recitesimplify □3）：blockRole 不再产出、
// 标记层两钮化（□2）已移除浮条总结钮与右键项——类型面不再含该成员（tsc 把关，任何比较
// 处写 "summary" 即编译错）。
export type ReciteRole = "target" | "context" | "none";

/**
 * 两角色判定序（recitesimplify □1 2026-09-20，唯一权威）：target? 考核 : keep? 上下文 :
 * old? 上下文 : 非空? 上下文 : 无角色。「总结」类型退役——新写非空块默认上下文（散落在
 * 别处写的字=照抄进卷当语境，不染色不参与判卷），题面身份不进角色模型（题面=位置：
 * 考核段末后紧邻的连续新写块，由 extractSpans 配对推导）。keep 泛化到任意块（新写块挂
 * keep=点名进语境）；markdown 只判空不判内容（DOM 侧传 textContent 同构——角色不读文本）。
 */
export function blockRole(b: { markdown: string; isOld?: boolean; isKeep?: boolean; isTarget?: boolean }): ReciteRole {
    if (b.isTarget) return "target";
    if (b.isKeep) return "context";
    if (b.isOld) return "context";
    return b.markdown.trim() ? "context" : "none";
}

/**
 * 流块构造（前端 identifyNotes 与 kernel readStream 共用一份，防两处漂移）：
 * role 过 blockRole；isNote=题面候选（非 old/keep/target 的非空块——与旧「总结角色」
 * 等价集合改由 flags 直判：角色不再承载题面身份，是否真升格题面由 extractSpans 位置
 * 配对定；存量文档零迁移，下次抽取自动按新规则重判）。attrsForRole（按钮互斥写值）在
 * 前端 role.ts（依赖 constants.ts 的属性名，kernel 勿 import）。
 */
export function toReciteBlock(id: string, markdown: string, flags: { isOld?: boolean; isKeep?: boolean; isTarget?: boolean }): ReciteBlock {
    const role = blockRole({ markdown, ...flags });
    return {
        id, markdown, role,
        isNote: !!markdown.trim() && !flags.isOld && !flags.isKeep && !flags.isTarget,
        isKeep: !!flags.isKeep,
        isTarget: !!flags.isTarget,
        isOld: !!flags.isOld,
    };
}

/**
 * 选中块多数角色（浮条两钮高亮判据，□2 两钮化）：无角色（空块）不计入；严格多数
 * （> 非空块半数）才返回该角色——平票/空选返回 null（两钮全不亮）。高亮语义=选中集
 * 「当前是什么」，与两钮「设成什么」互为表里（新写块 role=context 默认亮「原文」钮）。
 */
export function majorityRole(roles: ReciteRole[]): ReciteRole | null {
    const counts = new Map<ReciteRole, number>();
    let total = 0;
    roles.forEach(r => {
        if (r === "none") return;
        total++;
        counts.set(r, (counts.get(r) ?? 0) + 1);
    });
    for (const [r, n] of counts) if (n > total / 2) return r;
    return null;
}

/**
 * 连续题面候选聚合（老消费方结构基准——自活路径已随统一出卷退役，本体留作老整篇文档
 * 迁移工具的区间语义基准）：文档序上中间没有非空原文块（custom-recite-old）分隔的候选
 * 视为同组（旧「连续批注聚合」的等价集合，□1 起候选=isNote 判据）。语义无损——两个候选
 * 间没有原文分隔时本就无法各自成立（后条 refs 必空），聚合是唯一自洽读法；也是敲错回车
 * （想软换行敲了硬回车裂成两块）的安全网，用户无需改写块习惯。
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
 * 每组 refs（原文溯源块）切片：上一组末到本组首的非空正文=本组 refs（批注锚定其前
 * 文本，既有语义不动）；最后批注组兜底并到流尾——其后无人认领的尾部正文并入最后一组
 * （AI 拆分的收尾锚点未必插在文末——2026-09-01 主实例实锤：10 号锚点后甩两段尾声被
 * 对比/判卷静默漏掉；手写批注不插到底同理）。空块一律滤除。
 */
export function originBlocksForGroups(stream: ReciteBlock[], groups: NoteGroup[]): ReciteBlock[][] {
    let cursor = 0;
    return groups.map((g, gi) => {
        const origin = stream.slice(cursor, g.start).filter(b => b.markdown.trim());
        cursor = g.end + 1;
        return gi === groups.length - 1
            ? origin.concat(stream.slice(cursor).filter(b => b.markdown.trim()))
            : origin;
    });
}

/**
 * keep 上下文段切片（期1 整篇语义，2026-09-08）：与 originBlocksForGroups 同区间语义——
 * 上一组末到本组首之间的 keep 块复制进本组锚点之前（组间 keep 归后一组，与批注 refs 切片
 * 对齐原文档序）；最后一组之后的尾部 keep 块并进末组（插在抽取文档末尾）。返回
 * groups.length + 1 组（末组=尾部）。空块滤除。keep 块照常留在 refs 里。
 * □1 起判定经 toReciteBlock：挂 keep 的新写块不是题面候选（isNote 判据排除 keep 块）——
 * keep 泛化到任意块（bear 需求①：写提示时补的语境挂 keep=进卡面照抄而非成题；旧
 * `!b.isNote` 守卫随判据改写恒真冗余已删）。
 */
export function keepBlocksForGroups(stream: ReciteBlock[], groups: NoteGroup[]): ReciteBlock[][] {
    const isKeepBlock = (b: ReciteBlock) => !!b.isKeep && !!b.markdown.trim();
    let cursor = 0;
    const sets = groups.map((g) => {
        const keeps = stream.slice(cursor, g.start).filter(isKeepBlock);
        cursor = g.end + 1;
        return keeps;
    });
    sets.push(stream.slice(cursor).filter(isKeepBlock));
    return sets;
}

/**
 * 统一出卷整流（□2 出卷层 2026-09-13；recitesimplify □1 2026-09-20 题面位置化）：单一扫描
 * 语义——整篇/节选分叉退役，extractSpans 是抽取文档构建蓝图的唯一路径（前端 doExtract 与
 * kernel buildDrill 共用，防两处漂移）。核心分叉（handoff 设计共识）：
 * - 考核块（连续 target，滤空流上相邻）聚段 → 段末原位换 [锚点+写位]（refs=段块 id）；
 * - **题面=位置不是类型**：段末后紧邻的连续 `!isOld && !isKeep` 新写块升格为锚点（遇
 *   old/keep/target 块停；窗口=段末到下一段首/文末，不越段不越原文认领）。「这段练」自动
 *   留的空提示位写进字即题面；AI 锚点/written 块都无 old 属性=天然候选，buildDrill 的
 *   anchors 合同零改动自动成立；
 * - 无题面=空锚点占位（notes=[]，仍出卷——保 note 属性契约，下游 writeZone/q-ctrl/
 *   compare/判卷零分叉；判卷走纯默写 RECITE_EMPTY_NOTE 语义不变）；
 * - 其余块一律照抄（copy span → 挂 RECITE_KEEP 复制）：原文语境与散写的新写块同走
 *   copy 不染色不参与判卷（hint kind 已随「总结」类型退役，老卷子的 RECITE_HINT 判读
 *   在 extractEntries 保留兼容）；
 * - 空块滤除；无考核段不出卷（调用方数 unit 数为零时 toast）。
 */
export type ExtractSpan =
    | { kind: "copy"; blocks: ReciteBlock[] } // 照抄（原文语境+散写新块，挂 keep 不染色）
    | { kind: "unit"; targets: ReciteBlock[]; notes: ReciteBlock[] }; // 考核段（notes=升格题面；空=空锚点占位）

export function extractSpans(stream: ReciteBlock[]): { spans: ExtractSpan[]; emptyNoteCount: number } {
    const s = stream.filter(b => b.markdown.trim()); // 空块滤除（无角色，不进抽取文档）
    // 靶段切分：滤空流上连续 isTarget 聚段（一次「这段练」多选/多块=一段；分两次打的相邻靶天然合并）
    const segs: { start: number; end: number }[] = [];
    for (let i = 0; i < s.length; i++) {
        if (s[i].isTarget) {
            const start = i;
            while (i < s.length && s[i].isTarget) i++;
            segs.push({ start, end: i - 1 });
        }
    }
    // 配对（题面位置化）：窗口 = (段末, 下一段首) / (末段末, 文末)，段末后紧邻的连续
    // !isOld && !isKeep 块=题面，遇 old/keep/target 块停（滤空流上 target 本不进窗口，
    // 显式判据保语义自足——角色不读：新写块 role 也是 context，题面身份只在位置里）
    const paired = new Map<number, ReciteBlock[]>();
    segs.forEach((seg, gi) => {
        const winEnd = gi + 1 < segs.length ? segs[gi + 1].start : s.length;
        const notes: ReciteBlock[] = [];
        for (let j = seg.end + 1; j < winEnd && !s[j].isOld && !s[j].isKeep && !s[j].isTarget; j++) notes.push(s[j]);
        if (notes.length) paired.set(gi, notes);
    });
    // 整流：照抄块与 [锚点+写位] 单元按文档序排布。照抄逐块入 copy span、相邻合并；
    // 升格题面跳过（已变锚点本体）；无题面考核段=空锚点占位（notes=[] 仍出卷）。
    const skipNote = new Set<string>();
    paired.forEach(notes => notes.forEach(n => skipNote.add(n.id)));
    const segOf: number[] = [];
    segs.forEach((seg, gi) => { for (let j = seg.start; j <= seg.end; j++) segOf[j] = gi; });
    const spans: ExtractSpan[] = [];
    const pushCopy = (b: ReciteBlock) => {
        const last = spans[spans.length - 1];
        if (last && last.kind === "copy") last.blocks.push(b);
        else spans.push({ kind: "copy", blocks: [b] });
    };
    for (let j = 0; j < s.length; j++) {
        const gi = segOf[j] ?? -1;
        if (gi >= 0) {
            if (j === segs[gi].end) { // 考核段段末原位换 [锚点+写位]
                spans.push({
                    kind: "unit",
                    targets: s.slice(segs[gi].start, segs[gi].end + 1),
                    notes: paired.get(gi) ?? [],
                });
            }
        } else if (!skipNote.has(s[j].id)) {
            pushCopy(s[j]);
        }
    }
    const emptyNoteCount = spans.filter(x => x.kind === "unit" && !x.notes.length).length;
    return { spans, emptyNoteCount };
}

/**
 * 锚点认领节打靶（kernel buildDrill 装配核心 / □4 老整篇文档迁移工具同族）：锚点插在
 * 锚定块（after 指向的块）紧后——认领节=文首到最后一个锚定块（含，中间块无论远近），
 * 节内原文族块（old/keep，flags 直判）打 target 后，锚点即考核段末后第一个块=「段末后
 * 紧邻题面」配对成立（extractSpans 语义）。题面候选（AI 锚点/written/手写新块）与空块
 * 不打：候选要保持可配对身份（打了靶会被并进考核段吞掉题面）。**判据须 flags 直判**：
 * 旧 `role==="context"` 在两角色 blockRole 下扩面到全部非空块（新写块 role 也是 context），
 * AI 锚点会被误并进考核段——flags 直判（!target && (old||keep)）与旧角色集合精确等价，
 * buildDrill 行为零变化。最后一个锚定块之后的尾部原文不认领——照抄进卷尾，不并入末题
 * 考核（旧整篇语义吞尾 refs 的兜底 hack 在统一出卷下退役）。
 */
export function contextBlocksToTarget(stream: ReciteBlock[], anchorAfterIDs: Set<string>): string[] {
    let last = -1;
    stream.forEach((b, i) => { if (anchorAfterIDs.has(b.id)) last = Math.max(last, i); });
    if (last < 0) return [];
    return stream.slice(0, last + 1).filter(b => !b.isTarget && (b.isOld || b.isKeep)).map(b => b.id);
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
 * 衍生文档标题：类型前缀·原文标题后缀（文档树/搜索里一眼可辨归属）；取不到原文标题退回裸前缀。
 * 标题里的 / 替换为全角——它是 hpath 分隔符，裸用会把标题拆成多层路径。
 */
export function derivedTitle(prefix: string, originTitle: string): string {
    const t = originTitle?.trim().replaceAll("/", "／") ?? "";
    return t ? `${prefix}·${t}` : prefix;
}

/**
 * 题目标题级别设置收敛（settingCfg.noteHeadingLevel）：1~6 整数，缺省/越界/非法回落 6。
 * kernel 侧从 tomato-settings.json 读同一键后过本函数。
 */
export function noteHeadingLevel(cfg: any): number {
    const n = Math.round(Number(cfg?.noteHeadingLevel));
    return Number.isFinite(n) && n >= 1 && n <= 6 ? n : 6;
}

/**
 * 筛挂了指定卡组的块 id（抽取文档原地重插前的孤儿卡清理目标，2026-09-14 闪卡继承）：
 * 判据=IAL custom-riff-decks 逗号列表含 deckID（getRiffCardsByBlockIDs 对无卡块也回
 * 占位行，不可作判据——FloatBar 制卡判态同注）。文档级卡挂文档块（不在子块流里），
 * 由「文档 id 不变」天然继承，不经此函数。前端 replaceUnitsInPlace 与 kernel
 * buildDrill 共用一份，防两处漂移。
 */
export function riffCardedIDs(ids: string[], ials: Record<string, Record<string, string>> | null | undefined, deckID: string): string[] {
    const RIFF_DECKS = "custom-riff-decks";
    return ids.filter(id => (ials?.[id]?.[RIFF_DECKS] ?? "").split(",").includes(deckID));
}

/**
 * 卷面单事务编排（新建与原地重插共用，2026-09-14 闪卡继承）：units 锚 seed 之后插入
 * ——insert op 同锚顺序发落库倒序，reverse 后落库=传入文档序；无 seed（空文档）兜底
 * parentID 头插 reverse 保序。deleteIDs（新建=种子空块；原地=全部旧子块）concat 在
 * inserts 后——事务 ops 顺序执行，失败整体回滚不留半成品。前端与 kernel 共用一份
 * （op 形态纯 JSON，两侧 IOperation 结构同构），防漂移从注释承诺变结构保证。
 */
export type UnitOp = { action: "insert" | "delete"; data?: string; previousID?: string; parentID?: string; id?: string };
export function unitReplaceOps(units: string[], seed: string | null | undefined, docID: string, deleteIDs: string[]): UnitOp[] {
    const inserts: UnitOp[] = seed
        ? units.slice().reverse().map(data => ({ action: "insert", data, previousID: seed }))
        : units.slice().reverse().map(data => ({ action: "insert", data, parentID: docID }));
    return inserts.concat(deleteIDs.map(id => ({ action: "delete", id })));
}
