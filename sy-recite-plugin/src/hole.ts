import { siyuan } from "../../sy-tomato-plugin/src/libs/siyuanApi";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { NewNodeID } from "../../sy-tomato-plugin/src/libs/globals";
import { RECITE_START, RECITE_HOLE, RECITE_HOLE_SPAN, RECITE_KEEP, RECITE_OLD, RECITE_TARGET, RECITE_WRITTEN, RECITE_HINT } from "./constants";

/**
 * 文字级挖空打标（□H，2026-09-21 bear 拍板；holerevamp □1 复合词表翻新）：圈靶粒度从
 * 整块细化到选中的文字。通道=行内 span 物理标记——标记存在原文里、位置随文字走永不
 * 漂移。写通道=事务 update（块 outerHTML，渐进 multilineMark 同款 DOM 手术先例；探针
 * 6809 实测 span 在存储 DOM 保真、markdown/kramdown 序列化剥成纯文本——所以对比左栏
 * 走 SQL markdown 天然见被挖的字）。
 *
 * 打标形态（holerevamp □1）：内核 lute 行内体系=扁平复合词表模型——一段文字一个 span、
 * 多格式挤 data-type 空格分隔；SetTextMarkNode 对未知词表 default 透传无白名单、
 * renderTextMarkAttrs 原样回写 data-type（思源源码核查结论），故 recite-hole 一律以
 * 「词」进 data-type、绝不包壳产嵌套（旧包壳对带格式文字产 recite-hole 包 strong 的嵌套
 * 形态，写回即被内核归一化吞掉=加粗挖空静默失效、高亮更拆成字面 == 存盘=数据损坏）：
 * - 裸文本（无行内格式 span 包裹）：包 span[data-type="recite-hole"]；
 * - 行内格式 span（span[data-type] 非空：strong/em/mark/u/s/code/kbd/text-color…）：
 *   整选=data-type 追加 recite-hole 词（去重幂等）；半选=三段拆（前/后段原词表、中段
 *   原词表+recite-hole，setInlineMark 同款 Range 拆分语义）；跨多格式选区=按边界分段逐段。
 *
 * 一块多空（holerevamp 拍板放开）：每个 span=一个空（holeLiteralsOfBlock 逐 span 收
 * 字面）。相邻零间隔拒绝=硬约束——前端 mergeSameInlineElement 会合并词表完全相等的
 * 紧贴 span（思源 toolbar/util.ts:82），合并=两空变一空答案错位；零宽空格不算实字。
 * toggle=选区完整落在某个既有空内→只撤销那个空（从词表移词，词表空了才拆壳）；选区与
 * 既有空部分重叠（一端在空内一端在外）=空收缩/扩展到最新选区（分段手术的机械结果，不
 * 另设分支）。块级 IAL custom-recite-hole 与 span 集合同步（identifyNotes 判据，见
 * constants 注）。
 */

/** 行内挖空 span 判据（复合词表：内核把行内格式合并进同锚 span，词序不定须 ~ 匹配） */
export const HOLE_SPAN_SEL = `span[data-type~="${RECITE_HOLE_SPAN}"]`;

export function isHoleSpan(el: Element | null | undefined): boolean {
    return !!el?.matches?.(HOLE_SPAN_SEL);
}

/** data-type 复合词表匹配纯函数（[data-type~=] 的 TS 侧同构，单测锚点） */
export function dataTypeHasWord(attrValue: string | null | undefined, word: string): boolean {
    return (attrValue ?? "").trim().split(/\s+/).includes(word);
}

// ---------- 打标手术核心（纯 DOM 变换，单测锚点；holerevamp □1） ----------
//
// 坐标模型=可编辑区全量文本的全区偏移：textSlotsOf 按文档序铺开文本节点、intervalOfRange
// 用前缀 Range.toString 求选区端点偏移（两处同口径，含全部后代文本）。分段=把选区切成
// 「同一最近格式 span」的连续区间逐段处理；手术一律倒序（靠后的先动，靠前 slot 的节点
// 引用与边界不失真），产物恒扁平（recite-hole 不包 span）。

/** 最近行内格式 span（span[data-type] 非空；上爬止于可编辑区，u/code 等裸标签形态探针实证被内核归一成 span 不认） */
export function formatSpanOf(node: Node, editable: Element): HTMLElement | null {
    let el: HTMLElement | null = node.nodeType === 3 ? node.parentElement : (node as HTMLElement);
    while (el && el !== editable) {
        if (el.tagName === "SPAN" && (el.getAttribute("data-type") ?? "").trim() !== "") return el;
        el = el.parentElement;
    }
    return null;
}

