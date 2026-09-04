<script lang="ts">
    // recite 设置页域组件（2026-09-03 双栏改造）：自 Settings.svelte 整块搬运，卡片内部一行不动；
    // 壳（Settings.svelte）负责导航双栏/单域渲染/搜索聚合，本组件=「外观」域的卡片（皮肤主题
    // +花边入口、浮条样式、全局背景三货架）。
    // 区块挂 settingBox 类：searchSettings 深收按 .conf-group 内 .settingBox 粒度过滤（壳聚合视图）。
    import { openUnlockDialog } from "../../sy-tomato-plugin/src/unlockDialog";
    import { STORAGE_SETTINGS } from "../../sy-tomato-plugin/src/constants";
    import { devProPreview } from "../../sy-tomato-plugin/src/libs/devProPreview";
    import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";
    import { RECITE_SKINS, DEFAULT_SKIN_SLUG, applyReciteTheme, RECITE_BGS,
        applyBgForMode, watchAppearance, isDarkAppearance, resolveBgPair,
        BG_LIGHT_KEY, BG_DARK_KEY, BG_STRENGTH_LIGHT_KEY, BG_STRENGTH_DARK_KEY,
        BG_CUSTOM_FILE_LIGHT_KEY, BG_CUSTOM_FILE_DARK_KEY, BG_STRENGTH_DEFAULT,
        RECITE_FLOATBAR_SKINS, DEFAULT_FLOATBAR_SKIN_SLUG, applyReciteFloatbarSkin,
        LACE_MENU_KEY } from "./theme";

    interface Props {
        plugin: any;
        /** 激活态（壳持有并绑 UpgradeBar；三货架锁随它） */
        codeValid: boolean;
    }
    let { plugin, codeValid }: Props = $props();

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
    // 纹理浓淡「恢复默认」（2026-09-01）：回出厂基准 35，当前外观即时生效（另一库不动）
    function resetBgStrength() {
        const t = BG_STRENGTH_DEFAULT;
        if (bgMode === "light") bgStrengthLight = t;
        else bgStrengthDark = t;
        plugin.settingCfg[bgMode === "light" ? BG_STRENGTH_LIGHT_KEY : BG_STRENGTH_DARK_KEY] = t;
        plugin.saveData(STORAGE_SETTINGS, plugin.settingCfg);
        applyBgForMode(plugin.settingCfg);
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

    // 本块花边入口开关（2026-09-02 五款化配套）：关=右键菜单不出「本块花边」项（contextMenu
    // 构建时读 settingCfg 判），已挂花边的块照常渲染——花边都是自己加的，无全局渲染开关需求。
    // 缺省判 `!== false` 同 wzRuleOn（默认开）。
    // svelte-ignore state_referenced_locally
    let laceMenuOn = $state(plugin.settingCfg?.[LACE_MENU_KEY] !== false);
    function onToggleLaceMenu(e: Event) {
        laceMenuOn = (e.currentTarget as HTMLInputElement).checked;
        plugin.settingCfg[LACE_MENU_KEY] = laceMenuOn;
        plugin.saveData(STORAGE_SETTINGS, plugin.settingCfg);
    }
</script>

<!-- 皮肤主题货架：默认主题永久免费，其余 Pro（未激活锁死盖角标，点击弹激活引导）；已激活全解锁 -->
<div class="rs-skins settingBox">
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
                {#if skin.locked || (skin.pro && $devProPreview)}
                    <span class="rs-skin-pro">Pro</span>
                    {#if skin.locked}
                        <svg class="rs-skin-lock" aria-hidden="true"><use xlink:href="#iconLock"></use></svg>
                    {/if}
                {:else if selectedSkin === skin.slug}
                    <svg class="rs-skin-check" aria-hidden="true"><use xlink:href="#iconCheck"></use></svg>
                {/if}
            </button>
        {/each}
    </div>
    <!-- 本块花边入口开关：藏右键菜单项（默认开）；花边款式五款在右键子菜单选，不进面板 -->
    <div class="rs-setting-row">
        <label class="rs-setting-label b3-tooltips b3-tooltips__n" for="recite-lace-menu-switch" aria-label={plugin.i18n.花边入口说明}>{plugin.i18n.花边入口}</label>
        <input
            id="recite-lace-menu-switch"
            type="checkbox"
            class="b3-switch"
            checked={laceMenuOn}
            onchange={onToggleLaceMenu}
        />
    </div>
</div>

<!-- 浮条样式货架：默认款永久免费，墨玉轻雾/宣纸为 Pro（锁定+引导同皮肤货架） -->
<div class="rs-skins settingBox">
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
                {#if skin.locked || (skin.pro && $devProPreview)}
                    <span class="rs-skin-pro">Pro</span>
                    {#if skin.locked}
                        <svg class="rs-skin-lock" aria-hidden="true"><use xlink:href="#iconLock"></use></svg>
                    {/if}
                {:else if selectedFbSkin === skin.slug}
                    <svg class="rs-skin-check" aria-hidden="true"><use xlink:href="#iconCheck"></use></svg>
                {/if}
            </button>
        {/each}
    </div>
</div>

<!-- 全局背景库货架（□18+□19）：与皮肤两轴正交——无/羊皮纸/护眼免费，其余 Pro；
     亮/暗双库 chip 切编辑镜头，纹理浓淡滑块随镜头，custom 点击弹文件选择 -->
<div class="rs-skins settingBox">
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
            <button class="rs-reset-btn" onclick={resetBgStrength}>{plugin.i18n.恢复默认}</button>
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
                {#if bg.locked || (bg.pro && $devProPreview)}
                    <span class="rs-skin-pro">Pro</span>
                    {#if bg.locked}
                        <svg class="rs-skin-lock" aria-hidden="true"><use xlink:href="#iconLock"></use></svg>
                    {/if}
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

<style>
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
    /* 恢复默认小钮（浓度类滑块行尾通用）：弱化文字钮，chrome 走 b3 变量（□4 收敛口径） */
    .rs-reset-btn {
        flex: none;
        height: 22px;
        padding: 0 8px;
        border: 1px solid var(--b3-border-color);
        border-radius: 4px;
        background: transparent;
        color: var(--b3-theme-on-surface-light, var(--b3-theme-on-surface));
        font-size: 11px;
        line-height: 20px;
        cursor: pointer;
    }
    .rs-reset-btn:hover {
        border-color: var(--b3-theme-primary);
        color: var(--b3-theme-primary);
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
</style>
