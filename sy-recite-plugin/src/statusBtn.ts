import { confirm } from "siyuan";
import { writable } from "svelte/store";
import { events } from "../../sy-tomato-plugin/src/libs/Events";
import { siyuan } from "../../sy-tomato-plugin/src/libs/siyuanApi";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { RECITE_START, RECITE_EXTRACT, RECITE_COMPARE, RECITE_OLD, RECITE_KEEP, RECITE_TARGET, RECITE_WRITTEN, RECITE_PRACTICE_CLS } from "./constants";
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
 * 现存顶层块批量打 custom-recite-old 原文标记（一次事务），染色交给 CSS :not([custom-recite-old])。
 * □3 起 written 块（温和退出标记的「练习时写的字」）跳过不打 old——保持总结身份，
 * 练习连续（退出再进，自己写的字不会被认成原文）。
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
    // written 判向走 cache-first 属性 API（identifyNotes 同理）：SQL ial 列异步索引秒级窗；
    // 整体失败拦下重试（不拦会把 written 块当原文打 old，标记被下轮退出防御清掉=永久丢）
    const ials = await siyuan.batchGetBlockAttrs(children.map(c => c.id)).catch(() => null);
    if (ials == null && children.length) {
        await siyuan.pushMsg("读取块属性失败，请重试", 2500);
        return;
    }
    const olds = children.filter(c => !ials?.[c.id]?.[RECITE_WRITTEN]);
    if (olds.length) {
        await siyuan.batchSetBlockAttrsTrans(olds.map(c => ({ id: c.id, attrs: { [RECITE_OLD]: "1" } as AttrType })));
    }
    // ws 广播反射 DOM 属性有 ~1s 延迟：本地同步补齐防闪红；只补已知 protyle（同文档上次已知），
    // 拿不到就不补等 ws 广播——全局 querySelector 兜底可能抓到别的文档的 wysiwyg 造成误补；
    // written 块同样跳过（数据层与 DOM 补齐同分流，退出淡标记不闪没）
    const known = curDoc.docID === docID ? curDoc.protyle : undefined;
    const wysiwyg: HTMLElement = known?.wysiwyg?.$wysiwyg ?? known?.wysiwyg?.element;
    const oldIDs = new Set(olds.map(c => c.id));
    wysiwyg?.querySelectorAll?.(":scope > [data-node-id]").forEach((el: Element) => {
        if (oldIDs.has(el.getAttribute("data-node-id"))) el.setAttribute(RECITE_OLD, "1");
    });
    await siyuan.setBlockAttrs(docID, { [RECITE_START]: ts } as AttrType);
    debugLog("recite.mark", `enter doc=${docID} start=${ts} marked=${olds.length} writtenSkipped=${children.length - olds.length} emptyTrimmed=${empties.length}`, "recite");
    await siyuan.pushMsg(`已进入仿写模式：选中想练的段落点浮条「这段练」（段后自动留题面位）${empties.length ? `（已清理末尾空块 ${empties.length} 个）` : ""}`, 2500);
    await statusBtn.refresh();
}

/**
 * 删除仿写练习（原「退出」→「清理」，2026-08-23 第三轮反馈再改坐实语义：彻底抹掉练习痕迹）：
 * 删练习期间写的块（无 custom-recite-old 的顶层块）+ 删衍生文档（抽取文档连对比子树）+ 清全部原文标记 +
 * 删文档级 custom-recite-start，原文恢复原状。有批注或衍生文档时一次 confirm 覆盖全部删除内容；
 * 从未生成过衍生文档静默跳过；删块/删文档均进回收站可找回。
 * □3 起与温和退出（exitPractice）构成两档：本函数仍是重操作（浮条「删除」/右键「删除仿写
 * 模式」入口），written 标记一并清（恢复原状语义）；删除块判据（无 old）=练习期间写的未
 * 认领块（题面/散写/AI 锚点），认领为原文的块挂 old 按原文保留——文案口径用「练习期间
 * 写的块」涵盖（reasoning P2-5；「设为总结」认领面已随类型退役，recitesimplify □2）。
 */
