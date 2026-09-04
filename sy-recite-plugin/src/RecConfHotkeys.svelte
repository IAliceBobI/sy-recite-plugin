<script lang="ts">
    // recite 设置页域组件（2026-09-03 双栏改造）：自 Settings.svelte 整块搬运，卡片内部一行不动；
    // 壳（Settings.svelte）负责导航双栏/单域渲染/搜索聚合，本组件=「快捷键」域的卡片。
    // 区块挂 settingBox 类：searchSettings 深收按 .conf-group 内 .settingBox 粒度过滤（壳聚合视图）。
    import HotkeyCap from "../../sy-tomato-plugin/src/HotkeyCap.svelte";
    import { RECITE_HOTKEYS } from "./constants";

    interface Props {
        plugin: any;
    }
    let { plugin }: Props = $props();

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
</script>

<!-- 快捷键（□33）：五命令键帽，点击进入监听态按下新组合即免 reload 写回内核 keymap；
     Esc 取消 / Backspace 删除 / 🎲 随机 / ↩ 恢复默认由共享组件自带（键帽内字符是功能输入
     符号非装饰，保留）；行首图标走 sprite（□4 emoji 退役，icon id 单源 RECITE_HOTKEYS） -->
<div class="rs-hks settingBox">
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

<style>
    .rs-skins-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--b3-theme-on-surface);
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
</style>
