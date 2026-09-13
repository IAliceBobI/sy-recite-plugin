import { siyuan } from "../../sy-tomato-plugin/src/libs/siyuanApi";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { DomParaBuilder } from "../../sy-tomato-plugin/src/libs/sydom";
import { NewNodeID } from "../../sy-tomato-plugin/src/libs/globals";
import { RECITE_START, RECITE_OLD, RECITE_KEEP, RECITE_TARGET } from "./constants";
import { reciteSelection, selectionDiag } from "./selection";

/**
 * 三钮互斥设置统一入口（□1 标记层，2026-09-13 仿写三角色战役）：浮条「上下文/这段练/
 * 总结」三钮 + 右键菜单 + 命令三通道共用的角色设置执行，替掉 keep.ts/target.ts 的
 * 「再点取消」toggle 语义——三钮单选切换，「总结」兼任取消（bear 拍板）。
 * - 设上下文 = 语境认领（□4 bear 反馈修正）：新写块挂 old（「这段字从此当作原文」——只挂
 *   keep 会在三条链上都不按原文走：视觉仍带竖线标记、删除练习被当批注删、温和退出被
 *   written 标；与「设总结=清 old」互为镜像）；存量块清 keep/靶回默认语境；
 * - 设考核 = 挂靶清 keep + 段后空总结位幂等补插（已有不重复插）+ 光标落位；
 * - 设总结 = 清 keep/靶/old（存量认领：「这段字从此当作我写的」，与 AI 锚点 R_OLD=""
 *   同源手法；空值写=删属性，对未挂者是 no-op；对上下文认领块=回退为新写）。
 * 作用对象解析（块选/拖蓝/光标三级链 + 右键块语义）在 selection.ts reciteSelection。
 */

export type SettableRole = "context" | "target" | "summary";

/** 三钮互斥写值（纯函数，单测在 tests/unit/roleModel.test.ts；isOld=块当前存量身份） */
export function attrsForRole(role: SettableRole, isOld = false): AttrType {
    if (role === "context")
        return isOld
            ? { [RECITE_KEEP]: "", [RECITE_TARGET]: "" } as AttrType
            : { [RECITE_OLD]: "1", [RECITE_KEEP]: "", [RECITE_TARGET]: "" } as AttrType;
    if (role === "target") return { [RECITE_TARGET]: "1", [RECITE_KEEP]: "" } as AttrType;
    return { [RECITE_KEEP]: "", [RECITE_TARGET]: "", [RECITE_OLD]: "" } as AttrType;
}

/**
 * DOM 空块判据：零宽空格 \u200b 剥后再 trim（内核空块 contenteditable 恒含 \u200b，
 * 裸 trim 剔不掉——qCtrlRender 同款修法；旧 target.ts 清理路径的潜伏漏判一并根治）。
 */
const domEmpty = (el: HTMLElement): boolean =>
    !(el.querySelector('[contenteditable="true"]')?.textContent ?? "").replaceAll("\u200b", "").trim();

/**
 * 段末紧邻的空总结位（未写内容的非 old 块）：考核段后的「落笔即成锚点升格」位。
 * 选中集按 DOM 序，段末=下一选中块不再紧邻（多段各自一个位）。
 */
function emptyNoteSlotAfter(el: HTMLElement): HTMLElement | null {
    const next = el.nextElementSibling as HTMLElement | null;
    return next?.getAttribute?.("data-node-id") && !next.getAttribute(RECITE_OLD) && domEmpty(next) ? next : null;
}

/** 顺手清离靶方向的空总结位（已填保留——它是内容，删不删归用户）；返回清掉的块数 */
async function removeEmptyNoteSlots(els: HTMLElement[]): Promise<number> {
    const ids = els
        .filter((el, i) => el && (i === els.length - 1 || els[i + 1] !== el.nextElementSibling))
        .map(emptyNoteSlotAfter)
        .map(el => el.getAttribute("data-node-id"))
        .filter(Boolean) as string[];
    if (ids.length) await siyuan.deleteBlocks(ids);
    return ids.length;
}

/**
 * 设置执行：解析选中集 → （离靶清位/打靶补位）→ 互斥属性统一写 → 反馈。
 * 属性走 API 通道（内核侧 IAL 缓存即刷、前端 DOM 属性镜像仍经 ws 广播 ~1s；事务
 * setAttrs 也会刷 IAL 缓存——kernel/model/transaction.go:2285 PutBlockIALInBox，09-13
 * reasoning review 对照内核源码修正旧注释）；判向读 cache-first batchGetBlockAttrs
 * （SQL ial 列异步索引秒级窗会误判，target.ts 旧注释同源）。
 * 在途互斥（review P2-1）：打靶插总结位读 DOM 镜像判幂等，镜像 ~1s 才落——双击/连点
 * 在首插落 DOM 前会各插一个位（多的那个不紧邻段末永不清）。模块级单飞锁：在途直接
 * 复用同一 Promise（三通道共用，浮条/右键/命令全覆盖）。
 */
let roleInFlight: Promise<void> | null = null;
export function setBlocksRole(plugin: any, protyle: any, role: SettableRole, blockEl?: HTMLElement): Promise<void> {
    if (roleInFlight) return roleInFlight;
    roleInFlight = doSetBlocksRole(plugin, protyle, role, blockEl).finally(() => { roleInFlight = null; });
    return roleInFlight;
}

