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
// 两角色化（2026-09-20）起 copy span 照抄产物统一挂它——散写的新写块进卷也是语境（不染色）。
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
// 卷子里的提示块（□2 统一出卷，2026-09-13）：原文档未升格的总结块照抄进抽取文档时挂此
// 属性——「卷子里的提示块」新视觉（琥珀族染色），readExtractDoc/writeZone/q-ctrl 与 keep
// 同判跳过（展示层，不进 writes 不挪区间末）。与 RECITE_KEEP 的分野：keep=原文语境复制
// （灰弱化），hint=用户写的提示（自写族醒目）——色系随「青绿=作者句标记族/琥珀=自写族」。
// 【退役 2026-09-20 recitesimplify □1】「总结」类型退役后新卷不再产 hint 块（散写新块走
// copy 挂 keep 照抄不染色）；本属性与判读保留仅为老卷子兼容（extractEntries/writeZone/
// q-ctrl 照跳），勿在新链路挂写。
export const RECITE_HINT = "custom-recite-hint";
// 空锚点占位（□2 统一出卷）：无提示考核段照样出卷——锚点 heading 挂本属性=「无提示·纯默写
// 题」，块内容是占位文案（纯视觉，语言=抽取时快照）；readExtractDoc 出口据属性把
// noteMarkdown 归一为空串（占位文案不漏给下游——判卷走纯默写 rubric、联想判定天然不触发）。
// 题目性质由属性定：用户手改占位文字仍判空题（要提示应回原文在考核段后写提示块）。
export const RECITE_EMPTY_NOTE = "custom-recite-empty-note";
// 文字级挖空（□H，2026-09-21 bear 拍板）：块级 IAL=custom-recite-hole——块内含挖空标记 span
// 的快速判据（identifyNotes 走既有 batchGetBlockAttrs 通道零加读；span 本体在块 DOM 里，
// markdown/kramdown 序列化均剥——探针 6809 实测，故判据不能走 SQL markdown）。行内标记形态
// =span data-type="recite-hole"（存储/事务 DOM 通道保真、markdown 序列化剥成纯文本=对比左栏
// 天然见全文）。遮字 CSS 词表匹配必须复合词表 [data-type~="recite-hole"]（内核会把行内格式
// 合并进同锚 span，词序不定——anno □1 同判例）。
export const RECITE_HOLE = "custom-recite-hole";
export const RECITE_HOLE_SPAN = "recite-hole";
// 温和退出标记（□3 退出层，2026-09-13）：「退出」时给练习期间写的块（later-written=无
// old 的非空块）挂上——淡背景持久标记「这是仿写时写的」，练习标记全清、衍生文档保留；
// 重进仿写 enterPractice 跳过 written 块不打 old（保持练习连续）；「删除」
// cleanPractice 连 written 一起清（恢复原状）。不进 blockRole 判定序（重进后 written 块
// =无 old 非空=上下文/题面候选，天然正确）；正常链路不进抽取文档（copyHTML 纯文本重建
// 不带属性），readExtractDoc/writeZone 按本属性跳过只是脏数据防御。
export const RECITE_WRITTEN = "custom-recite-written";
// 仿写中 wysiwyg 染色类（highlight.ts 挂/摘，statusBtn exitPractice 同步摘——□3 防退出闪染）：
// 收敛到 constants 单一事实源防两文件字面量漂移
export const RECITE_PRACTICE_CLS = "recite-practicing";
// 设为原文右键入口开关（Settings 练习域，默认开；roleswap 2026-09-15 随钮更名）：关=右键菜单不出「设为原文」项
// （命令/浮条通道不设开关——同 laceMenuOn 只藏入口的语义）
export const KEEP_MENU_KEY = "keepMenuOn";
// 靶右键菜单入口开关（同 keepMenuOn 语义，默认开）
export const TARGET_MENU_KEY = "targetMenuOn";
export const EXTRACT_TITLE = "抽取";
export const COMPARE_TITLE = "对比";
// 收集成文（□E，2026-09-21 bear 点名）：身份属性与标题前缀。与 RECITE_EXTRACT 分野——
// 收集文档挂原文档下（与「抽取·」平级，不进卷子树：删除练习连删卷子树不波及它——
// 用户成果独立于练习生命周期）；值=原文档 id，与卷同一对一身份源（卷单例⇒收集单例）
export const RECITE_COLLECT = "custom-recite-collect";
export const COLLECT_TITLE = "仿写文";
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
    // 期1 keep（2026-09-08）：H=Hold 保留（09-13 复核更正：当初记 V/Y 查重无占用已过期——Y=tomato
    // MindWire word 默认键、V=bear 本机自定义占用；后续 recite 若补键走 ⌥⇧⌘ 段，同 target 先例）
    reciteKeep: winHotkey("alt+ctrl+h", "reciteKeep", "iconBookmark"),
    // 期2 靶「这段练」（2026-09-08 定 O；09-10 挪 ⇧）：O=靶心圈。原 ⌥⌘O 撞 tomato MindWire doc（v5.7.8
    // 已发布）——当初字面 grep "alt+ctrl+o" 漏了 tomato 的 "ctrl+alt+o"（修饰键顺序不同），撞键查重必须
    // 按 winHotkey 规范化形态（⌥⌘⇧O）比对；⌥⌘ 单字母段官方+四插件已全占，加 ⇧ 保 O 助记（同 seller 先例）。
    // 旧版用户 keymap.custom 被注册时自动回填过 ⌥⌘O（custom 非空会压过新默认），v1.3.0 发布说明须提示改键
    reciteTarget: winHotkey("alt+ctrl+shift+o", "reciteTarget", "iconReciteTarget"),
};
