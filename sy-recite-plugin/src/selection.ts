import { collectSelectedBlocks, resolveSeedRange, type SelectionResult } from "../../sy-tomato-plugin/src/libs/selection";
import { getCursorElement } from "../../sy-tomato-plugin/src/libs/domUtils";

/**
 * recite 选中解析包装（□8 期1，2026-09-09）：keep/靶三通道共用的目标块解析，
 * 内部委托 tomato 共享纯函数 collectSelectedBlocks（三级链：块选双横线全层级上爬 /
 * 拖蓝 blocksUnderRange / 光标焦点块——bear □8 拍板①「光标所在的块也接受」，toggle
 * 可逆兜误触；右键块语义已下沉共享函数），本层只做 recite 语境解包：
 * - range 取用优先级（review P1-2 修正，□8 期4 下沉共享函数 resolveSeedRange）：活选区
 *   （起点在本 wysiwyg）优先，缺失/不在本文档才回退 protyle.toolbar.range。内核
 *   toolbar.range 只在 hint/paste/页签切换/initUI 等流程回写、普通点击不更新——旧序
 *   「toolbar.range 优先」会让「拖蓝→点击别处落光标→按快捷键」命中陈旧旧拖蓝，架空
 *   光标兜底承诺；活选区在场时 toolbar.range 只剩「点击顶掉选区」一个存在理由，而该
 *   场景活选区本就缺失，回退链照常兜住；
 * - cursorEl=getCursorElement()（全局 selection 祖先链上爬，共享函数内 contains 守卫）。
 */
export type ReciteSelection = SelectionResult;

export function reciteSelection(protyle: any, blockEl?: HTMLElement): ReciteSelection {
    const wysiwyg: HTMLElement = protyle?.wysiwyg?.element;
    if (!wysiwyg) return { blocks: [], level: "none", rangeText: "" };
    const sel = document.getSelection();
    const live = sel?.rangeCount ? sel.getRangeAt(0) : undefined;
    const range = resolveSeedRange(wysiwyg, live, protyle?.toolbar?.range);
    return collectSelectedBlocks(wysiwyg, { range, cursorEl: getCursorElement(), blockEl });
}

/**
 * 空选中诊断串（□7 bear 主实例实锤排查用）：三级（块选类/getSelection/toolbar.range
 * 回退）同时落空时逐级打点 Loki——选区形态/所在容器/兜底链状态一眼可辨，远程定位断点。
 */
export function selectionDiag(protyle: any, blockEl?: HTMLElement): string {
    const wysiwyg: HTMLElement | undefined = protyle?.wysiwyg?.element;
    const sel = document.getSelection();
    const selRange = sel?.rangeCount ? sel.getRangeAt(0) : undefined;
    const tr = protyle?.toolbar?.range;
    const cur = getCursorElement();
    return `selClass=${wysiwyg ? wysiwyg.querySelectorAll(".protyle-wysiwyg--select").length : -1}`
        + ` blockEl=${blockEl ? "y" : "n"}`
        + ` selCollapsed=${selRange ? sel.isCollapsed : "n/a"}`
        + ` selLen=${selRange ? sel.toString().length : -1}`
        + ` selInDoc=${!!(selRange && wysiwyg?.contains(selRange.startContainer))}`
        + ` tbLen=${tr ? tr.toString().length : -1}`
        + ` tbInDoc=${!!(tr && wysiwyg?.contains(tr.startContainer))}`
        + ` curInDoc=${!!(cur && wysiwyg?.contains(cur))}`
        + ` hasToolbar=${!!protyle?.toolbar} hasWysiwyg=${!!wysiwyg}`;
}