export async function cleanPractice(docID: string) {
    // stale role 复核（review P2-9）：双窗对侧已退/删时，本侧 stale 浮条再点「删除」会对
    // 非练习文档跑清理链——首行闸门拦下（合法调用方 contextMenu/FloatBar 都在 origin 态）
    if (!(await siyuan.getBlockAttrs(docID).catch(() => null))?.[RECITE_START]) return;
    const children = await siyuan.getChildBlocks(docID);
    // 判向走 cache-first 属性 API（identifyNotes/role.ts 同源纪律）：SQL ial 列异步索引秒级窗
    // ——刚进仿写打的 old 还没进索引就点删除，原文块会被误判成批注删掉（e2e 1.5s 间隔实锤）。
    // 查询失败/缺键的块保守按原文处理（不删不误清，原 rows[i]==null 语义）
    const ials = await siyuan.batchGetBlockAttrs(children.map(c => c.id)).catch(() => null);
    const notes = children.filter(c => ials != null && ials[c.id] != null && !ials[c.id][RECITE_OLD]);
    const noteIDs = new Set(notes.map(c => c.id));
    const derivedID = await findDerivedDocID(docID);
    const doClean = async () => {
        if (notes.length) await siyuan.deleteBlocks(notes.map(c => c.id));
        // 原文块标记与 keep/靶标记一并清（期1/期2：标记挂在原文块上，删除练习=恢复原状不留孤儿属性）；
        // written 防御性同清（理论只挂无 old 块=已随删除消失，脏数据不残留）
        const olds = children.filter(c => !noteIDs.has(c.id)).map(c => ({ id: c.id, attrs: { [RECITE_OLD]: "", [RECITE_KEEP]: "", [RECITE_TARGET]: "", [RECITE_WRITTEN]: "" } as AttrType }));
        if (olds.length) await siyuan.batchSetBlockAttrsTrans(olds);
        await siyuan.setBlockAttrs(docID, { [RECITE_START]: "" } as AttrType);
        if (derivedID) await siyuan.removeDocByIDSiyuan(derivedID);
        debugLog("recite.mark", `clean doc=${docID} notes=${notes.length} unmarked=${olds.length} derived=${derivedID ?? "-"}`, "recite");
        await siyuan.pushMsg(`已删除仿写练习：原文恢复原状${notes.length ? `，${notes.length} 个练习期间写的块已删` : ""}${derivedID ? "，抽取/对比文档已删" : ""}（回收站可找回）`, 2500);
        await statusBtn.refresh();
    };
    if (notes.length || derivedID) {
        const parts = [notes.length ? `${notes.length} 个练习期间写的块（题面与认领的原文）` : "", derivedID ? "抽取文档及其对比子文档" : ""].filter(Boolean).join("、");
        confirm("⚠️ 删除仿写练习", `将删除 ${parts}并清除全部标记，原文恢复原状（均可在回收站找回）`, () => doClean().catch(() => { }));
    } else {
        await doClean();
    }
}

/**
 * 温和退出仿写模式（□3 退出层，2026-09-13）：与「删除」构成退出两档（bear 拍板语义）——
 * 后来写的字全保留并挂 custom-recite-written 淡背景持久标记，练习标记全清（old/keep/
 * target + 文档 RECITE_START），衍生文档保留。顶栏笔图标 toggle（togglePractice）改指本
 * 函数——重操作（删除）不绑开关；浮条另有「退出」钮（ghost，与「删除」一眼可辨轻重）。
 * 重进时 enterPractice 跳过 written 块（保持练习期书写身份，练习连续）。
 * later-written = 无 old 的非空块（题面/散写/认领前的新写 keep 块都是「练习期间写的」）；
 * 空块没字不挂标记。判向走 cache-first 属性 API（role.ts 同理：两钮刚设的 keep/target
 * 在 SQL ial 列异步索引秒级窗内拿不到）。
 * 无确认弹窗（650189 09-21 反馈「温和退出无需二次提醒」bear 拍板移除）——本档无损可逆
 * （写的字保留、衍生文档保留、重进续练），直退+toast 反馈；「删除」档是真删，confirm 保留。
 */
