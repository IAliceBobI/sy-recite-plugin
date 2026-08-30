import "./index.scss";
import { mount, unmount } from "svelte";
import { Setting } from "siyuan";
import { BaseTomatoPlugin } from "../../sy-tomato-plugin/src/libs/BaseTomatoPlugin";
import { events } from "../../sy-tomato-plugin/src/libs/Events";
import { tomatoI18n } from "../../sy-tomato-plugin/src/tomatoI18n";
import { isObject, Siyuan } from "../../sy-tomato-plugin/src/libs/utils";
import { STORAGE_SETTINGS } from "../../sy-tomato-plugin/src/constants";
import { licenseCloudSynced, userID, userToken } from "../../sy-tomato-plugin/src/libs/stores";
import { resetKey, verifyKeyRecite } from "../../sy-tomato-plugin/src/libs/user";
import { statusBtn, togglePractice, enterPractice, reciteDoc } from "./statusBtn";
import { highlight } from "./highlight";
import { contextMenu } from "./contextMenu";
import { RECITE_HOTKEYS } from "./constants";
import { RECITE_FLOAT_ICONS } from "./reciteIcons";
import { doExtract, rewriteExtract } from "./extract";
import { doCompare } from "./compare";
import { copyPrompt } from "./promptCopy";
import { applyReciteTheme, applyReciteFloatbarSkin, seedFloatbarSkin, applyBgForMode, clearReciteBg, watchAppearance } from "./theme";
import { applyReciteMascot, applyMascotEnabled, mountReciteMascot, unmountReciteMascot } from "./mascot";
import FloatBar from "./FloatBar.svelte";
import Settings from "./Settings.svelte";

function loadStore(plugin: BaseTomatoPlugin) {
    userToken.load(plugin);
    userID.load(plugin);
    licenseCloudSynced.load(plugin);
}

export default class ThePlugin extends BaseTomatoPlugin {
    private floatComp: ReturnType<typeof mount> = null;
    private floatHost: HTMLDivElement = null;
    private settingsComp: ReturnType<typeof mount> = null;
    private userIDTimer: ReturnType<typeof setInterval> = null;
    private topBarEl: HTMLElement = null;
    private topBarGearEl: HTMLElement = null;
    private appearanceUnwatch: (() => void) | null = null;
    // 背景跟仿写上下文走（2026-08-27 bug 修复）：订阅 reciteDoc 角色，仿写三角色文档
    // （原文/抽取/对比）在场→铺背景，切到无关文档→clearReciteBg 退场（用户反馈「切到
    // 无关书籍/文件背景不消失」）。bgRole 缓存最近角色供外观切换回调复用（免引 store get）。
    private bgRoleUnsub: (() => void) | null = null;
    private bgRole = "";
    // 设置面板存活期背景强制在场（预览语义）：面板开着时用户在货架上点选/拖滑块必须立刻
    // 可见，无关文档上开面板也不例外；面板关掉（destroyCallback）重按当前文档角色评估
    public bgPreviewOn = false;

    /**
     * 背景可见性同步：设置面板开着或当前文档是仿写三角色 → applyBgForMode（按外观挂库
     * 真值）；否则 clearReciteBg（显式 none，见 theme.ts 注释——摘属性会误入缺省羊皮纸档）。
     */
    syncBgVisibility() {
        if (this.bgPreviewOn || this.bgRole) {
            applyBgForMode(this.settingCfg);
        } else {
            clearReciteBg();
        }
    }

    constructor(options: any) {
        super(options)
        // 激活体系落盘（2026-08 商业化）：settingCfg 单文件两头一致（load 与 ActivationCard
        // 的 onActivated 同用 STORAGE_SETTINGS），userToken/userID/licenseCloudSynced 挂靠其上
        this.taskCfg = this.loadData(STORAGE_SETTINGS).then(cfg => {
            this.settingCfg = isObject(cfg) ? cfg : ({} as any);
            loadStore(this);
            return this.settingCfg;
        });
    }

