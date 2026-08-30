import { events } from "../../sy-tomato-plugin/src/libs/Events";
import { siyuan } from "../../sy-tomato-plugin/src/libs/siyuanApi";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { RECITE_START } from "./constants";
import { reciteDoc } from "./statusBtn";

const REFRESH_EVENTS = new Set(["switch-protyle", "loaded-protyle-static", "loaded-protyle-dynamic"]);
const PRACTICE_CLS = "recite-practicing";

/**
 * 染色 = 纯 CSS（index.scss）：`.recite-practicing > div[data-node-id]:not([custom-recite-old])`。
 * 原文块在进入仿写时由 enterPractice 批量打 custom-recite-old（随块 IAL 走、渲染即带），
 * 新块（回车分块/粘贴）无属性即批注——浏览器渲染同帧生效，无 JS 链路、无时序竞争。
 * 本类只管一件事：仿写中文档的 wysiwyg 加 class，其余文档全清。
 */
class Highlight {
    onload() {
        events.addListener("recite-highlight", (eType: string, detail: any) => {
            if (REFRESH_EVENTS.has(eType)) {
                this.setPractice(detail?.protyle).catch(() => { });
            }
        });
        // 仿写模式进入/删除（setBlockAttrs 不产生内核事件），经 store 联动
        reciteDoc.subscribe(v => {
            this.setPractice(v?.protyle ?? events.protyle?.protyle).catch(() => { });
        });
    }

    onunload() {
        document.querySelectorAll(`.protyle-wysiwyg.${PRACTICE_CLS}`).forEach(el => el.classList.remove(PRACTICE_CLS));
    }

    /** 全清所有 wysiwyg 的仿写 class 后，按文档 IAL 决定当前 protyle 是否加上（防多视图/切走残留误染） */
    private async setPractice(protyle?: any) {
        document.querySelectorAll(`.protyle-wysiwyg.${PRACTICE_CLS}`).forEach(el => el.classList.remove(PRACTICE_CLS));
        if (!protyle) protyle = events.protyle?.protyle;
        const wysiwyg: HTMLElement = protyle?.wysiwyg?.$wysiwyg
            ?? protyle?.wysiwyg?.element
            ?? protyle?.element?.querySelector?.(".protyle-wysiwyg");
        const docID: string = protyle?.block?.rootID;
        if (!wysiwyg || !docID) return;
        let on = false;
        try {
            on = !!(await siyuan.getBlockAttrs(docID))?.[RECITE_START];
        } catch { /* 文档刚被删除等瞬态，忽略 */ }
        if (on) wysiwyg.classList.add(PRACTICE_CLS);
        debugLog("recite.hl", `setPractice doc=${docID.slice(-8)} on=${on}`, "recite");
    }
}
export const highlight = new Highlight();
