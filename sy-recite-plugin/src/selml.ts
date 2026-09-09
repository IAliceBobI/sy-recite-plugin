import { getFrontend, IProtyle, Protyle } from "siyuan";
import { EventType, events } from "../../sy-tomato-plugin/src/libs/Events";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { disposeSelectionML, getSelectionML } from "../../sy-tomato-plugin/src/libs/selectionML";
import { reciteSelection } from "./selection";

// □8 期4（2026-09-09）：移动端选块三钮的锚点跟随监听器。三钮本体挂 FloatBar 顶栏
//（selmlAct 走空 seed 复用实例），本模块只负责与 tomato 同款的两件事：
// ① 四事件 reanchor——锚点随点击/切换刷新（点块后立即可向上连选；内核普通点击清类
//    后旧 trace 无主即弃，「点击后取消次序仍对」）；② destroy 出册清残留选中类。
// 不挂 breadcrumb 按钮：role 文档上仿写顶栏（z-index 安全档 10）盖住 breadcrumb
//（z 5），挂那儿等于不可点（e2e 实锤），且选完即消费的两钮就在顶栏。
// 移动端门控 getFrontend 勿 events.isMobile（2026-08-25 浮条 bundle 模块序坑纪律）。
const frontend = getFrontend();
const IS_MOBILE = frontend === "mobile" || frontend === "browser-mobile";

export function onload() {
    if (!IS_MOBILE) return;
    events.addListener("recite-selml □8期4", (eventType, detail: Protyle) => {
        const protyle: IProtyle = detail?.protyle;
        if (!protyle) return;
        if (eventType == EventType.destroy_protyle) {
            const wysiwyg = protyle.wysiwyg?.element;
            if (wysiwyg) disposeSelectionML(wysiwyg);
            return;
        }
        if (eventType == EventType.loaded_protyle_static || eventType == EventType.loaded_protyle_dynamic
            || eventType == EventType.click_editorcontent || eventType == EventType.switch_protyle) {
            // destroy 后 debounce 尾巴可能在 detached protyle 上复活实例（□9 P2-3 同款守卫）
            if (!protyle.element?.isConnected) return;
            const wysiwyg = protyle.wysiwyg?.element as HTMLElement;
            if (!wysiwyg) return;
            // seed=reciteSelection：块选/拖蓝/光标三级解析做 reanchor 种子（只刷锚点与
            // trace 对账，不挂类不动选区）。非 role 文档上实例休眠（无 UI 无 DOM 写，
            // review P2 披露：每事件多跑一次三级链解析，WeakMap 键随 wysiwyg 回收）
            const s = getSelectionML(wysiwyg, () => reciteSelection(protyle).blocks);
            debugLog("recite.selml", `evt=${eventType} root=${protyle.block?.rootID ?? ""} trace=${s.state.trace.length}`, "recite");
        }
    });
}
