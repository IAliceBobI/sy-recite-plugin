/**
 * 抽取结构层纯函数（2026-09-09 recite MCP □3 抽出）：前端 extract.ts 与 kernel 侧
 * （goja 无 DOM/Lute）共用一份，防两处漂移。此处只放「流进流出」的结构判定——
 * 依赖 siyuan API/DOM 的（identifyNotes/md2Divs/单例重建）留在 extract.ts / kernel 各自实现。
 */
export type ReciteBlock = {
    id: string;
    markdown: string;
    isNote: boolean; // 兼容面：批注=总结角色（role==="summary"）；老消费方（groupNotes/配对窗口）照读
    isKeep?: boolean;
    isTarget?: boolean;
    isOld?: boolean; // 判据原料：custom-recite-old 直存（role 的输入，非输出）
    role: ReciteRole; // □1 三角色统一判定（唯一事实源，判定序见 blockRole）
};
export type NoteGroup = { start: number; end: number; blocks: ReciteBlock[] };

// ---- □1 标记层三角色模型（2026-09-13 仿写三角色战役，handoff 2026-09-13-1555）----
export type ReciteRole = "target" | "context" | "summary" | "none";

/**
 * 三角色判定序（设计共识，唯一权威）：target? 考核 : keep? 上下文 : old? 上下文 : 非空? 总结 : 无角色。
 * - keep 泛化到任意块：新写块挂 keep=上下文（bear 需求①——写总结时补的提示要像原文一样进语境）；
 * - 存量基线（bear 拍板）：old 块默认上下文；新写非空块默认总结（写完即染色惯性）；
 * - markdown 只判空不判内容（DOM 侧传 textContent 同构——角色不读文本）。
 */
export function blockRole(b: { markdown: string; isOld?: boolean; isKeep?: boolean; isTarget?: boolean }): ReciteRole {
    if (b.isTarget) return "target";
    if (b.isKeep) return "context";
    if (b.isOld) return "context";
    return b.markdown.trim() ? "summary" : "none";
}

/**
 * 流块构造（前端 identifyNotes 与 kernel readStream 共用一份，防两处漂移）：
 * role 过 blockRole；兼容面 isNote=批注（总结角色）——挂 keep 的新写块从此不再当批注
 * （过渡期老抽取路径不再成题、走照抄）。attrsForRole（三钮互斥写值）在前端 role.ts
 * （依赖 constants.ts 的属性名，kernel 勿 import）。
 */
export function toReciteBlock(id: string, markdown: string, flags: { isOld?: boolean; isKeep?: boolean; isTarget?: boolean }): ReciteBlock {
    const role = blockRole({ markdown, ...flags });
    return {
        id, markdown, role,
        isNote: role === "summary",
        isKeep: !!flags.isKeep,
        isTarget: !!flags.isTarget,
        isOld: !!flags.isOld,
    };
}

/**
 * 选中块多数角色（浮条三钮高亮判据）：无角色（空块）不计入；严格多数（> 非空块半数）
 * 才返回该角色——平票/空选返回 null（三钮全不亮）。高亮语义=选中集「当前是什么」，
 * 与三钮「设成什么」互为表里。
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
 * □1 起判定经 toReciteBlock：挂 keep 的新写块 isNote=false，`!b.isNote` 不再把它排除——
 * keep 泛化到任意块（bear 需求①：写总结时补的提示挂 keep=进卡面语境而非成题）。
 */
