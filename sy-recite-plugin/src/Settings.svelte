<script lang="ts">
    // recite 设置面板（2026-08 商业化，视觉批 2026-08-25 焕新；□4 视觉收敛 2026-08-31）：
    // 统一 header（□3，名+版本+Pro 徽标+帮助菜单单图标钮）+ 付费状态条（□1）+ 搜索框
    // （□3 补齐，复用番茄 searchSettings），挂思源标准 Setting 页签（index.ts mount 进
    // setting.element）。
    // 2026-09-03 双栏改造（学习番茄工具箱设置页大重组终态，同日渐进已同款改造）：左 4 域导航
    // + 右侧单域渲染 / 搜索态「全部」聚合视图（域组件 RecConf*）；卡片内部自旧单栏整块搬运
    // 一行不动、设置键零迁移。样式复用 IndexConf.css 的 .tomato-settings-nav 作用域（根节点
    // 挂 .tomato-settings-dialog 启用，公共类零改动）。
    // □4 色板收敛：面板 chrome 全走 b3 变量（用户拍板方案一零品牌色），不再引用 --recite-* 运行时
    // token（旧引用会随 body[data-recite-theme] 皮肤漂移）。
    // 购买/激活/邻居解锁共享文案走 tomatoI18n（六语种，UnlockDialog 内聚）；
    // recite 特有文案走 plugin.i18n（zh_CN/en_US 起步）。
    import { Dialog } from "siyuan";
    import { mount } from "svelte";
    import { onDestroy, onMount, tick } from "svelte";
    import { newID } from "stonev5-utils";
    import UpgradeBar from "../../sy-tomato-plugin/src/UpgradeBar.svelte";
    import Help from "../../sy-tomato-plugin/src/libs/Help.svelte";
    import { openHelpMenu } from "../../sy-tomato-plugin/src/libs/helpMenu";
    import { searchSettings } from "../../sy-tomato-plugin/src/libs/ui";
    import { openChangelogDialog } from "../../sy-tomato-plugin/src/libs/changelogDialog";
    import { DestroyManager } from "../../sy-tomato-plugin/src/libs/destroyer";
    import { events } from "../../sy-tomato-plugin/src/libs/Events";
    import { STORAGE_SETTINGS } from "../../sy-tomato-plugin/src/constants";
    import changelog from "./changelog.json";
    import helpDoc from "./help.json";
    import pluginPkg from "../plugin.json";
    import RecConfPractice from "./RecConfPractice.svelte";
    import RecConfAppearance from "./RecConfAppearance.svelte";
    import RecConfHotkeys from "./RecConfHotkeys.svelte";
    import RecConfGeneral from "./RecConfGeneral.svelte";
    // 快捷键键帽共享组件（□33 三插件同源：tomato 自用 / progressive / recite 相对导入同款）。
    // 键帽样式（.kbd/.hotkey-cap/.hk-chip 等）在 IndexConf.css 且按 .tomato-settings-dialog
    // 作用域限定——根节点挂同名类启用（progressive 同款做法）；该 css 其余规则命不中 recite 模板
    // 类名，不泄漏不影响本面板既有视觉
    import "../../sy-tomato-plugin/src/IndexConf.css";

    interface Props {
        plugin: any;
    }
    let { plugin }: Props = $props();

    // 激活态初值直接取 body 门禁 class（面板只可能在 onLayoutReady 刷新门禁之后被打开，class 已
    // 就位）——已激活用户开面板不闪锁；随后 UpgradeBar onMount 自动 verify（懒缓存
    // verifyKeyRecite，与 index.ts refreshGate 同一判定源）经 bind:codeValid 回写纠正，两处一致。
    // 双栏改造后经 prop 下传练习/外观两域（货架锁随它）
    let codeValid = $state(!document.body.classList.contains("recite-unpaid"));

    // □14 激活互通（2026-08-28 拍板）＋□1 收敛（2026-08-31）：邻居检测与一键解锁整链
    // 移进统一 UnlockDialog（UpgradeBar neighbor 传入开启，弹框打开时惰性互问渐进实例），
    // 面板侧不再保留邻居行/购买拦截。

    // 完整帮助 = 飞书图文指南（2026-08-26 建，四场景示例 + 判卷全文）；私有期文档未开公开分享，
    // 未授权访问不可达——Help Dialog 本地渲染 help.json 速览兜底，链接仅作「看完整版」出口
    const FEISHU_DOC_URL = "https://my.feishu.cn/docx/FgSpdE2PmoEfJmxGYCqcurmDnCf";

    // 导航 4 域（2026-09-03 双栏改造：1:1 照搬原单栏段落，零迁移零重划；顺序按番茄
    // 「本体→招牌→工具→入口」哲学，仿写本体练习域打头）；label 惰性取值（模板每次渲染
    // 现取，勿在模块顶层快照）
    const NAV_DOMAINS: Array<{ id: string; label: () => string }> = [
        { id: "practice", label: () => plugin.i18n.练习 },
        { id: "appearance", label: () => plugin.i18n.外观 },
        { id: "hotkeys", label: () => plugin.i18n.快捷键 },
        { id: "general", label: () => plugin.i18n.通用 },
    ];
    let navActive = $state("practice");
    const NavKeyItemKey = "recite_settings_NavKeyItemKey_Km3vRtQ8wZxYc7hLsYdA2g";
    // 聚合视图：searchKey 非空=全 4 域聚合渲染，navActive 冻结待清空回位；
    // navHits=各域是否有命中卡（searchSettings 过滤后从 DOM 回读），驱动导航项高亮
    let navHits: Record<string, boolean> = $state({});
    // 输入沿聚合视图进出跳变跟踪（非响应式：只用于进/出沿触发滚顶，逐键过滤不触发）
    let searching = false;

    // □3 搜索框补齐：番茄/渐进同款（searchSettings + localStorage 记忆），过滤粒度深收
    // .conf-group 内 .settingBox（域组件区块挂 settingBox 类接入）
    let settingsDiv: HTMLElement = $state();
    let searchKey = $state("");
    const SearchKeyItemKey = "recite_settings_SearchKeyItemKey_RfrUm9VLS4GehTzg5ygRrNT";
    onDestroy(() => {
        localStorage.setItem(SearchKeyItemKey, searchKey);
        localStorage.setItem(NavKeyItemKey, navActive);
    });
    onMount(async () => {
        const savedSearchKey = localStorage.getItem(SearchKeyItemKey);
        if (savedSearchKey) {
            // 持久化搜索词非空=直接进聚合视图（onDestroy 冻存的搜索态原样恢复）
            searchKey = savedSearchKey;
            searching = true;
            await tick();
            if (settingsDiv) {
                searchSettings(settingsDiv, searchKey);
                updateNavHits();
            }
        }
        // 导航位置记忆：恢复上次分区（首开无存储落「练习」默认）。单域渲染无长滚动，
        // 纯状态切换即可
        const savedNav = localStorage.getItem(NavKeyItemKey);
        if (savedNav && NAV_DOMAINS.some((d) => d.id === savedNav)) {
            navActive = savedNav;
        }
    });

    function navGo(id: string) {
        // 搜索态点导航=退出聚合视图清搜索跳该域（「搜索全库找、浏览按域翻」的跳转出口）
        if (searchKey) {
            searchKey = "";
            navHits = {};
            searching = false;
            localStorage.setItem(SearchKeyItemKey, "");
            scrollPanelTop();
        }
        navActive = id;
        localStorage.setItem(NavKeyItemKey, id);
    }

    // 过滤完成后从 DOM 回读各域命中态（section 内有任一可见 settingBox 即命中）——
    // searchSettings 是纯 DOM 过滤不含此语义，必须在它之后取
    function updateNavHits() {
        const hits: Record<string, boolean> = {};
        settingsDiv?.querySelectorAll("section.conf-group[data-domain]").forEach((sec) => {
            const el = sec as HTMLElement;
            const id = el.dataset.domain;
            if (!id) return;
            hits[id] = [...el.querySelectorAll(".settingBox")].some(
                (b) => (b as HTMLElement).style.display !== "none",
            );
        });
        navHits = hits;
    }

    // 进/出聚合视图时面板滚回顶部（recite 挂思源标准 Setting 页签，滚动容器不是番茄/渐进
    // Dialog 的 .b3-dialog__body——向上找最近可滚祖先兜底；逐键输入不触发——用户在聚合
    // 结果里翻看时续输字符不能拽回顶部）
    function scrollPanelTop() {
        let el: HTMLElement | null = settingsDiv?.parentElement ?? null;
        while (el && el !== document.body) {
            const st = getComputedStyle(el);
            if (/(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight) {
                el.scrollTo({ top: 0 });
                return;
            }
            el = el.parentElement;
        }
    }

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
         已激活整条不渲染 -->
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
            oninput={async () => {
                localStorage.setItem(SearchKeyItemKey, searchKey);
                const entering = !!searchKey && !searching;
                const leaving = !searchKey && searching;
                searching = !!searchKey;
                // 空→非空跳变须等聚合视图挂载再过滤（同分支跳变 tick 只是空冲刷）
                await tick();
                searchSettings(settingsDiv, searchKey);
                if (searchKey) updateNavHits();
                else navHits = {};
                if (entering || leaving) scrollPanelTop();
            }}
        />
    </div>

    <!-- 双栏：左 4 域导航 + 右内容区（浏览态单域渲染 / 搜索态「全部」聚合视图）。
         data-search= searchSettings 候选跳过（容器 textContent 含全库设置文案，不跳则恒命中
         无意义）；样式挂 .tomato-settings-nav 作用域（IndexConf.css）。搜索态导航命中域
         高亮，点击即清搜索跳该域（复刻番茄/渐进终态交互） -->
    <div class="tomato-settings-nav" data-search>
        <nav class="tomato-nav-list">
            {#each NAV_DOMAINS as d (d.id)}
                <button
                    class="tomato-nav-item"
                    class:tomato-nav-item--active={navActive === d.id && !searchKey}
                    class:tomato-nav-item--hit={!!searchKey && navHits[d.id]}
                    onclick={() => navGo(d.id)}
                >{d.label()}</button>
            {/each}
        </nav>
        <div class="tomato-nav-content">
            <!-- 4 域组件渲染抽出 snippet 供浏览/聚合两分支复用；练习/外观两域吃 codeValid
                 激活态（货架锁），其余域纯 props 零状态 -->
            {#snippet domainCards(id: string)}
                {#if id === "practice"}
                    <RecConfPractice {plugin} {codeValid}></RecConfPractice>
                {:else if id === "appearance"}
                    <RecConfAppearance {plugin} {codeValid}></RecConfAppearance>
                {:else if id === "hotkeys"}
                    <RecConfHotkeys {plugin}></RecConfHotkeys>
                {:else}
                    <RecConfGeneral {plugin}></RecConfGeneral>
                {/if}
            {/snippet}
            {#if searchKey}
                <!-- 聚合视图：全 4 域同屏+域标题行做域界标，data-domain 供 updateNavHits
                     回读命中态；searchSettings 深收按域过滤、空域整节隐藏 -->
                {#each NAV_DOMAINS as d (d.id)}
                    <section class="conf-group" data-domain={d.id}>
                        <div class="tomato-agg-title">{d.label()}</div>
                        {@render domainCards(d.id)}
                    </section>
                {/each}
            {:else}
                {#each NAV_DOMAINS as d (d.id)}
                    {#if navActive === d.id}
                        <section class="conf-group" data-domain={d.id}>
                            {@render domainCards(d.id)}
                        </section>
                    {/if}
                {/each}
            {/if}
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

    /* 双栏壳语境微调（公共 .tomato-settings-nav 样式零改动，仅 recite 页签语境覆盖）：
       ① 导航列/聚合域标题的 sticky 偏移对齐本面板 sticky 搜索栏实高（页签内同款
       search-bar 结构，52px 公共值恰适用，留此注释备忘勿盲目改公共值）；
       ② settingBox 卡片内公共行距（>div 间距 12px + 5% 缩进列）与 rs-* 节自管 gap 叠加，
       rs-skins 节恢复自管节奏（title 后各行平铺，缩进列语义只属于番茄行卡语汇） */
    .recite-settings :global(.rs-skins.settingBox > div:not(:first-child)) {
        margin-left: 0;
        margin-bottom: 0;
    }

    /* 搜索命中域内小节标题（rs-skins-title）退化为纯文字色高亮（vision P1）：块级标题
       满宽，共享 .tomato-highlight 的通栏底色+inset 描边在标题上观感像输入框；行级命中
       保留原样不动 */
    .recite-settings :global(.rs-skins-title.tomato-highlight) {
        background-color: transparent;
        box-shadow: none;
    }

    /* 窄屏（≤480px，沿 settings-panel-unify 断点）：行布局防塌（vision P0×2——420px 下
       行内 label 无 flex:none 被压成逐字竖排、判官语气分段钮压成竖条）。行纵向化只施于
       双控件行（label+开关/下拉），分段与滑块行走 wrap 兜底 */
    @media (max-width: 480px) {
        .recite-settings :global(.rs-setting-row) {
            flex-direction: column;
            align-items: flex-start;
            gap: 6px;
        }
        .recite-settings :global(.rs-tone-seg) {
            flex-wrap: wrap;
        }
        .recite-settings :global(.rs-tone-btn) {
            white-space: nowrap;
        }
        .recite-settings :global(.rs-bg-strength) {
            flex-wrap: wrap;
            row-gap: 6px;
        }
        .recite-settings :global(.rs-bg-strength .rs-setting-label),
        .recite-settings :global(.rs-bg-strength-val),
        .recite-settings :global(.rs-reset-btn) {
            flex: none;
        }
        .recite-settings :global(.rs-bg-strength-range) {
            flex: 1 1 120px;
        }
    }

    /* 即时生效说明行（□3 footer 替代）：仿写无保存钮，一行弱字收底（□4 次级文字统一档） */
    .rs-instant-note {
        margin-top: 6px;
        font-size: 12px;
        text-align: center;
        color: var(--b3-theme-on-surface-light, var(--b3-theme-on-surface));
    }
</style>