export async function exitPractice(docID: string) {
    // stale role 复核（review P2-9）：双窗对侧已退/删时，本侧 stale 浮条点「退出」会对非练习
    // 文档全量错挂 written——首行闸门拦下（合法调用方笔图标 toggle/浮条都在 RECITE_START 态）
    if (!(await siyuan.getBlockAttrs(docID).catch(() => null))?.[RECITE_START]) return;
    const doExit = async () => {
        // 稳态等待 400ms（接管原确认弹窗停留期的时序兜底，P2-4 精神保留）：在途 sync/AI/他窗
        // 写入赶进快照；SQL 缺行兜底仍在数据层（下方 rows[i]==null 保守挂 written 不变）——
        // 弹窗移除后两道保险各归其位（650189 09-21 反馈移除弹窗，无损档直退）
        await new Promise(r => setTimeout(r, 400));
        const children = await siyuan.getChildBlocks(docID);
        const rows = await siyuan.getRows(children.map(c => c.id), "markdown", true, [], true);
        // 判向走 cache-first 属性 API（role.ts 同理：两钮刚设的 keep/target 在 SQL ial 列
        // 异步索引秒级窗内拿不到）；整体失败拦下重试——不拦会把原文整篇错挂 written
        const ials = await siyuan.batchGetBlockAttrs(children.map(c => c.id)).catch(() => null);
        if (ials == null && children.length) {
            await siyuan.pushMsg("读取块属性失败，请重试", 2500);
            return;
        }
        const isOld = (id: string) => !!(ials?.[id]?.[RECITE_OLD]);
        // later-written：无 old 的块（总结/认领/新写 keep 都是「练习期间写的」）。markdown 缺行
        // （索引窗内的新插入块）按新写保守挂 written——漏挂才是错身份（重进被打 old 成原文，
        // review P2-1）；空写位误挂无害（重进时 enterPractice 照删末尾空块）
        const writes = children.filter((c, i) => !isOld(c.id) && (rows[i] == null || (rows[i].markdown ?? "").trim()));
        const writeIDs = new Set(writes.map(c => c.id));
        // 互斥全集一笔事务（review P2-5）：分两笔提交部分失败会留半清半挂脏态，合一原子
        const all = [
            ...writes.map(c => ({ id: c.id, attrs: { [RECITE_WRITTEN]: "1", [RECITE_KEEP]: "", [RECITE_TARGET]: "" } as AttrType })),
            ...children.filter(c => !writeIDs.has(c.id)).map(c => ({ id: c.id, attrs: { [RECITE_OLD]: "", [RECITE_KEEP]: "", [RECITE_TARGET]: "", [RECITE_WRITTEN]: "" } as AttrType })),
        ];
        if (all.length) await siyuan.batchSetBlockAttrsTrans(all);
        await siyuan.setBlockAttrs(docID, { [RECITE_START]: "" } as AttrType);
        // 本地 DOM 补齐 + 同步摘 practicing 类（enterPractice 同款防闪变 + exit 侧特有窗：
        // 属性已清但类要等 refresh→getBlockAttrs 两次往返经 store 订阅才摘，窗口内原文块
        // 闪「你的句」强染色（review P2-6）——同步摘后 written 淡背景即刻接管）；只补已知
        // protyle，拿不到不补等 ws 广播
        const known = curDoc.docID === docID ? curDoc.protyle : undefined;
        const wysiwyg: HTMLElement = known?.wysiwyg?.$wysiwyg ?? known?.wysiwyg?.element;
        if (wysiwyg) {
            wysiwyg.classList.remove(RECITE_PRACTICE_CLS);
            wysiwyg.querySelectorAll?.(":scope > [data-node-id]").forEach((el: Element) => {
                if (writeIDs.has(el.getAttribute("data-node-id"))) {
                    el.setAttribute(RECITE_WRITTEN, "1");
                    el.removeAttribute(RECITE_KEEP);
                    el.removeAttribute(RECITE_TARGET);
                } else {
                    el.removeAttribute(RECITE_OLD);
                    el.removeAttribute(RECITE_KEEP);
                    el.removeAttribute(RECITE_TARGET);
                    el.removeAttribute(RECITE_WRITTEN);
                }
            });
        }
        debugLog("recite.exit", `exit doc=${docID} written=${writes.length} unmarked=${all.length - writes.length} derived=kept`, "recite");
        await siyuan.pushMsg(writes.length
            ? `已退出仿写模式：你写的 ${writes.length} 块已保留并加淡色标记`
            : "已退出仿写模式", 2500);
        await statusBtn.refresh();
    };
    await doExit().catch(() => { });
}

/**
 * 仿写模式开关（顶栏笔图标 / 命令面板入口）：作用于「最近交互文档」（events.docID），无则回退当前活动文档。
 * □3 起关闭方向=温和退出（exitPractice，bear 拍板：重操作不绑开关——笔图标是高频开关，
 * 「删除」只在浮条/右键显式入口）；退出后再点=重进（written 块保持总结身份）。
 */
export async function togglePractice() {
    const docID = events.docID || curDoc.docID;
    if (!docID) {
        await siyuan.pushMsg("请先点开一篇文档", 2500);
        return;
    }
    const attrs = await siyuan.getBlockAttrs(docID);
    if (attrs?.[RECITE_START]) {
        await exitPractice(docID);
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
