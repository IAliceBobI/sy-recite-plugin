import { siyuan } from "../../sy-tomato-plugin/src/libs/siyuanApi";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { RECITE_KEEP, RECITE_TARGET } from "./constants";
import { reciteSelection, selectionDiag } from "./selection";

/**
 * 「留作上下文」入口公共层（期1 整篇语义，2026-09-08）：右键菜单 / 命令 / 浮条三通道
 * 共用的 toggle 执行。keep 块 = 原文档里被点名复制的原文块，抽取时按文档序
 * 进抽取文档（卡面语境），语义矩阵见 extract.ts keepBlocksForGroups。
 *
 * 作用对象解析（块选/拖蓝/光标三级链 + 右键块语义）全在 selection.ts reciteSelection
 * （□8 期1 统一选中工具接入，共享纯函数=tomato libs/selection.ts；□6 拖蓝兜底与
 * □7 双横线类名的血泪史沉淀在共享函数与 tests/unit/selection.test.ts）。
 */

/**
 * toggle 执行：读目标集 IAL 判方向 → 逐块 setBlockAttrs（API 通道内核即刷 DOM 属性镜像，
 * CSS 实时渲染——事务 setAttrs 只落盘不刷已开编辑器，视觉场景禁用，与花边同约束）。
 * 多块少量请求可接受（花边先例单块；块集多选通常个位数）。
 * 判向语义：目标集内任一块已有 keep → 全清（单块主场景天然自身取反；多选按「有一个就
 * 算取消」简化——打标记是正向操作，误清可再打；光标块兜底误触同理靠 toggle 可逆兜底）。
 */
export async function toggleKeepBlocks(plugin: any, protyle: any, blockEl?: HTMLElement): Promise<void> {
    const { blocks: els, level, viaBlockEl } = reciteSelection(protyle, blockEl);
    const ids = els.map(el => el?.getAttribute?.("data-node-id")).filter(Boolean) as string[];
    if (!ids.length) {
        debugLog("recite.keep", `miss ${selectionDiag(protyle, blockEl)}`, "recite");
        await siyuan.pushMsg(plugin?.i18n?.["上下文无选中提示"] || "请先点一下要保留的原文块（光标落在块内即可），或拖蓝/Ctrl+点选多块", 2500);
        return;
    }
    // 判向走 cache-first 属性 API（SQL ial 列异步索引秒级窗会误判向，target.ts 注释同源）
    const ials = await siyuan.batchGetBlockAttrs(ids).catch(() => null);
    const clearing = !!ials && Object.values(ials).some(a => a?.[RECITE_KEEP]);
    // 打 keep 同步清靶（期2 互斥：keep=永显进卡面 vs 靶=永藏换总结，同块并存语义矛盾；
    // 清向只清自身——对面标记本就不可能共存；空值写=删属性（kernel setNodeAttrs0 语义），无残留）
    const attrs: AttrType = clearing
        ? { [RECITE_KEEP]: "" } as AttrType
        : { [RECITE_KEEP]: "1", [RECITE_TARGET]: "" } as AttrType;
    await Promise.all(ids.map(id => siyuan.setBlockAttrs(id, attrs)));
    debugLog("recite.keep", `toggle ids=${ids.length} clearing=${clearing} level=${level}${viaBlockEl ? "+blk" : ""}`, "recite");
    const msg = (key: string, fallback: string) =>
        (plugin?.i18n?.[key] || fallback).replace("{}", String(ids.length));
    await siyuan.pushMsg(clearing ? msg("已取消上下文", `已取消 ${ids.length} 块的上下文标记`)
        : msg("已留作上下文", `已留 ${ids.length} 块作上下文：抽取时会复制进练习文档`), 2500);
}
