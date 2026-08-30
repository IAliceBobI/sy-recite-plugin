import type { Plugin } from "siyuan";
import { Menu } from "siyuan";
import { siyuan } from "../../sy-tomato-plugin/src/libs/siyuanApi";
import { copyToClipboard } from "../../sy-tomato-plugin/src/libs/domUtils";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { RECITE_EXTRACT, RECITE_COMPARE } from "./constants";
import { readExtractDoc, fetchOriginMarkdown, isAssociation } from "./extract";
import type { ExtractEntry } from "./extract";
import { setRecitePose } from "./mascot";

// 判官语气三档（2026-08-26）：文判·鼓励 / 中立（默认）/ 武判·严厉，QQ 秀哲学三档全免费。
// slug = settingCfg.graderTone 存储值（英文 slug 勿改，改名=老用户存量值失配回落中立）；
// i18nKey = 设置面板档名（plugin.i18n 键，缺翻译兜底取 · 后段）；lines = buildPrompt 指令区
// 末尾追加的语气指令行——中立档留空 = prompt 与旧版逐字一致，零回归。
export interface GraderToneDef {
    slug: string;
    i18nKey: string;
    lines: string[];
}
export const GRADER_TONES: GraderToneDef[] = [
    {
        slug: "gentle", i18nKey: "判官·文判鼓励", lines: [
            "点评语气：请做温和鼓励的「文判」——先真心点出写得好的亮点再谈不足，批评裹在",
            "改进建议里说，结尾给一句鼓劲；但评判标准不降分毫，错漏要点全，不因鼓励而漏报。",
        ],
    },
    { slug: "neutral", i18nKey: "判官·中立", lines: [] },
    {
        slug: "strict", i18nKey: "判官·武判严厉", lines: [
            "点评语气：请做铁面无私的「武判」——锱铢必较，每处错漏点名到字，措辞可以毒舌",
            "犀利，但不进行人身攻击、不贬低写作者本人；不要客套与铺垫，直接开列问题。",
        ],
    },
];
export const DEFAULT_TONE_SLUG = "neutral";
/** settingCfg 里的判官语气键（与 reciteTheme/reciteTopBar 同落 STORAGE_SETTINGS 单文件） */
export const TONE_SETTING_KEY = "graderTone";

// <pose> 协议行指令（2026-08-26 □12 判卷小宠物）：AI 在判卷末尾回传一行成绩标记，前端
// 解析驱动宠物表情（mascot.ts parsePose）、写入文档前剥离（stripPoseLine）。只给当场判卷
// 通道（aiGrade 传 withPose）——「复制提示词去网页版」无回传通道，用户粘到网页 AI 看到
// 标记行反而困惑，故 copyPrompt 不追加，判卷正文两通道均零污染。
const POSE_PROMPT_LINES = [
    "输出要求：请在全部点评的最末尾单独一行输出总体评价标记，写 <pose>great</pose>、",
    "<pose>medium</pose>、<pose>poor</pose> 三者之一（great=整体质量好、亮点多；medium=有",
    "好有坏；poor=问题较多、需重点改进）。此标记用于驱动界面小宠物的表情，点评正文不要再出现。",
];

function toneLinesOf(tone: string | undefined): string[] {
    return GRADER_TONES.find(t => t.slug === tone)?.lines ?? [];
}

/**
 * 判卷提示词模板（spec「判卷提示词模板」节）：每条批注一题，原文段/笔记/复述三要素。
 * 原文按 refs 实时回查（与对比文档左列同源）；笔记=总结块（判卷上下文，抽取文档里仍在）。
 * 双标准（2026-08-26）：仿写级（逐句贴近）+ 骨架级（借结构换内容）一套模板让 AI 按每题
 * 实际写法自判，不分套——练法标记/判卷时选练法两方案已否决（给用户加仪式感，违反
 * 「批注即练习、零仪式感」产品气质）；另兜底逐字还原→按用词精度、英文→按英文点评两句。
 * 技法达成+方向级（2026-08-28 AI 拆分）：AI 插的仿写锚点写明技法要求、方向锚点只给剧情/
 * 情绪方向，两个 prompt 变体点评标准区各加两行承接——有意打破「纯仿写文档 prompt 逐字一致」
 * 旧承诺（功能改进非回归）。
 * 联想级（2026-08-26 联想练习）：批注「联想：」开头的题自由联想写作无原文可比，条目改
 * 【题目】+【我的联想】两要素、头部加联想级 rubric（词全用上/连接巧度/联想广度/融合度/
 * 词义准确，提炼自物品×情绪×时代公式与三词联想法两篇方法论笔记）；纯仿写文档（无联想题）
 * 生成的提示词与旧版逐字一致，零回归。
 * 判官语气（2026-08-26 三档）：tone 非中立档时指令区末尾追加一段语气指令（文判鼓励/武判
 * 严厉），aiGrade 与 copyPrompt 两通道从 settingCfg.graderTone 传入自动一致；中立档零追加。
 * pose 协议（2026-08-26 □12）：withPose=true（仅 aiGrade）再追加小宠物表情标记指令。
 */
