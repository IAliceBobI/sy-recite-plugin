import type { Plugin } from "siyuan";
import { siyuan } from "../../sy-tomato-plugin/src/libs/siyuanApi";
import { OpenSyFile2 } from "../../sy-tomato-plugin/src/libs/navUtils";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { DomSuperBlockBuilder, DomParaBuilder, md2Divs } from "../../sy-tomato-plugin/src/libs/sydom";
import type { DomBuilder } from "../../sy-tomato-plugin/src/libs/sydom";
import { escapeHtml } from "../../sy-tomato-plugin/src/libs/annoKramdown";
import { RECITE_EXTRACT, RECITE_COMPARE, RECITE_CMP_CARD, RECITE_NOTE, COMPARE_TITLE } from "./constants";
import { readExtractDoc, dispatchOrigin, findReciteChildDoc, insertUnitsDoc, unCardChildren, derivedTitle, isAssociation, noteBlockAsHeading, noteHeadingLevel } from "./extract";
import { holeFillDiff, normalizeHoleFill, md2plain } from "./diffCheck";
import type { DiffSpan } from "./diffCheck";

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

// ---------- □3 挖空题对比收窄（着色纯函数层，单测锚点） ----------
//
// 通道拍板（6808 探针 2026-09-22 实锤，updateBlock(dom) 与 insert 事务两通道同验）：
// 着色=扁平复合词表 + span IAL style——`<span data-type="u text" style="color:…">` /
// `<span data-type="s text" style="color:…">` 落盘逐字节保真；ask 假设的 text-color+
// data-content 形态 data-content 被内核剥（renderTextMarkAttrs 枚举不含，只 inline-math
// 有）不可用；data-*/class 伴生属性写通道必剥（R10）。色值走主题自适应 var（--b3-card-
// success/error-color 亮暗两主题都声明）带 hex fallback；语义对齐 diffCheck 现行 diff
// 产出（漏/被写错=绿系下划线 u、错/多=红系删除线 s），diff 结构复用 holeFillDiff 勿重写。

/** 漏/被写错的正确字着色（对齐 DiffDialog rd-s-miss 亮色值做 fallback） */
export const HOLE_DIFF_MISS_STYLE = "color:var(--b3-card-success-color,#2f8f4e)";
/** 错/多余的字着色（对齐 DiffDialog rd-s-wrong 亮色值做 fallback） */
export const HOLE_DIFF_WRONG_STYLE = "color:var(--b3-card-error-color,#c0392b)";

/** diff spans → 着色行内 HTML（答案行/写位着色共用；eq/punct 不着色——标点差异不进对比文档） */
export function holeDiffInlineHTML(spans: DiffSpan[]): string {
    return spans.map(s => {
        const text = escapeHtml(s.text);
        if (s.cls === "miss") return `<span data-type="u text" style="${HOLE_DIFF_MISS_STYLE}">${text}</span>`;
        if (s.cls === "wrong") return `<span data-type="s text" style="${HOLE_DIFF_WRONG_STYLE}">${text}</span>`;
        return text;
    }).join("");
}

/** 着色行内 HTML → 段落块（DomParaBuilder 结构同构：外 p + contenteditable 内层 + protyle-attr 尾）。
 *  导出供单测锚定事务块形态（compareNoteHeading.test.ts 手搭同构产物互证）。 */
export function paraWithInlineHTML(inlineHTML: string): HTMLElement {
    const built = new DomParaBuilder().build();
    (built.querySelector('[contenteditable="true"]') as HTMLElement).innerHTML = inlineHTML;
    return built;
}

/**
 * 挖空题对比卡左右栏装配（doCompare 挖空分支的纯函数核心，□3 单测锚点）：
 * 左栏=遮字形态原文逐条落段（masked 是 DOM 通道纯文本、span 剥净，走 DomParaBuilder
 * textContent 直落——md2Divs 会把原文里的 markdown 元字符（井号、星号、有序列表前缀、
 * 双等号对）重新解释成语法，纯文本契约破坏）+「被挖的字：」答案行（literals 全列空格分；漏/被写错的正确字绿下划线
 * 着色，fill.a 覆盖期望全文、eq 部分原样；未填空=纯文本不着色——无比对可言）；
 * 右栏=写位内容 holeFillDiff 着色（归一化后展示：分隔符统一单空格；错/多余红删除线）——
 * 挖空写位是短填空文本，着色比对价值大于原格式保留（普通题右栏照旧走 md2Divs）。
 */
export function holeCompareDivs(literals: string[], masked: string[], writesMarkdowns: string[]): {
    left: (HTMLElement | DomBuilder)[];
    right: (HTMLElement | DomBuilder)[];
} {
    const fill = holeFillDiff(literals, writesMarkdowns.map(md2plain).join(" "));
    const answer = writesMarkdowns.length
        ? holeDiffInlineHTML(fill.a)
        : escapeHtml(normalizeHoleFill(literals.join(" ")));
    return {
        left: [...masked.map(m => new DomParaBuilder(m)), paraWithInlineHTML(`被挖的字：${answer}`)],
        right: writesMarkdowns.length
            ? [paraWithInlineHTML(holeDiffInlineHTML(fill.b))]
            : [new DomParaBuilder("（未填空）")],
    };
}

