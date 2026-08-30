// 皮肤主题注册表 + 应用器（2026-08-25 皮肤真切换）：
// - slug = body[data-recite-theme] 属性值 + settingCfg 存储值（英文 slug 勿改——改名 = 老用户
//   存量值失配回落默认皮肤）；i18nKey = 设置面板货架显示名（plugin.i18n 键）；color = 货架
//   样机主色（index.scss 各主题 token 组的同色源）。
// - index.scss 的 $recite-skins 覆盖块（四套 Pro 皮肤）与本表 slug 必须一一对齐，新皮肤两头同步加。
// - 默认「琉璃琥珀」= 无 data-recite-theme 属性直用 :root token 组；未知/缺省 slug 一律回落默认。
export interface ReciteSkin {
    slug: string;
    i18nKey: string;
    color: string;
    /** 是否 Pro 收费皮肤（amber/eye-care 免费；Settings 货架 locked 判定用） */
    pro: boolean;
}

export const RECITE_SKINS: ReciteSkin[] = [
    { slug: "amber", i18nKey: "皮肤·琉璃琥珀", color: "#d4a960", pro: false },
    // 护眼皮肤（2026-08-27 □18，bg-library proposals §4）：豆沙绿低饱和 accent，免费——
    // 与羊皮纸背景组合即主打护眼场景；token 组见 index.scss $recite-skins 的 eye-care 行
    { slug: "eye-care", i18nKey: "皮肤·豆沙护眼", color: "#8fbf9a", pro: false },
    { slug: "ink-teal", i18nKey: "皮肤·青瓷砚墨", color: "#7fb5a8", pro: true },
    { slug: "plum", i18nKey: "皮肤·松烟黛紫", color: "#9d8cc4", pro: true },
    { slug: "sakura", i18nKey: "皮肤·绯樱落霞", color: "#d98a9c", pro: true },
    { slug: "mist", i18nKey: "皮肤·苍山雾雪", color: "#8fb6d9", pro: true },
    // 装饰皮肤三套（2026-08-26 □8，proposals.md 方案 A/B/C）：不止换色，整主题自带
    // 贴纸/花边/蕾丝装饰（index.scss 装饰覆盖块，同 slug 对齐；配套全局纸纹已随 □18
    // 背景库重做退役——背景与皮肤解耦，背景另见 RECITE_BGS）
    { slug: "sunny-kitty", i18nKey: "皮肤·晨光橘猫", color: "#e8a94d", pro: true },
    { slug: "celadon-rabbit", i18nKey: "皮肤·青瓷墨兔", color: "#7fb5a8", pro: true },
    { slug: "nocturne", i18nKey: "皮肤·暗夜轻奢", color: "#aab2e0", pro: true },
];

export const DEFAULT_SKIN_SLUG = "amber";

/** settingCfg 里的皮肤键（setTopBar 开关键为 reciteTopBar，同落 STORAGE_SETTINGS 单文件） */
export const THEME_SETTING_KEY = "reciteTheme";

/** 给 body 挂/摘 data-recite-theme：非默认且已注册才挂属性，否则摘掉（= 默认琥珀） */
export function applyReciteTheme(slug: string | undefined) {
    const hit = RECITE_SKINS.find(s => s.slug === slug);
    if (hit && hit.slug !== DEFAULT_SKIN_SLUG) {
        document.body.setAttribute("data-recite-theme", hit.slug);
    } else {
        document.body.removeAttribute("data-recite-theme");
    }
}

// ========== 浮条皮肤注册表（2026-08-25 浮条美化，QQ 秓「功能免费，Pro 视觉收费」） ==========
// 与 RECITE_SKINS 同机制但独立维度：body[data-recite-floatbar-skin] 属性 + settingCfg.floatbarSkin。
// color = 设置货架样机主按钮色；mockBg = 样机底色（空串 = 跟随 b3 surface）；pro = 是否收费视觉
// （未激活锁卡片 + index.scss 门禁 body:not(.recite-unpaid) 双保险，unpaid 挂了属性也不生效）。
// index.scss 的浮条皮肤覆盖块（墨玉轻雾/宣纸）与本表 slug 一一对齐，新皮肤两头同步加。
export interface ReciteFloatbarSkin {
    slug: string;
    i18nKey: string;
    color: string;
    mockBg: string;
    pro: boolean;
}