export async function buildPrompt(entries: ExtractEntry[], tone?: string, withPose?: boolean): Promise<string> {
    const assoc = entries.map(e => isAssociation(e.noteMarkdown));
    const hasAssoc = assoc.some(Boolean);
    const originsPerEntry = await Promise.all(
        entries.map((e, i) => (assoc[i] ? Promise.resolve([] as string[]) : fetchOriginMarkdown(e.refs))),
    );
    const parts: string[] = hasAssoc ? [
        "我在做写作练习（读后仿写与自由联想）。下面每题按题型给出材料与我的写作，",
        "请逐题点评，不需要复述原文或题目，直接给结论。",
        "点评标准请按每题写作的实际写法自行判断：",
        "- 仿写级（逐句贴近原文的写法）：指出遗漏的要点、意思偏差处、我杜撰的内容。",
        "- 骨架级（只借原文的结构骨架、内容换新的写法）：点评结构节拍是否与原文同构",
        "（句式、段落节奏、起承转合），新内容是否自洽、有无逻辑漏洞。",
        "- 联想级（题目只给几个词、自由联想写作的写法）：检查给出的词是否全部用上、",
        "词与词的连接是否巧妙（场景化、意象化，还是生硬拼贴）、联想广度（是否只停在",
        "第一层联想、每个词的子树展开是否丰富）、人物与主题能否把所有词融合成一个",
        "整体、词义是否用得准（如「安全带」不等于「安全地带」）。",
        "- 技法达成（笔记写明写作技法要求时，检查复述是否真用上了该技法、用得如何）。",
        "- 方向级（笔记只给剧情/情绪方向而非关键词的写法）：剧情走向大致贴合、情绪曲线",
        "对味即好，不逐点较真，鼓励合理的再创作。",
        "另两种情形请兼顾：",
        "- 复述接近逐字还原时，改按用词精度点评（错字、与原文用词的细微差别）。",
        "- 原文/复述是英文时，改按英文语法与用词点评。",
        "",
    ] : [
        "我在做「读后仿写」练习。下面每题给出【原文】【我的笔记】【我的复述】，",
        "请逐题点评，不需要复述原文，直接给结论。",
        "点评标准请按每题复述的实际写法自行判断：",
        "- 仿写级（逐句贴近原文的写法）：指出遗漏的要点、意思偏差处、我杜撰的内容。",
        "- 骨架级（只借原文的结构骨架、内容换新的写法）：点评结构节拍是否与原文同构",
        "（句式、段落节奏、起承转合），新内容是否自洽、有无逻辑漏洞。",
        "- 技法达成（笔记写明写作技法要求时，检查复述是否真用上了该技法、用得如何）。",
        "- 方向级（笔记只给剧情/情绪方向而非关键词的写法）：剧情走向大致贴合、情绪曲线",
        "对味即好，不逐点较真，鼓励合理的再创作。",
        "另两种情形请兼顾：",
        "- 复述接近逐字还原时，改按用词精度点评（错字、与原文用词的细微差别）。",
        "- 原文/复述是英文时，改按英文语法与用词点评。",
        "",
    ];
    const toneLines = toneLinesOf(tone);
    if (toneLines.length) parts.push(...toneLines, "");
    if (withPose) parts.push(...POSE_PROMPT_LINES, "");
    entries.forEach((e, i) => {
        const write = e.writes.map(w => w.markdown).join("\n\n");
        parts.push(`## 第 ${i + 1} 题`);
        if (assoc[i]) { // 联想题：题目（批注原文）+ 联想写作两要素，无原文/笔记
            parts.push("【题目】");
            parts.push(e.noteMarkdown);
            parts.push("");
            parts.push("【我的联想】");
            parts.push(write || "（未写作）");
            parts.push("");
            return;
        }
        const origin = originsPerEntry[i].join("\n\n") || "（本条批注前没有原文段）";
        parts.push("【原文】");
        parts.push(origin);
        parts.push("");
        parts.push("【我的笔记】");
        parts.push(e.noteMarkdown);
        parts.push("");
        parts.push("【我的复述】");
        parts.push(write || "（未仿写）");
        parts.push("");
    });
    return parts.join("\n");
}

