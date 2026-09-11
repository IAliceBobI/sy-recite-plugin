/**
 * 抽取结构层纯函数（2026-09-09 recite MCP □3 抽出）：前端 extract.ts 与 kernel 侧
 * （goja 无 DOM/Lute）共用一份，防两处漂移。此处只放「流进流出」的结构判定——
 * 依赖 siyuan API/DOM 的（identifyNotes/md2Divs/单例重建）留在 extract.ts / kernel 各自实现。
 */
export type ReciteBlock = { id: string; markdown: string; isNote: boolean; isKeep?: boolean; isTarget?: boolean };
export type NoteGroup = { start: number; end: number; blocks: ReciteBlock[] };

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
 * groups.length + 1 组（末组=尾部）。批注块上的 keep 忽略；空块滤除。keep 块照常留在 refs 里。
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