/** 可编辑区文本槽（全区偏移区间 × 最近格式 span） */
export interface HoleSlot { node: Text; start: number; end: number; span: HTMLElement | null }

export function textSlotsOf(editable: Element): HoleSlot[] {
    const slots: HoleSlot[] = [];
    let offset = 0;
    const walk = (node: Node): void => {
        if (node.nodeType === 3) {
            const len = node.nodeValue?.length ?? 0;
            if (len > 0) {
                slots.push({ node: node as Text, start: offset, end: offset + len, span: formatSpanOf(node, editable) });
                offset += len;
            }
            return;
        }
        if (node.nodeType !== 1) return;
        for (const child of Array.from(node.childNodes)) walk(child);
    };
    walk(editable);
    return slots;
}

/** 选区 → 全区偏移区间（端点=可编辑区起点到该边界的前缀文本长度；与 textSlotsOf 同口径） */
export function intervalOfRange(editable: Element, range: Range): { from: number; to: number } {
    const pre = document.createRange();
    pre.selectNodeContents(editable);
    pre.setEnd(range.startContainer, range.startOffset);
    const from = pre.toString().length;
    pre.selectNodeContents(editable);
    pre.setEnd(range.endContainer, range.endOffset);
    const to = pre.toString().length;
    return { from, to };
}

/** 既有空 span → 其全部文本的全区区间（词表含 recite-hole 的 span 才算空） */
function holeIntervalsOf(slots: HoleSlot[]): Map<HTMLElement, { from: number; to: number }> {
    const map = new Map<HTMLElement, { from: number; to: number }>();
    for (const s of slots) {
        if (!s.span || !dataTypeHasWord(s.span.getAttribute("data-type"), RECITE_HOLE_SPAN)) continue;
        const cur = map.get(s.span);
        if (!cur) map.set(s.span, { from: s.start, to: s.end });
        else { cur.from = Math.min(cur.from, s.start); cur.to = Math.max(cur.to, s.end); }
    }
    return map;
}

/** toggle 判定：选区完整落在某个既有空内（区间包含——两端同在才算，半空跨出不算） */
export function holeSpanContaining(slots: HoleSlot[], from: number, to: number): HTMLElement | null {
    for (const [span, iv] of holeIntervalsOf(slots)) {
        if (from >= iv.from && to <= iv.to) return span;
    }
    return null;
}

/** [a,b) 内是否有非零宽实字（思源空位零宽空格 \u200b 不算字——判间隔须剥） */
function hasRealCharBetween(slots: HoleSlot[], a: number, b: number): boolean {
    if (b <= a) return false;
    for (const s of slots) {
        const lo = Math.max(s.start, a), hi = Math.min(s.end, b);
        if (lo >= hi) continue;
        const text = s.node.nodeValue ?? "";
        for (let i = lo - s.start; i < hi - s.start; i++) {
            if (text.charAt(i) !== "\u200b") return true;
        }
    }
    return false;
}

/** 相邻零间隔判定：选区与既有空紧贴（中间零实字）——mergeSameInlineElement 合并同词表
 *  紧贴 span 的硬约束入口，命中即拒绝（两空变一空答案错位）。空在选区内部（被本次手术
 *  覆盖/重塑）不算紧贴。 */
export function touchesExistingHole(slots: HoleSlot[], from: number, to: number): boolean {
    if (to <= from) return false;
    for (const iv of holeIntervalsOf(slots).values()) {
        if (iv.to <= from && !hasRealCharBetween(slots, iv.to, from)) return true; // 左紧贴
        if (iv.from >= to && !hasRealCharBetween(slots, to, iv.from)) return true; // 右紧贴
    }
    return false;
}

/** 词表追加 recite-hole 词（去重幂等；追加在词尾——~= 匹配词序无关） */
export function appendHoleWord(span: HTMLElement): void {
    const words = (span.getAttribute("data-type") ?? "").trim().split(/\s+/).filter(Boolean);
    if (!words.includes(RECITE_HOLE_SPAN)) words.push(RECITE_HOLE_SPAN);
    span.setAttribute("data-type", words.join(" "));
}

