<script module lang="ts">
    // □1 tooltip 预告（2026-08-31）：渐进邻居检测的模块级缓存——只缓存正结果：
    // 渐进启动 verify 在途（paid=null）时互问拿到空串，若把 false 也固化，渐进随后
    // 验证完成并不 reload（只有激活流程才 reload），尾注整会话错文案（reasoning P1-1）。
    // false 不写回、下次再问——互问是同步 plugins.find，便宜。整页 reload 自然重置。
    // neighbor.ts 是无状态纯函数模块（type-only siyuan import），无 events 单例的
    // bundle 模块序扰动坑（顶部 isMobile 注释那条针对有状态单例）
    import { progressiveCodeFromApp } from "../../sy-tomato-plugin/src/libs/neighbor";
    let progNeighborCached = false;
    function neighborProgActive(app: unknown): boolean {
        if (!progNeighborCached && progressiveCodeFromApp(app as any)) {
            progNeighborCached = true;
        }
        return progNeighborCached;
    }
</script>

<script lang="ts">
    import type { Plugin } from "siyuan";
    import { Constants, getFrontend } from "siyuan";
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
    import { selmlOn } from "./uiState";
    import { reciteIcon } from "./reciteIcons";
    import { toggleKeepBlocks } from "./keep";
    import { toggleTargetBlocks } from "./target";
    import { getSelectionML } from "../../sy-tomato-plugin/src/libs/selectionML";
    import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
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

    // □13 一键加卡 → toggle（2026-09-09 群反馈）：制卡钮只留抽取文档浮条——对比/答案文档
    // 制卡=把答案整篇复习，是错误入口（compare 分支已摘）。判态走文档 IAL custom-riff-decks
    // （内核制卡=挂该属性、取消=摘除，落盘即真相；getRiffCardsByBlockIDs 对不在卡组的块也
    // 回占位行，不可作判据）。removeRiffCards 传快速卡组 ID 只摘这一组——用户手动加进
    // 别的卡组的卡不动。siyuan.call 吞错返回 null 不抛异常（review P1-1），须查返回值防假成功 toast。
    let carded = $state(false);
    $effect(() => {
        const id = $reciteDoc.docID;
        carded = false;
        if (!id) return;
        siyuan.getBlockAttrs(id).then(a => {
            if (id !== $reciteDoc.docID) return; // then 回调读 docID 不进依赖集（依赖收集只在同步期）
            carded = (a?.["custom-riff-decks"] ?? "").split(",").includes(Constants.QUICK_DECK_ID);
        }).catch(() => { /* 查询失败按未制卡处理，点击走 add 幂等兜底 */ });
    });
    async function addToCards() {
        if (carded) {
            const ret = await siyuan.removeRiffCards([$reciteDoc.docID], Constants.QUICK_DECK_ID);
            if (!ret) {
                await siyuan.pushMsg(plugin.i18n["取消闪卡失败"] || "移除闪卡失败，请重试", 2500);
                return;
            }
            carded = false;
            await siyuan.pushMsg(plugin.i18n["已取消闪卡"] || "已从快速卡组移除，不再出现在闪卡复习", 2500);
            return;
        }
        const ret = await siyuan.addRiffCards([$reciteDoc.docID]);
        if (!ret) {
            await siyuan.pushMsg(plugin.i18n["加闪卡失败"] || "加入闪卡失败，请重试", 2500);
            return;
        }
        carded = true;
        await siyuan.pushMsg(plugin.i18n["已加入闪卡"] || "已加入闪卡（快速卡组），可在闪卡复习中查看", 2500);
    }

    // □8 期4（2026-09-09）：顶栏选块三钮（向上/向下/取消最后一次）——触屏拖蓝难的逐块
    // 多选入口，复用 □9 升格的 SelectionML，挂内核同款 protyle-wysiwyg--select 类，
    // 上下文/这段练经 reciteSelection 一级链直接读走（同一条栏选完即消费）。挂顶栏行内
    // 而非 breadcrumb：顶栏（z-index 安全档 10）会盖住 breadcrumb（z 5），挂 breadcrumb
    // 在 role 文档上等于不可点（e2e 实锤）。空 seed 复用实例——act 不重置锚点（连按
    // 向上持续外扩），锚点随点击的刷新由 selml.ts 监听器负责（tomato 同款分工）；
    // 无需 dispose（WeakMap 键随 wysiwyg 回收）。图标用内核 sprite（iconUp/Down/Redo，
    // 与 tomato breadcrumb 三钮同源）；{@html} 注入走 parser——程序化
    // setAttribute("xlink:href") 不进命名空间会画占位（infra 坑在案）。
    function selmlAct(name: string, fn: (s: ReturnType<typeof getSelectionML>) => void) {
        const protyle = $reciteDoc.protyle as any;
        const wysiwyg = protyle?.wysiwyg?.element as HTMLElement | undefined;
        if (!wysiwyg) return;
        const s = getSelectionML(wysiwyg);
        fn(s);
        debugLog("recite.selml", `${name} ${JSON.stringify(s.state)}`, "recite");
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

    // □30 未激活门禁可视化 + □1 邻居预告（2026-08-31）：AI 拆分钮（本浮条唯一 Pro 钮）
    // 灰档 + tooltip 尾注。读 body class 而非 store——激活流程成功后整页 reload，尾注/
    // 灰档随刷新消失；平时 docID 换代触发 aria-label 重算也会重读。未激活且检测到渐进
    // 已激活时，尾注换「渐进用户免费解锁」（检测走模块级缓存，见顶部 module script）
    const proNote = () => document.body.classList.contains("recite-unpaid")
        ? "\n" + (neighborProgActive((plugin as any).app)
            ? (plugin.i18n["拆分Pro尾注邻居"] || "渐进用户免费解锁")
            : (plugin.i18n["拆分Pro尾注"] || "Pro 功能，激活后可用"))
        : "";

    // 五键文案 i18n 化（2026-08-27 图标化顺手补：原硬编码中文，en 用户一直看中文；与「默写查错」用法对齐）
    const t = (key: string) => plugin.i18n[key] || key;
</script>

<!-- 根 div 常驻 DOM（判卷小宠物 mascot.ts 挂进来，随浮条拖动自动跟随；无激活文档或 ✕ 收起挂
     --idle 类整体隐藏，display 翻转同样会重播出场动画，与原 {#if} 卸载重建行为一致）。
     移动端（--topbar）：钉 toolbar 下沿的 44px 全宽矮条，纯图标横滑 + ✕ 收起，不拖拽。
     onmousedown 全根 preventDefault（□7 2026-09-09 bear 主实例 Loki 实锤 selCollapsed=true）：
     真人点击带 1~3px 微移，mousedown 默认行为把拖蓝选区塌成光标（playwright 零移点击测不出），
     keep/靶通道点按钮时刻选区恒空——preventDefault 保选区，划词工具条按钮同款手法；
     pointer 拖拽/click/tooltip 均不受影响 -->
<div class="recite-floatbar" role="toolbar" tabindex="-1" aria-label="仿写练习浮条" bind:this={bar}
    class:recite-floatbar--idle={hidden}
    class:recite-floatbar--drag={!isMobile && dragging}
    class:recite-floatbar--settle={!isMobile && settling}
    class:recite-floatbar--square={!isMobile && $reciteDoc.role === "compare"}
    class:recite-floatbar--topbar={isMobile}
    style={isMobile ? `left:0;top:${barTop}px` : `left:${x}px;top:${y}px`}
    onpointerdown={isMobile ? undefined : startDrag}
    onmousedown={(e) => e.preventDefault()}>
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
                <button class="b3-tooltips b3-tooltips__n" aria-label={tip("生成练习文档：原文批注逐题拆出，每题留空写位")} onclick={() => doExtract(plugin, $reciteDoc.docID)}>{@html reciteIcon("iconReciteExtract")}<span class="recite-btn-text">{t("抽取")}</span></button>
                <!-- □8 期4 选块三钮（移动端顶栏纯图标，桌面共用标记但桌面顶栏不渲染）：
                     选完的块挂内核同款选中类，右侧 上下文/这段练 直接读走；
                     $selmlOn=设置面板「移动端选块按钮」开关（2026-09-09），切换即时生效 -->
                {#if isMobile && $selmlOn}
                    <span class="recite-topbar-sep" aria-hidden="true"></span>
                    <button class="b3-tooltips b3-tooltips__n" aria-label={plugin.i18n["向上选择"] || "向上选择"} onclick={() => selmlAct("up", s => s.selectUp())}>{@html "<svg><use xlink:href=\"#iconUp\"></use></svg>"}<span class="recite-btn-text">{plugin.i18n["向上选择"] || "向上选择"}</span></button>
                    <button class="b3-tooltips b3-tooltips__n" aria-label={plugin.i18n["向下选择"] || "向下选择"} onclick={() => selmlAct("down", s => s.selectDown())}>{@html "<svg><use xlink:href=\"#iconDown\"></use></svg>"}<span class="recite-btn-text">{plugin.i18n["向下选择"] || "向下选择"}</span></button>
                    <button class="b3-tooltips b3-tooltips__n" aria-label={plugin.i18n["取消最后一次选择的内容"] || "取消最后一次选择"} onclick={() => selmlAct("cancel", s => s.cancelLast())}>{@html "<svg><use xlink:href=\"#iconRedo\"></use></svg>"}<span class="recite-btn-text">{plugin.i18n["取消最后一次选择的内容"] || "取消最后一次选择"}</span></button>
                    <span class="recite-topbar-sep" aria-hidden="true"></span>
                {/if}
                <!-- 期1 留作上下文（2026-09-08）：作用于当前编辑器选中块集（Ctrl+点击多选），keep 块
                     抽取时复制进练习文档做卡面语境；再点取消。选中态读取见 keep.ts keepTargets -->
                <button class="b3-tooltips b3-tooltips__n" aria-label={tip(plugin.i18n["上下文浮条提示"] || "把选中的原文块留作上下文：抽取时复制进练习文档，闪卡复习时看得到语境（再点取消）")} onclick={() => toggleKeepBlocks(plugin, $reciteDoc.protyle)}>{@html reciteIcon("iconReciteKeep")}<span class="recite-btn-text">{t("上下文")}</span></button>
                <!-- 期2 这段练（2026-09-08）：选中块圈靶+段后留总结位，抽取切节选语义只练这段；再点取消 -->
                <button class="b3-tooltips b3-tooltips__n" aria-label={tip(plugin.i18n["靶浮条提示"] || "把选中的原文块圈为「这段练」：段后写总结，抽取只练这段、其余照抄做语境（再点取消）")} onclick={() => toggleTargetBlocks(plugin, $reciteDoc.protyle)}>{@html reciteIcon("iconReciteTarget")}<span class="recite-btn-text">{t("这段练")}</span></button>
                <button class="b3-tooltips b3-tooltips__n recite-btn-ghost" aria-label={tip("删批注块+抽取/对比子文档+原文标记，彻底抹掉练习痕迹（回收站可找回）")} onclick={() => cleanPractice($reciteDoc.docID)}>{@html reciteIcon("iconReciteDelete")}<span class="recite-btn-text">{t("删除")}</span></button>
            </div>
        {:else if $reciteDoc.role === "extract"}
            <div class="recite-floatbar-btns">
                <button class="b3-tooltips b3-tooltips__n" aria-label={tip("生成对比文档：每题左右两列，原文与复述逐题对照")} onclick={() => doCompare(plugin, $reciteDoc.docID)}>{@html reciteIcon("iconReciteCompare")}<span class="recite-btn-text">{t("对比")}</span></button>
                <button class="b3-tooltips b3-tooltips__n" aria-label={tip(plugin.i18n["默写查错提示"] || "逐字比对原文与复述：错/多字红删除线、漏字绿下划线，弹窗即看即走，不写入文档")} onclick={() => openDiffCheck(plugin, $reciteDoc.docID)}>{@html reciteIcon("iconReciteDiff")}<span class="recite-btn-text">{plugin.i18n["默写查错"] || "默写查错"}</span></button>
                <button class="b3-tooltips b3-tooltips__n" aria-label={tip(carded ? (plugin.i18n["取消制卡提示"] || "本篇练习文档已在快速卡组，再点移除") : (plugin.i18n["加闪卡提示"] || "把本篇练习文档整体加入快速闪卡卡组，与摘抄卡同组复习"))} onclick={addToCards}>{@html reciteIcon(carded ? "iconReciteCardOn" : "iconReciteCard")}<span class="recite-btn-text">{carded ? (plugin.i18n["取消制卡"] || "取消制卡") : t("加闪卡")}</span></button>
                <button class="b3-tooltips b3-tooltips__n recite-btn-ghost" aria-label={tip("删当前抽取文档（连对比，复述可从回收站找回）并按原文当前批注重建空抽取，重新练习")} onclick={() => rewriteExtract(plugin, $reciteDoc.docID)}>{@html reciteIcon("iconReciteRewrite")}<span class="recite-btn-text">{t("重新写")}</span></button>
            </div>
        {:else if $reciteDoc.role === "compare"}
            {#if isMobile}
                <!-- 单行横滑 + 分组分隔线（判分行 | 操作行；两行会让条高翻倍到 85px 违背矮条承诺，
                     分隔线保留桌面两行的分组认知）。制卡钮不进对比文档（2026-09-09 群反馈）：
                     对比=含原文答案的对照视图，制卡入口只留抽取文档浮条 -->
                <div class="recite-floatbar-btns">
                    <button class="b3-tooltips b3-tooltips__n" aria-label={tip(plugin.i18n["默写查错提示"] || "逐字比对原文与复述：错/多字红删除线、漏字绿下划线，弹窗即看即走，不写入文档")} onclick={() => openDiffCheck(plugin, $reciteDoc.docID)}>{@html reciteIcon("iconReciteDiff")}<span class="recite-btn-text">{plugin.i18n["默写查错"] || "默写查错"}</span></button>
                    <button class="b3-tooltips b3-tooltips__n" class:recite-btn-busy={grading} disabled={grading} aria-label={tip(grading ? (plugin.i18n["判卷中提示"] || "AI 判卷进行中…") : (plugin.i18n["AI判卷提示"] || "用思源已配置的 AI（设置 → AI）当场判卷，结果覆盖上一次判卷"))} onclick={runGrade}>{@html reciteIcon(grading ? "iconReciteSpin" : "iconReciteJudge")}<span class="recite-btn-text">{grading ? (plugin.i18n["判卷中"] || "判卷中…") : (plugin.i18n["AI 判卷"] || "AI 判卷")}</span></button>
                    <span class="recite-topbar-sep" aria-hidden="true"></span>
                    <button class="b3-tooltips b3-tooltips__n recite-btn-ghost" aria-label={tip("按抽取文档当前复述刷新本对比文档")} onclick={() => doCompare(plugin, $reciteDoc.docID)}>{@html reciteIcon("iconReciteCompare")}<span class="recite-btn-text">{t("对比")}</span></button>
                    <button class="b3-tooltips b3-tooltips__n" aria-label={tip(plugin.i18n["复制提示词提示"] || "复制判卷提示词，可选直接打开 DeepSeek/豆包/千问等网页版粘贴")} onclick={e => copyPrompt($reciteDoc.docID, plugin, e.currentTarget)}>{@html reciteIcon("iconReciteCopyPrompt")}<span class="recite-btn-text">{t("复制提示词")}</span></button>
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
