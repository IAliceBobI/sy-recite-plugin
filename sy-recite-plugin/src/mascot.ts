// 判卷小宠物（2026-08-26 □12）：AI 判卷全流程的伴侣形象——判卷时出场打盹等待，出结果按
// 成绩摆表情。方案唯一事实源 docs/research/recite-pet/proposals.md（vision-deepseek 出，
// 数值级任务书）。机制：常驻 div.recite-mascot 挂 body（display 由 data-pose 驱动，仅判卷
// 流程出场，平时不打扰）；pose 词 = 成绩（AI 在判卷末尾回传 <pose>great|medium|poor</pose>
// 协议行，前端写入文档前剥离不污染正文）× 判官等级（前端本地 settingCfg.graderTone，无需
// 回传）组合出特征态 gentle-great（文判好评卖萌）/ strict-poor（武判差评瞪眼）。
// 帧渲染全在 index.scss（SVG data URI；形象维度 body[data-recite-mascot]，默认无属性 =
// 柴犬豆豆；□26 扩容后五形象：豆豆/雪团免费、小盼/博士/豆芽 Pro——Pro 形象整体 unpaid
// 门禁，强挂属性也回落豆豆帧；免费形象雪团基础帧无门禁，仅特征帧照豆豆语义走 Pro）。
// □5 货架「无」档（slug=none）非渲染形象：与出场开关 reciteMascotOn 同一键的货架入口。
// 本模块只管注册表 / body 属性 / 容器 / pose 状态机 / 协议行解析剥离。

export interface ReciteMascotDef {
    slug: string;
    i18nKey: string;
    pro: boolean;
}

export const RECITE_MASCOTS: ReciteMascotDef[] = [
    // 「无」档（2026-09-01 □5 用户拍板 B 案）：与出场开关 reciteMascotOn 同一状态的货架
    // 入口——选无只落 reciteMascotOn=false 不动形象键（记忆保留，重开开关即回原形象）；
    // 排头对齐背景库 RECITE_BGS「无」先例。非可渲染形象，applyReciteMascot 特判分流不走帧属性
    { slug: "none", i18nKey: "宠物·无", pro: false },
    { slug: "shiba", i18nKey: "宠物·柴犬豆豆", pro: false },
    { slug: "snow", i18nKey: "宠物·白兔雪团", pro: false },
    { slug: "spirit", i18nKey: "宠物·精灵小盼", pro: true },
    { slug: "owl", i18nKey: "宠物·雪鸮博士", pro: true },
    { slug: "dino", i18nKey: "宠物·恐龙豆芽", pro: true },
];

export const DEFAULT_MASCOT_SLUG = "shiba";

/** settingCfg 里的形象选择键 / 出场开关键（与 reciteTheme 等同落 STORAGE_SETTINGS 单文件） */
export const MASCOT_SETTING_KEY = "reciteMascot";
export const MASCOT_ENABLED_SETTING_KEY = "reciteMascotOn";

/** 给 body 挂/摘 data-recite-mascot：非默认且已注册才挂（= 精灵小盼），否则摘掉（= 豆豆）。
 * 「无」档特判分流 applyMascotEnabled(false)（挂 off 而非形象属性）——UI 正常路径选无只调
 * applyMascotEnabled（形象属性留着，重开开关即回原形象），此处兜底手改存储等防御路径 */
export function applyReciteMascot(slug: string | undefined) {
    if (slug === "none") {
        applyMascotEnabled(false);
        document.body.removeAttribute("data-recite-mascot");
        return;
    }
    const hit = RECITE_MASCOTS.find(m => m.slug === slug);
    if (hit && hit.slug !== DEFAULT_MASCOT_SLUG) {
        document.body.setAttribute("data-recite-mascot", hit.slug);
    } else {
        document.body.removeAttribute("data-recite-mascot");
    }
}

/** 出场开关（默认开，undefined=开仅显式 false 才关）：关 = body 挂 off 属性，CSS 关显示 */
export function applyMascotEnabled(on: boolean | undefined) {
    if (on === false) document.body.setAttribute("data-recite-mascot-off", "");
    else document.body.removeAttribute("data-recite-mascot-off");
}

// ---------- 常驻容器（display/登场位置全交给 CSS 的 data-pose，本模块零样式知识） ----------

let mascotEl: HTMLElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

/** 收场动画时长（与 index.scss recite-mascot-vanish 0.32s 对齐，两段式退场的 CSS 半段） */
const MASCOT_EXIT_MS = 350;

/** 出分表情定格时长：冒出 0.55s + 定格 1.6s + 收场 0.35s ≈ 2.5s 全程零交互（第四版演出
 * 2026-08-26 用户拍板：宠物常驻浮条 + hover/click 互动，出分原地放大给表情后化烟回常驻，
 * 杜绝旧版 6s「赖着不走像要点一下才消失」） */
const MASCOT_SHOW_MS = 1600;

/** 摸头互动时长（click：蹦两下 + 眯眼笑一瞬 + 冒爱心，与 CSS --pat 动画 0.9s 对齐） */
const MASCOT_PAT_MS = 900;

/** pat 变身演出时长（click：切变身全身帧 + 放大定格，与 CSS recite-mascot-transform
 * 1.6s 对齐；2026-08-26 用户提议「点击了之后就变大，出来全身有翅膀的」——变身感需要
 * 定格时长，比豆豆蹦跳长）。□26 扩容：小盼展翅 / 博士学识爆发 / 豆芽喷火共用 */
const MASCOT_PAT_TRANSFORM_MS = 1600;

