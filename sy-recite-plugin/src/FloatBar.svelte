<script lang="ts">
    import type { Plugin } from "siyuan";
    import { getFrontend } from "siyuan";
    import { onMount } from "svelte";
    import { reciteDoc, cleanPractice } from "./statusBtn";
    import { doExtract, rewriteExtract } from "./extract";
    import { doCompare } from "./compare";
    import { copyPrompt } from "./promptCopy";
    import { aiGrade } from "./aiGrade";
    import { startAISplit, aiSplit } from "./aiSplit";
    import type { AISplitMode } from "./aiSplit";
    import { openDiffCheck } from "./diffCheck";
    import { FLOATBAR_POS_KEY } from "./constants";
    import { reciteIcon } from "./reciteIcons";
    import { siyuan } from "../../sy-tomato-plugin/src/libs/utils";

    let { plugin }: { plugin: Plugin } = $props();

    // 移动端分叉判定（2026-08-27 顶栏形态改造，方案 docs/research/recite-mobile-topbar/proposals.md）：
    // 顶层求一次，app 会话内不变。别 import tomato events 单例判分叉——progressive 2026-08-25
    // 实测坑（多引入 tomato 内部模块扰动 bundle 模块序致移动端浮条不渲染）；官方 getFrontend 无此问题。
    const isMobile = getFrontend() === "mobile" || getFrontend() === "browser-mobile";

    const TOPBAR_H = 44;

    // —— 移动端顶栏定位：钉思源 toolbar 下沿（实测 rect.bottom，真机 safe-area/横竖屏会变，
    //    不硬编码）；渐进顶栏（.prog-topbar）在场则顺延一个身位——渐进「送进仿写」会给分片
    //    文档挂仿写标记，双顶栏同屏是真实场景。渐进顶栏随分片文档动态挂卸，mount 查一次
    //    不够 → 400ms 轮询兜底（measure 内有变更守卫，空转开销仅两次 querySelector）。
    let barTop = $state(0);
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    function measure() {
        const base = Math.round(document.querySelector(".toolbar")?.getBoundingClientRect().bottom ?? 0);
        const next = base + (document.querySelector(".prog-topbar") ? TOPBAR_H : 0);
        if (next !== barTop) barTop = next;
    }
    onMount(() => {
        if (!isMobile) return;
        measure();
        window.addEventListener("resize", measure);
        pollTimer = setInterval(measure, 400);
        return () => {
            window.removeEventListener("resize", measure);
            clearInterval(pollTimer);
        };
    });

    // —— ✕ 收起（渐进先例，两形态一套语义）：记 dismissedDocID 复用 --idle 隐藏机制；切文档
    //    即唤回（docID 一变就清——含切回被关的文档，与渐进切文档 show.set(true) 语义对齐）；
    //    纯会话态不落盘，刷新即复位。
    let dismissedDocID = $state("");
    let lastDocID = "";
    $effect(() => {
        if ($reciteDoc.docID !== lastDocID) {
            dismissedDocID = "";
            lastDocID = $reciteDoc.docID;
        }
    });
    const hidden = $derived(!$reciteDoc.role || dismissedDocID === $reciteDoc.docID);
    function dismiss(e: Event) {
        e.stopPropagation();
        dismissedDocID = $reciteDoc.docID;
    }

    // body 类驱动 #editor 顶开（index.scss 让位双规则）：顶栏实际可见才挂，✕ 收起/无角色后
    // 编辑区顶开同步回落
    $effect(() => {
        if (!isMobile) return;
        document.body.classList.toggle("recite-topbar-on", !hidden);
        return () => document.body.classList.remove("recite-topbar-on");
    });

    // □13 一键加卡：当前产物文档整体进快速卡组（与渐进摘抄卡同组混排复习；官方路径需
    // 文档属性面板三四步，这里一键）。addRiffCards 对已在卡组的块幂等，重复点无副作用。
    // siyuan.call 吞错返回 null 不抛异常（review P1-1），须查返回值防假成功 toast
    async function addToCards() {
        const ret = await siyuan.addRiffCards([$reciteDoc.docID]);
        if (!ret) {
            await siyuan.pushMsg(plugin.i18n["加闪卡失败"] || "加入闪卡失败，请重试", 2500);
            return;
        }
        await siyuan.pushMsg(plugin.i18n["已加入闪卡"] || "已加入闪卡（快速卡组），可在闪卡复习中查看", 2500);
    }

    // AI 判卷进行态：图标自旋 + 禁点（aiGrade 内另有 running 双保险）
    let grading = $state(false);
    async function runGrade() {
        if (grading) return;
        grading = true;
        try {
            await aiGrade(plugin, $reciteDoc.docID);
        } finally {
            grading = false;
        }
    }

    // AI 拆分进行态（同款 busy 语义）：startAISplit 管首点引导 + 三选菜单，菜单项回调 runSplit
    // （busy 态留在组件，aiSplit 内另有 running 双保险）
    let splitting = $state(false);
    async function runSplit(mode: AISplitMode) {
        if (splitting) return;
        splitting = true;
        try {
            await aiSplit(plugin, $reciteDoc.docID, mode);
        } finally {
            splitting = false;
        }
    }
    function onSplitClick(e: Event) {
        startAISplit(plugin, $reciteDoc.docID, runSplit, e.currentTarget as HTMLElement);
    }

    let x = $state(200);
    let y = $state(200);
    // 拖动动效态（2026-08-25 浮条美化）：--drag = 拖动中（.12s 缓动追手 + 微放大），--settle =
    // 释放后 .25s 收尾；两态只切类，坐标仍走内联 left/top（index.scss 态类上声明过渡，平时无
    // 过渡——localStorage 位置恢复不滑移）。300ms（> .25s）后摘 settle，防过渡中途摘类跳变。
    let dragging = $state(false);
    let settling = $state(false);
    let settleTimer: ReturnType<typeof setTimeout>;

    let bar: HTMLElement = $state();

    // 位置存 localStorage（spec：可拖、位置存 localStorage，不走 tomato 配置）。
    // 读位置必须在组件初始化（非 $effect）里做：effect 里调 clamp 会让依赖集含 x/y，
    // 之后拖拽每次写 x/y 都重放 localStorage 旧值把条打回原地、越界还原还会振荡到
    // effect_update_depth_exceeded（review P0-1，svelte 5.57 复现实锤）
    try {
        const pos = JSON.parse(localStorage.getItem(FLOATBAR_POS_KEY) ?? "null");
        if (pos?.x != null && pos?.y != null) {
            x = pos.x;
            y = pos.y;
        }
    } catch { /* 坏数据忽略 */ }

    function clamp() {
        // 量实测尺寸（compare 态两行 ~90px 只是估值的下限；拖拽早期未量到退固定值）
        const w = bar?.offsetWidth || 320;
        const h = bar?.offsetHeight || 90;
        x = Math.max(0, Math.min(x, Math.max(0, window.innerWidth - w)));
        y = Math.max(0, Math.min(y, Math.max(0, window.innerHeight - h)));
    }

    // □25：还原越界即钳 + 视口变化/内容长高（角色切换两行）时钳位——与渐进共享
    // FloatBar 同款三时机（mount 一次/resize/ResizeObserver）
    onMount(() => {
        if (isMobile) return;
        clamp();
        const ro = new ResizeObserver(() => clamp());
        if (bar) ro.observe(bar);
        const onResize = () => clamp();
        window.addEventListener("resize", onResize);
        return () => {
            ro.disconnect();
            window.removeEventListener("resize", onResize);
        };
    });

    // Pointer Events 统一鼠标/触摸/笔（2026-08-27 移动端修复：mouse 事件触摸端不响应）。
    // 触摸不被滚动劫持的前提是 CSS touch-action:none（index.scss .recite-floatbar），两者成对存在；
    // pointercancel 与 up 同收尾（来电/系统手势打断拖拽时不能悬在 dragging 态）。
    // 移动端已改顶部吸附条不拖拽：根上不绑本 handler，touch-action 由 --topbar 段覆回。
    function startDrag(e: PointerEvent) {
        if ((e.target as HTMLElement).closest("button")) return; // 按钮可点，不触发拖动
        const offX = e.clientX - x;
        const offY = e.clientY - y;
        dragging = true;
        settling = false;
        clearTimeout(settleTimer);
        const move = (ev: PointerEvent) => {
            x = ev.clientX - offX;
            y = ev.clientY - offY;
            clamp();
        };
        const up = () => {
            document.removeEventListener("pointermove", move);
            document.removeEventListener("pointerup", up);
            document.removeEventListener("pointercancel", up);
            dragging = false;
            settling = true;
            settleTimer = setTimeout(() => (settling = false), 300);
            localStorage.setItem(FLOATBAR_POS_KEY, JSON.stringify({ x, y }));
        };
        document.addEventListener("pointermove", move);
        document.addEventListener("pointerup", up);
        document.addEventListener("pointercancel", up);
    }

    // 按钮悬浮提示：首行文档名（标题区被截短，悬浮在哪都可知操作的是哪篇），次行动作说明（若有）
    // 走思源 b3-tooltips 自绘体系（aria-label + ::after）：原生 title 在桌面端约 1s 延迟且非思源惯例，用户感知为「不显示」
    const tip = (desc = "") => [$reciteDoc.docName, desc].filter(Boolean).join("\n");

    // □30 未激活门禁可视化：AI 拆分钮（本浮条唯一 Pro 钮）灰档 + tooltip 尾注。读 body class
    // 而非 store——激活流程（ActivationCard）成功后整页 reload，尾注/灰档随刷新消失；
    // 平时 docID 换代触发 aria-label 重算也会重读。抽取/对比/删除/判卷全免费不受影响
    const proNote = () => document.body.classList.contains("recite-unpaid")
        ? "\n" + (plugin.i18n["拆分Pro尾注"] || "Pro 功能，激活后可用")
        : "";

    // 五键文案 i18n 化（2026-08-27 图标化顺手补：原硬编码中文，en 用户一直看中文；与「默写查错」用法对齐）
    const t = (key: string) => plugin.i18n[key] || key;
