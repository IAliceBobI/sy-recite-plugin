// IAL 属性名（spec「数据模型」节，勿改名——抽取/对比文档跨轮次识别只认 IAL，与标题无关）
// 与衍生文档标题前缀（完整标题 = 前缀·原文标题后缀，见 extract.ts derivedTitle——标题仅展示，
// 原文改名后下次重建即跟随；身份识别见 findReciteChildDoc，勿退回按标题找）
import { winHotkey } from "../../sy-tomato-plugin/src/libs/winHotkey";
export const RECITE_START = "custom-recite-start";
export const RECITE_OLD = "custom-recite-old";
export const RECITE_EXTRACT = "custom-recite-extract";
export const RECITE_COMPARE = "custom-recite-compare";
export const RECITE_NOTE = "custom-recite-note";
export const RECITE_REFS = "custom-recite-refs";
// 上下文块标记（期1 整篇语义，2026-09-08）：原文档块挂=「留作上下文」——抽取时按文档序
// 复制进抽取文档（复制产物同挂本属性），闪卡卡面从此有语境。原文标记（RECITE_OLD）与本
// 标记可同块共存（keep 块=被点名的原文块）；readExtractDoc 据此跳过复制块不进 writes。
export const RECITE_KEEP = "custom-recite-keep";
// 对比视图外层 sb（每题一张卡）：仅样式定位用（index.scss 画题框+中缝），非身份识别
export const RECITE_CMP_CARD = "custom-recite-cmp-card";
// 手动级装饰（□13 右键菜单入口，2026-09-02 五款化）：RECITE_LACE 挂任意 div 块，值=款式 slug
// （注册表 theme.ts RECITE_LACES；存量 "1"/未知值由 CSS :not 排除链兜底成 line 款渲染）。
// （单文档背景 custom-recite-bg 已随全局纸纹退役 2026-08-26：决策记录见
// docs/research/recite-global-bg/proposals.md；存量文档 IAL 残留旧属性 = 无害孤儿）
export const RECITE_LACE = "custom-recite-lace";
// AI 判卷结果头块（块引用「🧑‍🏫 AI 判卷 · 时间」）：仅 CSS 弱视觉定位，免费功能免费视觉，
// 不挂付费门禁；正文是 AI markdown 拆开的普通块，无任何属性依赖，长期可读
export const RECITE_AI = "custom-recite-ai";
// 节选语义靶（期2「这段练」，2026-09-08）：原文档块挂=「这段练」——抽取切换节选语义
// （靶的存在本身就是模式声明，无显式档位）：整流照抄非靶块、靶段原位换 [锚点+写位]。
// 与 RECITE_KEEP 同块互斥（打靶清 keep、打 keep 清靶）——靶=永藏换总结，keep=永显进卡面。
export const RECITE_TARGET = "custom-recite-target";
// keep 右键菜单入口开关（Settings 练习域，默认开）：关=右键菜单不出「留作上下文」项
// （命令/浮条通道不设开关——同 laceMenuOn 只藏入口的语义）
export const KEEP_MENU_KEY = "keepMenuOn";
// 靶右键菜单入口开关（同 keepMenuOn 语义，默认开）
export const TARGET_MENU_KEY = "targetMenuOn";
export const EXTRACT_TITLE = "抽取";
export const COMPARE_TITLE = "对比";
export const FLOATBAR_POS_KEY = "sy-recite-floatbar-pos";
// 五命令默认快捷键（2026-08-25）：⌥⌘ 字母系（Windows 显示 Alt+Ctrl+X）。两条硬约束（实测）：
// ① 修饰键顺序必须 ⌥ 在前——内核 matchHotKey 的 ⌥ 分支只认 startsWith("⌥⌘")（app/src/protyle/
// util/hotKey.ts），写 "⌘⌥R" 永不匹配（tomato 的 winHotkey 同理规范化 ⌥ 前置，其 ⌘⌥E 实存 ⌥⌘E）；
// ② 字母避让要看「内核默认 + 用户 keymap.custom + 四插件」全集——⌥⌘ 的 A/B/D/E/F/I/J/L/M/N/
// R/S/T/U/W/X/Z 全被占（如 ⌥⌘R=表格右移、⌥⌘X=外观、⌥⌘W=NoteBox dock），⌥⇧+字母 26 个全满，
// ⌥⌘ 的 C/G/H/K/O/P/Q/V/Y 空闲。取拼音/语义助记：K开关/Q抽取/G生成/C重新/P提示词。
// key 与 addCommand langKey 一致（右键菜单 accelerator 按此直查用户自定义键），用户可改默认。
// 2026-08-27 □33 可配置化：值升级为 winHotkey 对象（"alt+ctrl+x" 输入规范化后即上述 ⌥⌘X 默认，
// m/langKey 单源供 addCommand 与 HotkeyCap 键帽共用；写回协议见 tomato libs/hotkeyCap.ts）；
// 设置面板行名走 i18n（Settings hk_ 键），故不传 langText。
// 第三参 icon = 面板行 sprite 图标 id（□4 emoji 退役；四命令复用浮条 iconReciteXxx，进入仿写
// 用官方 iconEdit——本字段唯一消费方是 Settings 快捷键行的 <use xlink:href>）
export const RECITE_HOTKEYS = {
    reciteTogglePractice: winHotkey("alt+ctrl+k", "reciteTogglePractice", "iconEdit"),
    reciteExtract: winHotkey("alt+ctrl+q", "reciteExtract", "iconReciteExtract"),
    reciteCompare: winHotkey("alt+ctrl+g", "reciteCompare", "iconReciteCompare"),
    reciteCopyPrompt: winHotkey("alt+ctrl+p", "reciteCopyPrompt", "iconReciteCopyPrompt"),
    reciteRewrite: winHotkey("alt+ctrl+c", "reciteRewrite", "iconReciteRewrite"),
    // 期1 keep（2026-09-08）：H=Hold 保留（⌥⌘ 空闲字母 H/O/V/Y 内取，四插件+官方 keymap 查重无占用）
    reciteKeep: winHotkey("alt+ctrl+h", "reciteKeep", "iconBookmark"),
    // 期2 靶「这段练」（2026-09-08）：O=靶心圈（H/O/V/Y 余量内取，全仓 alt+ctrl+o 零占用+官方 keymap 无冲突）
    reciteTarget: winHotkey("alt+ctrl+o", "reciteTarget", "iconReciteTarget"),
};