    onload() {
        events.onload(this);
        tomatoI18n.init();
        this.addIcons(RECITE_FLOAT_ICONS); // 浮条按钮图标 sprite（2026-08-27 移动端顶栏改造）
        statusBtn.onload();
        highlight.onload();
        contextMenu.onload(this);

        // 调试通道（照 tomato 的 window.tomato_zZmqus5PtYRi 惯例）：e2e/目视验证用
        // window.recitePlugin.setting.open('仿写练习') 直开设置面板
        (window as any).recitePlugin = this;

        // 设置面板（首个设置 UI，2026-08 商业化）：思源标准 Setting（插件列表设置图标入口），
        // Settings.svelte mount 进 addItem 的 actionElement。Setting 每次 open 都重跑
        // createActionElement：先 unmount 旧实例 + destroyCallback 兜底，任一时刻至多一个活实例
        this.setting = new Setting({
            destroyCallback: () => {
                if (this.settingsComp) unmount(this.settingsComp);
                this.settingsComp = null;
                // 面板关闭即撤销背景预览强制在场，重按当前文档角色评估显隐
                this.bgPreviewOn = false;
                this.syncBgVisibility();
            },
        });
        this.setting.addItem({
            title: this.i18n.激活与帮助,
            // row 方向让 host 拿 fn__block（全宽）；默认 column 的 fn__size200 只有 200px 太窄
            direction: "row",
            createActionElement: () => {
                if (this.settingsComp) unmount(this.settingsComp);
                const settingsHost = document.createElement("div");
                this.settingsComp = mount(Settings, { target: settingsHost, props: { plugin: this } });
                // 面板存活期背景强制在场：无关文档上开面板也能立刻看到货架点选/滑块效果
                this.bgPreviewOn = true;
                this.syncBgVisibility();
                return settingsHost;
            },
        });

        // 命令/快捷键兜底（浮条、右键菜单之外的可发现入口；默认快捷键见 constants RECITE_HOTKEYS，
        // 用户可在 设置→快捷键 或思源 设置→快捷键 改；右键菜单 accelerator 与此同源
        // （□33：langKey/默认键改从 RECITE_HOTKEYS 对象单源引用，langText 保持命令面板完整句）
        this.addCommand({
            langKey: RECITE_HOTKEYS.reciteTogglePractice.langKey,
            langText: "仿写练习：进入/删除仿写模式（当前文档）",
            hotkey: RECITE_HOTKEYS.reciteTogglePractice.m,
            callback: () => togglePractice(),
        });
        this.addCommand({
            langKey: RECITE_HOTKEYS.reciteExtract.langKey,
            langText: "仿写练习：抽取批注到抽取文档",
            hotkey: RECITE_HOTKEYS.reciteExtract.m,
            editorCallback: (protyle) => doExtract(this, protyle.block?.rootID),
        });
        this.addCommand({
            langKey: RECITE_HOTKEYS.reciteCompare.langKey,
            langText: "仿写练习：生成对比文档",
            hotkey: RECITE_HOTKEYS.reciteCompare.m,
            editorCallback: (protyle) => doCompare(this, protyle.block?.rootID),
        });
        this.addCommand({
            langKey: RECITE_HOTKEYS.reciteCopyPrompt.langKey,
            langText: "仿写练习：复制判卷提示词",
            hotkey: RECITE_HOTKEYS.reciteCopyPrompt.m,
            editorCallback: (protyle) => copyPrompt(protyle.block?.rootID, this),
        });
        this.addCommand({
            langKey: RECITE_HOTKEYS.reciteRewrite.langKey,
            langText: "仿写练习：重新写（删旧抽取连对比，按当前批注重建空抽取）",
            hotkey: RECITE_HOTKEYS.reciteRewrite.m,
            editorCallback: (protyle) => rewriteExtract(this, protyle.block?.rootID),
        });
    }

    /**
     * 定向进入仿写模式（渐进「仿写本片」副本链路调用，□27）：命令通道 togglePractice
     * 只作用于最近交互文档无法定向，故开此实例口。跨插件惯例：调用方可选链 ?. 访问，
     * 旧版 recite 无此方法时静默降级。enterPractice 自带「已进入仿写模式」toast。
     */
    async enterPracticeFor(docID: string) {
        await enterPractice(docID);
    }

