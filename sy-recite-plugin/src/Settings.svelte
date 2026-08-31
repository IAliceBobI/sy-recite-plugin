<script lang="ts">
    // recite 设置面板（2026-08 商业化，视觉批 2026-08-25 焕新；□4 视觉收敛 2026-08-31）：统一
    // header（□3，名+版本+Pro 徽标+帮助菜单单图标钮，名片/标语收进菜单「关于」）+ 顶栏图标开关
    // + 皮肤主题货架（真切换）+ 付费状态条（□1，点击弹统一解锁框）+ 搜索框（□3 补齐，复用番茄
    // searchSettings），挂思源标准 Setting 页签（index.ts mount 进 setting.element）。
    // □4 色板收敛：面板 chrome 全走 b3 变量（用户拍板方案一零品牌色），不再引用 --recite-* 运行时
    // token（旧引用会随 body[data-recite-theme] 皮肤漂移）；emoji 装饰全退役（宠物卡改真帧 mock、
    // 快捷键行改 sprite 图标）。
    // 购买/激活/邻居解锁共享文案走 tomatoI18n（六语种，UnlockDialog 内聚）；
    // recite 特有文案走 plugin.i18n（zh_CN/en_US 起步）。
    import { Dialog } from "siyuan";
    import { mount } from "svelte";
    import { onDestroy, onMount, tick } from "svelte";
    import { newID } from "stonev5-utils";
    import UpgradeBar from "../../sy-tomato-plugin/src/UpgradeBar.svelte";
    import { openUnlockDialog } from "../../sy-tomato-plugin/src/unlockDialog";
    import Help from "../../sy-tomato-plugin/src/libs/Help.svelte";
    import { openHelpMenu } from "../../sy-tomato-plugin/src/libs/helpMenu";
    import { searchSettings } from "../../sy-tomato-plugin/src/libs/ui";
    import { openChangelogDialog } from "../../sy-tomato-plugin/src/libs/changelogDialog";
    import { DestroyManager } from "../../sy-tomato-plugin/src/libs/destroyer";
    import { events } from "../../sy-tomato-plugin/src/libs/Events";
    import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
    import { STORAGE_SETTINGS } from "../../sy-tomato-plugin/src/constants";
    import changelog from "./changelog.json";
    import helpDoc from "./help.json";
    import pluginPkg from "../plugin.json";
    import { RECITE_SKINS, DEFAULT_SKIN_SLUG, applyReciteTheme, RECITE_BGS,
        applyBgForMode, watchAppearance, isDarkAppearance, resolveBgPair,
        BG_LIGHT_KEY, BG_DARK_KEY, BG_STRENGTH_LIGHT_KEY, BG_STRENGTH_DARK_KEY,
        BG_CUSTOM_FILE_LIGHT_KEY, BG_CUSTOM_FILE_DARK_KEY,
        RECITE_FLOATBAR_SKINS, DEFAULT_FLOATBAR_SKIN_SLUG, applyReciteFloatbarSkin } from "./theme";
    import { GRADER_TONES, DEFAULT_TONE_SLUG } from "./promptCopy";
    import { RECITE_MASCOTS, DEFAULT_MASCOT_SLUG, applyReciteMascot, applyMascotEnabled } from "./mascot";
    import { RECITE_HOTKEYS } from "./constants";
    // 快捷键键帽共享组件（□33 三插件同源：tomato 自用 / progressive / recite 相对导入同款）。
    // 键帽样式（.kbd/.hotkey-cap/.hk-chip 等）在 IndexConf.css 且按 .tomato-settings-dialog
    // 作用域限定——根节点挂同名类启用（progressive 同款做法）；该 css 其余规则命不中 recite 模板
    // 类名，不泄漏不影响本面板既有视觉
    import HotkeyCap from "../../sy-tomato-plugin/src/HotkeyCap.svelte";
    import "../../sy-tomato-plugin/src/IndexConf.css";

    interface Props {
        plugin: any;
    }
    let { plugin }: Props = $props();

    // 激活态初值直接取 body 门禁 class（面板只可能在 onLayoutReady 刷新门禁之后被打开，class 已
    // 就位）——已激活用户开面板不闪锁；随后 UpgradeBar onMount 自动 verify（懒缓存
    // verifyKeyRecite，与 index.ts refreshGate 同一判定源）经 bind:codeValid 回写纠正，两处一致。
    let codeValid = $state(!document.body.classList.contains("recite-unpaid"));

    // □14 激活互通（2026-08-28 拍板）＋□1 收敛（2026-08-31）：邻居检测与一键解锁整链
    // 移进统一 UnlockDialog（UpgradeBar neighbor 传入开启，弹框打开时惰性互问渐进实例），
    // 面板侧不再保留邻居行/购买拦截。

    // 完整帮助 = 飞书图文指南（2026-08-26 建，四场景示例 + 判卷全文）；私有期文档未开公开分享，
    // 未授权访问不可达——Help Dialog 本地渲染 help.json 速览兜底，链接仅作「看完整版」出口
    const FEISHU_DOC_URL = "https://my.feishu.cn/docx/FgSpdE2PmoEfJmxGYCqcurmDnCf";

    // 顶栏笔图标开关（settingCfg 单文件落盘，2026-08-25 入口去重后默认开）：切换即时生效——
    // addTopBar 返回的元素可 .remove() 动态摘除（index.ts setTopBarIcon），无需重载插件。
    // 缺省判 `!== false`（undefined = 开，与 index.ts onLayoutReady 同一迁移语义），老用户显式
    // 存过 false 的尊重存储。settingCfg 在面板打开前已由 taskCfg 装载完毕，此处有意只取初值
    // （面板每次 open 重 mount，开关状态随之重读）。
    // svelte-ignore state_referenced_locally
    let topBarOn = $state(plugin.settingCfg?.reciteTopBar !== false);
    function onToggleTopBar(e: Event) {
        topBarOn = (e.currentTarget as HTMLInputElement).checked;
        plugin.settingCfg.reciteTopBar = topBarOn;
        plugin.saveData(STORAGE_SETTINGS, plugin.settingCfg);
        plugin.setTopBarIcon(topBarOn);
    }

    // 顶栏「设置」齿轮按钮（默认关）：on 时顶栏加青绿齿轮（iconSettings），点击直开本设置面板
    // svelte-ignore state_referenced_locally
    let gearOn = $state(!!plugin.settingCfg?.reciteTopBarGear);
    function onToggleGear(e: Event) {
        gearOn = (e.currentTarget as HTMLInputElement).checked;
        plugin.settingCfg.reciteTopBarGear = gearOn;
        plugin.saveData(STORAGE_SETTINGS, plugin.settingCfg);
        plugin.setTopBarGear(gearOn);
    }

    // 判官语气三档（2026-08-26）：三选一存 settingCfg.graderTone，即选即存——判卷时（aiGrade/
    // copyPrompt 调 buildPrompt）读最新值，无即时视觉无需重载。默认中立=判卷 prompt 零变化。
    const tones = $derived(GRADER_TONES.map(t => ({
        ...t,
        name: (plugin.i18n as any)[t.i18nKey] ?? t.i18nKey.split("·")[1],
    })));
    // svelte-ignore state_referenced_locally
    let selectedTone = $state<string>(plugin.settingCfg?.graderTone || DEFAULT_TONE_SLUG);

    function pickTone(slug: string) {
        selectedTone = slug;
        plugin.settingCfg.graderTone = slug;
        plugin.saveData(STORAGE_SETTINGS, plugin.settingCfg);
    }

    // 判卷小宠物出场开关（2026-08-26 □12，默认开）：关 = body 挂 off 属性 CSS 关显示，
    // 判卷流程的 setRecitePose 照常跑只是不渲染，重开即时生效。缺省判 `!== false` 同顶栏笔图标。
    // svelte-ignore state_referenced_locally
    let mascotOn = $state(plugin.settingCfg?.reciteMascotOn !== false);
    function onToggleMascot(e: Event) {
        mascotOn = (e.currentTarget as HTMLInputElement).checked;
        plugin.settingCfg.reciteMascotOn = mascotOn;
        plugin.saveData(STORAGE_SETTINGS, plugin.settingCfg);
        applyMascotEnabled(mascotOn);
    }

    // 宠物形象货架（与皮肤货架同款机制）：豆豆免费默认 / 精灵小盼 Pro（未激活锁死盖角标）。
    // 选择落 settingCfg.reciteMascot + 立即挂 body[data-recite-mascot]（Pro 形象另有 unpaid
    // CSS 门禁——此处只管属性，锁是双保险的功能层）
    const mascots = $derived(RECITE_MASCOTS.map(m => ({
        ...m,
        name: (plugin.i18n as any)[m.i18nKey] ?? m.i18nKey.split("·")[1],
        locked: !codeValid && m.pro,
    })));
    // svelte-ignore state_referenced_locally
    let selectedMascot = $state<string>(plugin.settingCfg?.reciteMascot || DEFAULT_MASCOT_SLUG);

    // □1 灰档统一：锁卡点击一律弹统一解锁框（替代原 pushMsg 提示）；激活链内聚在
    // UnlockDialog（成功后 saveData→reload），此处只管弹
    function openUnlock() {
        openUnlockDialog({
            product: "recite",
            neighbor: true,
            getApp: () => plugin.app,
            onActivated: () => plugin.saveData(STORAGE_SETTINGS, plugin.settingCfg),
        });
    }

    function pickMascot(slug: string) {
        const m = mascots.find(x => x.slug === slug);
        if (!m) return;
        if (m.locked) {
            openUnlock();
            return;
        }
        selectedMascot = slug;
        plugin.settingCfg.reciteMascot = slug;
        plugin.saveData(STORAGE_SETTINGS, plugin.settingCfg);
        applyReciteMascot(slug);
    }

    // 全局背景库货架（□18 重做 + □19 明暗分库/滑块/护眼档）：与皮肤两轴正交，七档可选——
    // 无/羊皮纸/护眼免费，其余四款 Pro（locked+引导同皮肤货架）。亮/暗双库各自选
    // （bgLight/bgDark），chip 只是「编辑镜头」——切换不触发应用，选择/滑块永远写 chip 所指键；
    // 立即生效走 applyBgForMode（按当前外观决定挂哪个库的值，另库不受扰）。未存过双键的老
    // 用户走 resolveBgPair 迁移链（旧 reciteBg 值双侧播种）。纹理浓淡滑块（bgStrengthLight/
    // Dark，缺省 50=出厂基准）：oninput 实时预览（仅编辑镜头=当前外观时才写 body，编辑另一
    // 库不扰动当前显示）、onchange 落盘；当前模式选中 none/custom 无纹样可调，整行隐藏。
    // custom 桌：点击先弹文件选择（png/jpg/webp/gif ≤8MB），上传 /data/assets 走思源静态
    // 服务，图键明暗各一（bgCustomFileLight/Dark，换图只删对应模式旧图）。
    const bgs = $derived(RECITE_BGS.map(b => ({
        ...b,
        name: (plugin.i18n as any)[b.i18nKey] ?? b.i18nKey.split("·")[1],
        locked: !codeValid && b.pro,
    })));
    // svelte-ignore state_referenced_locally
    const bgPairInit = resolveBgPair(plugin.settingCfg);
    // svelte-ignore state_referenced_locally
    let bgMode = $state<"light" | "dark">(isDarkAppearance() ? "dark" : "light");
    // svelte-ignore state_referenced_locally
    let selectedBgLight = $state<string>(bgPairInit.light);
    // svelte-ignore state_referenced_locally
    let selectedBgDark = $state<string>(bgPairInit.dark);
    // svelte-ignore state_referenced_locally
    let bgStrengthLight = $state<number>(bgPairInit.strengthLight);
    // svelte-ignore state_referenced_locally
    let bgStrengthDark = $state<number>(bgPairInit.strengthDark);
    let bgFileEl = $state<HTMLInputElement | null>(null);
    const modeBg = $derived(bgMode === "light" ? selectedBgLight : selectedBgDark);
    const modeStrength = $derived(bgMode === "light" ? bgStrengthLight : bgStrengthDark);

    // 面板存活期外观切换 → chip 跟随当前外观（背景本体由 index.ts 的 watchAppearance 换库）
    $effect(() => watchAppearance(() => {
        bgMode = isDarkAppearance() ? "dark" : "light";
    }));

    // 第三方主题提示（□19）：打开面板时快照判定（亮/暗任一非思源默认即提示；不追实时切主题，
    // 下次开面板自然刷新）。只提示不改行为——尊重用户选择权。
    const isThirdPartyTheme = (() => {
        const ap = (window as any).siyuan?.config?.appearance || {};
        const bad = (name: unknown, def: string) => typeof name === "string" && name !== def;
        return bad(ap.theme, "daylight") || bad(ap.themeDark, "midnight");
    })();

    function setBgMode(m: "light" | "dark") {
        bgMode = m; // 只切编辑镜头（货架选中态/滑块读数随之指向该库的存储值），不应用
    }

    function pickBg(slug: string) {
        const bg = bgs.find(x => x.slug === slug);
        if (!bg) return;
        if (bg.locked) {
            openUnlock();
            return;
        }
        if (slug === "custom") {
            bgFileEl?.click(); // 先选图后切换，见 onPickBgFile
            return;
        }
        if (bgMode === "light") selectedBgLight = slug;
        else selectedBgDark = slug;
        plugin.settingCfg[bgMode === "light" ? BG_LIGHT_KEY : BG_DARK_KEY] = slug;
        plugin.saveData(STORAGE_SETTINGS, plugin.settingCfg);
        applyBgForMode(plugin.settingCfg);
    }

    function onBgStrength(e: Event, persist: boolean) {
        const raw = Number((e.currentTarget as HTMLInputElement).value);
        const t = Math.min(100, Math.max(0, Math.round(raw)));
        if (bgMode === "light") bgStrengthLight = t;
        else bgStrengthDark = t;
        // 实时预览仅当编辑镜头=当前外观模式（编辑另一库不扰动当前显示；k 变量随下次切外观应用）
        if ((bgMode === "dark") === isDarkAppearance()) {
            document.body.style.setProperty("--recite-bg-k", String(t / 100));
        }
        if (persist) {
            plugin.settingCfg[bgMode === "light" ? BG_STRENGTH_LIGHT_KEY : BG_STRENGTH_DARK_KEY] = t;
            plugin.saveData(STORAGE_SETTINGS, plugin.settingCfg);
            applyBgForMode(plugin.settingCfg); // 权威值覆盖预览（另库键不受扰）
        }
    }

    async function onPickBgFile(e: Event) {
        const input = e.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        input.value = ""; // 清值允许重选同一文件
        if (!file) return;
        const extMap: Record<string, string> = {
            "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
        };
        const ext = extMap[file.type];
        if (!ext) {
            siyuan.pushMsg(plugin.i18n.背景图片类型不支持, 3000);
            return;
        }
        if (file.size > 8 * 1024 * 1024) {
            siyuan.pushMsg(plugin.i18n.背景图片过大, 3000);
            return;
        }
        const path = `/data/assets/recite-bg-custom-${Date.now()}.${ext}`;
        const ok = await siyuan.putFile(path, await file.arrayBuffer());
        if (!ok) {
            siyuan.pushMsg(plugin.i18n.背景图片上传失败, 3000);
            return;
        }
        // 删旧图（时间戳文件名换图后旧文件成孤儿；只删当前模式键的旧图——另一库可能还在用；
        // 删除失败不阻塞）
        const fileKey = bgMode === "light" ? BG_CUSTOM_FILE_LIGHT_KEY : BG_CUSTOM_FILE_DARK_KEY;
        const old = plugin.settingCfg?.[fileKey];
        if (old) siyuan.removeFile("/data" + old).catch(() => {});
        const url = "/assets/" + path.split("/").pop();
        plugin.settingCfg[fileKey] = url;
        plugin.settingCfg[bgMode === "light" ? BG_LIGHT_KEY : BG_DARK_KEY] = "custom";
        if (bgMode === "light") selectedBgLight = "custom";
        else selectedBgDark = "custom";
        plugin.saveData(STORAGE_SETTINGS, plugin.settingCfg);
        applyBgForMode(plugin.settingCfg);
    }

    // 皮肤货架：locked 绑激活态——amber/豆沙护眼永久免费（pro=false），其余未激活锁死（功能层锁：
    // aria-disabled + 点击弹激活引导，不用 disabled 属性否则收不到点击没法引导）。已激活全解锁。
    // 点击已解锁卡：选中 + 写 settingCfg.reciteTheme + 立即挂 body[data-recite-theme] 换肤。
    const skins = $derived(RECITE_SKINS.map(s => ({
        ...s,
        name: (plugin.i18n as any)[s.i18nKey] ?? s.i18nKey.split("·")[1],
        locked: !codeValid && s.pro,
    })));
    // svelte-ignore state_referenced_locally
    let selectedSkin = $state<string>(plugin.settingCfg?.reciteTheme || DEFAULT_SKIN_SLUG);

    function pickSkin(slug: string) {
        const skin = skins.find(s => s.slug === slug);
        if (!skin) return;
        if (skin.locked) {
            openUnlock();
            return;
        }
        selectedSkin = slug;
        plugin.settingCfg.reciteTheme = slug;
        plugin.saveData(STORAGE_SETTINGS, plugin.settingCfg);
        applyReciteTheme(slug); // 全 UI（浮条/卡片/染色）即时换肤
    }

    // 浮条样式货架（与皮肤主题货架同款机制，独立维度）：默认「晨光便签」永久免费，墨玉轻雾/宣纸
    // 为 Pro（locked 逻辑同上：未激活锁死盖角标 + 点击弹引导；已激活解锁）。选择落
    // settingCfg.floatbarSkin + 立即挂 body[data-recite-floatbar-skin]（Pro 款另有 unpaid CSS 门禁）。
    const fbSkins = $derived(RECITE_FLOATBAR_SKINS.map(s => ({
        ...s,
        name: (plugin.i18n as any)[s.i18nKey] ?? s.i18nKey.split("·")[1],
        locked: !codeValid && s.pro,
    })));
    // svelte-ignore state_referenced_locally
    let selectedFbSkin = $state<string>(plugin.settingCfg?.floatbarSkin || DEFAULT_FLOATBAR_SKIN_SLUG);

    function pickFbSkin(slug: string) {
        const skin = fbSkins.find(s => s.slug === slug);
        if (!skin) return;
        if (skin.locked) {
            openUnlock();
            return;
        }
        selectedFbSkin = slug;
        plugin.settingCfg.floatbarSkin = slug;
        plugin.saveData(STORAGE_SETTINGS, plugin.settingCfg);
        applyReciteFloatbarSkin(slug); // 浮条即时换肤
    }

    // 快捷键节行数据（□33）：hk 来自 RECITE_HOTKEYS（winHotkey 对象，langKey/默认键/icon 单源），
    // 行名走 plugin.i18n；键帽写回/冲突检测/随机建议全由 HotkeyCap + tomato libs/hotkeyCap.ts 承担
    // svelte-ignore state_referenced_locally
    const hkRows = [
        { hk: RECITE_HOTKEYS.reciteTogglePractice, label: plugin.i18n["快捷键·进入仿写"] },
        { hk: RECITE_HOTKEYS.reciteExtract, label: plugin.i18n["快捷键·抽取"] },
        { hk: RECITE_HOTKEYS.reciteCompare, label: plugin.i18n["快捷键·对比"] },
        { hk: RECITE_HOTKEYS.reciteCopyPrompt, label: plugin.i18n["快捷键·复制提示词"] },
        { hk: RECITE_HOTKEYS.reciteRewrite, label: plugin.i18n["快捷键·重新写"] },
    ];

    // 照 openHelpDialog 接线模式（Dialog + DestroyManager + mount Help），help.json 为
    // 自写单一对象（非按飞书 token 索引的快照表），hint/linkText 覆盖默认飞书口径
    function openHelp() {
        const dm = new DestroyManager();
        const id = newID();
        const dialog = new Dialog({
            title: helpDoc.title,
            content: `<div id="${id}" style="height:100%"></div>`,
            width: events.isMobile ? "90vw" : "700px",
            height: events.isMobile ? "180svw" : "700px",
            destroyCallback: () => {
                dm.destroyBy("dialog");
            },
        });
        const d = mount(Help, {
            target: dialog.element.querySelector("#" + id),
            props: { doc: { ...helpDoc, url: FEISHU_DOC_URL } },
        });
        dm.add("dialog", () => dialog.destroy());
        dm.add("svelte", () => d.destroy());
    }

    // □4 关于弹窗：hero 名片区退役后的版本+标语承接位（择轻=纯 Dialog 零 Svelte mount）。
    // 内容样式走内联（Dialog content 挂 body 外层，scoped 样式命不中），全 b3 变量
    function openAbout() {
        new Dialog({
            title: plugin.i18n.关于仿写练习,
            content: `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:28px 16px 20px;text-align:center">
                <div style="font-size:16px;font-weight:600;color:var(--b3-theme-on-background)">${plugin.i18n.name}</div>
                <div style="font-size:12px;color:var(--b3-theme-on-surface-light, var(--b3-theme-on-surface))">v${pluginPkg.version}</div>
                <div style="font-size:13px;line-height:1.6;color:var(--b3-theme-on-surface)">${plugin.i18n.标语}</div>
            </div>`,
            width: "360px",
        });
    }

    // □3 帮助菜单（header 单 iconHelp 入口）：使用说明/更新日志/开源仓库/关于（isMe，
    // helpMenu 内聚）；原页脚三按钮与 dev-row 全部收编于此
    function onHelpMenuBtn(e: MouseEvent) {
        openHelpMenu(e, {
            usage: openHelp,
            changelog: () => openChangelogDialog(changelog),
            repo: () => window.open("https://github.com/IAliceBobI/sy-recite-plugin", "_blank"),
            about: openAbout,
            labels: {
                usage: plugin.i18n.使用说明,
                changelog: plugin.i18n.更新日志,
                repo: plugin.i18n.开源仓库,
                about: plugin.i18n.关于仿写练习,
            },
        });
    }

    // □3 搜索框补齐：番茄/渐进同款（searchSettings + localStorage 记忆），过滤粒度=面板
    // 直接子元素（rs-header 挂 data-search 豁免，不会被搜索隐藏）
    let settingsDiv: HTMLElement = $state();
    let searchKey = $state("");
    const SearchKeyItemKey = "recite_settings_SearchKeyItemKey_RfrUm9VLS4GehTzg5ygRrNT";
    onDestroy(() => {
        localStorage.setItem(SearchKeyItemKey, searchKey);
    });
    onMount(async () => {
        const savedSearchKey = localStorage.getItem(SearchKeyItemKey);
        if (savedSearchKey) {
            searchKey = savedSearchKey;
            await tick();
            if (settingsDiv) {
                searchSettings(settingsDiv, searchKey);
            }
        }
    });