/** toggle 撤销：从词表移除 recite-hole 词；词表空了才拆壳（裸文本空=纯壳.unwrap 回文字） */
export function removeHoleWord(span: HTMLElement): void {
    const words = (span.getAttribute("data-type") ?? "").trim().split(/\s+/).filter(w => w && w !== RECITE_HOLE_SPAN);
    if (words.length) span.setAttribute("data-type", words.join(" "));
    else span.replaceWith(...Array.from(span.childNodes));
}

/** 段内实字判定（剥零宽空格；空白字符算内容——保用户文本原貌不擅自丢空格） */
function hasRealContent(el: Element): boolean {
    return (el.textContent ?? "").replace(/\u200b/g, "") !== "";
}

/** 裸文本切片包壳：splitText 三分后中段包 span[data-type=recite-hole]（slot 一次一处理，引用恒有效） */
function wrapTextSlice(slot: HoleSlot, from: number, to: number): void {
    const t = slot.node;
    if (!t.parentNode) return;
    const a = from - slot.start, b = to - slot.start;
    if (b < t.length) t.splitText(b);
    const mid = a > 0 ? (t.splitText(a) as Text) : t;
    const span = document.createElement("span");
    span.setAttribute("data-type", RECITE_HOLE_SPAN);
    mid.replaceWith(span);
    span.appendChild(mid);
}

/** 格式 span 三段拆（setInlineMark 同款语义）：头尾先 cloneContents 快照、再 extractContents
 *  取中段，原 span 整体替换为 [头? / 中（原词表+recite-hole）/ 尾?]——三壳全 cloneNode(false)
 *  保格式属性（data-type/style/data-* 原样），产物恒扁平。头/尾无实字不落壳（不留空壳）。 */
function splitFormatSpan(span: HTMLElement, slots: HoleSlot[], from: number, to: number): void {
    const inner = slots.filter(s => s.span === span);
    const first = inner.find(s => from < s.end) ?? inner[0];
    const last = inner.find(s => s.start < to && to <= s.end) ?? inner[inner.length - 1];
    const midR = document.createRange();
    midR.setStart(first.node, Math.max(0, from - first.start));
    midR.setEnd(last.node, Math.min(last.node.length, to - last.start));
    const headR = document.createRange();
    headR.selectNodeContents(span);
    headR.setEnd(midR.startContainer, midR.startOffset);
    const tailR = document.createRange();
    tailR.selectNodeContents(span);
    tailR.setStart(midR.endContainer, midR.endOffset);
    const headFrag = headR.cloneContents(); // 先快照后手术：extract 前边界点全有效
    const tailFrag = tailR.cloneContents();
    const midFrag = midR.extractContents();
    const shell = () => span.cloneNode(false) as HTMLElement;
    const parts: Node[] = [];
    const head = shell(); head.appendChild(headFrag);
    if (hasRealContent(head)) parts.push(head);
    const mid = shell(); appendHoleWord(mid); mid.appendChild(midFrag); parts.push(mid);
    const tail = shell(); tail.appendChild(tailFrag);
    if (hasRealContent(tail)) parts.push(tail);
    span.replaceWith(...parts);
}

/** 打标主刀：[from,to) 逐段打 recite-hole（裸文本包壳 / 格式 span 整选追加词 / 半选三段拆）。
 *  slots 须为手术前快照；内部倒序手术保引用有效。返回是否有实际改动（幂等重挖=false）。 */
export function markIntervalAsHole(slots: HoleSlot[], from: number, to: number): boolean {
    if (to <= from) return false;
    // 分段：选区按「最近格式 span」切连续段（同 span 的相邻 slot 归并）
    const segs: { span: HTMLElement | null; from: number; to: number }[] = [];
    for (const s of slots) {
        const a = Math.max(s.start, from), b = Math.min(s.end, to);
        if (a >= b) continue;
        const lastSeg = segs[segs.length - 1];
        if (lastSeg && lastSeg.span === s.span) lastSeg.to = b;
        else segs.push({ span: s.span, from: a, to: b });
    }
    // 格式 span 全量区间（整选判定：段覆盖 span 全部文本=追加词，不动结构）
    const full = new Map<HTMLElement, { from: number; to: number }>();
    for (const s of slots) {
        if (!s.span) continue;
        const cur = full.get(s.span);
        if (!cur) full.set(s.span, { from: s.start, to: s.end });
        else { cur.from = Math.min(cur.from, s.start); cur.to = Math.max(cur.to, s.end); }
    }
    let changed = false;
    for (let i = segs.length - 1; i >= 0; i--) {
        const seg = segs[i];
        if (!seg.span) {
            // 裸文本段：逐 slot 倒序包壳
            for (let j = slots.length - 1; j >= 0; j--) {
                const sl = slots[j];
                if (sl.span) continue;
                const a = Math.max(sl.start, seg.from), b = Math.min(sl.end, seg.to);
                if (a >= b) continue;
                wrapTextSlice(sl, a, b);
                changed = true;
            }
            continue;
        }
        const iv = full.get(seg.span);
        if (iv && seg.from <= iv.from && seg.to >= iv.to) {
            const before = seg.span.getAttribute("data-type"); // 整选：词表追加（幂等）
            appendHoleWord(seg.span);
            if (seg.span.getAttribute("data-type") !== before) changed = true;
            continue;
        }
        splitFormatSpan(seg.span, slots, seg.from, seg.to);
        changed = true;
    }
    return changed;
}