    /**
     * 顶栏按钮增删小工具（元素留存 + remove 模式，笔/齿轮两开关共用）：思源无 removeTopBar
     * API——addTopBar 返回的元素手动 .remove() 即等效摘除（topBarIcons 数组残留无害，元素 id
     * 按数组长度递增不会撞），故开关即时生效无需重载插件。
     */
    private toggleTopBarEl(on: boolean, cur: HTMLElement, build: () => HTMLElement): HTMLElement {
        if (on && !cur) return build();
        if (!on && cur) {
            cur.remove();
            return null;
        }
        return cur;
    }

    /**
     * 顶栏笔图标开关（2026-08-25 用户反馈，模式照 ReadingPointBox.addTopBar）：点击 = togglePractice
     * （等价命令 reciteTogglePractice）。默认开——缺省 true 只在 onLayoutReady/Settings 用
     * `reciteTopBar !== false` 判定（undefined 视为开），已存过 false 的老用户存储被尊重。
     * 主题色（2026-08-25 用户反馈）：思源 svg 填色走 currentColor，挂类改 color 即改图标颜色
     * （index.scss .recite-topbar-icon = --recite-accent 金色系，随皮肤/明暗切换）。
     * Settings.svelte 的 checkbox 与 onLayoutReady 启动恢复共用本方法。
     */
    setTopBarIcon(on: boolean) {
        this.topBarEl = this.toggleTopBarEl(on, this.topBarEl, () => {
            const el = this.addTopBar({
                icon: "iconEdit",
                title: this.i18n.顶栏提示,
                position: "left",
                callback: () => togglePractice(),
            });
            el.classList.add("recite-topbar-icon");
            return el;
        });
    }

    /**
     * 顶栏「设置」齿轮按钮（2026-08-25 用户反馈，默认关）：点击 = this.setting.open() 直开插件
     * 设置面板。青绿第二主题色与笔金色一眼可辨（.recite-topbar-gear = --recite-yours，随皮肤
     * 映射表 yours 档联动）。机制同 setTopBarIcon（即时增删 / onLayoutReady 恢复 / unload 摘除）。
     */
    setTopBarGear(on: boolean) {
        this.topBarGearEl = this.toggleTopBarEl(on, this.topBarGearEl, () => {
            const el = this.addTopBar({
                icon: "iconSettings",
                title: this.i18n.顶栏设置提示,
                position: "left",
                callback: () => this.setting.open(this.i18n.激活与帮助),
            });
            el.classList.add("recite-topbar-gear");
            return el;
        });
    }

