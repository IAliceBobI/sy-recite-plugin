import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { RECITE_KEEP, RECITE_HOLE, RECITE_NOTE, RECITE_EXTRACT } from "./constants";

/**
 * 卷内填写引导（holerevamp □2，症状1 修法·方向 B：空位负责看、写位负责填）：
 * 遮字块可编辑+挖空虚线空位诱导就地打字→字 color:transparent 隐形（且盲打的字污染题面、
 * 全流程不再可见——temp/holebug_repro.mjs 实验 A 实锤）。修法=光标引导：抽取文档里光标
 * 一落进遮字块可编辑区（div[custom-recite-keep][custom-recite-hole] 的 contenteditable）
 * 即把选区移到同题写位块末尾——空位看得见摸不得，要填去写位填。
 *
 * 通道=document 级 selectionchange（writeZone 同款事件驱动+幂等）：
 * - protyle 块级 :focus 永不成立（焦点恒落 wysiwyg 祖先）——焦点事件不可用，selectionchange
 *   是唯一可靠光标通道；
 * - 判定全 DOM 局部（选区祖先上爬+wysiwyg 的 custom-recite-extract 镜像属性），不依赖
 *   events.currentProtyle——重载后到首次点击的空窗（protyle 恒空）天然免疫；
 * - 幂等不自激：引导后的新选区落写位（非遮字块），下一轮 maskedHostOf 判空早退；
 * - 跨块选区（一端在遮字块一端在外，如全选/跨段复制）不拦——只收两端同落同一遮字块的
 *   选区（点击/双击选词/键盘导航进空位），不劫持整卷操作。
 * 每次选区变化都过一遍（含打字逐字移标）——早退路径只有两次 closest，开销可忽略。
 */

/** 卷内遮字块判据（keep=展示层复制 + hole=挖空题面；与 index.scss 遮字规则同词汇） */
const MASKED_SEL = `div[data-node-id][${RECITE_KEEP}][${RECITE_HOLE}]`;

/**
 * 选区端点 → 其所在卷内遮字块（端点不在遮字块/不在抽取文档 wysiwyg 返回 null）。
 * 原文档的挖空块只有 hole 无 keep，且原文档 wysiwyg 无 custom-recite-extract 镜像——
 * 双条件天然只命中卷内遮字块，原文档挖空编辑照常。
 */
export function maskedHostOf(node: Node | null): HTMLElement | null {
    const el = node?.nodeType === 3 ? node.parentElement : (node as Element | null);
    const host = el?.closest?.(MASKED_SEL) as HTMLElement | null;
    if (!host) return null;
    return host.closest(".protyle-wysiwyg")?.hasAttribute(RECITE_EXTRACT) ? host : null;
}

/**
 * 遮字块 → 同题写位块：挖空单元结构=[遮字块][锚点(note，可多块)][写位]——跳过锚点块取
 * 其后第一个块（data-recite-write 由 writeZone 挂；未挂时同位兜底）。越过锚点直接撞上
 * 语境块（keep）=本单元无写位（脏卷防御），返回 null 不引导。
 */
export function writeTargetOf(masked: HTMLElement): HTMLElement | null {
    for (let el = masked.nextElementSibling; el; el = el.nextElementSibling) {
        const b = el as HTMLElement;
        if (b.hasAttribute(RECITE_NOTE)) continue; // 锚点（空锚点 CSS 隐藏但仍在 DOM）
        if (b.hasAttribute(RECITE_KEEP)) return null;
        return b;
    }
    return null;
}

/**
 * 引导执行：选区两端同落同一卷内遮字块 → 选区移到写位块可编辑区末尾（续写手感——已填过
 * 一半时接着填）。返回是否发生引导（调试/断言锚点）。
 */
export function guardSelection(sel: Selection | null): boolean {
    if (!sel?.rangeCount) return false;
    const host = maskedHostOf(sel.anchorNode);
    if (!host || maskedHostOf(sel.focusNode) !== host) return false;
    const editable = writeTargetOf(host)?.querySelector('[contenteditable="true"]');
    if (!editable) return false;
    const range = document.createRange();
    range.selectNodeContents(editable);
    range.collapse(false); // 末尾
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
}

class HoleGuard {
    private handler = () => {
        try {
            if (guardSelection(document.getSelection())) {
                debugLog("recite.holeguard", "caret redirected to write block", "recite");
            }
        } catch { /* 选区瞬态异常不炸链 */ }
    };

    onload() {
        document.addEventListener("selectionchange", this.handler);
        // 调试通道（照 writeZone 惯例）：e2e/诊断用 window.reciteHoleGuard 查引导器生死
        (window as any).reciteHoleGuard = this;
    }

    onunload() {
        document.removeEventListener("selectionchange", this.handler);
    }
}
export const holeGuard = new HoleGuard();