/** 选区祖先上爬拿块元素（data-node-id 容器；文本节点先回父元素） */
function blockOf(node: Node | null): HTMLElement | null {
    const el = node?.nodeType === 3 ? node.parentElement : (node as Element | null);
    return (el?.closest?.("div[data-node-id]") as HTMLElement) ?? null;
}

/** 单飞锁（setBlocksRole 同款）：在途连点复用同一轮，防双写竞态 */
let holeInFlight: Promise<void> | null = null;
export function setHoleFromSelection(plugin: any, protyle: any): Promise<void> {
    if (holeInFlight) return holeInFlight;
    holeInFlight = doSetHole(plugin, protyle).finally(() => { holeInFlight = null; });
    return holeInFlight;
}

async function doSetHole(plugin: any, protyle: any): Promise<void> {
    const say = (k: string, fb: string) => (plugin?.i18n?.[k] as string) || fb;
    const wysiwyg: HTMLElement = protyle?.wysiwyg?.$wysiwyg ?? protyle?.wysiwyg?.element;
    if (!wysiwyg) return;
    // 门禁同打靶（role.ts 同判据）：挖空有内容副作用（span 进原文），非仿写文档拦下
    if (!wysiwyg.getAttribute(RECITE_START)) {
        await siyuan.pushMsg(say("挖空非仿写提示", "先进入仿写模式再划词挖空（点顶栏笔图标进入）"), 2500);
        return;
    }
    // 活选区（reciteSelection 同源优先级）：非 collapsed 且首末都在本 wysiwyg
    const sel = document.getSelection();
    const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
    if (!range || range.collapsed || !wysiwyg.contains(range.startContainer) || !wysiwyg.contains(range.endContainer)) {
        await siyuan.pushMsg(say("挖空无选区提示", "先在原文里划词选中要挖空的文字，再点「挖空」"), 2500);
        return;
    }
    const startBlock = blockOf(range.startContainer);
    const endBlock = blockOf(range.endContainer);
    // 单块约束（setInlineMark 'a' 同款：跨块行内标记内核不支持，文字级挖空天然单块）
    if (!startBlock || startBlock !== endBlock) {
        await siyuan.pushMsg(say("挖空跨块提示", "挖空只支持同一段文字：请把选区收到一个块内"), 2500);
        return;
    }
    const blockID = startBlock.getAttribute("data-node-id");
    if (!blockID) return;
    // 选区收在块的可编辑区（protyle-attr 属性行 contenteditable=false 不可入 span）
    const editable = startBlock.querySelector('[contenteditable="true"]');
    if (!editable || !editable.contains(range.startContainer) || !editable.contains(range.endContainer)) {
        await siyuan.pushMsg(say("挖空跨块提示", "挖空只支持同一段文字：请把选区收到一个块内"), 2500);
        return;
    }
    const text = range.toString().replaceAll("\u200b", "").trim();
    if (!text) {
        await siyuan.pushMsg(say("挖空空选区提示", "选中的文字是空的，划一段字再点「挖空」"), 2500);
        return;
    }

    const slots = textSlotsOf(editable);
    const { from, to } = intervalOfRange(editable, range);

    // toggle off：选区完整落在某个既有空内=只撤销那个空（词表移词/纯壳拆壳——复合词表空
    // 只去 recite-hole 词保留原格式）；块内还有别的空则 IAL 保留（一块多空）。防误打无出路；
    // 只查锚点端会把「从半空跨到块尾」误判成撤销——区间包含（两端同在）才算完整选中
    const hole = holeSpanContaining(slots, from, to);
    if (hole) {
        removeHoleWord(hole);
        const rest = startBlock.querySelectorAll(HOLE_SPAN_SEL).length;
        if (!rest) startBlock.removeAttribute(RECITE_HOLE);
        const ok = await writeBlock(startBlock, blockID);
        if (ok) {
            await siyuan.setBlockAttrs(blockID, { [RECITE_HOLE]: rest ? "1" : "" } as AttrType);
            await siyuan.pushMsg(rest
                ? say("已取消挖空之一", "已撤销这个空：本块还有 {} 个空").replace("{}", String(rest))
                : say("已取消挖空", "已撤销这段挖空：文字恢复原样"), 2500);
        }
        debugLog("recite.hole", `unhole block=${blockID.slice(-8)} ok=${ok} rest=${rest}`, "recite");
        return;
    }
    // 相邻零间隔拒绝（硬约束：mergeSameInlineElement 合并同词表紧贴 span=两空变一空答案错位）
    if (touchesExistingHole(slots, from, to)) {
        await siyuan.pushMsg(say("挖空相邻空提示", "空之间至少隔一个字：紧贴的空会被合并成一个，答案就对不上了"), 2500);
        return;
    }

    // 打标：分段手术（裸文本包壳/格式 span 整选追加词/半选三段拆——setInlineMark 同语义，产物恒扁平）
    markIntervalAsHole(slots, from, to);
    startBlock.setAttribute(RECITE_HOLE, "1"); // 随 outerHTML 进 IAL（insert 通道 custom-* 保真）
    const holes = startBlock.querySelectorAll(HOLE_SPAN_SEL).length;
    const ok = await writeBlock(startBlock, blockID);
    if (ok) {
        // 双保险：update 万一剥属性，setBlockAttrs 兜底补 IAL（identifyNotes 判据不能丢）
        await siyuan.setBlockAttrs(blockID, { [RECITE_HOLE]: "1" } as AttrType);
        await siyuan.pushMsg((holes > 1
            ? say("已挖空多空", "已挖空「{}」：本块已有多个空，出卷时按顺序在写位填回（多个答案用空格分隔）")
            : say("已挖空", "已挖空「{}」：出卷时这段字会被遮住，凭记忆在写位填回")).replace("{}", clip(text)), 2500);
    }
    debugLog("recite.hole", `mark block=${blockID.slice(-8)} ok=${ok} holes=${holes} len=${text.length}`, "recite");
}

