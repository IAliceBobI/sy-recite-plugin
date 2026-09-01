import type { Plugin } from "siyuan";
import { siyuan } from "../../sy-tomato-plugin/src/libs/siyuanApi";
import { OpenSyFile2 } from "../../sy-tomato-plugin/src/libs/navUtils";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { DomSuperBlockBuilder, DomParaBuilder, md2Divs } from "../../sy-tomato-plugin/src/libs/sydom";
import type { DomBuilder } from "../../sy-tomato-plugin/src/libs/sydom";
import { RECITE_EXTRACT, RECITE_COMPARE, RECITE_CMP_CARD, RECITE_NOTE, COMPARE_TITLE } from "./constants";
import { readExtractDoc, fetchOriginMarkdown, findReciteChildDoc, insertUnitsDoc, derivedTitle, isAssociation, noteBlockAsHeading, noteHeadingLevel } from "./extract";

/**
 * 题目单行化：批注 markdown 的 \n 拼为空格——对比文档每题进 h2 的前提。
 * 与抽取文档不同源决策：抽取侧多行题保持段落（题目是唯一载体，heading 落库剥 \n 即丢内容）；
 * 对比文档左栏有完整原文兜底，标题只丢视觉换行不丢信息，且多行题若保持段落会被吸进
 * 上一题 h2 的折叠范围（折上一题连这题卡片一起收走），破坏折叠收纳诉求。
 */
export function flatNote(md: string): string {
    return md.replace(/\n/g, " ");
}

/**
 * 批注块流 → hN 题目标题块数组（级别跟设置项默认 6=出厂；对比文档每题卡片前置）：首块为段落
 * （常态）原地 heading 化，残余块全量照跟；首块为块级容器（列表等罕见形态，DOM 与 heading
 * 不同构）取全文重构纯文本段落再 heading 化——丢行内格式保全部文本。
 * 首块挂 custom-recite-note：与抽取文档题目块同吃 index.scss 的 accent+500
 * （两文档题目观感单源，unpaid 门禁自动跟随）；下游安全——writeZone 按文档级
 * RECITE_EXTRACT IAL 判定启用，对比文档（RECITE_COMPARE）恒不触发。
 */
export function headingifyNoteDivs(divs: HTMLElement[], level: number = 6): HTMLElement[] {
    if (!divs.length) return [];
    if (divs[0].getAttribute("data-type") === "NodeParagraph") {
        divs[0].setAttribute(RECITE_NOTE, "1");
        noteBlockAsHeading(divs[0], level);
        return divs;
    }
    const text = divs.map(d => d.textContent).join(" ").trim();
    const para = new DomParaBuilder(text).build();
    para.setAttribute(RECITE_NOTE, "1");
    return [noteBlockAsHeading(para, level)];
}

/**
 * 对比：抽取文档下生成「对比·原文标题」子文档（每条批注一个左右两列超级块：左原文 / 右复述）。
 * 原文按总结块 refs 溯源属性实时回查原块（v1 语义：原文改了拿新文，删了占位标注）；
 * 总结不进对比——它已在抽取文档里，对比只看「写得像不像原文」。
 * 可编辑（不锁只读，2026-08-24 用户反馈改）——浮条常驻可「重新写/复制提示词」。
 */