/**
 * 对比：抽取文档下生成「对比·原文标题」子文档（每条批注一个左右两列超级块：左原文 / 右复述）。
 * 原文按总结块 refs 溯源属性实时回查原块（v1 语义：原文改了拿新文，删了占位标注）；
 * 总结不进对比——它已在抽取文档里，对比只看「写得像不像原文」。
 * 可编辑（不锁只读，2026-08-24 用户反馈改）——浮条常驻可「重新写/复制提示词」。
 * 挖空题收窄（□3，症状 2 修法）：refs 全为挖空块的题走 dispatchOrigin——左栏不再整段
 * 回查（94 字明文 vs 用户 6 字的粒度不对等），改「遮字形态原文（masked，语境+____ 占位）
 * + 被挖字面答案行（literals 全列）」；右栏=写位内容 holeFillDiff 着色（错/多红删除线、
 * 漏在答案行绿下划线）。普通题/联想题行为零变化；分派失败（dispatchOrigin 内降级 full）
 * 回落整段语义=改前行为。
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
        await siyuan.pushMsg("抽取文档里没有题目（旧版布局请先「重新写」）", 3000);
        return;
    }
    // 题目标题级别跟设置项（出厂默认 H6——H2 巨大折行；2026-09-01 用户「二级还是很巨大」可配 1~6）
    const noteLevel = noteHeadingLevel((plugin as any).settingCfg);
    const units = (await Promise.all(entries.map(async e => {
        // 题目标题 hN：单行化全文进标题——接通大纲跳转与 heading 折叠收纳（看过的折起来）。
        // 空锚点题（□2 纯默写）noteMarkdown 归一为空串——不出标题块（2026-09-15 起不显示
        // 占位文案，卡片自有题框不靠标题分隔）
        const heading = e.noteMarkdown.trim()
            ? headingifyNoteDivs(md2Divs(flatNote(e.noteMarkdown)), noteLevel).map(d => d.outerHTML)
            : [];
        // 左栏：联想题=题目本身（自由联想无原文可比，不回查 refs）；挖空题=遮字形态+答案行
        // （□3 收窄）；普通题=refs 实时回查原文
        let leftDivs: (HTMLElement | DomBuilder)[];
        let rightDivs: (HTMLElement | DomBuilder)[];
        if (isAssociation(e.noteMarkdown)) {
            leftDivs = md2Divs(e.noteMarkdown);
            rightDivs = e.writes.flatMap(w => md2Divs(w.markdown));
            if (!e.writes.length) rightDivs.push(new DomParaBuilder("（未仿写）"));
        } else {
            const d = await dispatchOrigin(attrs[RECITE_EXTRACT], e.refs);
            if (d.kind === "hole") {
                const hole = holeCompareDivs(d.literals, d.masked, e.writes.map(w => w.markdown));
                leftDivs = hole.left;
                rightDivs = hole.right;
            } else {
                const origins = d.markdowns;
                leftDivs = origins.length ? md2Divs(origins.join("\n\n")) : [new DomParaBuilder("（本题前没有原文段）")];
                rightDivs = e.writes.flatMap(w => md2Divs(w.markdown));
                if (!e.writes.length) rightDivs.push(new DomParaBuilder("（未仿写）"));
            }
        }
        // 思源 sb 语义：layout="col"=列布局左右并排、layout="row"=行布局垂直堆叠（与直觉相反）。
        // 故外层 col 承左右两栏，内层 row 承栏内多块垂直——一条抽取可对应好几个原文块，整组归左栏。
        const left = new DomSuperBlockBuilder("row").append(...leftDivs);
        // 右栏=复述：总结不进对比（抽取文档里已有，判卷提示词里另有【我的笔记】）
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
    // 单例：已存在（我们的）则删除重建——仿写改了再点「对比」即刷新（单事务原子成型）。
    // 删前先摘挂卡子块的快速卡组卡防孤儿：判卷块级卡正挂在这里（aiGradeRender 按 blockID
    // 制卡进对比文档），裸删=孤儿 deck 数据残留（闪卡继承战役 review P1-1 补口）
    const old = await findReciteChildDoc({ box: info.box, path: info.path, hpath }, derivedTitle(COMPARE_TITLE, origin?.rootTitle), RECITE_COMPARE, extractID);
    if (old.id) {
        await unCardChildren(old.id);
        await siyuan.removeDocByIDSiyuan(old.id);
    }
    const cmpID = await insertUnitsDoc(info.box, old.hpath, units, { [RECITE_COMPARE]: extractID } as AttrType);
    if (!cmpID) { // □B③ 假成功复核读失败（insertUnitsDoc 内已复核卷内块数）——勿假报生成
        await siyuan.pushMsg("对比文档生成失败，请重试", 2500);
        return;
    }
    debugLog("recite.compare", `extract=${extractID} compare=${cmpID} entries=${entries.length}`, "recite");
    await siyuan.pushMsg(`对比文档已生成（${entries.length} 题）`, 2000);
    OpenSyFile2(plugin, cmpID, "front");
}