</script>

<div class="recite-settings tomato-settings-dialog" bind:this={settingsDiv}>
    <!-- □3 统一 header（页签内自绘，同 tomato-header 类复用 IndexConf.css；无关闭钮——
         页签由思源自身管理）。data-search：搜索过滤豁免，header 永不隐藏 -->
    <div class="tomato-header rs-header" data-search>
        <span class="tomato-header-title">{plugin.i18n.name} · {plugin.i18n.设置}</span>
        <span class="tomato-header-version">v{pluginPkg.version}</span>
        {#if codeValid}<span class="tomato-pro-badge">Pro</span>{/if}
        <div class="tomato-header-btns">
            <button
                class="tomato-header-btn b3-tooltips b3-tooltips__n"
                aria-label={plugin.i18n.帮助}
                onclick={onHelpMenuBtn}
            >
                <svg aria-hidden="true"><use xlink:href="#iconHelp"></use></svg>
            </button>
        </div>
    </div>

    <!-- 付费状态条（□1）：未激活一行入口，点击弹统一解锁框（neighbor 开启渐进一键解锁格）；
         已激活整条不渲染。□4 hero 退役后自然成为内容流最顶 -->
    <UpgradeBar
        product="recite"
        bind:codeValid
        neighbor={true}
        getApp={() => plugin.app}
        onActivated={() => plugin.saveData(STORAGE_SETTINGS, plugin.settingCfg)}
    ></UpgradeBar>

    <!-- search（□3 补齐）：番茄/渐进同款搜索配置，localStorage 记忆 -->
    <div class="settingBox search-bar" data-search>
        <input
            class="b3-text-field"
            placeholder={plugin.i18n.搜索配置}
            bind:value={searchKey}
            oninput={() => {
                localStorage.setItem(SearchKeyItemKey, searchKey);
                searchSettings(settingsDiv, searchKey);
            }}
        />
    </div>

    <!-- 顶栏按钮开关（笔图标默认开，齿轮设置按钮默认关）：切换即时生效（动态 addTopBar / 元素 remove） -->
    <div class="rs-setting-row">
        <label class="rs-setting-label" for="recite-topbar-switch">{plugin.i18n.顶栏图标}</label>
        <input
            id="recite-topbar-switch"
            type="checkbox"
            class="b3-switch"
            checked={topBarOn}
            onchange={onToggleTopBar}
        />
    </div>
    <div class="rs-setting-row">
        <label class="rs-setting-label" for="recite-topbar-gear-switch">{plugin.i18n.顶栏设置按钮}</label>
        <input
            id="recite-topbar-gear-switch"
            type="checkbox"
            class="b3-switch"
            checked={gearOn}
            onchange={onToggleGear}
        />
    </div>

    <!-- 快捷键（□33）：五命令键帽，点击进入监听态按下新组合即免 reload 写回内核 keymap；
         Esc 取消 / Backspace 删除 / 🎲 随机 / ↩ 恢复默认由共享组件自带（键帽内字符是功能输入
         符号非装饰，保留）；行首图标走 sprite（□4 emoji 退役，icon id 单源 RECITE_HOTKEYS） -->
    <div class="rs-hks">
        <div class="rs-skins-title">{plugin.i18n.快捷键}</div>
        {#each hkRows as row}
            <div class="rs-hk-row">
                <span class="rs-hk-label">
                    <svg class="rs-hk-ic" aria-hidden="true"><use xlink:href="#{row.hk.icon}"></use></svg>
                    {row.label}
                </span>
                <HotkeyCap hk={row.hk} pluginName="sy-recite-plugin"></HotkeyCap>
            </div>
        {/each}
    </div>

    <!-- 判官语气三选（分段控件）：AI 判卷的点评口吻，云端判卷与复制提示词两通道同步生效 -->
    <div class="rs-setting-row">
        <span class="rs-setting-label">{plugin.i18n.判官语气}</span>
        <div class="rs-tone-seg" role="radiogroup" aria-label={plugin.i18n.判官语气}>
            {#each tones as tone}
                <button
                    class="rs-tone-btn"
                    class:rs-tone-btn--on={selectedTone === tone.slug}
                    role="radio"
                    aria-checked={selectedTone === tone.slug}
                    onclick={() => pickTone(tone.slug)}
                >{tone.name}</button>
            {/each}
        </div>
    </div>

    <!-- 判卷小宠物出场开关（默认开）：判卷时宠物出场打盹等分、按成绩摆表情，关闭后不渲染 -->
    <div class="rs-setting-row">
        <label class="rs-setting-label" for="recite-mascot-switch">{plugin.i18n.判卷小宠物}</label>
        <input
            id="recite-mascot-switch"
            type="checkbox"
            class="b3-switch"
            checked={mascotOn}
            onchange={onToggleMascot}
        />
    </div>

    <!-- 宠物形象两选：豆豆/雪团免费默认 / 其余 Pro（未激活锁死盖角标，点击弹激活引导）。
         卡面直接展示判卷出场的真帧（idle 睁眼帧，index.scss .rs-mascot-frame--* 单源）。
         --skin 借 primary 而非各形象主题色（vision P1-1：无 --skin 时选中✓ 白勾裸奔+边框
         回退黑色；且与其他货架「皮肤色=商品色」不同，宠物无商品主色，统一走 b3） -->
    <div class="rs-skins">
        <div class="rs-skins-title">{plugin.i18n.宠物形象}</div>
        <div class="rs-skin-shelf" role="radiogroup" aria-label={plugin.i18n.宠物形象}>
            {#each mascots as m}
                <button
                    class="rs-skin b3-tooltips b3-tooltips__n"
                    class:rs-skin--selected={selectedMascot === m.slug}
                    class:rs-skin--locked={m.locked}
                    style="--skin: var(--b3-theme-primary)"
                    role="radio"
                    aria-checked={selectedMascot === m.slug}
                    aria-disabled={m.locked}
                    aria-label={m.locked ? plugin.i18n.宠物Pro提示 : m.name}
                    onclick={() => pickMascot(m.slug)}
                >
                    <span class="rs-mascot-mock" aria-hidden="true">
                        <span class="rs-mascot-frame rs-mascot-frame--{m.slug}"></span>
                    </span>
                    <span class="rs-skin-name">{m.name}</span>
                    {#if m.locked}
                        <span class="rs-skin-pro">Pro</span>
                        <svg class="rs-skin-lock" aria-hidden="true"><use xlink:href="#iconLock"></use></svg>
                    {:else if selectedMascot === m.slug}
                        <svg class="rs-skin-check" aria-hidden="true"><use xlink:href="#iconCheck"></use></svg>
                    {/if}
                </button>
            {/each}
        </div>
    </div>

    <!-- 全局背景库货架（□18+□19）：与皮肤两轴正交——无/羊皮纸/护眼免费，其余 Pro；
         亮/暗双库 chip 切编辑镜头，纹理浓淡滑块随镜头，custom 点击弹文件选择 -->
    <div class="rs-skins">
        <div class="rs-skins-title">{plugin.i18n.全局背景}</div>

        <!-- 第三方主题提示条：低调小字，不阻断不弹窗，不改任何行为 -->
        {#if isThirdPartyTheme}
            <div class="rs-bg-note" role="note">{plugin.i18n.第三方主题背景提示}</div>
        {/if}

        <!-- 明暗分库 chip：切换只改下方读写指向（编辑镜头），不触发任何应用动作 -->
        <div class="rs-bg-mode-seg" role="radiogroup" aria-label={plugin.i18n.背景应用到外观}>
            <button
                class="rs-bg-mode-btn"
                class:rs-bg-mode-btn--on={bgMode === "light"}
                role="radio"
                aria-checked={bgMode === "light"}
                onclick={() => setBgMode("light")}
            >{plugin.i18n.背景亮色}</button>
            <button
                class="rs-bg-mode-btn"
                class:rs-bg-mode-btn--on={bgMode === "dark"}
                role="radio"
                aria-checked={bgMode === "dark"}
                onclick={() => setBgMode("dark")}
            >{plugin.i18n.背景暗色}</button>
        </div>

        <!-- 纹理浓淡：oninput 实时预览 + onchange 落盘；当前模式选 none/custom 时无纹样可调，整行隐藏 -->
        {#if modeBg !== "none" && modeBg !== "custom"}
            <div class="rs-bg-strength">
                <span class="rs-setting-label b3-tooltips b3-tooltips__n" aria-label={plugin.i18n.纹理浓淡说明}>{plugin.i18n.纹理浓淡}</span>
                <input
                    class="rs-bg-strength-range"
                    type="range"
                    min="0" max="100" step="1"
                    value={modeStrength}
                    oninput={(e) => onBgStrength(e, false)}
                    onchange={(e) => onBgStrength(e, true)}
                    aria-label={plugin.i18n.纹理浓淡}
                    aria-valuetext={`${modeStrength}%`}
                />
                <span class="rs-bg-strength-val">{modeStrength}%</span>
            </div>
        {/if}

        <!-- 货架本体：结构同 □18，选中态比较目标=当前编辑镜头所指库的值 -->
        <div class="rs-skin-shelf" role="radiogroup" aria-label={plugin.i18n.全局背景}>
            {#each bgs as bg}
                <button
                    class="rs-skin b3-tooltips b3-tooltips__n"
                    class:rs-skin--selected={modeBg === bg.slug}
                    class:rs-skin--locked={bg.locked}
                    style="--skin: {bg.color}"
                    role="radio"
                    aria-checked={modeBg === bg.slug}
                    aria-disabled={bg.locked}
                    aria-label={bg.locked ? plugin.i18n.背景Pro提示 : bg.name}
                    onclick={() => pickBg(bg.slug)}
                >
                    <span class="rs-skin-mock rs-bg-mock rs-bg-{bg.slug}" aria-hidden="true">
                        {#if bg.slug === "custom"}<svg class="rs-bg-custom-ic" aria-hidden="true"><use xlink:href="#iconImage"></use></svg>{/if}
                    </span>
                    <span class="rs-skin-name">{bg.name}</span>
                    {#if bg.locked}
                        <span class="rs-skin-pro">Pro</span>
                        <svg class="rs-skin-lock" aria-hidden="true"><use xlink:href="#iconLock"></use></svg>
                    {:else if modeBg === bg.slug}
                        <svg class="rs-skin-check" aria-hidden="true"><use xlink:href="#iconCheck"></use></svg>
                    {/if}
                </button>
            {/each}
        </div>
    </div>
    <!-- custom 背景文件选择（隐藏，pickBg('custom') 触发 click）；display:none 不进 DOM 布局 -->
    <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        bind:this={bgFileEl}
        onchange={onPickBgFile}
        style="display:none"
    />

    <!-- 皮肤主题货架：默认主题永久免费，其余 Pro（未激活锁死盖角标，点击弹激活引导）；已激活全解锁 -->
    <div class="rs-skins">
        <div class="rs-skins-title">{plugin.i18n.皮肤主题}</div>
        <div class="rs-skin-shelf" role="radiogroup" aria-label={plugin.i18n.皮肤主题}>
            {#each skins as skin}
                <button
                    class="rs-skin b3-tooltips b3-tooltips__n"
                    class:rs-skin--selected={selectedSkin === skin.slug}
                    class:rs-skin--locked={skin.locked}
                    style="--skin: {skin.color}"
                    role="radio"
                    aria-checked={selectedSkin === skin.slug}
                    aria-disabled={skin.locked}
                    aria-label={skin.locked ? plugin.i18n.皮肤Pro提示 : skin.name}
                    onclick={() => pickSkin(skin.slug)}
                >
                    <span class="rs-skin-mock" aria-hidden="true">
                        <span class="rs-skin-bar"></span>
                        <span class="rs-skin-blocks"><i></i><i></i></span>
                    </span>
                    <span class="rs-skin-name">{skin.name}</span>
                    {#if skin.locked}
                        <span class="rs-skin-pro">Pro</span>
                        <svg class="rs-skin-lock" aria-hidden="true"><use xlink:href="#iconLock"></use></svg>
                    {:else if selectedSkin === skin.slug}
                        <svg class="rs-skin-check" aria-hidden="true"><use xlink:href="#iconCheck"></use></svg>
                    {/if}
                </button>
            {/each}
        </div>
    </div>

    <!-- 浮条样式货架：默认款永久免费，墨玉轻雾/宣纸为 Pro（锁定+引导同皮肤货架） -->
    <div class="rs-skins">
        <div class="rs-skins-title">{plugin.i18n.浮条样式}</div>
        <div class="rs-skin-shelf" role="radiogroup" aria-label={plugin.i18n.浮条样式}>
            {#each fbSkins as skin}
                <button
                    class="rs-skin b3-tooltips b3-tooltips__n"
                    class:rs-skin--selected={selectedFbSkin === skin.slug}
                    class:rs-skin--locked={skin.locked}
                    style="--skin: {skin.color}; --fb-mock-bg: {skin.mockBg || 'var(--b3-theme-surface)'}"
                    data-fbskin={skin.slug}
                    role="radio"
                    aria-checked={selectedFbSkin === skin.slug}
                    aria-disabled={skin.locked}
                    aria-label={skin.locked ? plugin.i18n.浮条Pro提示 : skin.name}
                    onclick={() => pickFbSkin(skin.slug)}
                >
                    <span class="rs-skin-mock rs-fb-mock" aria-hidden="true">
                        <span class="rs-fb-title"></span>
                        <span class="rs-fb-btns"><i class="rs-fb-main"></i><i class="rs-fb-ghost"></i></span>
                    </span>
                    <span class="rs-skin-name">{skin.name}</span>
                    {#if skin.locked}
                        <span class="rs-skin-pro">Pro</span>
                        <svg class="rs-skin-lock" aria-hidden="true"><use xlink:href="#iconLock"></use></svg>
                    {:else if selectedFbSkin === skin.slug}
                        <svg class="rs-skin-check" aria-hidden="true"><use xlink:href="#iconCheck"></use></svg>
                    {/if}
                </button>
            {/each}
        </div>
    </div>

    <!-- □3：页脚三按钮（使用说明/更新日志/开源仓库）与 dev-row 取消激活收编进 header
         帮助菜单；仿写保存语义=即时生效，无 footer，仅留一行说明收底 -->
    <div class="rs-instant-note">{plugin.i18n.改动即时生效}</div>
</div>

<style>
    .recite-settings {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 8px 16px 16px;
    }

    /* 顶栏图标开关行：label 左 + b3-switch 右（思源原生开关样式），与货架同宽呼吸 */
    .rs-setting-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 4px 2px;
    }
    .rs-setting-label {
        font-size: 13px;
        color: var(--b3-theme-on-surface);
        cursor: pointer;
    }

    /* 快捷键节（□33）：行=行名左 + 键帽右（HotkeyCap 自带监听态芯片/提示行样式，IndexConf.css） */
    .rs-hks {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin: 4px 0 2px;
    }
    .rs-hk-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 2px 2px;
    }
    .rs-hk-label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        color: var(--b3-theme-on-surface);
    }
    /* 行首 sprite 图标（□4 emoji 退役）：id 单源 RECITE_HOTKEYS，色随文字 */
    .rs-hk-ic {
        width: 14px;
        height: 14px;
        flex: none;
        opacity: 0.78;
    }

    /* 判官语气分段三选：贴 b3 按钮语汇的 segmented control，选中档 primary 实心（□4 色板
       收敛方案一——原 --recite-accent 系会随运行时皮肤漂移，字重 500 对齐 tomato-chip 先例） */
    .rs-tone-seg {
        display: flex;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        overflow: hidden;
    }
    .rs-tone-btn {
        padding: 4px 10px;
        border: none;
        border-right: 1px solid var(--b3-border-color);
        background: transparent;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        cursor: pointer;
    }
    .rs-tone-btn:last-child {
        border-right: none;
    }
    .rs-tone-btn:hover:not(.rs-tone-btn--on) {
        color: var(--b3-theme-primary);
    }
    .rs-tone-btn--on {
        background: var(--b3-theme-primary);
        color: var(--b3-theme-on-primary);
        font-weight: 500;
    }

    /* 皮肤货架：5 张 96×64 mini 样机卡，窄面板自动换行 */
    .rs-skins {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .rs-skins-title {
        font-size: 13px;
        /* □5 打磨（vision P1-1）：补 600 字重对齐战役拍板的分区标题层级
           （header 15px/600 > 分区 13px/600 > 组小标题 12px/600），否则与
           13px/400 的行标签塌平拉不开 */
        font-weight: 600;
        color: var(--b3-theme-on-surface);
    }
    .rs-skin-shelf {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
    }
    .rs-skin {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 6px;
        width: 96px;
        padding: 6px;
        border: 1.5px solid var(--b3-border-color);
        border-radius: 8px;
        background: var(--b3-theme-background);
        cursor: pointer;
    }
    .rs-skin:hover:not(:disabled) {
        border-color: var(--skin);
    }
    .rs-skin--selected {
        border-color: var(--skin);
        box-shadow: 0 0 0 1px var(--skin);
    }
    .rs-skin--locked {
        cursor: not-allowed;
    }
    .rs-skin--locked .rs-skin-mock {
        opacity: 0.45;
        filter: saturate(0.75);
    }
    .rs-skin--locked .rs-skin-name {
        opacity: 0.55;
    }

    /* mini 样机：3px 主题色横条 + 两个迷你圆角块（纯 CSS，无图片） */
    .rs-skin-mock {
        display: flex;
        flex-direction: column;
        gap: 5px;
        height: 64px;
        box-sizing: border-box;
        padding: 7px;
        border-radius: 6px;
        background: var(--b3-theme-surface);
    }

    /* 背景库样机：底色=各款 body 色 (--skin)，纹样用 CSS 渐变示意各自材质（斜杠=无、
       横线=纤维、方格=网格、对角斑=牛皮；custom 灰蓝底+iconImage 小图示意自定义图片） */
    .rs-bg-mock {
        align-items: center;
        justify-content: center;
        background: var(--skin);
    }
    .rs-bg-custom-ic {
        width: 18px;
        height: 18px;
        color: var(--b3-theme-on-surface);
        opacity: 0.55;
    }
    .rs-bg-none {
        background-image: repeating-linear-gradient(135deg, transparent 0 8px, rgba(130, 130, 130, 0.3) 8px 10px);
    }
    .rs-bg-rough {
        background-image: repeating-linear-gradient(135deg, rgba(80, 56, 26, 0.1) 0 4px, transparent 4px 9px);
    }
    .rs-bg-texture {
        background-image: repeating-linear-gradient(180deg, rgba(74, 80, 58, 0.3) 0 2px, transparent 2px 7px);
    }
    .rs-bg-grid {
        background-image:
            repeating-linear-gradient(to right, rgba(96, 118, 104, 0.4) 0 1px, transparent 1px 9px),
            repeating-linear-gradient(to bottom, rgba(96, 118, 104, 0.4) 0 1px, transparent 1px 9px);
    }
    .rs-bg-custom {
        background-image: linear-gradient(45deg, rgba(255, 255, 255, 0.22) 25%, transparent 25% 75%, rgba(255, 255, 255, 0.22) 75%);
    }

    /* ---- □19 背景库二波：提示条 / 明暗分库 chip / 纹理浓淡滑块 / 护眼样机 ---- */
    /* 第三方主题提示条：小字弱行 + primary 细左边，不打断主流程（□4 次级文字统一
       on-surface-light 单档，不再用 opacity 分档） */
    .rs-bg-note {
        padding: 6px 9px;
        border-inline-start: 2px solid var(--b3-theme-primary);
        border-radius: 4px;
        background: color-mix(in srgb, var(--b3-theme-primary) 8%, transparent);
        font-size: 12px;
        line-height: 1.5;
        color: var(--b3-theme-on-surface-light, var(--b3-theme-on-surface));
    }

    /* 亮/暗分库 chip：克隆判官语气分段控件语汇，宽自适应、窄面板不撑破 */
    .rs-bg-mode-seg {
        display: inline-flex;
        align-self: flex-start;
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        overflow: hidden;
    }
    .rs-bg-mode-btn {
        padding: 4px 16px;
        border: none;
        border-right: 1px solid var(--b3-border-color);
        background: transparent;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        cursor: pointer;
    }
    .rs-bg-mode-btn:last-child {
        border-right: none;
    }
    .rs-bg-mode-btn:hover:not(.rs-bg-mode-btn--on) {
        color: var(--b3-theme-primary);
    }
    .rs-bg-mode-btn--on {
        background: var(--b3-theme-primary);
        color: var(--b3-theme-on-primary);
        font-weight: 500;
    }

    /* 纹理浓淡行：label + native range（accent-color 一发命中主题色）+ 读数 */
    .rs-bg-strength {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 2px;
    }
    .rs-bg-strength-range {
        flex: 1 1 auto;
        min-width: 0;
        height: 16px;
        margin: 0;
        accent-color: var(--b3-theme-primary);
        cursor: pointer;
    }
    .rs-bg-strength-val {
        flex: 0 0 36px;
        font-size: 11px;
        text-align: right;
        color: var(--b3-theme-on-surface-light, var(--b3-theme-on-surface));
        font-variant-numeric: tabular-nums;
    }

    /* 护眼/羊皮纸样机（□25 对齐实际渲染）：数值锚 index.scss $recite-bg-turb eye-care/parchment 行
       （颗粒引擎 feTurbulence bf 0.45/0.35，默认 k₀=0.5 位实测 σ 0.45/0.59，bg-library §9.2/§9.4）。
       点距 4px 单点不可数=磨砂语义；强度按实际排序 eye-care(σ≈1.9) ≤ parchment(σ≈2.4) < rough(3.0)
       < texture(6.8)——样机强度一律为示意放大，但相对排序与形态须与实际一致（「最安静档」不画显眼点阵） */
    .rs-bg-eye-care {
        background-image: radial-gradient(circle, rgba(71, 114, 83, 0.04) 0 0.7px, transparent 1px);
        background-size: 4px 4px;
    }
    .rs-bg-parchment {
        background-image:
            radial-gradient(circle, rgba(122, 97, 58, 0.04) 0 0.7px, transparent 1px),
            radial-gradient(circle, rgba(122, 97, 58, 0.03) 0 1.1px, transparent 1.5px);
        background-size: 4px 4px, 6px 6px;
    }

    .rs-skin-bar {
        height: 3px;
        border-radius: 2px;
        background: var(--skin);
    }
    .rs-skin-blocks {
        display: flex;
        gap: 5px;
    }
    .rs-skin-blocks i {
        flex: 1;
        height: 26px;
        border-radius: 4px;
        background: color-mix(in srgb, var(--skin) 22%, var(--b3-theme-surface));
    }
    .rs-skin-name {
        font-size: 11px;
        text-align: center;
        color: var(--b3-theme-on-surface);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    /* 宠物形象样机（□4 真帧化）：卡面居中 48×48 真帧——图片来自 index.scss 的
       .rs-mascot-frame--<slug>（单源 Sass 帧），96×48 双帧 sprite 取左帧（睁眼态） */
    .rs-mascot-mock {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 64px;
        box-sizing: border-box;
        border-radius: 6px;
        background: var(--b3-theme-surface);
    }
    .rs-mascot-frame {
        width: 48px;
        height: 48px;
        background-repeat: no-repeat;
        background-size: 96px 48px;
        background-position: left top;
    }

    /* 浮条样机：迷你浮条——标题细线 + 主按钮（--skin）/ghost 按钮（描边），底色 --fb-mock-bg
       （墨玉恒暗/宣纸恒纸面/晨光跟随 surface）；标题线用 skin 与底色调和，深底浅底自适应 */
    .rs-fb-mock {
        justify-content: center; /* 浮条样机内容较矮，垂直居中避免贴顶留白 */
        background: var(--fb-mock-bg);
        position: relative; /* 花边示意 ::after 的定位上下文（二波 §5.7） */
    }
    .rs-fb-title {
        height: 3px;
        margin: 1px auto 0;
        width: 68%;
        border-radius: 2px;
        background: color-mix(in srgb, var(--skin) 38%, var(--fb-mock-bg));
    }
    .rs-fb-btns {
        display: flex;
        gap: 5px;
        margin-top: 5px;
    }
    .rs-fb-btns i {
        height: 22px;
        border-radius: 4px;
    }
    .rs-fb-main {
        flex: 1.4;
        background: var(--skin);
    }
    .rs-fb-ghost {
        flex: 1;
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--skin) 70%, transparent);
    }

    /* 二波花边款示意（proposals §5.7）：样机底缘一粒 4px 示意条，各款用自家花边语言画；
       dawn/ink-mist/xuan 样机维持现状不挂（基座 ::after 仅 data-fbskin 命中的款出现） */
    .rs-fb-mock::after {
        content: "";
        position: absolute;
        left: 5px;
        right: 5px;
        bottom: -4px;
        height: 4px;
        pointer-events: none;
    }
    [data-fbskin="scallop"] .rs-fb-mock::after {
        background: radial-gradient(circle 2px at 2px 0, var(--fb-mock-bg) 92%, transparent) -2px 0 / 4px 4px repeat-x;
    }
    [data-fbskin="fret"] .rs-fb-mock::after {
        border-bottom: 2px dotted rgba(100, 125, 114, 0.80);
    }
    [data-fbskin="gilded"] .rs-fb-mock::after {
        box-shadow: inset 0 1.5px 0 rgba(170, 178, 224, 0.70), inset 0 -1.5px 0 rgba(170, 178, 224, 0.45);
        border-radius: 2px;
    }
    [data-fbskin="bamboo"] .rs-fb-mock::after {
        background: repeating-linear-gradient(90deg, rgba(96, 116, 74, 0.35) 0 1px, transparent 1px 7px);
    }
    [data-fbskin="vermilion"] .rs-fb-mock::after {
        border: 1px solid rgba(200, 84, 62, 0.60);
        outline: 1px solid rgba(200, 84, 62, 0.35);
        outline-offset: -3px;
        border-radius: 2px;
    }

    /* 选中 ✓（右上角）/ Pro 锁标 */
    .rs-skin-check,
    .rs-skin-lock {
        position: absolute;
        top: -7px;
        right: -6px;
        width: 17px;
        height: 17px;
        border-radius: 50%;
        fill: #fff;
    }
    .rs-skin-check {
        background: var(--skin);
        padding: 2.5px;
        box-sizing: border-box;
    }
    .rs-skin-lock {
        padding: 4px;
        box-sizing: border-box;
        background: var(--b3-theme-on-surface);
        opacity: 0.85;
    }
    .rs-skin-pro {
        position: absolute;
        bottom: 28px;
        left: 6px;
        padding: 0 4px;
        border-radius: 4px;
        /* □5 打磨（vision P2-2）：原 var(--recite-accent-strong) 跟皮肤色漂移，
           违反 □4「面板 chrome 不引用 --recite-*」拍板；换渐进 locked 角标
           同款中性色（.prog-skin-card.locked .skin-tag 对齐） */
        background: var(--b3-theme-on-surface);
        opacity: 0.75;
        color: #fff;
        font-size: 9px;
        line-height: 14px;
        font-weight: 600;
        letter-spacing: 0.4px;
    }

    /* □3 统一 header：主体样式走 IndexConf.css 的 tomato-header* 类（recite 根挂
       tomato-settings-dialog 已引入），此处仅页签语境微调 */
    .rs-header {
        margin-top: 2px;
    }

    /* 搜索框横距：根容器自带 padding 8px 16px，抵消 IndexConf.css 共享规则给
       Dialog 型面板的 12px 横距（vision P1-1 节奏统一——仿写侧 16px 由根 padding 提供） */
    .recite-settings :global(.settingBox.search-bar) {
        margin: 10px 0 0;
    }

    /* 即时生效说明行（□3 footer 替代）：仿写无保存钮，一行弱字收底（□4 次级文字统一档） */
    .rs-instant-note {
        margin-top: 6px;
        font-size: 12px;
        text-align: center;
        color: var(--b3-theme-on-surface-light, var(--b3-theme-on-surface));
    }
</style>