export const RECITE_FLOATBAR_SKINS: ReciteFloatbarSkin[] = [
    { slug: "dawn", i18nKey: "浮条·晨光便签", color: "#d4a960", mockBg: "", pro: false },
    { slug: "ink-mist", i18nKey: "浮条·墨玉轻雾", color: "#d4a960", mockBg: "#26272b", pro: true },
    { slug: "xuan", i18nKey: "浮条·宣纸", color: "#d4a960", mockBg: "#f7f1e6", pro: true },
    // 浮条二波（2026-08-27 □23，proposals.md §1）：三迁移款自装饰皮肤段搬家换轴 + 两原创。
    // 扇贝/回纹/鎏金原属 Pro 装饰皮肤（拆售不白送）；竹简为第二免费样板间（花边语言引流）。
    { slug: "scallop", i18nKey: "浮条·扇贝花边", color: "#d4a960", mockBg: "", pro: true },
    { slug: "fret", i18nKey: "浮条·回纹滚边", color: "#647d72", mockBg: "#f0f3ee", pro: true },
    { slug: "gilded", i18nKey: "浮条·鎏金嵌边", color: "#aab2e0", mockBg: "#20222c", pro: true },
    { slug: "bamboo", i18nKey: "浮条·竹简", color: "#d4a960", mockBg: "#eef1e2", pro: false },
    { slug: "vermilion", i18nKey: "浮条·朱丝栏", color: "#bd4a34", mockBg: "#fcf4ea", pro: true },
];

export const DEFAULT_FLOATBAR_SKIN_SLUG = "dawn";

/** settingCfg 里的浮条皮肤键（与 reciteTheme/reciteTopBar 同落 STORAGE_SETTINGS 单文件） */
export const FLOATBAR_SKIN_SETTING_KEY = "floatbarSkin";

/** 给 body 挂/摘 data-recite-floatbar-skin：非默认且已注册才挂属性，否则摘掉（= 晨光便签） */
export function applyReciteFloatbarSkin(slug: string | undefined) {
    const hit = RECITE_FLOATBAR_SKINS.find(s => s.slug === slug);
    if (hit && hit.slug !== DEFAULT_FLOATBAR_SKIN_SLUG) {
        document.body.setAttribute("data-recite-floatbar-skin", hit.slug);
    } else {
        document.body.removeAttribute("data-recite-floatbar-skin");
    }
}

// —— 装饰皮肤→浮条款一次性播种映射（2026-08-27 □23 二波解耦）：老用户浮条观感平滑搬家，
// 见 docs/research/recite-floatbar-skins/proposals.md §4
const FLOATBAR_SEED_MAP: Record<string, string> = {
    "sunny-kitty": "scallop",
    "celadon-rabbit": "fret",
    "nocturne": "gilded",
};

/**
 * 解耦播种：装饰皮肤老用户首次启动把浮条轴搬到对应迁移款。undefined 判据天然幂等（写值后
 * 不再命中）；未激活跳过（目标款全 Pro，防货架「已选中 ∨ 锁标」矛盾态）。只改传入 cfg，
 * 落盘由调用方负责（返回 true 时应立即 saveData 固化，防日后切主题判据漂移二次改写）。
 */
export function seedFloatbarSkin(cfg: any, paid: boolean): boolean {
    if (!cfg || cfg[FLOATBAR_SKIN_SETTING_KEY] !== undefined) return false;
    const seed = FLOATBAR_SEED_MAP[cfg.reciteTheme];
    if (!seed) return false;
    const def = RECITE_FLOATBAR_SKINS.find(s => s.slug === seed);
    if (def?.pro && !paid) return false;
    cfg[FLOATBAR_SKIN_SETTING_KEY] = seed;
    return true;
}

// ========== 全局背景库（2026-08-27 □18 重做 + □19 二波，数值唯一事实源 docs/research/recite-bg-library/proposals.md） ==========
// 背景与皮肤两轴正交：皮肤管 accent 色系/贴纸装饰，背景管全窗口底材。旧「主题背景纸纹」
// （八套主题配套弱纸纹 + recitePaperOn 开关 + data-recite-bg-off）整体退役，被本库取代。
// 机制与 RECITE_SKINS 同款：slug = body[data-recite-bg] 属性值 + settingCfg 存储值；
// color = 货架样机色；pro = 是否收费背景（无/羊皮纸/护眼免费，其余四款 Pro）。
// index.scss 的 $recite-bg-turb 生成段与本表 slug 一一对齐，新背景两头同步加。
export interface ReciteBg {
    slug: string;
    i18nKey: string;
    color: string;
    pro: boolean;
}