    async onLayoutReady() {
        await this.taskCfg;

        // 皮肤恢复（settingCfg.reciteTheme，theme.ts 注册表外slug 自动回落默认）+ 顶栏按钮开关：
        // 笔图标默认开（undefined=开，仅显式存过 false 才关）；齿轮设置按钮默认关（仅显式 true 才开）
        applyReciteTheme((this.settingCfg as any).reciteTheme);
        // 浮条皮肤恢复挪到下方 refreshGate 后（播种须先于挂属性，见那儿注释）
        // 判卷小宠物（2026-08-26 □12）：形象/开关属性（容器挂载挪到下方 mount(FloatBar)
        // 之后——宠物栖身浮条根内随拖动跟随，浮条 DOM 就绪才能 querySelector 到）；
        // Pro 形象（精灵小盼）另有 unpaid CSS 门禁
        applyReciteMascot((this.settingCfg as any).reciteMascot);
        applyMascotEnabled((this.settingCfg as any).reciteMascotOn !== false);
        // 全局背景库恢复（2026-08-27 □18/□19 + 同日 bug 修复「背景跟仿写上下文走」）：
        // 订阅 reciteDoc 角色驱动显隐（订阅即刻回调一次，角色缓存进 bgRole）——当前文档
        // 是仿写三角色铺 applyBgForMode（按外观取 bgLight/bgDark 挂属性 + 注入 --recite-bg-k
        // 浓淡系数；双键未存走 resolveBgPair 迁移链），切到无关文档 clearReciteBg 退场；
        // 切外观时 observer 重调 syncBgVisibility 即自动换库。启动时角色未知（""）先退场，
        // 下方 statusBtn.refresh() 查到角色后 store 触发再铺。
        this.bgRoleUnsub = reciteDoc.subscribe(d => {
            this.bgRole = d.role;
            this.syncBgVisibility();
        });
        this.appearanceUnwatch = watchAppearance(() => this.syncBgVisibility());
        this.setTopBarIcon((this.settingCfg as any).reciteTopBar !== false);
        this.setTopBarGear(!!(this.settingCfg as any).reciteTopBarGear);

        // 思源登录态异步就绪（照 progressive 轮询）；启动时未登录的门禁在登录后补验刷新。
        // resetKey 防 verify 懒缓存旧结果：切账号场景重验
        const refreshGate = async () => {
            const valid = userID.get() ? await verifyKeyRecite() : false;
            document.body.classList.toggle("recite-unpaid", !valid);
        };
        this.userIDTimer = setInterval(() => {
            const id = Siyuan?.user?.userId;
            if (id && userID.get() !== id) {
                userID.write(id).then(() => {
                    resetKey();
                    refreshGate();
                });
            }
        }, 2000);
        // 门禁初判：默认无 class = 付费态样式（与现状一致），verify 失败才挂 unpaid（无闪烁方向）
        await refreshGate();

        // 浮条二波解耦播种（2026-08-27 □23，proposals §4）：装饰皮肤老用户首次启动把浮条轴
        // 搬到对应迁移款（橘猫→扇贝/墨兔→回纹/暗夜→鎏金）；undefined 判据天然幂等，未激活
        // 跳过（目标款全 Pro，防货架「已选中 ∨ 锁标」矛盾）。须在 refreshGate 后（激活态
        // 就绪）+ mount(FloatBar) 前（浮条渲染入口只有这一处）。
        const fbCfg = this.settingCfg as any;
        if (seedFloatbarSkin(fbCfg, !document.body.classList.contains("recite-unpaid"))) {
            await this.saveData(STORAGE_SETTINGS, this.settingCfg); // 真写盘固化，防日后切主题判据漂移二次改写
        }
        applyReciteFloatbarSkin(fbCfg.floatbarSkin); // 播种值/存量值统一挂属性（Pro 款另有 unpaid CSS 门禁）

        this.floatHost = document.createElement("div");
        document.body.appendChild(this.floatHost);
        this.floatComp = mount(FloatBar, { target: this.floatHost, props: { plugin: this } });
        mountReciteMascot(); // 浮条根已就绪：宠物栖身其内（absolute 贴纸位），见 mascot.ts
        statusBtn.refresh();
    }

    onunload() {
        if (this.userIDTimer) clearInterval(this.userIDTimer);
        this.userIDTimer = null;
        this.bgRoleUnsub?.(); // 背景角色订阅停表（属性清理由下方 removeAttribute 一并兜底）
        this.bgRoleUnsub = null;
        this.bgPreviewOn = false;
        this.setTopBarIcon(false); // 显式摘除顶栏元素（内核 unload 也会清 topBarIcons，双保险）
        this.setTopBarGear(false);
        this.topBarEl = null;
        this.topBarGearEl = null;
        document.body.removeAttribute("data-recite-theme"); // 皮肤属性随插件停用摘除
        document.body.removeAttribute("data-recite-floatbar-skin"); // 浮条皮肤属性同理
        document.body.removeAttribute("data-recite-mascot"); // 判卷小宠物属性同理
        document.body.removeAttribute("data-recite-mascot-off");
        document.body.removeAttribute("data-recite-bg"); // 全局背景库属性同理（含 none/custom 档）
        document.body.style.removeProperty("--recite-bg-custom"); // custom 图片 URL 变量一并清
        document.body.style.removeProperty("--recite-bg-k"); // 纹理浓淡纱系数同理
        this.appearanceUnwatch?.(); // 外观切换观察者停表（□19 明暗分库）
        unmountReciteMascot();
        if (this.floatComp) unmount(this.floatComp);
        this.floatComp = null;
        this.floatHost?.remove();
        this.floatHost = null;
        if (this.settingsComp) unmount(this.settingsComp);
        this.settingsComp = null;
        contextMenu.onunload();
        highlight.onunload();
        statusBtn.onunload(); // 与 onload 注册顺序对称的逆序回收（清挂起的自检 timer，见 statusBtn.onunload 范式注释）
    }
}
