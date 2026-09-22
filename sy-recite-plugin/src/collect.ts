import type { Plugin } from "siyuan";
import { siyuan } from "../../sy-tomato-plugin/src/libs/siyuanApi";
import { OpenSyFile2 } from "../../sy-tomato-plugin/src/libs/navUtils";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { DomParaBuilder, md2Divs } from "../../sy-tomato-plugin/src/libs/sydom";
import { RECITE_EXTRACT, RECITE_COMPARE, RECITE_COLLECT, COLLECT_TITLE } from "./constants";
import { readExtractDoc, findReciteChildDoc, insertUnitsDoc, replaceUnitsInPlace, syncDerivedTitle, derivedTitle } from "./extract";
import type { ExtractEntry } from "./extract";

/**
 * 收集成文（□E，2026-09-21 bear 点名新功能）：把练习卷里「用户写的字」一键抽成独立文档
 * ——练习的终点是作品：多段圈靶练完后，一段段写下的仿写按题序拼成一篇可导出的作文。
 * 功能提案三问：内容归宿=思源文档（用户成果可编辑可导出，插件只管生成与更新）；
 * 独特功能=练习成果成文（渐进摘抄收集的是「摘的东西」，这里收集的是「自己写的字」）；
 * 用户零额外输入（字已在写位里）。全量免费不挂门禁（用户核心成果不锁，收费边界 bear
 * 后定）——本文件不进任何 Pro 判定分支。
 */

/**
 * 收集纯函数核心：entries → 每题写位 markdown 组（按题序）。
 * 隔离全在 readExtractDoc 出口（extractEntries）：题面（noteMarkdown）、语境照抄
 * （keep）、老卷 hint、written、q-ctrl 控制块都已跳过；写位空块不进 writes——此处
 * 拿到的 writes 就是「用户写的字」全集。整题无写位剔除（没写的题不成段）；题内多块
 * 保留原块结构（一题写多块=多段照搬，不合并——块结构是用户自己的分段）。
 */
export function collectGroups(entries: ExtractEntry[]): string[][] {
    return entries
        .map(e => e.writes.map(w => w.markdown))
        .filter(g => g.length);
}

/**
 * 收集单元构造：每组逐块 md2Divs（行内格式保留，与对比右栏同通道），组间插空段
 * 分隔——题与题之间空行分段（作文排版语义；设计定案③）。空段走 DomParaBuilder
 * 无参先例（extract.ts 空写位同款，事务插入通道已验证）。末组后不插（文档尾不留空块）。
 */
export function collectUnits(groups: string[][]): string[] {
    const units: string[] = [];
    groups.forEach((g, gi) => {
        if (gi) units.push(new DomParaBuilder().html());
        g.forEach(md => units.push(...md2Divs(md).map(d => d.outerHTML)));
    });
    return units;
}

/**
 * 一键整卷收集：练习卷（或对比文档——入口归一同 rewriteExtract/doCompare 惯例）所有
 * 写位按题序拼文，落原文档下「仿写文·原文标题」子文档。
 * 落点必须在原文档下（与「抽取·」平级）：挂卷下会被「删除练习」连子树删掉（cleanPractice
 * 删 RECITE_EXTRACT 文档即删其全部子文档）——收集文档是用户成果，独立于练习生命周期
 * （statusBtn.cleanPractice 只查 RECITE_EXTRACT，独立属性+平级落点双保险不波及）。
 * 单例覆盖更新：findReciteChildDoc 按 custom-recite-collect=<原文 id> 识别（勿与卷的
 * custom-recite-extract 混）；有旧文档=replaceUnitsInPlace 原地重插（文档 id 不变，
 * 用户手动挂的闪卡/进度继承，对齐卷的「重抽覆盖更新」惯例）+ 标题跟随原文改名；
 * 无旧文档=insertUnitsDoc 新建。空写位卷（全题没字）toast 提示不建文档。
 */
export async function doCollect(plugin: Plugin, docID: string) {
    if (!docID) return;
    let attrs = await siyuan.getBlockAttrs(docID);
    if (attrs?.[RECITE_COMPARE]) { // 对比文档再点「收集」= 对抽取文档现状收集
        docID = attrs[RECITE_COMPARE];
        attrs = await siyuan.getBlockAttrs(docID);
    }
    const originID = attrs?.[RECITE_EXTRACT];
    if (!originID) {
        await siyuan.pushMsg("请在抽取/对比文档中点击「收集」", 2500);
        return;
    }
    const entries = await readExtractDoc(docID);
    const groups = collectGroups(entries);
    if (!groups.length) {
        await siyuan.pushMsg("还没有可收集的内容：先在练习卷写位写下你的字", 3000);
        return;
    }
    const units = collectUnits(groups);
    // box/路径/标题全走按 id 直查通道（rebuildExtractDoc 同理）：SQL 有索引延迟，
    // 原文刚改名时会拿旧路径旧标题把收集文档建进幽灵文件夹
    const info = await siyuan.getBlockInfo(originID);
    const hpath = info?.box ? await siyuan.getHPathByID(originID, info.box) : "";
    if (!info?.box || !hpath) {
        await siyuan.pushMsg("未取到原文位置信息，请重试", 2500);
        return;
    }
    const old = await findReciteChildDoc({ box: info.box, path: info.path, hpath }, derivedTitle(COLLECT_TITLE, info.rootTitle), RECITE_COLLECT, originID);
    const collectAttrs = { [RECITE_COLLECT]: originID } as AttrType;
    let collectID: string | null = null;
    if (old.id) {
        collectID = await replaceUnitsInPlace(old.id, units, info.box, old.hpath, collectAttrs);
        // 病卷自愈走新建时 collectID 是新文档 id（≠old.id）：标题按入参 hpath 建即正确；
        // in-place 成功 id 不变，改名跟随照旧（syncDerivedTitle 同 extract 惯例）
        if (collectID && collectID === old.id) await syncDerivedTitle(old.id, old.hpath);
    } else {
        collectID = await insertUnitsDoc(info.box, old.hpath, units, collectAttrs);
    }
    if (!collectID) { // 假成功复核读失败（insertUnitsDoc/replaceUnitsInPlace 内已复核）——勿假报成功
        await siyuan.pushMsg("收集文档生成失败，请重试", 2500);
        return;
    }
    const n = groups.reduce((s, g) => s + g.length, 0);
    const name = old.hpath.split("/").pop() ?? COLLECT_TITLE;
    debugLog("recite.collect", `origin=${originID} collect=${collectID} entries=${entries.length} written=${groups.length} blocks=${n} rebuild=${old.id ? `inPlace(${old.id})` : "create"}`, "recite");
    await siyuan.pushMsg(`收集完成：${n} 段字已${old.id ? "更新" : "写入"}「${name}」（独立文档，不随删除练习消失）`, 3000);
    OpenSyFile2(plugin, collectID, "front");
}