export const RECITE_BGS: ReciteBg[] = [
    { slug: "none", i18nKey: "背景·无", color: "#e8eaed", pro: false },
    { slug: "parchment", i18nKey: "背景·羊皮纸", color: "#f4ecd2", pro: false },
    { slug: "eye-care", i18nKey: "背景·护眼", color: "#e3eed9", pro: false },
    { slug: "rough", i18nKey: "背景·粗糙牛皮", color: "#ddc49c", pro: true },
    // texture 样机色随 §9 底色沉降同步（#e4e2d4→#d5d0bd，与 index.scss bcL 同源）
    { slug: "texture", i18nKey: "背景·纤维纹理", color: "#d5d0bd", pro: true },
    { slug: "grid", i18nKey: "背景·方格网", color: "#eef0ea", pro: true },
    { slug: "custom", i18nKey: "背景·自定义图片", color: "#8a94a0", pro: true },
];

/** 缺省档 = 羊皮纸：CSS 侧「无属性」即羊皮纸在场（免费样板间），显式选「无」才挂 none */
export const DEFAULT_BG_SLUG = "parchment";

/** 旧单键背景（□19 明暗分库前，只读迁移源不写）与旧自定义图键（同） */
export const BG_SETTING_KEY = "reciteBg";
export const BG_CUSTOM_FILE_KEY = "bgCustomFile";

// ---- □19 明暗分库（2026-08-27，VS Code 式）：亮/暗各自选背景，切外观时自动换 ----
// 存储：bgLight/bgDark 各存 slug；bgStrengthLight/bgStrengthDark 各存 0~100 纹理浓淡
// 刻度（缺省 50=出厂基准 k0.5）；bgCustomFileLight/bgCustomFileDark 各存 custom 图 URL。
// CSS 单属性轴不变（body[data-recite-bg]），applyBgForMode 按当前外观取对应键挂属性。
export const BG_LIGHT_KEY = "bgLight";
export const BG_DARK_KEY = "bgDark";
export const BG_STRENGTH_LIGHT_KEY = "bgStrengthLight";
export const BG_STRENGTH_DARK_KEY = "bgStrengthDark";
export const BG_CUSTOM_FILE_LIGHT_KEY = "bgCustomFileLight";
export const BG_CUSTOM_FILE_DARK_KEY = "bgCustomFileDark";

/** 纹理浓淡出厂基准刻度（k=0.5：纱把预渲染上限压回现网基准值，proposals §8.3） */
export const BG_STRENGTH_DEFAULT = 50;

/** 当前思源外观是否暗色（html[data-theme-mode]，思源切外观时内核改该属性） */
export function isDarkAppearance(): boolean {
    return document.documentElement.dataset.themeMode === "dark";
}

export interface ReciteBgPair {
    light: string;
    dark: string;
    strengthLight: number;
    strengthDark: number;
    customFileLight?: string;
    customFileDark?: string;
}

/**
 * 单键迁移链（老用户兼容）：未存过新键时走旧键——存过 reciteBg 以其为准，否则看更旧的
 * 纸纹开关（recitePaperOn 显式关过=无背景，其余缺省羊皮纸）。存过 reciteBg 一律以其为准。
 */
export function resolveBgSlug(cfg: any): string {
    if (cfg && cfg[BG_SETTING_KEY]) return cfg[BG_SETTING_KEY] as string;
    return cfg && cfg.recitePaperOn === false ? "none" : DEFAULT_BG_SLUG;
}

function validBgSlug(v: any): string | undefined {
    return typeof v === "string" && RECITE_BGS.some(b => b.slug === v) ? v : undefined;
}

function validStrength(v: any): number {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : BG_STRENGTH_DEFAULT;
}