/** 块 outerHTML 落盘（事务 update，渐进 multilineMark 同通道）；false=写失败已提示 */
async function writeBlock(block: HTMLElement, blockID: string): Promise<boolean> {
    try {
        const ret = await siyuan.updateBlock(blockID, block.outerHTML, "dom");
        if (ret == null) throw new Error("no echo");
        return true;
    } catch {
        await siyuan.pushMsg("挖空写入失败，请重试（页面未刷新前标记可能未生效）", 2500);
        return false;
    }
}

function clip(s: string, n = 12): string {
    return s.length > n ? s.slice(0, n) + "…" : s;
}

/**
 * 挖空块 DOM 克隆 → 卷内照抄 HTML（extract.ts 出卷装配用）：剥全层 data-node-id
 * （复制链净化——预挂合规 id 会被内核认领保留=与原块撞 id 污染 blocktree）、顶层换
 * NewNodeID（无 id 丢 custom-* 属性，事务 HTML 通道硬契约）、剥 recite 角色族属性
 * （old/target/written——卷内身份只留 keep=展示层，与 copyHTML 产物同形态）、挂
 * RECITE_KEEP（readExtractDoc/writeZone/q-ctrl 跳过，不进复述）+ RECITE_HOLE（卷内
 * 判据/诊断锚）。span 原样保留——卷内遮字 CSS 按词表命中（index.scss 卷面规则）。
 */
export function holeCopyHTML(clone: HTMLElement): string {
    clone.querySelectorAll("[data-node-id]").forEach(el => el.removeAttribute("data-node-id"));
    clone.setAttribute("data-node-id", NewNodeID());
    for (const a of [RECITE_OLD, RECITE_TARGET, RECITE_WRITTEN, RECITE_HINT]) {
        clone.removeAttribute(a);
    }
    clone.setAttribute(RECITE_HOLE, "1");
    clone.setAttribute(RECITE_KEEP, "1");
    return clone.outerHTML;
}