/** 有专属变身帧的形象（其余形象 pat 走豆豆模式：复用 great 蹦跳 0.9s） */
const MASCOT_TRANSFORM_SLUGS = new Set(["spirit", "owl", "dino"]);

export function mountReciteMascot() {
    if (mascotEl) return;
    mascotEl = document.createElement("div");
    mascotEl.className = "recite-mascot";
    // 烟雾 puff ×4（纯 CSS 播放，登场的「烟雾中冒出来」演出，方向差异见 nth-child 规则）
    for (let i = 0; i < 4; i++) {
        const puff = document.createElement("span");
        puff.className = "recite-mascot__puff";
        mascotEl.appendChild(puff);
    }
    // 摸头互动（2026-08-26 用户提议）：常驻待机态点击 = 蹦两下 + 切「眯眼笑」帧一瞬 +
    // 冒小爱心（CSS --pat 动画整包）。变身形象（小盼/博士/豆芽，Pro 已付费）点击 =
    // 变身演出（全身定格帧 + 放大定格，时长更长）。判卷演出态（wait/出分）不响应——
    // 演出不打断。
    mascotEl.addEventListener("click", () => {
        if (!mascotEl || mascotEl.dataset.pose || mascotEl.classList.contains("recite-mascot--pat")) return;
        mascotEl.classList.add("recite-mascot--pat");
        const transform = MASCOT_TRANSFORM_SLUGS.has(document.body.getAttribute("data-recite-mascot") ?? "")
            && !document.body.classList.contains("recite-unpaid");
        setTimeout(() => mascotEl?.classList.remove("recite-mascot--pat"),
            transform ? MASCOT_PAT_TRANSFORM_MS : MASCOT_PAT_MS);
    });
    // 挂浮条根内（FloatBar 根 div 常驻 DOM，absolute 定位随浮条拖动自动跟随；无激活
    // 文档浮条 --idle 隐藏时宠物随浮条整体隐藏）。mount 时机在 mount(FloatBar) 之后根
    // 必在；万一竞态拿不到就挂 body 兜底（CSS 走 fixed 右下角老位）。
    (document.querySelector(".recite-floatbar") ?? document.body).appendChild(mascotEl);
}

export function unmountReciteMascot() {
    if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
    }
    mascotEl?.remove();
    mascotEl = null;
}

/** 两段式退场的收尾半段（CSS 演完 vanish/puff-out 再真清 pose，宠物回到常驻待机） */
function clearPose() {
    if (mascotEl) {
        delete mascotEl.dataset.pose;
        mascotEl.classList.remove("recite-mascot--out");
    }
    hideTimer = null;
}

/**
 * 驱动宠物姿态（定位全在 CSS：常驻/演出都在浮条左上贴纸位，无 JS 坐标）。pose 词表：
 * wait（判卷中，48px 打盹常驻，stayMs=0 不自动退，流结束由调用方切换）/ 其余姿态
 * （great·medium·poor 成绩 / gentle-great·strict-poor 特征态 / error 失败 / idle 回落）
 * 走**放大登场**演出（CSS 层 :not([data-pose="wait"]) 组：烟雾绽开 + 原地 pop 放大 1.75
 * 定格给表情）。有 stayMs 的姿态定格后两段式退场（--out 收场动画 0.32s → 清 pose 回常驻）。
 */
export function setRecitePose(pose: string, stayMs = MASCOT_SHOW_MS) {
    if (!mascotEl) return;
    if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
    }
    mascotEl.classList.remove("recite-mascot--out");
    if (!pose) {
        clearPose();
        return;
    }
    mascotEl.dataset.pose = pose;
    if (stayMs > 0) {
        hideTimer = setTimeout(() => {
            if (!mascotEl) return;
            mascotEl.classList.add("recite-mascot--out"); // 收场动画半段
            hideTimer = setTimeout(clearPose, MASCOT_EXIT_MS);
        }, stayMs);
    }
}

/** 成绩 × 判官等级 → pose 词：仅两个「情绪溢价」组合出特征态，其余回落成绩基础词 */
export function poseWithTone(grade: string, toneSlug: string | undefined): string {
    if (grade === "great" && toneSlug === "gentle") return "gentle-great";
    if (grade === "poor" && toneSlug === "strict") return "strict-poor";
    return grade;
}

// ---------- <pose> 协议行（buildPrompt 指令 ↔ 判卷正文剥离 ↔ 表情驱动） ----------

const POSE_RE = /<pose[^>]*>\s*(great|medium|poor)\s*<\/pose>/i;

/** 从判卷全文提取协议行成绩；AI 没输出/输坏返回 undefined（调用方回落 idle） */
export function parsePose(text: string): string | undefined {
    return text.match(POSE_RE)?.[1]?.toLowerCase();
}

/**
 * 剥离协议行（写入文档前必过，判卷正文与无宠物时代逐字一致）：先删完整标记（连前置
 * 换行一起吃，整行删除不留空行；行中夹带的罕见变体也一并删）；再截末尾未闭合残片——
 * 流式写块期间半截 `<pose>gre` 也先截掉再落文档（协议指令本就要求标记在最后一行，
 * 截尾安全）。
 */
export function stripPoseLine(text: string): string {
    return text
        .replace(/\r?\n?[ \t]*<pose[^>]*>[ \t]*(?:great|medium|poor)[ \t]*<\/pose>[ \t]*\r?\n?/gi, "")
        .replace(/\r?\n?[ \t]*<pose[^>]*>(?:(?!<\/pose>)[\s\S])*$/i, "");
}