/**
 * 明暗双库解析（□19）：bgLight/bgDark 各自独立（未存过/未知 slug 落迁移链，legacy 值同时
 * 播种两侧——老用户明暗两侧都是升级前熟悉的样子）；strength 缺省 50；旧 bgCustomFile 同样
 * 双侧播种。只读不写（落盘发生在首次改选时，照 recitePaperOn 先例）。
 */
export function resolveBgPair(cfg: any): ReciteBgPair {
    const legacy = resolveBgSlug(cfg);
    const legacyFile = cfg?.[BG_CUSTOM_FILE_KEY] as string | undefined;
    return {
        light: validBgSlug(cfg?.[BG_LIGHT_KEY]) ?? legacy,
        dark: validBgSlug(cfg?.[BG_DARK_KEY]) ?? legacy,
        strengthLight: cfg && cfg[BG_STRENGTH_LIGHT_KEY] != null ? validStrength(cfg[BG_STRENGTH_LIGHT_KEY]) : BG_STRENGTH_DEFAULT,
        strengthDark: cfg && cfg[BG_STRENGTH_DARK_KEY] != null ? validStrength(cfg[BG_STRENGTH_DARK_KEY]) : BG_STRENGTH_DEFAULT,
        customFileLight: cfg?.[BG_CUSTOM_FILE_LIGHT_KEY] ?? legacyFile,
        customFileDark: cfg?.[BG_CUSTOM_FILE_DARK_KEY] ?? legacyFile,
    };
}

/**
 * 给 body 挂/摘 data-recite-bg（单属性轴，挂哪个 slug 由调用方按当前外观决定）：缺省
 * 羊皮纸/未知 slug = 摘属性（CSS 无属性形态即羊皮纸）；「无」显式挂 none；custom 档另把
 * 用户图 URL 写进 --recite-bg-custom 变量（index.scss custom 段消费；图走 /assets 静态服务）。
 */
export function applyReciteBg(slug: string | undefined, customFile?: string) {
    const hit = RECITE_BGS.find(b => b.slug === slug);
    if (hit && hit.slug !== DEFAULT_BG_SLUG) {
        document.body.setAttribute("data-recite-bg", hit.slug);
    } else {
        document.body.removeAttribute("data-recite-bg");
    }
    if (hit?.slug === "custom" && customFile) {
        document.body.style.setProperty("--recite-bg-custom", `url("${customFile}")`);
    } else {
        document.body.style.removeProperty("--recite-bg-custom");
    }
}

/**
 * 背景全退（2026-08-27 bug 修复：背景跟仿写上下文走，切到无关文档时退场）：显式挂
 * data-recite-bg="none"（零规则命中=思源原生完整还原），**不能摘属性**——摘掉会被
 * body:not([data-recite-bg]) 缺省档规则当成「羊皮纸在场」，none 是唯一安全的视觉全退
 * 形态。custom 图变量与浓淡系数一并清。存储键不动，回到仿写文档时 applyBgForMode
 * 重挂当前外观库的真值。
 */
export function clearReciteBg() {
    document.body.setAttribute("data-recite-bg", "none");
    document.body.style.removeProperty("--recite-bg-custom");
    document.body.style.removeProperty("--recite-bg-k");
}

/**
 * 按当前外观应用背景（□19 唯一应用入口）：亮挂 bgLight、暗挂 bgDark；同时注入
 * --recite-bg-k（纹理浓淡纱系数 0~1，index.scss 纱层/grid 线消费，缺省 0.5）。思源
 * 切外观时由 watchAppearance 的回调重调本函数即自动换库。
 */
export function applyBgForMode(cfg: any) {
    const pair = resolveBgPair(cfg);
    const dark = isDarkAppearance();
    applyReciteBg(dark ? pair.dark : pair.light, dark ? pair.customFileDark : pair.customFileLight);
    const t = dark ? pair.strengthDark : pair.strengthLight;
    document.body.style.setProperty("--recite-bg-k", String(t / 100));
}

/**
 * 盯 html[data-theme-mode] 的外观切换观察者（□19）：返回停止函数。回调里应重调
 * applyBgForMode——切外观即从亮库换到暗库的背景（或反向），CSS 声明零改动。
 */
export function watchAppearance(onChange: () => void): () => void {
    const mo = new MutationObserver(() => onChange());
    mo.observe(document.documentElement, { attributeFilter: ["data-theme-mode"] });
    return () => mo.disconnect();
}
