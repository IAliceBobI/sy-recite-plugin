<script lang="ts">
    // recite 设置页域组件（2026-09-03 双栏改造）：自 Settings.svelte 整块搬运，卡片内部一行不动；
    // 壳（Settings.svelte）负责导航双栏/单域渲染/搜索聚合，本组件=「练习」域的卡片（仿写练习
    // 本体功能：写作现场视觉参数、题目标题级别、判官语气、判卷小宠物与形象货架）。
    // 区块挂 settingBox 类：searchSettings 深收按 .conf-group 内 .settingBox 粒度过滤（壳聚合视图）。
    import { openUnlockDialog } from "../../sy-tomato-plugin/src/unlockDialog";
    import { STORAGE_SETTINGS } from "../../sy-tomato-plugin/src/constants";
    import { devProPreview } from "../../sy-tomato-plugin/src/libs/devProPreview";
    import {
        WZ_GLOW_DEFAULT, applyWzVisuals, clampWzGlow,
    } from "./theme";
    import { RECITE_MASCOTS, DEFAULT_MASCOT_SLUG, applyReciteMascot, applyMascotEnabled } from "./mascot";
    import { GRADER_TONES, DEFAULT_TONE_SLUG } from "./promptCopy";
    import { noteHeadingLevel } from "./extract";

    interface Props {
        plugin: any;
        /** 激活态（壳持有并绑 UpgradeBar；宠物货架锁随它） */
        codeValid: boolean;
    }
    let { plugin, codeValid }: Props = $props();

    // 题目标题级别（2026-09-01 用户需求「二级标题还是很巨大」）：抽取/对比文档每题标题块
    // 用第几级标题渲染，H1~H6 可选，出厂默认 H6（小号贴近正文行高，仍享大纲/折叠）；即选即存
    // （select 表单值是字符串，noteHeadingLevel 统一收敛），改后点「重新写」/「对比」重建文档
    // 生效——两文档都是单例删建语义，点一次即按新级别重建，存量文档不动。
    // svelte-ignore state_referenced_locally
    let noteLevel = $state<number>(noteHeadingLevel(plugin.settingCfg));
    function onNoteLevel(e: Event) {
        noteLevel = noteHeadingLevel({ noteHeadingLevel: (e.currentTarget as HTMLSelectElement).value });
        plugin.settingCfg.noteHeadingLevel = noteLevel;
        plugin.saveData(STORAGE_SETTINGS, plugin.settingCfg);
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

    // 写作现场（2026-09-01 用户需求「竖线像中括号可选不要 + 浓度给滑块带恢复默认」）：
    // 竖线开关默认开（缺省判 `!== false` 同顶栏笔图标），关 = applyWzVisuals 挂
    // data-recite-wz-norule（写区/你的句竖线一起退场）；写位底色浓度默认 100=出厂
    // （=v1.2.0 恒显浅底原值），oninput 实时预览（body inline 变量）onchange 落盘，
    // 行尾「恢复默认」回 100。
    // svelte-ignore state_referenced_locally
    let wzRuleOn = $state(plugin.settingCfg?.wzRuleOn !== false);
    // svelte-ignore state_referenced_locally
    let wzGlow = $state<number>(clampWzGlow(plugin.settingCfg?.wzGlow));
    function onToggleWzRule(e: Event) {
        wzRuleOn = (e.currentTarget as HTMLInputElement).checked;
        plugin.settingCfg.wzRuleOn = wzRuleOn;
        plugin.saveData(STORAGE_SETTINGS, plugin.settingCfg);
        applyWzVisuals(plugin.settingCfg);
    }
    function onWzGlow(e: Event, persist: boolean) {
        wzGlow = clampWzGlow((e.currentTarget as HTMLInputElement).value);
        // 预览只写变量（settingCfg 可能还没这个键，applyWzVisuals 会读回旧值）
        document.body.style.setProperty("--recite-glow-k", String(wzGlow / 100));
        if (persist) {
            plugin.settingCfg.wzGlow = wzGlow;
            plugin.saveData(STORAGE_SETTINGS, plugin.settingCfg);
            applyWzVisuals(plugin.settingCfg); // 权威值覆盖预览（与 onBgStrength 收口模式对齐）
        }
    }
    function resetWzGlow() {
        wzGlow = WZ_GLOW_DEFAULT;
        plugin.settingCfg.wzGlow = WZ_GLOW_DEFAULT;
        plugin.saveData(STORAGE_SETTINGS, plugin.settingCfg);
        applyWzVisuals(plugin.settingCfg);
    }

    // 判卷小宠物出场开关（2026-08-26 □12，默认开）：关 = body 挂 off 属性 CSS 关显示，
    // 判卷流程的 setRecitePose 照常跑只是不渲染，重开即时生效。缺省判 `!== false` 同顶栏笔图标。
    // □5「无」档联动：开关与货架「无」卡是同一状态（reciteMascotOn）两入口——关=货架选中
    // 落「无」卡，开=回 settingCfg.reciteMascot 记忆形象（形象键从不动，见 pickMascot）
    // svelte-ignore state_referenced_locally
    let mascotOn = $state(plugin.settingCfg?.reciteMascotOn !== false);
    function onToggleMascot(e: Event) {
        mascotOn = (e.currentTarget as HTMLInputElement).checked;
        plugin.settingCfg.reciteMascotOn = mascotOn;
        plugin.saveData(STORAGE_SETTINGS, plugin.settingCfg);
        applyMascotEnabled(mascotOn);
        selectedMascot = mascotOn
            ? (plugin.settingCfg.reciteMascot || DEFAULT_MASCOT_SLUG)
            : "none";
    }

    // 宠物形象货架（与皮肤货架同款机制）：豆豆免费默认 / 精灵小盼 Pro（未激活锁死盖角标）。
    // 选择落 settingCfg.reciteMascot + 立即挂 body[data-recite-mascot]（Pro 形象另有 unpaid
    // CSS 门禁——此处只管属性，锁是双保险的功能层）。初值：出场开关关=「无」卡选中（off 态
    // 的货架表达），形象键不因关而被改写
    const mascots = $derived(RECITE_MASCOTS.map(m => ({
        ...m,
        name: (plugin.i18n as any)[m.i18nKey] ?? m.i18nKey.split("·")[1],
        locked: !codeValid && m.pro,
    })));
    // svelte-ignore state_referenced_locally
    let selectedMascot = $state<string>(mascotOn
        ? (plugin.settingCfg?.reciteMascot || DEFAULT_MASCOT_SLUG)
        : "none");

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
        if (slug === "none") { // 「无」档：只落出场开关键（形象键留着=记忆，重开即回）
            selectedMascot = "none";
            mascotOn = false;
            plugin.settingCfg.reciteMascotOn = false;
            plugin.saveData(STORAGE_SETTINGS, plugin.settingCfg);
            applyMascotEnabled(false);
            return;
        }
        const m = mascots.find(x => x.slug === slug);
        if (!m) return;
        if (m.locked) {
            openUnlock();
            return;
        }
        selectedMascot = slug;
        mascotOn = true; // 重选形象=出场开关自动回开（曾选无/开关关过则 off 在挂，需摘）
        plugin.settingCfg.reciteMascot = slug;
        plugin.settingCfg.reciteMascotOn = true;
        plugin.saveData(STORAGE_SETTINGS, plugin.settingCfg);
        applyReciteMascot(slug);
        applyMascotEnabled(true);
    }
