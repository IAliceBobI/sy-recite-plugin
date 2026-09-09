import { siyuan } from "../../sy-tomato-plugin/src/libs/siyuanApi";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { DomParaBuilder } from "../../sy-tomato-plugin/src/libs/sydom";
import { NewNodeID } from "../../sy-tomato-plugin/src/libs/globals";
import { RECITE_TARGET, RECITE_KEEP, RECITE_OLD, RECITE_START } from "./constants";
import { reciteSelection, selectionDiag } from "./selection";

/**
 * 「这段练」入口公共层（期2 节选语义，2026-09-08）：右键菜单 / 命令 / 浮条三通道共用的
 * 目标解析 + toggle 执行。靶块 = 原文档里被圈定练习的原文段，抽取切节选语义（整流照抄
 * 非靶块、靶段原位换 [锚点+写位]，切分逻辑见 extract.ts targetSpans）。
 *
 * 打向 = 逐块 setBlockAttrs 打靶属性（清 keep，互斥）+ 段后（文档序末块之后）插空批注块
 * + 光标落位（identifyNotes 判据=无 RECITE_OLD 且非空才算批注——空批注自然不进抽取，
 * 落笔即成靶的配对总结）。清向 = 清属性 + 每连续段后紧邻的空批注顺手删（已填保留——
 * 它是内容，删不删归用户）。作用对象解析同 keep.ts（三级链+右键块语义，selection.ts）。
 */
export async function toggleTargetBlocks(plugin: any, protyle: any, blockEl?: HTMLElement): Promise<void> {
    const { blocks: els, level, viaBlockEl } = reciteSelection(protyle, blockEl);
    const ids = els.map(el => el?.getAttribute?.("data-node-id")).filter(Boolean) as string[];
    if (!ids.length) {
        debugLog("recite.target", `miss ${selectionDiag(protyle, blockEl)}`, "recite");
        await siyuan.pushMsg(plugin?.i18n?.["靶无选中提示"] || "请先点一下要练的原文块（光标落在块内即可），或拖蓝/Ctrl+点选多块", 2500);
        return;
    }
    const wysiwyg: HTMLElement = protyle?.wysiwyg?.$wysiwyg ?? protyle?.wysiwyg?.element;
    // 判向走 cache-first 属性 API（setBlockAttrs 返回前同步刷缓存；SQL ial 列异步索引秒级窗
    // 会把「取消」误读成「再打」→ 重复插空批注——reasoning review P1-2，2026-09-08）
    const ials = await siyuan.batchGetBlockAttrs(ids).catch(() => null);
    const clearing = !!ials && Object.values(ials).some(a => a?.[RECITE_TARGET]);
    if (clearing) {
        // 清向：清属性 + 紧邻空批注顺手删。候选=每段（DOM 序连续选中集）末块的下一个顶层兄弟块，
        // DOM 直判（无 RECITE_OLD 属性镜像 + 无文本）——渲染 DOM 即 IAL 镜像，点击时刻即最新。
        // 已知窄边（review P2-3 记录，概率极低维持 DOM 直判）：超级块/列表首 editable 空而后续
        // 项有内容、纯图片块 textContent 恒空、分屏对侧刚落笔本侧 ws 未同步——均可能误判为空批注
        const emptyNext: string[] = [];
        els.forEach((el, i) => {
            const segEnd = i === els.length - 1 || els[i + 1] !== el.nextElementSibling; // 段末=下一选中块不再紧邻
            if (!el || !segEnd) return;
            const next = el.nextElementSibling as HTMLElement | null;
            if (next?.getAttribute?.("data-node-id") && !next.getAttribute(RECITE_OLD)
                && !(next.querySelector('[contenteditable="true"]')?.textContent ?? "").trim()) {
                emptyNext.push(next.getAttribute("data-node-id"));
            }
        });
        await Promise.all(ids.map(id => siyuan.setBlockAttrs(id, { [RECITE_TARGET]: "" } as AttrType)));
        if (emptyNext.length) await siyuan.deleteBlocks(emptyNext);
        debugLog("recite.target", `clear ids=${ids.length} emptyNotes=${emptyNext.length}`, "recite");
        const base = (plugin?.i18n?.["已取消靶"] || `已取消 ${ids.length} 块的练习标记`).replace("{}", String(ids.length));
        await siyuan.pushMsg(emptyNext.length
            ? base + (plugin?.i18n?.["已取消靶清总结"] || "，段后空总结已顺手清")
            : base, 2500);
        return;
    }
    // 打向门禁（review P2-1）：插块有内容副作用，非仿写文档拦下（清向纯属性无害放行）；
    // 文档级 custom-recite-start 由内核镜像在 wysiwyg 元素属性上（docRole 同款零请求判据）
    if (wysiwyg && !wysiwyg.getAttribute(RECITE_START)) {
        await siyuan.pushMsg(plugin?.i18n?.["靶非仿写提示"] || "先进入仿写模式再圈「这段练」（点顶栏笔图标进入）", 2500);
        return;
    }
    // 打向：段后（DOM 序末块后）插预置 id 的空批注，再打靶属性（互斥清 keep）+ 光标落位。
    // 顺序铁律（aiSplit 同坑先例）：先插块后挂 custom 标记——标记后 ~2s 内 insertBlock 会竞态
    // 继承属性。事务通道插 DOM 串（insertUnitsDoc 同款，预置 data-node-id 保真）。DOM 序=
    // 文档序（querySelectorAll 文档序），末块=els 最后一个
    const noteID = NewNodeID();
    const lastID = ids[ids.length - 1];
    const div = new DomParaBuilder();
    div.setAttr("data-node-id", noteID);
    await siyuan.transactions(siyuan.transInsertBlocksAfter([div.html()], lastID));
    // note 显式清继承面（reasoning review P1-1，aiSplit 同款防御）：插块仍可能竞态继承锚块
    // custom 属性——继承 RECITE_OLD=总结永远不被识别为批注（恒 orphan）、继承 RECITE_KEEP=
    // 未配对时被 readExtractDoc 静默吞掉；空值写=删属性，对未继承者是 no-op
    await Promise.all([
        siyuan.setBlockAttrs(noteID, { [RECITE_OLD]: "", [RECITE_KEEP]: "" } as AttrType),
        ...ids.map(id => siyuan.setBlockAttrs(id, { [RECITE_TARGET]: "1", [RECITE_KEEP]: "" } as AttrType)),
    ]);
    debugLog("recite.target", `mark ids=${ids.length} level=${level}${viaBlockEl ? "+blk" : ""} note=${noteID} focus=${!!protyle?.focusBlock}`, "recite");
    await siyuan.pushMsg((plugin?.i18n?.["已标靶"] || "已圈 {} 块为「这段练」：抽取只练这段，段后已留总结位（再点取消）").replace("{}", String(ids.length)), 2500);
    // 光标落位：HTTP/事务插入经 ws 广播刷 DOM 有延迟，轮询等元素进场再 focusBlock（Protyle
    // 公开方法，app/src/protyle/index.ts focusBlock(element)）；伪 protyle（e2e）无此方法/元素
    // 则跳过。toast 已先发（review P2-8），元素始终不出现最多空转 2.5s 不阻塞反馈
    if (wysiwyg) {
        const deadline = Date.now() + 2500;
        while (Date.now() < deadline) {
            const el = wysiwyg.querySelector(`[data-node-id="${noteID}"]`);
            if (el) {
                protyle?.focusBlock?.(el);
                break;
            }
            await new Promise(r => setTimeout(r, 80));
        }
    }
}