export function keepBlocksForGroups(stream: ReciteBlock[], groups: NoteGroup[]): ReciteBlock[][] {
    const isKeepBlock = (b: ReciteBlock) => !!b.isKeep && !b.isNote && !!b.markdown.trim();
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
 * 统一出卷整流（□2 出卷层，2026-09-13 仿写三角色战役）：单一扫描语义——整篇/节选分叉
 * 退役，extractSpans 是抽取文档构建蓝图的唯一路径（前端 doExtract 与 kernel buildDrill
 * 共用，防两处漂移）。核心分叉（handoff 设计共识）：
 * - 考核块（连续 target，滤空流上相邻）聚段 → 段末原位换 [锚点+写位]（refs=段块 id）；
 * - 考核段**后紧邻**提示块（总结角色）升格为锚点（窗口=段末到下一段首/文末，窗口内首块
 *   须是提示，不越原文认领——与期2节选配对方向一致）；
 * - 无提示=空锚点占位（notes=[]，仍出卷——保 note 属性契约，下游 writeZone/q-ctrl/
 *   compare/判卷零分叉；判卷走纯默写）；
 * - 上下文块照抄（copy span → 挂 RECITE_KEEP 复制）；未升格提示块照抄+染色（hint span →
 *   挂 RECITE_HINT，卷子里的提示块新视觉）；
 * - 空块滤除；无考核段不出卷（调用方数 unit 数为零时 toast）。
 */
export type ExtractSpan =
    | { kind: "copy"; blocks: ReciteBlock[] } // 上下文照抄（原文复制，挂 keep）
    | { kind: "hint"; blocks: ReciteBlock[] } // 未升格提示照抄（用户写的总结未配考核段，挂 hint 染色）
    | { kind: "unit"; targets: ReciteBlock[]; notes: ReciteBlock[] }; // 考核段（notes 空=空锚点占位）

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
    // 配对：窗口 = (段末, 下一段首) / (末段末, 文末)，取窗口内第一个提示块并向后续到提示组末
    const paired = new Map<number, ReciteBlock[]>();
    segs.forEach((seg, gi) => {
        const winEnd = gi + 1 < segs.length ? segs[gi + 1].start : s.length;
        const notes: ReciteBlock[] = [];
        for (let j = seg.end + 1; j < winEnd && s[j].isNote; j++) notes.push(s[j]);
        if (notes.length) paired.set(gi, notes);
    });
    // 整流：照抄块与 [锚点+写位] 单元按文档序排布。照抄逐块入 span、相邻同类才合并——
    // copy（上下文）与 hint（未升格提示）交错时不得重排（双缓冲 flush 会把交错序压扁）。
    // 升格提示跳过（已变锚点本体）；无提示考核段=空锚点占位（notes=[] 仍出卷）。
    const skipNote = new Set<string>();
    paired.forEach(notes => notes.forEach(n => skipNote.add(n.id)));
    const segOf: number[] = [];
    segs.forEach((seg, gi) => { for (let j = seg.start; j <= seg.end; j++) segOf[j] = gi; });
    const spans: ExtractSpan[] = [];
    const pushCopy = (b: ReciteBlock, kind: "copy" | "hint") => {
        const last = spans[spans.length - 1];
        if (last && last.kind === kind) last.blocks.push(b);
        else spans.push({ kind, blocks: [b] });
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
            pushCopy(s[j], s[j].isNote ? "hint" : "copy");
        }
    }
    const emptyNoteCount = spans.filter(x => x.kind === "unit" && !x.notes.length).length;
    return { spans, emptyNoteCount };
}

/**
 * 锚点认领节打靶（kernel buildDrill 装配核心 / □4 老整篇文档迁移工具同族）：锚点插在
 * 锚定块（after 指向的块）紧后——认领节=文首到最后一个锚定块（含，中间块无论远近），
 * 节内 context 角色块（old/keep 原文）打 target 后，锚点即考核段末后第一个块=「段末后
 * 紧邻提示」配对成立（extractSpans 语义）。手写批注（summary）与空块不打：批注保持
 * 提示身份（卷里进 hint 照抄）。最后一个锚定块之后的尾部原文不认领——照抄进卷尾，
 * 不并入末题考核（旧整篇语义吞尾 refs 的兜底 hack 在统一出卷下退役）。
 */
export function contextBlocksToTarget(stream: ReciteBlock[], anchorAfterIDs: Set<string>): string[] {
    let last = -1;
    stream.forEach((b, i) => { if (anchorAfterIDs.has(b.id)) last = Math.max(last, i); });
    if (last < 0) return [];
    return stream.slice(0, last + 1).filter(b => b.role === "context").map(b => b.id);
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