</script>

<!-- 写作现场（2026-09-01 用户需求）：仿写练习时写字现场的视觉参数——竖线开关（默认开，
     关=写区/你的句竖线退场）+ 写位底色浓度滑块（100=出厂，0=无底色，行尾恢复默认） -->
<div class="rs-skins settingBox">
    <div class="rs-skins-title">{plugin.i18n.写作现场}</div>
    <div class="rs-setting-row">
        <label class="rs-setting-label b3-tooltips b3-tooltips__n" for="recite-wz-rule-switch" aria-label={plugin.i18n.写作竖线说明}>{plugin.i18n.写作竖线}</label>
        <input
            id="recite-wz-rule-switch"
            type="checkbox"
            class="b3-switch"
            checked={wzRuleOn}
            onchange={onToggleWzRule}
        />
    </div>
    <div class="rs-bg-strength">
        <span class="rs-setting-label b3-tooltips b3-tooltips__n" aria-label={plugin.i18n.写位底色浓度说明}>{plugin.i18n.写位底色浓度}</span>
        <input
            class="rs-bg-strength-range"
            type="range"
            min="0" max="100" step="1"
            value={wzGlow}
            oninput={(e) => onWzGlow(e, false)}
            onchange={(e) => onWzGlow(e, true)}
            aria-label={plugin.i18n.写位底色浓度}
            aria-valuetext={`${wzGlow}%`}
        />
        <span class="rs-bg-strength-val">{wzGlow}%</span>
        <button class="rs-reset-btn" onclick={resetWzGlow}>{plugin.i18n.恢复默认}</button>
    </div>
