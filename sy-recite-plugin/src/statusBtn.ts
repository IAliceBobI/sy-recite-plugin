import { confirm } from "siyuan";
import { writable } from "svelte/store";
import { events } from "../../sy-tomato-plugin/src/libs/Events";
import { siyuan } from "../../sy-tomato-plugin/src/libs/siyuanApi";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { parseIAL } from "../../sy-tomato-plugin/src/libs/strUtils";
import { RECITE_START, RECITE_EXTRACT, RECITE_COMPARE, RECITE_OLD } from "./constants";
import { findDerivedDocID } from "./extract";

export type ReciteRole = "" | "origin" | "extract" | "compare";
export type ReciteDocState = { docID: string; role: ReciteRole; docName?: string; protyle?: any };

// 当前活动文档的仿写角色：FloatBar 显隐/按钮、highlight 重刷共用
export const reciteDoc = writable<ReciteDocState>({ docID: "", role: "" });
let curDoc: ReciteDocState = { docID: "", role: "" };
function setDoc(d: ReciteDocState) {
    curDoc = d;
    reciteDoc.set(d);
}

/** yyyymmddhhmmss 定宽本地时间戳，与 blocks 表 created 同格式可直接字符串比较 */
export function nowTS(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * 进入仿写模式：先删末尾连续空块（空块会被打成原文标记，用户在上面写字会被误判为原文），
 * 现存全部顶层块批量打 custom-recite-old 原文标记（一次事务），染色交给 CSS :not([custom-recite-old])
 */
export async function enterPractice(docID: string) {
    // 衍生文档（抽取/对比）禁入仿写模式（2026-08-27 用户反馈逻辑 bug）：它们是练习产物，
    // 在其上打 custom-recite-start 会造出嵌套衍生（抽取的抽取）。togglePractice 笔图标 /
    // 命令与右键菜单全走本函数，在此一处设卡；已被误标的旧文档仍可走 cleanPractice 清理。
    const attrs0 = await siyuan.getBlockAttrs(docID);
    if (attrs0?.[RECITE_EXTRACT] || attrs0?.[RECITE_COMPARE]) {
        await siyuan.pushMsg("抽取/对比文档是练习产物，不能再进入仿写模式，请回到原文档操作", 2500);
        return;
    }
    const ts = nowTS();
    let children = await siyuan.getChildBlocks(docID);
    const rows = await siyuan.getRows(children.map(c => c.id), "markdown", true, [], true);
    let end = children.length;
    while (end > 0) {
        const md = rows[end - 1]?.markdown;
        if (md == null || md.trim()) break; // 拿不到 markdown 的块不碰，只删明确空串的
        end--;
    }
    const empties = children.slice(end).map(c => c.id);
    if (empties.length) {
        await siyuan.deleteBlocks(empties);
        children = children.slice(0, end);
    }
    if (children.length) {
        await siyuan.batchSetBlockAttrsTrans(children.map(c => ({ id: c.id, attrs: { [RECITE_OLD]: "1" } as AttrType })));
    }
    // ws 广播反射 DOM 属性有 ~1s 延迟：本地同步补齐防闪红；只补已知 protyle（同文档上次已知），
    // 拿不到就不补等 ws 广播——全局 querySelector 兜底可能抓到别的文档的 wysiwyg 造成误补
    const known = curDoc.docID === docID ? curDoc.protyle : undefined;
    const wysiwyg: HTMLElement = known?.wysiwyg?.$wysiwyg ?? known?.wysiwyg?.element;
    wysiwyg?.querySelectorAll?.(":scope > [data-node-id]").forEach((el: Element) => el.setAttribute(RECITE_OLD, "1"));
    await siyuan.setBlockAttrs(docID, { [RECITE_START]: ts } as AttrType);
    debugLog("recite.mark", `enter doc=${docID} start=${ts} marked=${children.length} emptyTrimmed=${empties.length}`, "recite");
    await siyuan.pushMsg(`已进入仿写模式：直接打字插入的块即批注${empties.length ? `（已清理末尾空块 ${empties.length} 个）` : ""}`, 2500);
    await statusBtn.refresh();
}

/**
 * 删除仿写练习（原「退出」→「清理」，2026-08-23 第三轮反馈再改坐实语义：彻底抹掉练习痕迹）：
 * 删批注块（无 custom-recite-old 的顶层块）+ 删衍生文档（抽取文档连对比子树）+ 清全部原文标记 +
 * 删文档级 custom-recite-start，原文恢复原状。有批注或衍生文档时一次 confirm 覆盖全部删除内容；
 * 从未生成过衍生文档静默跳过；删块/删文档均进回收站可找回。
 */
export async function cleanPractice(docID: string) {
    const children = await siyuan.getChildBlocks(docID);
    const rows = await siyuan.getRows(children.map(c => c.id), "ial", true, [], true);
    // 索引缺行的块保守按原文处理（不删不误清）
    const notes = children.filter((_, i) => rows[i] != null && !parseIAL(rows[i].ial ?? "")[RECITE_OLD]);
    const noteIDs = new Set(notes.map(c => c.id));
    const derivedID = await findDerivedDocID(docID);
    const doClean = async () => {
        if (notes.length) await siyuan.deleteBlocks(notes.map(c => c.id));
        const olds = children.filter(c => !noteIDs.has(c.id)).map(c => ({ id: c.id, attrs: { [RECITE_OLD]: "" } as AttrType }));
        if (olds.length) await siyuan.batchSetBlockAttrsTrans(olds);
        await siyuan.setBlockAttrs(docID, { [RECITE_START]: "" } as AttrType);
        if (derivedID) await siyuan.removeDocByIDSiyuan(derivedID);
        debugLog("recite.mark", `clean doc=${docID} notes=${notes.length} unmarked=${olds.length} derived=${derivedID ?? "-"}`, "recite");
        await siyuan.pushMsg(`已删除仿写练习：原文恢复原状${notes.length ? `，${notes.length} 条批注已删` : ""}${derivedID ? "，抽取/对比文档已删" : ""}（回收站可找回）`, 2500);
        await statusBtn.refresh();
    };
    if (notes.length || derivedID) {
        const parts = [notes.length ? `${notes.length} 条批注块` : "", derivedID ? "抽取文档及其对比子文档" : ""].filter(Boolean).join("、");
        confirm("⚠️ 删除仿写练习", `将删除 ${parts}并清除全部原文标记，原文恢复原状（均可在回收站找回）`, () => doClean().catch(() => { }));
    } else {
        await doClean();
    }
}

/** 仿写模式开关（顶栏笔图标 / 命令面板入口）：作用于「最近交互文档」（events.docID），无则回退当前活动文档 */
export async function togglePractice() {
    const docID = events.docID || curDoc.docID;
    if (!docID) {
        await siyuan.pushMsg("请先点开一篇文档", 2500);
        return;
    }
    const attrs = await siyuan.getBlockAttrs(docID);
    if (attrs?.[RECITE_START]) {
        await cleanPractice(docID);
    } else {
        await enterPractice(docID);
    }
}

const REFRESH_EVENTS = new Set(["switch-protyle", "loaded-protyle-static", "loaded-protyle-dynamic"]);

// 文档角色跟踪器（2026-08-25 入口去重：状态栏「仿写」文字开关已删，togglePractice 主入口 =
// 顶栏笔图标默认开 + 命令面板兜底；本类只留事件订阅 + reciteDoc store 联动，无 UI）
class StatusBtn {
    // destroy-protyle 善后自检定时器（见 onProtyleDestroyed）
    private destroyCheckTimer: ReturnType<typeof setTimeout> = null;

    onload() {
        events.addListener("recite-status", (eType: string, detail: any) => {
            if (REFRESH_EVENTS.has(eType)) {
                this.refresh(detail?.protyle).catch(() => { });
            } else if (eType === "destroy-protyle") {
                this.onProtyleDestroyed(detail?.protyle);
            }
        });
    }

    /**
     * 浮条指向的文档页签被关闭：编辑区因此变空时思源只发 destroy-protyle、不再发 switch 系事件
     * （关页签切相邻 tab / 跨分屏接管焦点的场景则先 destroy 后 switch-protyle），故起 600ms 自检——
     * 期间无人接管（curDoc 仍是被销毁文档与实例）就清 role 收浮条；有接管则 refresh 已覆盖 curDoc，
     * 浮条无缝对准新文档。600ms > 事件 300ms debounce + 一次属性查询，代价仅收条晚半秒。
     * 同文档双页签关其一时：接管的 switch-protyle 会把 curDoc.protyle 换成存活实例（引用不同），
     * 后台实例被关也因引用不同被跳过，浮条均不误收。
     */
    private onProtyleDestroyed(protyle: any) {
        const deadID = protyle?.block?.rootID;
        if (!deadID || deadID !== curDoc.docID) return; // 销毁的不是浮条指向的文档，不管
        clearTimeout(this.destroyCheckTimer);
        this.destroyCheckTimer = setTimeout(() => {
            this.destroyCheckTimer = null;
            if (curDoc.docID === deadID && (!curDoc.protyle || curDoc.protyle === protyle)) {
                setDoc({ docID: "", role: "" });
            }
        }, 600);
    }

    /**
     * 卸载清理（范式 Demo）：一次性 setTimeout 触发后引擎本会自动回收，此处清理只封「卸载瞬间
     * 恰有 pending timer」的边缘（回调此刻只剩无人监听的 store 写，无实害）——但模块级单例的
     * 挂起状态不随插件实例销毁，凡起了 timer/listener 的模块都该配对 onload/onunload 显式回收，
     * 新插件照此模式写。
     */
    onunload() {
        clearTimeout(this.destroyCheckTimer);
        this.destroyCheckTimer = null;
    }

    /** 刷新当前活动文档角色（origin=带仿写标记，extract=抽取文档，compare=对比文档）；订阅方：FloatBar、highlight */
    async refresh(protyle?: any) {
        const docID: string = protyle?.block?.rootID || curDoc.docID || events.docID;
        if (!docID) return;
        let role: ReciteRole = "";
        let attrs: any = null;
        try {
            attrs = await siyuan.getBlockAttrs(docID);
            if (attrs?.[RECITE_START]) role = "origin";
            else if (attrs?.[RECITE_EXTRACT]) role = "extract";
            else if (attrs?.[RECITE_COMPARE]) role = "compare";
        } catch { /* 文档刚被删除等瞬态，忽略 */ }
        // 进入/删除等无 protyle 入参的调用：沿用同文档上次已知 protyle（events.protyle 桌面端可能不初始化，不可依赖）
        const known = curDoc.docID === docID ? curDoc.protyle : undefined;
        setDoc({ docID, role, docName: attrs?.title ?? "", protyle: protyle ?? known });
    }
}
export const statusBtn = new StatusBtn();