</script>

<!-- 根 div 常驻 DOM（判卷小宠物 mascot.ts 挂进来，随浮条拖动自动跟随；无激活文档或 ✕ 收起挂
     --idle 类整体隐藏，display 翻转同样会重播出场动画，与原 {#if} 卸载重建行为一致）。
     移动端（--topbar）：钉 toolbar 下沿的 44px 全宽矮条，纯图标横滑 + ✕ 收起，不拖拽 -->
<div class="recite-floatbar" role="toolbar" tabindex="-1" aria-label="仿写练习浮条" bind:this={bar}
    class:recite-floatbar--idle={hidden}
    class:recite-floatbar--drag={!isMobile && dragging}
    class:recite-floatbar--settle={!isMobile && settling}
    class:recite-floatbar--square={!isMobile && $reciteDoc.role === "compare"}
    class:recite-floatbar--topbar={isMobile}
    style={isMobile ? `left:0;top:${barTop}px` : `left:${x}px;top:${y}px`}
    onpointerdown={isMobile ? undefined : startDrag}>
    {#if $reciteDoc.role}
        <!-- 桌面标题行（移动端顶栏省略：思源移动端页头已有文档名，矮条宽度留给按钮）；
             ✕ 绝对定位右上不参与 width:0/min-width:100% 的标题排版计算 -->
        {#if !isMobile}
            <div class="recite-floatbar-title">
                {$reciteDoc.docName}
                <button class="b3-tooltips b3-tooltips__n recite-floatbar-close"
                    aria-label={plugin.i18n["浮条收起"] || "隐藏仿写浮条，切换文档后恢复"}
                    onpointerdown={(e) => e.stopPropagation()} onclick={dismiss}>{@html reciteIcon("iconReciteClose", 10)}</button>
            </div>
        {/if}
        {#if $reciteDoc.role === "origin"}
            <div class="recite-floatbar-btns">
                <button class="b3-tooltips b3-tooltips__n recite-btn-pro" class:recite-btn-busy={splitting} disabled={splitting} aria-label={tip(splitting ? (plugin.i18n["拆分中提示"] || "AI 拆分进行中…") : (plugin.i18n["AI拆分提示"] || "AI 通读全文按叙事节拍自动插入锚点批注（走思源 AI 配置，消耗自己的额度）；重跑删旧 AI 锚点，手写批注不动")) + (splitting ? "" : proNote())} onclick={onSplitClick}>{@html reciteIcon(splitting ? "iconReciteSpin" : "iconReciteSplit")}<span class="recite-btn-text">{splitting ? (plugin.i18n["拆分中"] || "拆分中…") : t("AI 拆分")}</span></button>
                <button class="b3-tooltips b3-tooltips__n" aria-label={tip()} onclick={() => doExtract(plugin, $reciteDoc.docID)}>{@html reciteIcon("iconReciteExtract")}<span class="recite-btn-text">{t("抽取")}</span></button>
                <button class="b3-tooltips b3-tooltips__n recite-btn-ghost" aria-label={tip("删批注块+抽取/对比子文档+原文标记，彻底抹掉练习痕迹（回收站可找回）")} onclick={() => cleanPractice($reciteDoc.docID)}>{@html reciteIcon("iconReciteDelete")}<span class="recite-btn-text">{t("删除")}</span></button>
            </div>
        {:else if $reciteDoc.role === "extract"}
            <div class="recite-floatbar-btns">
                <button class="b3-tooltips b3-tooltips__n" aria-label={tip()} onclick={() => doCompare(plugin, $reciteDoc.docID)}>{@html reciteIcon("iconReciteCompare")}<span class="recite-btn-text">{t("对比")}</span></button>
                <button class="b3-tooltips b3-tooltips__n" aria-label={tip(plugin.i18n["默写查错提示"] || "逐字比对原文与复述：错/多字红删除线、漏字绿下划线，弹窗即看即走，不写入文档")} onclick={() => openDiffCheck(plugin, $reciteDoc.docID)}>{@html reciteIcon("iconReciteDiff")}<span class="recite-btn-text">{plugin.i18n["默写查错"] || "默写查错"}</span></button>
                <button class="b3-tooltips b3-tooltips__n" aria-label={tip(plugin.i18n["加闪卡提示"] || "把本篇练习文档整体加入快速闪卡卡组，与摘抄卡同组复习")} onclick={addToCards}>{@html reciteIcon("iconReciteCard")}<span class="recite-btn-text">{t("加闪卡")}</span></button>
                <button class="b3-tooltips b3-tooltips__n recite-btn-ghost" aria-label={tip("删当前抽取文档（连对比，复述可从回收站找回）并按原文当前批注重建空抽取，重新练习")} onclick={() => rewriteExtract(plugin, $reciteDoc.docID)}>{@html reciteIcon("iconReciteRewrite")}<span class="recite-btn-text">{t("重新写")}</span></button>
            </div>
        {:else if $reciteDoc.role === "compare"}
            {#if isMobile}
                <!-- 单行横滑 + 分组分隔线（判分行 | 操作行；两行会让条高翻倍到 85px 违背矮条承诺，
                     分隔线保留桌面两行的分组认知） -->
                <div class="recite-floatbar-btns">
                    <button class="b3-tooltips b3-tooltips__n" aria-label={tip(plugin.i18n["默写查错提示"] || "逐字比对原文与复述：错/多字红删除线、漏字绿下划线，弹窗即看即走，不写入文档")} onclick={() => openDiffCheck(plugin, $reciteDoc.docID)}>{@html reciteIcon("iconReciteDiff")}<span class="recite-btn-text">{plugin.i18n["默写查错"] || "默写查错"}</span></button>
                    <button class="b3-tooltips b3-tooltips__n" class:recite-btn-busy={grading} disabled={grading} aria-label={tip(grading ? (plugin.i18n["判卷中提示"] || "AI 判卷进行中…") : (plugin.i18n["AI判卷提示"] || "用思源已配置的 AI（设置 → AI）当场判卷，结果覆盖上一次判卷"))} onclick={runGrade}>{@html reciteIcon(grading ? "iconReciteSpin" : "iconReciteJudge")}<span class="recite-btn-text">{grading ? (plugin.i18n["判卷中"] || "判卷中…") : (plugin.i18n["AI 判卷"] || "AI 判卷")}</span></button>
                    <span class="recite-topbar-sep" aria-hidden="true"></span>
                    <button class="b3-tooltips b3-tooltips__n recite-btn-ghost" aria-label={tip("按抽取文档当前复述刷新本对比文档")} onclick={() => doCompare(plugin, $reciteDoc.docID)}>{@html reciteIcon("iconReciteCompare")}<span class="recite-btn-text">{t("对比")}</span></button>
                    <button class="b3-tooltips b3-tooltips__n" aria-label={tip(plugin.i18n["复制提示词提示"] || "复制判卷提示词，可选直接打开 DeepSeek/豆包/千问等网页版粘贴")} onclick={e => copyPrompt($reciteDoc.docID, plugin, e.currentTarget)}>{@html reciteIcon("iconReciteCopyPrompt")}<span class="recite-btn-text">{t("复制提示词")}</span></button>
                    <button class="b3-tooltips b3-tooltips__n" aria-label={tip(plugin.i18n["加闪卡提示"] || "把本篇练习文档整体加入快速闪卡卡组，与摘抄卡同组复习")} onclick={addToCards}>{@html reciteIcon("iconReciteCard")}<span class="recite-btn-text">{t("加闪卡")}</span></button>
                    <button class="b3-tooltips b3-tooltips__n recite-btn-ghost" aria-label={tip("删抽取文档（连对比子树）并按原文当前批注重建练习文档，复述清零重新练习")} onclick={() => rewriteExtract(plugin, $reciteDoc.docID)}>{@html reciteIcon("iconReciteRewrite")}<span class="recite-btn-text">{t("重新写")}</span></button>
                </div>
            {:else}
                <!-- 两行方形（2026-08-26）：判分行（默写查错+AI 判卷）+ 文档操作行（对比+复制提示词+重新写） -->
                <div class="recite-floatbar-btns">
                    <button class="b3-tooltips b3-tooltips__n" aria-label={tip(plugin.i18n["默写查错提示"] || "逐字比对原文与复述：错/多字红删除线、漏字绿下划线，弹窗即看即走，不写入文档")} onclick={() => openDiffCheck(plugin, $reciteDoc.docID)}>{@html reciteIcon("iconReciteDiff")}<span class="recite-btn-text">{plugin.i18n["默写查错"] || "默写查错"}</span></button>
                    <button class="b3-tooltips b3-tooltips__n" class:recite-btn-busy={grading} disabled={grading} aria-label={tip(grading ? (plugin.i18n["判卷中提示"] || "AI 判卷进行中…") : (plugin.i18n["AI判卷提示"] || "用思源已配置的 AI（设置 → AI）当场判卷，结果覆盖上一次判卷"))} onclick={runGrade}>{@html reciteIcon(grading ? "iconReciteSpin" : "iconReciteJudge")}<span class="recite-btn-text">{grading ? (plugin.i18n["判卷中"] || "判卷中…") : (plugin.i18n["AI 判卷"] || "AI 判卷")}</span></button>
                </div>
                <div class="recite-floatbar-btns">
                    <button class="b3-tooltips b3-tooltips__n recite-btn-ghost" aria-label={tip("按抽取文档当前复述刷新本对比文档")} onclick={() => doCompare(plugin, $reciteDoc.docID)}>{@html reciteIcon("iconReciteCompare")}<span class="recite-btn-text">{t("对比")}</span></button>
                    <button class="b3-tooltips b3-tooltips__n" aria-label={tip(plugin.i18n["复制提示词提示"] || "复制判卷提示词，可选直接打开 DeepSeek/豆包/千问等网页版粘贴")} onclick={e => copyPrompt($reciteDoc.docID, plugin, e.currentTarget)}>{@html reciteIcon("iconReciteCopyPrompt")}<span class="recite-btn-text">{t("复制提示词")}</span></button>
                    <button class="b3-tooltips b3-tooltips__n" aria-label={tip(plugin.i18n["加闪卡提示"] || "把本篇练习文档整体加入快速闪卡卡组，与摘抄卡同组复习")} onclick={addToCards}>{@html reciteIcon("iconReciteCard")}<span class="recite-btn-text">{t("加闪卡")}</span></button>
                    <button class="b3-tooltips b3-tooltips__n recite-btn-ghost" aria-label={tip("删抽取文档（连对比子树）并按原文当前批注重建练习文档，复述清零重新练习")} onclick={() => rewriteExtract(plugin, $reciteDoc.docID)}>{@html reciteIcon("iconReciteRewrite")}<span class="recite-btn-text">{t("重新写")}</span></button>
                </div>
            {/if}
        {/if}
    {/if}
    <!-- 移动端 ✕：flex 根的最后一个兄弟（横滑滚动区外常驻），idle 态随根一起 display:none -->
    {#if isMobile}
        <button class="b3-tooltips b3-tooltips__n recite-topbar-close"
            aria-label={plugin.i18n["浮条收起"] || "隐藏仿写浮条，切换文档后恢复"}
            onpointerdown={(e) => e.stopPropagation()} onclick={dismiss}>{@html reciteIcon("iconReciteClose", 14)}</button>
    {/if}
</div>