</div>

<!-- 题目标题级别（2026-09-01 用户需求「二级还是很巨大」）：抽取/对比文档每题标题块的渲染
     级别 H1~H6（出厂默认 H6 小号），改后重新抽取/点对比刷新生效（单例删建语义） -->
<div class="rs-setting-row settingBox">
    <label class="rs-setting-label b3-tooltips b3-tooltips__n" for="recite-note-level" aria-label={plugin.i18n.题目标题级别说明}>{plugin.i18n.题目标题级别}</label>
    <select
        id="recite-note-level"
        class="b3-select"
        style="width:auto; min-width:72px"
        value={noteLevel}
        onchange={onNoteLevel}
    >
        {#each [1, 2, 3, 4, 5, 6] as lv}
            <option value={lv}>H{lv}</option>
        {/each}
    </select>
</div>

<!-- 判官语气三选（分段控件）：AI 判卷的点评口吻，云端判卷与复制提示词两通道同步生效 -->
<div class="rs-setting-row settingBox">
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
<div class="rs-setting-row settingBox">
    <label class="rs-setting-label" for="recite-mascot-switch">{plugin.i18n.判卷小宠物}</label>
    <input
        id="recite-mascot-switch"
        type="checkbox"
        class="b3-switch"
        checked={mascotOn}
        onchange={onToggleMascot}
    />
</div>

<!-- 宠物形象货架（□5 加「无」档排头）：无/豆豆/雪团免费默认 / 其余 Pro（未激活锁死盖角标，
     点击弹激活引导）。「无」=出场开关同一状态的货架入口（选中即挂 off 不渲染宠物，与
     「判卷小宠物」开关联动）。形象卡面直接展示判卷出场的真帧（idle 睁眼帧，index.scss
     .rs-mascot-frame--* 单源）；「无」卡斜杠纹占位（.rs-bg-none 同款斜杠语言）。
     --skin 借 primary 而非各形象主题色（vision P1-1：无 --skin 时选中✓ 白勾裸奔+边框
     回退黑色；且与其他货架「皮肤色=商品色」不同，宠物无商品主色，统一走 b3） -->
<div class="rs-skins settingBox">
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
                    {#if m.slug === "none"}
                        <span class="rs-mascot-none"></span>
                    {:else}
                        <span class="rs-mascot-frame rs-mascot-frame--{m.slug}"></span>
                    {/if}
                </span>
                <span class="rs-skin-name">{m.name}</span>
                {#if m.locked || (m.pro && $devProPreview)}
                    <span class="rs-skin-pro">Pro</span>
                    {#if m.locked}
                        <svg class="rs-skin-lock" aria-hidden="true"><use xlink:href="#iconLock"></use></svg>
                    {/if}
                {:else if selectedMascot === m.slug}
                    <svg class="rs-skin-check" aria-hidden="true"><use xlink:href="#iconCheck"></use></svg>
                {/if}
            </button>
        {/each}
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
    .rs-skin-name {
        font-size: 11px;
        text-align: center;
        color: var(--b3-theme-on-surface);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    /* 纹理浓淡行：label + native range（accent-color 一发命中主题色）+ 读数（写位底色浓度同款） */
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

    /* 「无」档样机（□5）：斜杠纹占位块——与背景库 .rs-bg-none 同款斜杠语言（135° 灰纹），
       尺寸对齐真帧 48×48；圆角 4px 走 mock 内层块惯例（.rs-skin-blocks i / .rs-fb-btns i） */
    .rs-mascot-none {
        width: 48px;
        height: 48px;
        box-sizing: border-box;
        border-radius: 4px;
        background: repeating-linear-gradient(135deg, transparent 0 8px, rgba(130, 130, 130, 0.3) 8px 10px);
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
