// kernel 侧块 HTML 模板（goja 无 DOM/Lute，事务 HTML 通道用字符串直构；形态对齐前端
// md2Divs/DomParaBuilder 产物）。块 id 恒被内核重生成（事务 HTML 契约），模板里的
// data-node-id 只为结构合法；custom-* 属性一律走插后 setBlockAttrs（预挂必丢）。

export function escapeHTML(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const ZWSP = "\u200b";

/** 段落块；软换行（\n）以 <br> 呈现（前端 Lute 同义；多行题不进 heading 的判据见 extractCore） */
export function paraHTML(text: string, id: string): string {
    const content = escapeHTML(text).replace(/\n/g, "<br>");
    return `<div data-type="NodeParagraph" data-node-id="${id}"><div class="p" contenteditable="true" spellcheck="false">${content}</div><div class="protyle-attr" contenteditable="false">${ZWSP}</div></div>`;
}

/** 空段写位块（点开即可落笔，对齐前端 DomParaBuilder()） */
export function emptyParaHTML(id: string): string {
    return `<div data-type="NodeParagraph" data-node-id="${id}"><div class="p" contenteditable="true" spellcheck="false"></div><div class="protyle-attr" contenteditable="false">${ZWSP}</div></div>`;
}

/** 标题块（题目 heading 化：接通官方大纲跳转/折叠；级别 1~6 由 extractCore.noteHeadingLevel 收敛） */
export function headingHTML(text: string, level: number, id: string): string {
    const sub = `h${level}`;
    return `<div data-type="NodeHeading" data-subtype="${sub}" data-node-id="${id}"><div class="${sub}" contenteditable="true" spellcheck="false">${escapeHTML(text)}</div><div class="protyle-attr" contenteditable="false">${ZWSP}</div></div>`;
}