async function doSetBlocksRole(plugin: any, protyle: any, role: SettableRole, blockEl?: HTMLElement): Promise<void> {
    const { blocks: els, level, viaBlockEl } = reciteSelection(protyle, blockEl);
    const ids = els.map(el => el?.getAttribute?.("data-node-id")).filter(Boolean) as string[];
    if (!ids.length) {
        debugLog("recite.role", `miss role=${role} ${selectionDiag(protyle, blockEl)}`, "recite");
        await siyuan.pushMsg(plugin?.i18n?.["无选中提示"] || "请先点一下要标记的块（光标落在块内即可），或拖蓝/Ctrl+点选多块", 2500);
        return;
    }
    const wysiwyg: HTMLElement = protyle?.wysiwyg?.$wysiwyg ?? protyle?.wysiwyg?.element;
    const ials = await siyuan.batchGetBlockAttrs(ids).catch(() => null);
    const hadTarget = !!ials && Object.values(ials).some(a => a?.[RECITE_TARGET]);

    // 离靶方向（考核→上下文/总结）：紧邻空总结位顺手清
    let cleanedSlots = 0;
    if (hadTarget && role !== "target") cleanedSlots = await removeEmptyNoteSlots(els);

    // 打考核方向：门禁（插块有内容副作用，非仿写文档拦下；wysiwyg 属性镜像零请求判据，
    // 与清位/其余两方向的无门禁不对称是既有语义——纯属性设置无害放行）+ 空总结位幂等补插。
    // 顺序铁律（aiSplit 同坑先例）：先插块后挂 custom 标记——标记后 ~2s 内 insertBlock 会
    // 竞态继承属性
    let slotID = "";
    let inserted = false;
    if (role === "target") {
        if (wysiwyg && !wysiwyg.getAttribute(RECITE_START)) {
            await siyuan.pushMsg(plugin?.i18n?.["靶非仿写提示"] || "先进入仿写模式再圈「这段练」（点顶栏笔图标进入）", 2500);
            return;
        }
        const last = els[els.length - 1];
        const existing = emptyNoteSlotAfter(last);
        if (existing) {
            slotID = existing.getAttribute("data-node-id"); // 已有位（重复设考核/旧位仍在）：不重复插
        } else {
            slotID = NewNodeID();
            inserted = true;
            const div = new DomParaBuilder();
            div.setAttr("data-node-id", slotID);
            await siyuan.transactions(siyuan.transInsertBlocksAfter([div.html()], ids[ids.length - 1]));
        }
    }

    await Promise.all(ids.map(id => siyuan.setBlockAttrs(id, attrsForRole(role, !!ials?.[id]?.[RECITE_OLD]))));
    // 新插总结位显式清继承面（aiSplit 同款防御）：竞态继承 RECITE_OLD=永不被识别为总结
    // （恒 orphan）、继承 RECITE_KEEP=被 readExtractDoc 静默吞掉；空值写=删属性。
    // 复用既有位不清（非本调用产物，无继承面）
    if (inserted) {
        await siyuan.setBlockAttrs(slotID, { [RECITE_OLD]: "", [RECITE_KEEP]: "" } as AttrType);
    }

    debugLog("recite.role", `set role=${role} ids=${ids.length} hadTarget=${hadTarget} cleanedSlots=${cleanedSlots} slot=${slotID || "-"} level=${level}${viaBlockEl ? "+blk" : ""}`, "recite");

    const n = String(ids.length);
    const msg = (key: string, fallback: string) => (plugin?.i18n?.[key] || fallback).replace("{}", n);
    if (role === "context") {
        // 认领口径两态（镜像 summary 的 hadOld 先例）：选中集含新写块=认领（当作原文），
        // 全存量=清标回默认语境
        const hadClaim = !!ials && ids.some(id => ials[id] && !ials[id][RECITE_OLD]);
        await siyuan.pushMsg(hadClaim
            ? msg("已留上下文认领", "已留 {} 块作上下文：新写的字从此当作原文（照抄进卷、退出与删除都按原文走）")
            : msg("已留作上下文", "已留 {} 块作上下文：抽取时会复制进练习文档"), 2500);
    } else if (role === "target") {
        await siyuan.pushMsg(msg("已标靶", "已圈 {} 块为「这段练」：段后已留总结位，抽取只练这段"), 2500);
    } else {
        const hadOld = !!ials && Object.values(ials).some(a => a?.[RECITE_OLD]);
        await siyuan.pushMsg(hadOld
            ? msg("已设总结认领", "已把 {} 块设为总结（存量原文一并认领为我写的）")
            : msg("已设总结", "已把 {} 块设为总结：抽取时作为题目"), 2500);
    }

    // 光标落位（打考核方向）：HTTP/事务插入经 ws 广播刷 DOM 有延迟，轮询等元素进场再
    // focusBlock；伪 protyle（e2e）无此方法/元素则跳过。toast 已先发，最多空转 2.5s 不阻塞
    if (role === "target" && slotID && wysiwyg) {
        const deadline = Date.now() + 2500;
        while (Date.now() < deadline) {
            const el = wysiwyg.querySelector(`[data-node-id="${slotID}"]`);
            if (el) {
                protyle?.focusBlock?.(el);
                break;
            }
            await new Promise(r => setTimeout(r, 80));
        }
    }
}
