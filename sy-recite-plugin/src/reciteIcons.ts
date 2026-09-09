// recite 浮条系统图标（2026-08-27 移动端顶栏改造，方案 docs/research/recite-mobile-topbar/proposals.md §2）：
// 规范照渐进 progIcons.ts：统一 viewBox 0 0 24 24 线稿（fill:none stroke:currentColor 1.8 round），
// currentColor 着色 → 皮肤/明暗经外层 color 自动联动。经 plugin.addIcons 注册、reciteIcon(name,size) 渲染。
export const RECITE_FLOAT_ICONS = `
<symbol id="iconReciteExtract" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4"/><path d="M15 3v4a1 1 0 0 0 1 1h4"/><path d="M15 17h6"/><path d="m18 14 3 3-3 3"/></symbol>
<symbol id="iconReciteDelete" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/></symbol>
<symbol id="iconReciteCompare" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/></symbol>
<!-- □13 加闪卡：叠卡+入卡下箭头（与渐进 iconProgCardHere 同构，跨插件视觉一致） -->
<symbol id="iconReciteCard" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/><path d="M14.5 11v7"/><path d="m12 15.5 2.5 2.5 2.5-2.5"/></symbol>
<!-- □13 toggle 态（2026-09-09 群反馈）：iconReciteCard 同构对勾版——下箭头（入卡）↔ 对勾
     （已在卡组）。浮条全形态 icon-only，加闪卡→取消制卡的文案切换不可见，态差异只能走图形 -->
<symbol id="iconReciteCardOn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/><path d="m12.5 14.8 2 2 4-4.5"/></symbol>
<symbol id="iconReciteDiff" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h13"/><path d="M4 10h6"/><path d="M4 19h6"/><circle cx="14.5" cy="13.5" r="4.5"/><path d="m17.8 16.8 3.7 3.7"/></symbol>
<symbol id="iconReciteJudge" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3l1.9 5.1L17 10l-5.1 1.9L10 17l-1.9-5.1L3 10l5.1-1.9Z"/><path d="m14.5 18.5 2.5 2.5L22 16.5"/></symbol>
<symbol id="iconReciteCopyPrompt" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M20 1.5v5"/><path d="M17.5 4h5"/></symbol>
<symbol id="iconReciteRewrite" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></symbol>
<symbol id="iconReciteSplit" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21l7.8-7.8"/><path d="M14.6 2.8l1.1 2.7 2.7 1.1-2.7 1.1-1.1 2.7-1.1-2.7-2.7-1.1 2.7-1.1z"/><path d="M19.7 14.3l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z"/></symbol>
<symbol id="iconReciteSpin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.2-8.6"/></symbol>
<symbol id="iconReciteClose" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></symbol>
<!-- 期1 留作上下文（2026-09-08）：书签=保留语义，与右键菜单官方 iconBookmark 同语言 -->
<symbol id="iconReciteKeep" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4.6L5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></symbol>
<!-- 期2 这段练（2026-09-08）：靶心准星=圈定练习语义，与快捷键 ⌥⌘O（O=靶圈）同助记 -->
<symbol id="iconReciteTarget" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.6"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/></symbol>
<!-- □5 单题对照（2026-09-08）：左右双栏+中缝=单题「原文 vs 复述」就地对照（iconReciteCompare 双栏矩形族的单页迷你变体） -->
<symbol id="iconReciteQctrl" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M12 5v14"/><path d="M6.5 11.5l1.8-2 1.7 3.5"/><path d="M14.5 12.5h3.2"/></symbol>
<!-- 顶栏设置双页对照（topbar-logo 战役 2026-09-08，返工一期旋钮）：左右两页=原文/习作对照，
     仿写核心语义的 logo 化标识。二期取证修正：官方顶栏生态=24vb / stroke 1.7u / round cap·join /
     fill:none 细线稿（litheness icon.js 231/234 同规格）——一期 32vb 粗剪影（环壁 2.2 倍官方线宽）
     被用户判「不合群」已弃。本枚与浮条族同 24vb 但线宽按顶栏生态用 1.7（浮条族 1.8 不变，语境不同）。
     中缝几何经 vision 像素复核：两页各宽 7.4、右页 x13.3，中缝净空 0.7u（64px 下 ~2px 背景缝、
     14px 双窗结构成立）。id 特例对齐 iconSettings* 家族命名（iconSettingsProg 先例），保住 e2e
     顶栏按钮通道（querySelectorAll('use') href 含 iconSettingsXxx）。挂色 .recite-topbar-gear
     固定青绿两档不变（stroke:currentColor 随 color） -->
<symbol id="iconSettingsRec" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3.5" y="4.5" width="7.4" height="15" rx="1.5"></rect>
    <rect x="13.3" y="4.5" width="7.4" height="15" rx="1.5"></rect>
</symbol>
`;

/** 渲染 sprite 引用（名字必须 iconRecite 开头防与宿主 spritespace 撞 id） */
export function reciteIcon(name: string, size = 14) {
    return `<svg width="${size}px" height="${size}px"><use xlink:href="#${name}"></use></svg>`;
}
