// □8（3.8.3 升级战役）仿写判卷结果自定义块——纯函数层。
// 设计拍板（handoff 2026-09-07-1941 □8 六分叉）：
// - 流式照旧（super block 承接），完成后删临时块转 custom 块成品（收进卡）；
// - 卡=anno-chat 同构：头行（标题·判官档·时间·pose 成绩徽章·制卡钮）+ 判卷全文折叠层；
// - 3.8.3+ 特性检测分流，旧内核照旧引用块节（aiGrade.ts 尾部分流）；
// - custom 块照挂 custom-recite-ai IAL（插入后 setBlockAttrs——markdown 通道不解析 IAL），
//   现有 deleteOldGradeSections「第一个命中块到文档末尾整段删」天然兼容两形态；
// - 全免费零新墙（判卷链现状分层不动）。
// 内核契约（exp/apirenew-report.md）：content 含纯 ;;; 行拒写（isCustomBlockContentValid）——
// JSON.stringify 单行天然满足（换行转义为字面 \n）。

export const AI_GRADE_BLOCK_TYPE = "ai-grade";
export const AI_GRADE_FENCE = ";;;sy-recite-plugin/ai-grade";

export interface AiGradeBlockData {
    v: 1;
    /** 判官档 slug（gentle/neutral/strict，GRADER_TONES 同源） */
    tone: string;
    ts: number;
    /** AI 协议行成绩（great/medium/poor）；缺省=AI 未回传（徽章不显） */
    pose?: string;
    /** 遗漏点清单（□3：AI <missed> 协议回传「原文有而复述没提到」的短句）；缺省/空=不渲染 */
    missed?: string[];
    /** 判卷全文（落盘前已剥 pose 行与 think 标签） */
    text: string;
}

/** content 不得含纯 ;;; 行（内核拒写契约）——洗文本里的围栏样式字符以防意外 */
const sanitize = (s: string): string => s.replaceAll("‸", "");

/** missed 清单项清洗（build/parse 双侧共用）：非 string/空白丢弃 → trim → 剥围栏字符 */
function cleanMissedItems(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((m): m is string => typeof m === "string")
        .map(m => sanitize(m.trim()))
        .filter(m => m.length);
}

export function buildAiGradeContent(data: AiGradeBlockData): string {
    const clean: AiGradeBlockData = {
        v: 1,
        tone: typeof data.tone === "string" ? data.tone : "neutral",
        ts: typeof data.ts === "number" ? data.ts : 0,
        text: sanitize(data.text),
    };
    if (data.pose && data.pose.trim()) clean.pose = data.pose;
    const missed = cleanMissedItems(data.missed);
    if (missed.length) clean.missed = missed;
    return JSON.stringify(clean);
}

export function buildAiGradeBlockMD(content: string): string {
    return `${AI_GRADE_FENCE}\n${content}`;
}

/** 容错解析：坏 JSON/版本不符/text 缺失 → null（渲染层显占位）；tone/ts 脏数据洗默认 */
export function parseAiGradeContent(content: string): AiGradeBlockData | null {
    let raw: unknown;
    try {
        raw = JSON.parse(content);
    } catch {
        return null;
    }
    if (typeof raw !== "object" || raw === null) return null;
    const o = raw as Record<string, unknown>;
    if (o.v !== 1) return null;
    if (typeof o.text !== "string") return null;
    const data: AiGradeBlockData = {
        v: 1,
        tone: typeof o.tone === "string" ? o.tone : "neutral",
        ts: typeof o.ts === "number" ? o.ts : 0,
        text: o.text,
    };
    if (typeof o.pose === "string" && o.pose.trim()) data.pose = o.pose;
    const missed = cleanMissedItems(o.missed);
    if (missed.length) data.missed = missed;
    return data;
}

/** 头行时间戳（与 aiGrade 流式头块同款格式 YYYY-MM-DD HH:mm，本地时区）；脏数据（ts≤0）显占位 */
export function fmtGradeStamp(ts: number): string {
    if (!ts || ts <= 0) return "—";
    const d = new Date(ts);
    const p2 = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

// ---------- <missed> 协议（□3 遗漏点清单，<pose> 同构手法） ----------
// AI 在判卷末尾、pose 标记之前回传 <missed>["…","…"]</missed>（短句 JSON 数组，逐条带题号
// 出处）。弱模型容忍设计：坏 JSON/非数组=undefined（无清单，正文点评不受影响）；数组内脏项
// （非 string/空白）丢弃不整体失败；条数封顶防灌水。仅当场判卷通道追加此指令（copyPrompt
// 无回传通道，同 pose 理由不追加）。

const MISSED_RE = /<missed[^>]*>([\s\S]*?)<\/missed>/i;
/** 清单条数上限：防弱模型把全文点评灌进清单炸版面 */
const MISSED_MAX_ITEMS = 20;

/** 从判卷全文提取遗漏点清单；AI 没输出/输坏/过滤后空返回 undefined（渲染层不渲染） */
export function parseMissedTag(text: string): string[] | undefined {
    const inner = text.match(MISSED_RE)?.[1];
    if (inner === undefined) return undefined;
    let raw: unknown;
    try {
        raw = JSON.parse(inner);
    } catch {
        return undefined;
    }
    const items = cleanMissedItems(raw).slice(0, MISSED_MAX_ITEMS);
    return items.length ? items : undefined;
}

/** 剥离协议块（写入文档前必过，与 stripPoseLine 组合双清）：先删完整标记（连前置换行整段
 *  删、内容多行也删净，行中夹带变体一并删）；再截末尾未闭合残片——流式写块期间半截
 *  `<missed>["第1题：漏了` 先截掉再落文档（协议指令本就要求标记在末段，截尾安全）。 */
export function stripMissedTag(text: string): string {
    return text
        .replace(/\r?\n?[ \t]*<missed[^>]*>[\s\S]*?<\/missed>[ \t]*\r?\n?/gi, "")
        .replace(/\r?\n?[ \t]*<missed[^>]*>(?:(?!<\/missed>)[\s\S])*$/i, "");
}

export interface GradeLine {
    type: "h" | "li" | "p" | "gap";
    text?: string;
}

/** 判卷全文 markdown 简渲染数据层（渲染器消费）：AI 点评=题头（atx 标题或整行加粗）+列表+
 *  段落的低密度形态——h/li/p/gap 四态，不引完整 markdown 引擎（anno-chat renderNoteLines 同思路，
 *  快照只读；行内散置粗体等语法显示原文星号，可接受） */
export function renderGradeLines(text: string): GradeLine[] {
    const lines = text.split(/\r\n|\r|\n/).map((line): GradeLine => {
        const t = line.trim();
        if (!t) return { type: "gap" };
        const h = /^#{1,6}\s+(.*)$/.exec(t) || /^\*\*(.+)\*\*$/.exec(t);
        if (h) return { type: "h", text: h[1] };
        const li = /^([-*]|\d{1,3}[.)])\s+(.*)$/.exec(t);
        if (li) return { type: "li", text: li[2] };
        return { type: "p", text: t };
    });
    // gap 三步归一：折连续→去首→去尾（anno-chat 单遍 filter 在「尾双 gap」形态会漏留一个空行）
    const collapsed = lines.filter((l, i) => l.type !== "gap" || lines[i - 1]?.type !== "gap");
    while (collapsed.length && collapsed[0].type === "gap") collapsed.shift();
    while (collapsed.length && collapsed[collapsed.length - 1].type === "gap") collapsed.pop();
    return collapsed;
}
