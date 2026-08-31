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
// 对比视图外层 sb（每题一张卡）：仅样式定位用（index.scss 画题框+中缝），非身份识别
export const RECITE_CMP_CARD = "custom-recite-cmp-card";
// 手动级装饰（□13 右键菜单入口）：RECITE_LACE 挂任意 div 块（统一款蕾丝，accent 驱动）。
// （单文档背景 custom-recite-bg 已随全局纸纹退役 2026-08-26：决策记录见
// docs/research/recite-global-bg/proposals.md；存量文档 IAL 残留旧属性 = 无害孤儿）
export const RECITE_LACE = "custom-recite-lace";
// AI 判卷结果头块（块引用「🧑‍🏫 AI 判卷 · 时间」）：仅 CSS 弱视觉定位，免费功能免费视觉，
// 不挂付费门禁；正文是 AI markdown 拆开的普通块，无任何属性依赖，长期可读
export const RECITE_AI = "custom-recite-ai";
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
};
