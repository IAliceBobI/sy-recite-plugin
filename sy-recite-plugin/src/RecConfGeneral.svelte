<script lang="ts">
    // recite 设置页域组件（2026-09-03 双栏改造）：自 Settings.svelte 整块搬运，卡片内部一行不动；
    // 壳（Settings.svelte）负责导航双栏/单域渲染/搜索聚合，本组件=「通用」域的卡片（顶栏入口开关）。
    // 区块挂 settingBox 类：searchSettings 深收按 .conf-group 内 .settingBox 粒度过滤（壳聚合视图）。
    // vision P1 补节标题（2026-09-03 双栏评审）：其余三域首卡均带小节标题，通用域光秃两行卡
    // 观感缺头——两行包进「顶栏入口」节卡（对齐 rs-skins 节形态，搜索粒度=整节）。
    import { STORAGE_SETTINGS } from "../../sy-tomato-plugin/src/constants";

    interface Props {
        plugin: any;
    }
    let { plugin }: Props = $props();

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
</script>

<!-- 顶栏按钮开关（笔图标默认开，齿轮设置按钮默认关）：切换即时生效（动态 addTopBar / 元素 remove） -->
<div class="rs-skins settingBox">
    <div class="rs-skins-title">{plugin.i18n.顶栏入口}</div>
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
</div>

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

    .rs-skins {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .rs-skins-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
    }
</style>