export async function doCompare(plugin: Plugin, extractID: string) {
    if (!extractID) return;
    let attrs = await siyuan.getBlockAttrs(extractID);
    if (attrs?.[RECITE_COMPARE]) { // 对比文档再点「对比」= 按抽取文档现状刷新
        extractID = attrs[RECITE_COMPARE];
        attrs = await siyuan.getBlockAttrs(extractID);
    }
    if (!attrs?.[RECITE_EXTRACT]) {
        await siyuan.pushMsg("请在抽取文档中点击「对比」", 2500);
        return;
    }
    const entries = await readExtractDoc(extractID);
    if (!entries.length) {
        await siyuan.pushMsg("抽取文档里没有批注（旧版布局请先「重新写」）", 3000);
        return;
    }
    // 题目标题级别跟设置项（出厂默认 H6——H2 巨大折行；2026-09-01 用户「二级还是很巨大」可配 1~6）
    const noteLevel = noteHeadingLevel((plugin as any).settingCfg);
    const units = (await Promise.all(entries.map(async e => {
        // 题目标题 hN：单行化全文进标题——接通大纲跳转与 heading 折叠收纳（看过的折起来）
        const heading = headingifyNoteDivs(md2Divs(flatNote(e.noteMarkdown)), noteLevel).map(d => d.outerHTML);
        // 左栏：联想题=题目本身（自由联想无原文可比，不回查 refs）；普通题=refs 实时回查原文
        let leftDivs: (HTMLElement | DomBuilder)[];
        if (isAssociation(e.noteMarkdown)) {
            leftDivs = md2Divs(e.noteMarkdown);
        } else {
            const origins = await fetchOriginMarkdown(e.refs);
            leftDivs = origins.length ? md2Divs(origins.join("\n\n")) : [new DomParaBuilder("（本条批注前没有原文段）")];
        }
        // 思源 sb 语义：layout="col"=列布局左右并排、layout="row"=行布局垂直堆叠（与直觉相反）。
        // 故外层 col 承左右两栏，内层 row 承栏内多块垂直——一条抽取可对应好几个原文块，整组归左栏。
        const left = new DomSuperBlockBuilder("row").append(...leftDivs);
        // 右栏=复述：总结不进对比（抽取文档里已有，判卷提示词里另有【我的笔记】）
        const rightDivs: (HTMLElement | DomBuilder)[] = e.writes.flatMap(w => md2Divs(w.markdown));
        if (!e.writes.length) rightDivs.push(new DomParaBuilder("（未仿写）"));
        const right = new DomSuperBlockBuilder("row").append(...rightDivs);
        // 外层挂卡片属性：index.scss 据此画题框+中缝（嵌套 sb 只画外层，内层 row 无线防乱）
        const card = new DomSuperBlockBuilder("col").setAttrs({ [RECITE_CMP_CARD]: "1" } as AttrType).append(left, right).html();
        return [...heading, card];
    }))).flat();

    // box/路径走按 id 直查通道（getBlockInfo/getHPathByID 直读文件树，无 SQL 索引延迟——
    // 抽取文档可能刚建几分钟，SQL 行未必就绪）。焦点在抽取文档（按钮/命令入口保证）。
    const info = await siyuan.getBlockInfo(extractID);
    const hpath = info?.box ? await siyuan.getHPathByID(extractID, info.box) : "";
    if (!info?.box || !hpath) {
        await siyuan.pushMsg("未取到抽取文档位置信息，请重试", 2500);
        return;
    }
    // 标题后缀同抽取文档：原文标题（从抽取文档 IAL 回溯原文，不解析抽取文档自己的标题——命名方案会改）
    const origin = await siyuan.getBlockInfo(attrs[RECITE_EXTRACT]);
    // 单例：已存在（我们的）则删除重建——仿写改了再点「对比」即刷新（单事务原子成型）
    const old = await findReciteChildDoc({ box: info.box, path: info.path, hpath }, derivedTitle(COMPARE_TITLE, origin?.rootTitle), RECITE_COMPARE, extractID);
    if (old.id) await siyuan.removeDocByIDSiyuan(old.id);
    const cmpID = await insertUnitsDoc(info.box, old.hpath, units, { [RECITE_COMPARE]: extractID } as AttrType);
    debugLog("recite.compare", `extract=${extractID} compare=${cmpID} entries=${entries.length}`, "recite");
    await siyuan.pushMsg(`对比文档已生成（${entries.length} 题）`, 2000);
    OpenSyFile2(plugin, cmpID, "front");
}
