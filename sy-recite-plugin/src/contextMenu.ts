import type { Plugin } from "siyuan";
import { get } from "svelte/store";
import { events } from "../../sy-tomato-plugin/src/libs/Events";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { toWin } from "../../sy-tomato-plugin/src/libs/winHotkey";
import { Siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { siyuan } from "../../sy-tomato-plugin/src/libs/siyuanApi";
import { RECITE_START, RECITE_EXTRACT, RECITE_COMPARE, RECITE_HOTKEYS, RECITE_LACE, KEEP_MENU_KEY, TARGET_MENU_KEY, RECITE_OLD, RECITE_KEEP, RECITE_TARGET, RECITE_WRITTEN } from "./constants";
import { enterPractice, cleanPractice, reciteDoc } from "./statusBtn";
import type { ReciteRole } from "./statusBtn";
import { RECITE_LACES, LACE_MENU_KEY } from "./theme";
import { doExtract } from "./extract";
import { doCompare } from "./compare";
import { copyPrompt } from "./promptCopy";
import { setBlocksRole } from "./role";

/**
 * 编辑器内容右键菜单入口（2026-08-25，照 tomato GraphBox.locateNodeMenu 惯例）：订阅
 * open-menu-content，按右键文档角色智能显示（角色判据与 StatusBtn.refresh 同源——
 * custom-recite-start/excerpt/compare 三文档属性）。内核 emitOpenMenu 会把各插件 addItem
 * 的项统一收进「插件」子菜单（顶部带分隔线，仅桌面端），故本插件只 addItem 不自建分隔线。
 *
 * ⚠️ addItem 必须同步完成：内核 emit 返回后立即读取 detail.menu 构建子菜单 DOM
 * （app/src/menus/Menu.ts 子菜单项在 MenuItem 构造期物化），await 后再 addItem 不渲染——
 * 所以角色判定走零请求通道（见 docRole），与 tomato 各 box 的「同步段 addItem」同款约束。
 * 移动端不显示（events.isMobile，浮条已覆盖）。
 */
class ContextMenu {
    private plugin: Plugin = null;
    private handler: (e: any) => void = null;

    onload(plugin: Plugin) {
        this.plugin = plugin;
        this.handler = ({ detail }: any) => this.buildMenu(detail);
        plugin.eventBus.on("open-menu-content", this.handler);
    }

    /**
     * 显式 off。双保险：内核 uninstall() 也会整棵移除插件 EventBus 的 comment 节点
     * （app/src/plugin/uninstall.ts「rm listen」，EventBus 以 comment 节点为 EventTarget）
     * 并 splice 出 app.plugins，停用/重载后监听必然失效——tomato 全线未 off 即依此。
     */
    onunload() {
        if (this.plugin && this.handler) this.plugin.eventBus.off("open-menu-content", this.handler);
        this.plugin = null;
        this.handler = null;
    }

    private buildMenu(detail: any) {
        if (events.isMobile || !detail?.menu) return;
        const docID: string = detail.protyle?.block?.rootID;
        if (!docID) return;
        // 右键命中块（app/src/menus/protyle.ts hasClosestBlock 产物）：origin 分支的 keep 入口
        // 与下方花边入口共用，提前声明（原在花边段内）
        const blockEl = detail.element as HTMLElement | undefined;
        const blockID = blockEl?.getAttribute("data-node-id");
        const role = this.docRole(docID, detail.protyle);
        debugLog("recite.menu", `doc=${docID} role=${role || "-"}`, "recite");
        const item = (label: string, icon: string, langKey: keyof typeof RECITE_HOTKEYS, click: () => void) =>
            detail.menu.addItem({ label, icon, accelerator: hotkeyOf(langKey), click });

        if (role === "origin") {
            // 原文档三入口：「抽取批注」与「重新写」同义（doExtract 单例删建：删旧抽取连对比后
            // 按当前批注重建——「重新写」是浮条在抽取/对比文档上的免导航说法，落在原文档即再抽取）；
            // 删除仿写模式内部自带 confirm（与浮条「删除」一致）。□3 起该项不带 accelerator——
            // ⌥⌘K（reciteTogglePractice）已改指温和退出，键提示挂在删除项上会误导按键
            item("抽取批注", "iconCopy", "reciteExtract", () => { void doExtract(this.plugin, docID); });
            item("重新写", "iconRedo", "reciteRewrite", () => { void doExtract(this.plugin, docID); });
            detail.menu.addItem({ label: "删除仿写模式", icon: "iconTrashcan", click: () => { void cleanPractice(docID); } });
            // □1 三角色菜单项（2026-09-13 三角色战役）：三选一互斥设置替 toggle，回原文走
            // 「设为原文」（roleswap 2026-09-15：原「留作上下文」——□2 统一出卷后非靶块全
            // 照抄，本方向落点=回原文/认领为原文，词不达意是 bear「改不回原文」体感主因）。
            // 开关沿用 KEEP/TARGET_MENU_KEY（默认开）；「设为总结」在两入口至少一个可见时
            // 出现——藏掉全部角色入口时单独出现一个设置项是噪音。靶只打在仿写原文档
            // （role 判定已在上方，非仿写无抽取链路）
            const roleMenuOn = (key: string) => (this.plugin as any).settingCfg?.[key] !== false;
            if (blockID && roleMenuOn(KEEP_MENU_KEY)) {
                detail.menu.addItem({
                    label: this.plugin.i18n["设为原文"] || "设为原文",
                    icon: "iconBookmark",
                    click: () => { void setBlocksRole(this.plugin, detail.protyle, "context", blockEl as HTMLElement); },
                });
            }
            if (blockID && roleMenuOn(TARGET_MENU_KEY)) {
                detail.menu.addItem({
                    label: this.plugin.i18n["这段练"],
                    icon: "iconReciteTarget",
                    click: () => { void setBlocksRole(this.plugin, detail.protyle, "target", blockEl as HTMLElement); },
                });
            }
            if (blockID && (roleMenuOn(KEEP_MENU_KEY) || roleMenuOn(TARGET_MENU_KEY))) {
                detail.menu.addItem({
                    label: this.plugin.i18n["设为总结"],
                    icon: "iconReciteSummary",
                    click: () => { void setBlocksRole(this.plugin, detail.protyle, "summary", blockEl as HTMLElement); },
                });
            }
        } else if (role === "extract") {
            item("生成对比", "iconEye", "reciteCompare", () => { void doCompare(this.plugin, docID); });
            item("复制判卷提示词", "iconSparkles", "reciteCopyPrompt", () => { void copyPrompt(docID, this.plugin); });
        } else if (role === "compare") {
            // copyPrompt 自带 对比→抽取 文档跳转（读复述数据）；无锚点菜单落屏幕右下角
            item("复制判卷提示词", "iconSparkles", "reciteCopyPrompt", () => { void copyPrompt(docID, this.plugin); });
        } else {
            // 普通文档：精确作用于右键文档（togglePractice 命令走 events.docID 最近交互文档）
            item("进入仿写模式", "iconEdit", "reciteTogglePractice", () => { void enterPractice(docID); });
            // 清残留入口（□3 review P2-2）：思源复制/剪切保留 custom-* 属性，练习标记块粘到
            // 别的文档=孤儿标记。old/keep/target 被 .recite-practicing 门控不可见，written 是
            // 唯一非门控标记（退出后淡背景照渲染）——普通文档无任何清除通道，右键补一个：
            // 命中块带任一仿写标记才出现（零请求直读 DOM，addItem 同步约束），空值写=删属性
            if (blockID && [RECITE_OLD, RECITE_KEEP, RECITE_TARGET, RECITE_WRITTEN].some(k => blockEl?.hasAttribute?.(k))) {
                detail.menu.addItem({
                    label: this.plugin.i18n["清除仿写标记"] || "清除仿写标记",
                    icon: "iconReciteExit",
                    click: () => {
                        siyuan.setBlockAttrs(blockID, { [RECITE_OLD]: "", [RECITE_KEEP]: "", [RECITE_TARGET]: "", [RECITE_WRITTEN]: "" } as AttrType)
                            .then(() => siyuan.pushMsg("已清除该块的仿写标记", 2500))
                            .catch(() => { });
                    },
                });
            }
        }

        // ---- 手动级装饰（□13 右键入口；2026-09-02 五款子菜单化，spec=docs/recite-block-lace-styles-spec.md）：
        // 任何文档/角色右键都可用，LACE_MENU_KEY 开关可藏入口（默认开，已挂花边照常渲染）。
        // 门禁哲学与 Settings 皮肤货架一致：unpaid 项可见、款式点击 pushMsg 引导激活（不藏——
        // 保留 QQ 秀可见性；CSS 另有 body:not(.recite-unpaid) 双保险）。addItem 同步约束（见类
        // 注释）：有无花边零请求直读右键现场 DOM——detail.element 即右键命中的块元素（app/src/
        // menus/protyle.ts hasClosestBlock 产物）。交互（用户拍板）：无花边=「本块花边 ▸」子菜单
        // 选款（submenu 纯数据一次构建，tomato PairBox 快捷键速查先例）；有花边=「本块去花边」
        // 单键移除（沿旧 toggle 语义，不展开子菜单；换款=去掉再加）。去花边不设门禁——清残留
        // 不该被付费拦（旧版统一拦的行为变更）。setBlockAttrs 走 API 通道内核即刷 DOM 属性镜像
        // （renderCustom）→ CSS 实时渲染；事务 setAttrs 只落盘 IAL 不刷已开编辑器，CSS 场景必须走 API。
        // settingCfg 是本插件主类扩展属性（siyuan Plugin 无此类型），启动早期 loadData 未回时
        // undefined——`?.[key] !== false` 缺省即显示，与 Settings 侧同判据
        const laceCfg = (this.plugin as any).settingCfg;
        if (blockID && laceCfg?.[LACE_MENU_KEY] !== false) {
            const laced = blockEl.getAttribute(RECITE_LACE);
            if (laced) {
                detail.menu.addItem({
                    label: "本块去花边",
                    icon: "iconMark",
                    click: () => {
                        void siyuan.setBlockAttrs(blockID, { [RECITE_LACE]: "" } as AttrType);
                    },
                });
            } else {
                detail.menu.addItem({
                    label: "本块花边",
                    icon: "iconMark",
                    submenu: RECITE_LACES.map(l => ({
                        label: l.name,
                        click: () => {
                            if (!this.decorGate()) return;
                            void siyuan.setBlockAttrs(blockID, { [RECITE_LACE]: l.slug } as AttrType);
                        },
                    })),
                });
            }
        }
    }

    /** unpaid 引导（Settings 货架同款）：可写返回 true，否则 pushMsg 提示后拦下 */
    private decorGate(): boolean {
        if (document.body.classList.contains("recite-unpaid")) {
            void siyuan.pushMsg(this.plugin.i18n.装饰Pro提示, 2500);
            return false;
        }
        return true;
    }

    /**
     * 角色同步判定（零请求）：同文档信 reciteDoc store——进入/删除/抽取等动作结束都会显式
     * statusBtn.refresh，比 DOM 的 ws 广播反射（~1s 延迟）新；异文档（分屏右键非活动文档、
     * 刚切换未及刷新）直读右键 protyle 的 wysiwyg 元素属性——文档 IAL 由内核 renderCustom
     * 全量镜像为元素属性（custom-recite-* 即在 .protyle-wysiwyg 上）
     */
    private docRole(docID: string, protyle: any): ReciteRole {
        const cur = get(reciteDoc);
        if (cur?.docID === docID) return cur.role;
        const el = protyle?.wysiwyg?.element;
        if (el?.getAttribute(RECITE_START)) return "origin";
        if (el?.getAttribute(RECITE_EXTRACT)) return "extract";
        if (el?.getAttribute(RECITE_COMPARE)) return "compare";
        return "";
    }
}

/**
 * 菜单 accelerator 展示值：优先用户在 设置→快捷键 改过的自定义键（keymap.plugin 直读，
 * winHotkey.w 同款读法），否则插件默认；toWin 平台化（Windows 显示 Ctrl+Alt+X 形态）
 */
function hotkeyOf(langKey: keyof typeof RECITE_HOTKEYS): string {
    const custom = (Siyuan as any)?.config?.keymap?.plugin?.["sy-recite-plugin"]?.[langKey]?.custom;
    return toWin(custom || RECITE_HOTKEYS[langKey].m);
}

export const contextMenu = new ContextMenu();