/**
 * 网页版 AI 对话入口（2026-08-25 复制即用闭环）：复制提示词后弹菜单选一家直接 window.open，
 * 浏览器里 Cmd+V 粘贴即判卷。key = i18n 键；name = 中文兜底文案里的品牌名（不翻译）。
 */
const AI_CHAT_SITES = [
    { key: "打开DeepSeek", name: "DeepSeek", url: "https://chat.deepseek.com/" },
    { key: "打开豆包", name: "豆包", url: "https://www.doubao.com/chat/" },
    { key: "打开千问", name: "通义千问", url: "https://www.tongyi.com/" },
    { key: "打开Kimi", name: "Kimi", url: "https://kimi.moonshot.cn/" },
];

/**
 * 弹「打开 AI 网页版」菜单。anchor = 浮条按钮（菜单贴其下方弹出）；无 anchor（快捷键/右键
 * 回调拿不到坐标）落屏幕右下角向左上展开，不挡正文。popup 在 click 回调内（用户手势链），
 * window.open 不被弹窗拦截。
 */
function openSiteMenu(plugin: Plugin, anchor?: MouseEvent | HTMLElement) {
    const t: any = plugin?.i18n ?? {};
    const say = (k: string, fb: string) => t[k] || fb;
    const menu = new Menu("recite-ai-sites");
    AI_CHAT_SITES.forEach(s => menu.addItem({
        label: say(s.key, `打开 ${s.name}`),
        icon: "iconLink",
        click: () => { window.open(s.url, "_blank"); },
    }));
    if (anchor instanceof MouseEvent) {
        menu.open({ x: anchor.clientX, y: anchor.clientY });
    } else if (anchor) {
        const r = anchor.getBoundingClientRect();
        menu.open({ x: r.right, y: r.bottom, isLeft: true });
    } else {
        // 右下角向上留白弹（内核 popup 自带屏幕边界翻转，此处 y 上移一个菜单高度保常态向上展开）
        menu.open({ x: window.innerWidth - 16, y: window.innerHeight - 220, isLeft: true });
    }
}

/** 复制提示词（焦点须在抽取/对比文档）：拼判卷提示词进剪贴板（headless 无剪贴板权限时以 recite.prompt 打点区分环境限制），成功后弹菜单可选直接打开网页版 AI */
export async function copyPrompt(extractID: string, plugin?: Plugin, anchor?: MouseEvent | HTMLElement) {
    if (!extractID) return;
    let attrs = await siyuan.getBlockAttrs(extractID);
    if (attrs?.[RECITE_COMPARE]) { // 对比文档浮条入口：跳到抽取文档取数据
        extractID = attrs[RECITE_COMPARE];
        attrs = await siyuan.getBlockAttrs(extractID);
    }
    if (!attrs?.[RECITE_EXTRACT]) {
        await siyuan.pushMsg("请在抽取/对比文档中点击「复制提示词」", 2500);
        return;
    }
    const entries = await readExtractDoc(extractID);
    if (!entries.length) {
        await siyuan.pushMsg("抽取文档里没有批注（旧版布局请先「重新写」）", 3000);
        return;
    }
    const t: any = plugin?.i18n ?? {};
    const say = (k: string, fb: string) => t[k] || fb;
    const prompt = await buildPrompt(entries, (plugin as any)?.settingCfg?.[TONE_SETTING_KEY]);
    const ok = await copyToClipboard(prompt);
    debugLog("recite.prompt", `copied=${ok} entries=${entries.length} chars=${prompt.length}`, "recite");
    if (ok) {
        openSiteMenu(plugin, anchor);
        setRecitePose("wait", 4000); // 复制通道无回传：宠物短暂出场打个盹送行即退（proposals.md 乙 5）
    }
    await siyuan.pushMsg(
        ok
            ? say("已复制选网页", "判卷提示词已复制，点菜单项打开网页版即可粘贴判卷")
            : "复制失败，请手动复制",
        3000,
    );
}
