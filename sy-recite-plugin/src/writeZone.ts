import { events } from "../../sy-tomato-plugin/src/libs/Events";
import { siyuan } from "../../sy-tomato-plugin/src/libs/siyuanApi";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { RECITE_EXTRACT, RECITE_NOTE } from "./constants";

const WRITE_ATTR = "data-recite-write";
const REFRESH_EVENTS = new Set(["switch-protyle", "loaded-protyle-static", "loaded-protyle-dynamic"]);

/**
 * 写区打标（2026-08-31）：抽取文档里每条总结块（custom-recite-note）之后到下一条总结块
 * 之间的所有顶层块 = 该题写作区，挂 data-recite-write，CSS 画左侧 accent 竖线带（视觉与
 * 原文档「你的句」同语言）。根治旧版 `note + p` 相邻选择器只框第一个段块、回车新块出框的
 * 瑕疵，顺带解除「写区只认段落块」的暗限制（任意块类型都认）。
 * 属性只挂内存 DOM 不写 IAL 不落数据——重开文档 onload 重算补挂，重算幂等可随意多跑。
 */

/**
 * 区间判定纯函数：输入顶层块序列的总结块属性值（无属性 = null/undefined），输出每块是否
 * 挂写区标。首条总结块之前不属于任何写区；末条总结块之后全部归属写区（尾区）。
 */
export function computeWriteFlags(noteFlags: (string | null | undefined)[]): boolean[] {
    const flags: boolean[] = [];
    let inZone = false;
    for (const f of noteFlags) {
        if (f != null) {
            inZone = true; // 新写区开区；总结块自己不挂标
            flags.push(false);
        } else {
            flags.push(inZone);
        }
    }
    return flags;
}

/** DOM 执行薄层：按 wysiwyg 顶层块流重算写区并打/摘标（幂等， MutationObserver 回调复用） */
export function markWriteZones(wysiwyg: HTMLElement): void {
    const blocks = Array.from(wysiwyg.children) as HTMLElement[];
    const flags = computeWriteFlags(blocks.map(b => b.getAttribute(RECITE_NOTE)));
    blocks.forEach((b, i) => {
        if (flags[i]) b.setAttribute(WRITE_ATTR, "");
        else b.removeAttribute(WRITE_ATTR);
    });
}

/**
 * 只管一件事：当前 protyle 是抽取文档时给它的 wysiwyg 挂打标 + 盯顶层结构变化重算，
 * 其余文档全清（全清重挂模式同 highlight）。文档判定走 rootID 的 RECITE_EXTRACT IAL。
 * 变化监听只盯 wysiwyg 直接子节点增删（childList 不含 subtree）——回车分块/删块/粘贴/
 * 拖拽都是顶层增删；打字是 characterData 变化不触发，wbr 光标标记的子树噪音也一并免掉。
 */
class WriteZone {
    private observer: MutationObserver | null = null;
    private curWysiwyg: HTMLElement | null = null;
    private rafId = 0;
    private gen = 0; // 代际守卫：getBlockAttrs 异步期间用户切走，旧响应不得覆盖新状态

    onload() {
        events.addListener("recite-writezone", (eType: string, detail: any) => {
            if (eType === "destroy-protyle") this.teardown();
            else if (REFRESH_EVENTS.has(eType)) this.refresh(detail?.protyle).catch(() => { });
        });
        // 调试通道（照 window.recitePlugin 惯例）：e2e/诊断用 reciteWriteZone.observer 查观察器生死
        (window as any).reciteWriteZone = this;
    }

    onunload() {
        this.teardown();
        document.querySelectorAll(`[${WRITE_ATTR}]`).forEach(el => el.removeAttribute(WRITE_ATTR));
    }

    /** 断开观察器与挂起的重算（切文档/文档销毁/插件停用）；已挂的标留给全清或重算处理 */
    private teardown() {
        this.observer?.disconnect();
        this.observer = null;
        this.curWysiwyg = null;
        if (this.rafId) clearTimeout(this.rafId);
        this.rafId = 0;
    }

    /**
     * 事件驱动的刷新入口。时序教训（2026-08-31）：teardown 不能放函数开头——protyle 事件
     * 常连发（loaded-static 后紧跟 switch 等），后到的 refresh 若在 getBlockAttrs 往返后
     * 走任何提前 return，观察器就「拆了不再重建」且旧标还留着（表现=打标对、回车新块
     * 永不跟标）。故拆旧必须推迟到「确认本次要成功重建」之后；同文档且观察器活着则快路径
     * 幂等返回（观察器自会重算，无需重复挂）。
     */
    private async refresh(protyle?: any) {
        const gen = ++this.gen;
        if (!protyle) protyle = events.protyle?.protyle;
        const wysiwyg: HTMLElement = protyle?.wysiwyg?.$wysiwyg
            ?? protyle?.wysiwyg?.element
            ?? protyle?.element?.querySelector?.(".protyle-wysiwyg");
        const docID: string = protyle?.block?.rootID;
        if (!wysiwyg || !docID) {
            debugLog("recite.wz", `skip: no wysiwyg/docID (protyle=${!!protyle})`, "recite");
            return; // 事件残缺，不动现状——旧观察器（若有）继续活着
        }
        let on = false;
        try {
            on = !!(await siyuan.getBlockAttrs(docID))?.[RECITE_EXTRACT];
        } catch { /* 文档刚被删除等瞬态，忽略 */ }
        if (gen !== this.gen) return; // 已有更新代际接管，本轮整体丢弃
        if (this.observer && this.curWysiwyg === wysiwyg) return; // 同文档幂等：观察器活着自会重算
        this.teardown(); // 确定要切换目标（或旧观察器已死需重建），此刻才拆旧
        if (!on) {
            debugLog("recite.wz", `off doc=${docID.slice(-8)}`, "recite");
            return; // 非抽取文档：保持空手；旧 wysiwyg 的标留着无妨（切回时重算刷新）
        }
        markWriteZones(wysiwyg);
        this.curWysiwyg = wysiwyg;
        // 防抖用 setTimeout 而非 rAF：后台页签/遮挡窗格下 rAF 被整帧暂停（重算永不跑），
        // setTimeout 最坏被节流到 1s 也终会执行；防抖目标只是合并连发变化，50ms 足够。
        this.observer = new MutationObserver(() => {
            if (this.rafId) return;
            this.rafId = setTimeout(() => {
                this.rafId = 0;
                if (this.observer && wysiwyg.isConnected) markWriteZones(wysiwyg);
            }, 50) as unknown as number;
        });
        this.observer.observe(wysiwyg, { childList: true });
        debugLog("recite.wz", `on doc=${docID.slice(-8)}`, "recite");
    }
}
export const writeZone = new WriteZone();
