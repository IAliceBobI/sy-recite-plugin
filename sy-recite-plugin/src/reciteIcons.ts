// recite 浮条系统图标（2026-08-27 移动端顶栏改造，方案 docs/research/recite-mobile-topbar/proposals.md §2）：
// 规范照渐进 progIcons.ts：统一 viewBox 0 0 24 24 线稿（fill:none stroke:currentColor 1.8 round），
// currentColor 着色 → 皮肤/明暗经外层 color 自动联动。经 plugin.addIcons 注册、reciteIcon(name,size) 渲染。
export const RECITE_FLOAT_ICONS = `
<symbol id="iconReciteExtract" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4"/><path d="M15 3v4a1 1 0 0 0 1 1h4"/><path d="M15 17h6"/><path d="m18 14 3 3-3 3"/></symbol>
<symbol id="iconReciteDelete" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/></symbol>
<symbol id="iconReciteCompare" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/></symbol>
<!-- □13 加闪卡：叠卡+入卡下箭头（与渐进 iconProgCardHere 同构，跨插件视觉一致） -->
<symbol id="iconReciteCard" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/><path d="M14.5 11v7"/><path d="m12 15.5 2.5 2.5 2.5-2.5"/></symbol>
<symbol id="iconReciteDiff" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h13"/><path d="M4 10h6"/><path d="M4 19h6"/><circle cx="14.5" cy="13.5" r="4.5"/><path d="m17.8 16.8 3.7 3.7"/></symbol>
<symbol id="iconReciteJudge" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3l1.9 5.1L17 10l-5.1 1.9L10 17l-1.9-5.1L3 10l5.1-1.9Z"/><path d="m14.5 18.5 2.5 2.5L22 16.5"/></symbol>
<symbol id="iconReciteCopyPrompt" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M20 1.5v5"/><path d="M17.5 4h5"/></symbol>
<symbol id="iconReciteRewrite" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></symbol>
<symbol id="iconReciteSplit" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21l7.8-7.8"/><path d="M14.6 2.8l1.1 2.7 2.7 1.1-2.7 1.1-1.1 2.7-1.1-2.7-2.7-1.1 2.7-1.1z"/><path d="M19.7 14.3l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z"/></symbol>
<symbol id="iconReciteSpin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.2-8.6"/></symbol>
<symbol id="iconReciteClose" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></symbol>
`;

/** 渲染 sprite 引用（名字必须 iconRecite 开头防与宿主 spritespace 撞 id） */
export function reciteIcon(name: string, size = 14) {
    return `<svg width="${size}px" height="${size}px"><use xlink:href="#${name}"></use></svg>`;
}
