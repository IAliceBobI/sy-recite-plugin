<script lang="ts">
    // 默写查错弹窗内容（diffCheck.ts openDiffCheck mount 进思源 Dialog）：多题区块
    // （题号徽章 + 笔记副题 + 原文/我的复述两列行对齐）+ 底部统计条。数据全部由
    // diffCheck.ts 算好传入（纯渲染）。差异行微黄底；原文列绿下划线=漏写/被写错的
    // 正确字，复述列红删除线=写错/多余，标点差异降级轻标（灰、低透明度）。
    import type { Plugin } from "siyuan";
    import type { DiffEntryView, DiffSummary, DiffSpan } from "./diffCheck";

    let { plugin, entries, summary }: {
        plugin: Plugin;
        entries: DiffEntryView[];
        summary: DiffSummary;
    } = $props();

    const say = (k: string, fb: string) => (plugin.i18n as any)[k] || fb;
    // 类名走 {#if} 静态分支而非 class="rd-s-{cls}" 拼串——Svelte 对纯动态类名会判
    // 选择器未使用并剪枝样式
    // svelte-ignore state_referenced_locally
    const statLine = say("查错·统计", "差异 {d} 处（错 {w} · 漏 {m} · 多 {e}）· 相似度 {s}%")
        .replace("{d}", String(summary.diffs))
        .replace("{w}", String(summary.wrong))
        .replace("{m}", String(summary.miss))
        .replace("{e}", String(summary.extra))
        .replace("{s}", String(summary.similarity));
</script>

{#snippet spans(arr: DiffSpan[])}
    {#each arr as s}
        {#if s.cls === "miss"}<span class="rd-s-miss">{s.text}</span>
        {:else if s.cls === "wrong"}<span class="rd-s-wrong">{s.text}</span>
        {:else if s.cls === "punct"}<span class="rd-s-punct">{s.text}</span>
        {:else}<span>{s.text}</span>{/if}
    {/each}
{/snippet}

<div class="recite-diffcheck">
    <div class="rd-body">
        {#each entries as e, i}
            <section class="rd-entry">
                <header class="rd-entry-head">
                    <span class="rd-no" aria-hidden="true">{i + 1}</span>
                    <span class="rd-note">{e.note}</span>
                </header>
                {#if e.association}
                    <div class="rd-assoc">{say("查错·联想说明", "联想题 · 自由写作，不参与逐字比对")}</div>
                {:else}
                    <div class="rd-grid">
                        <div class="rd-colhead">{say("原文", "原文")}</div>
                        <div class="rd-colhead">{say("我的复述", "我的复述")}</div>
                        {#each e.lines as line}
                            <div class="rd-line" class:rd-line--dirty={line.dirty}>
                                <div class="rd-cell">{@render spans(line.a)}</div>
                                <div class="rd-cell">{@render spans(line.b)}</div>
                            </div>
                        {/each}
                    </div>
                {/if}
            </section>
        {/each}
    </div>
    <footer class="rd-stats">
        {#if entries.every(e => e.association)}
            {say("查错·纯联想", "联想练习没有逐字比对——点「AI 判卷」让 AI 评你的联想力")}
        {:else if summary.diffs === 0}
            {say("查错·完美", "一字不差，完全正确 🎉")}
        {:else}
            {statLine}
        {/if}
    </footer>
</div>

<style>
    .recite-diffcheck {
        display: flex;
        flex-direction: column;
        height: 100%;
        box-sizing: border-box;
        font-size: 14px;
        line-height: 1.7;
    }
    .rd-body {
        flex: 1;
        overflow-y: auto;
        padding-right: 4px;
    }
    .rd-entry {
        margin: 0 0 18px;
    }
    .rd-entry-head {
        display: flex;
        align-items: baseline;
        gap: 8px;
        margin: 0 0 6px;
    }
    .rd-no {
        flex: none;
        min-width: 20px;
        height: 20px;
        padding: 0 6px;
        box-sizing: border-box;
        border-radius: 10px;
        background: var(--recite-accent-strong);
        color: #fff;
        font-size: 12px;
        font-weight: 600;
        line-height: 20px;
        text-align: center;
    }
    .rd-note {
        color: var(--recite-accent);
        font-size: 13px;
    }
    /* 联想题占位说明：自由写作无逐字比对，与两列 diff 区分开 */
    .rd-assoc {
        padding: 6px 12px;
        border: 1px dashed var(--recite-card-border);
        border-radius: 8px;
        color: var(--b3-theme-on-surface);
        font-size: 13px;
        opacity: 0.7;
    }
    .rd-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        border: 1px solid var(--recite-card-border);
        border-radius: 8px;
        overflow: hidden;
    }
    .rd-colhead {
        padding: 4px 12px;
        background: var(--recite-card-bg);
        color: var(--b3-theme-on-surface);
        font-size: 12px;
        font-weight: 600;
        opacity: 0.75;
    }
    .rd-grid > .rd-colhead + .rd-colhead {
        border-inline-start: 1px solid var(--recite-card-border);
    }
    .rd-line {
        grid-column: 1 / -1;
        display: grid;
        grid-template-columns: 1fr 1fr;
        border-top: 1px solid color-mix(in srgb, var(--recite-card-border) 55%, transparent);
    }
    .rd-cell {
        min-height: 1.7em;
        padding: 2px 12px;
        white-space: pre-wrap; /* 英文空格保形 */
        overflow-wrap: break-word;
    }
    .rd-line .rd-cell + .rd-cell {
        border-inline-start: 1px dashed color-mix(in srgb, var(--recite-card-border) 70%, transparent);
    }
    .rd-line--dirty {
        background: rgba(255, 208, 0, 0.12); /* 差异行微黄 */
    }
    :global(html[data-theme-mode="dark"]) .rd-line--dirty {
        background: rgba(255, 208, 0, 0.07);
    }
    /* 原文列绿下划线=漏写/被写错的正确字；复述列红删除线=写错/多余 */
    .rd-s-miss {
        color: #2f8f4e;
        text-decoration: underline;
        text-decoration-thickness: 2px;
        text-underline-offset: 3px;
        font-weight: 600;
    }
    :global(html[data-theme-mode="dark"]) .rd-s-miss {
        color: #6cc08a;
    }
    .rd-s-wrong {
        color: #c0392b;
        text-decoration: line-through;
        text-decoration-thickness: 2px;
        font-weight: 600;
    }
    :global(html[data-theme-mode="dark"]) .rd-s-wrong {
        color: #e07060;
    }
    .rd-s-punct {
        opacity: 0.4; /* 标点差异降级轻标 */
    }
    .rd-stats {
        flex: none;
        padding: 8px 4px 2px;
        border-top: 1px solid var(--b3-border-color);
        color: var(--b3-theme-on-surface);
        font-size: 13px;
        text-align: center;
        background: var(--b3-theme-surface);
    }
</style>
