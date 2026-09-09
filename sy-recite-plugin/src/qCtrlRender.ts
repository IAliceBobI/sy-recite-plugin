// □5（仿写上下文升级战役）单题就地对照——q-ctrl 渲染器与注入面板（aiGradeRender.ts 同构）。
// 注册面（exp/apirenew-report.md 硬事实）：plugin.customBlockRenders["q-ctrl"] =
// { render({element, content}) => dispose? }；element=DIV.custom-block__content（内核对
// content 元素已做 30 类编辑器事件隔离，卡内按钮不扰编辑器）；事务/切页签 dispose→render
// 成对；旧内核（<3.8.3）无此注册面 → renderFallback <pre> 显围栏原文一行。
// 面板形态（□5 mini-spec 拍板）：点「对照」在写位下方（控制块宿主之后）就地展开两栏——
// 左=该题 refs 实时回查原文（联想题=题目本身，对比文档同款语义）、右=写位当前复述实时读
// DOM；宽屏左右、窄屏上下、原文弱化灰。临时态不做块（零落盘零事务，纯 DOM 注入不进 .sy）：
// 再点/点外收起、切文档重载随宿主 DOM 卸载自动消。视觉细节经 vision 评审定稿。
import { siyuan } from "../../sy-tomato-plugin/src/libs/siyuanApi";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { md2Divs } from "../../sy-tomato-plugin/src/libs/sydom";
import { fetchOriginMarkdown, isAssociation } from "./extract";
import { reciteIcon } from "./reciteIcons";
import { RECITE_NOTE, RECITE_KEEP, RECITE_REFS } from "./constants";
import { Q_CTRL_BLOCK_TYPE, isQCtrlHost, parseQCtrlContent, markQCtrlPlugin, type CustomBlockPlugin, type QCtrlData } from "./qCtrlBlock";

let i18nRef: Record<string, string> | undefined;
const say = (k: string, fallback: string): string => i18nRef?.[k] || fallback;

export function registerQCtrlRender(plugin: CustomBlockPlugin): void {
    if (!plugin.customBlockRenders) return; // <3.8.3：不注册，官方 fallback 兜底
    markQCtrlPlugin(plugin); // qCtrlBlock 特性检测（回填判据）共享 pluginRef
    i18nRef = plugin.i18n;
    plugin.customBlockRenders[Q_CTRL_BLOCK_TYPE] = {
        render: ({ element, content }: { element: HTMLElement; content: string }) => renderCtrl(element, content),
    };
}

/**
 * 面板内容 inert 化（review P1-1）：面板挂 wysiwyg 顶层流（在 custom-block__content 的
 * 内核事件隔离范围之外），md2Divs 产物带随机 data-node-id+内层 contenteditable=true——
 * 不洗则点进左栏打字会以假块 id 发编辑事务（报错 toast/DOM 与文档态脱节）。
 * contenteditable=false 仍可选可复制（对照面板主用途不受影响）。
 */
const inert = (els: HTMLElement[]) => els.map(d => {
    d.removeAttribute("data-node-id");
    // 嵌套块（列表/引用/表格内层）同样带假 id：hover gutter/ctrl+click 块选择会 latch 假块
    d.querySelectorAll("[data-node-id]").forEach(n => n.removeAttribute("data-node-id"));
    d.querySelectorAll("[contenteditable]").forEach(c => c.setAttribute("contenteditable", "false"));
    return d;
});

/** 面板挂宿主块之后（文档流内），WeakMap 记活面板（同宿主重渲染前先收，防孤儿） */
const livePanels = new WeakMap<HTMLElement, { panel: HTMLElement; onDocDown: (ev: PointerEvent) => void }>();
/** 活面板宿主集合（index.ts onunload 全收——document 级监听器跨插件代清理，review P2-1） */
const openHosts = new Set<HTMLElement>();

/** 插件 unload/reload 全收活面板与 document 捕获段监听（index.ts onunload 调用） */
export function unloadQCtrlRender(): void {
    Array.from(openHosts).forEach(closePanelOf);
}

function closePanelOf(host: HTMLElement) {
    const live = livePanels.get(host);
    if (!live) return;
    livePanels.delete(host);
    openHosts.delete(host);
    host.querySelector(".recite-qctrl-btn")?.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", live.onDocDown, true);
    live.panel.remove();
}

function renderCtrl(element: HTMLElement, content: string): (() => void) | undefined {
    const host = element.closest<HTMLElement>("[data-node-id]");
    if (!host) return;
    const data = parseQCtrlContent(content);
    if (!data) {
        const tip = document.createElement("div");
        tip.className = "recite-qctrl-broken";
        tip.textContent = say("对照配置无法解析", "对照配置无法解析");
        element.append(tip);
        return;
    }
    debugLog("recite.q_ctrl", `render note=${data.noteID.slice(-8)}`, "recite");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "recite-qctrl-btn";
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = `${reciteIcon("iconReciteQctrl", 12)}<span>${say("对照", "对照")}</span>`;
    btn.addEventListener("click", () => {
        if (livePanels.has(host)) {
            closePanelOf(host);
            debugLog("recite.q_ctrl", `close note=${data.noteID.slice(-8)}`, "recite");
        } else {
            void openPanel(host, data);
        }
    });
    element.append(btn);
    // dispose（事务/切页签触发）：活面板随宿主一起收
    return () => closePanelOf(host);
}

/**
 * 展开面板：右栏同步实时读 DOM（锚点到下一锚点间的块文本=当前复述，readExtractDoc 的
 * writes 同源区间）；左栏——联想题=题目本身（锚点实时文本，同步直填零等待），普通题=
 * refs 回查原文（fetchOriginMarkdown，原文改了拿新文）。收起三通道：再点钮/点外
 * （document 捕获段 pointerdown，防编辑器 stopPropagation 吞冒泡）/切文档重载（宿主
 * DOM 卸载自然消）。收起竞态：面板已摘（isConnected=false）即丢弃晚归结果。
 */
async function openPanel(host: HTMLElement, data: QCtrlData): Promise<void> {
    const wysiwyg = host.closest<HTMLElement>(".protyle-wysiwyg");
    // CSS.escape：content 被手改出 " ] 等字符时防选择器 SyntaxError（review P2-3）
    const anchor = wysiwyg?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(data.noteID)}"]`);
    if (!anchor) {
        void siyuan.pushMsg(say("找不到锚点", "找不到这道题的锚点（可能已被删除）"), 2500).catch?.(() => {});
        debugLog("recite.q_ctrl", `no_anchor note=${data.noteID.slice(-8)}`, "recite");
        return;
    }

    const panel = document.createElement("div");
    panel.className = "recite-qctrl-panel";
    const assoc = isAssociation(anchor.textContent ?? "");
    panel.append(buildCol("recite-qctrl-panel__origin", say("原文", "原文"), null));
    panel.append(buildCol("recite-qctrl-panel__mine", say("我的复述", "我的复述"), collectMine(anchor)));
    host.after(panel);
    host.querySelector(".recite-qctrl-btn")?.setAttribute("aria-expanded", "true");
    debugLog("recite.q_ctrl", `open note=${data.noteID.slice(-8)} assoc=${assoc}`, "recite");

    const onDocDown = (ev: PointerEvent) => {
        const t = ev.target as Node;
        if (panel.contains(t) || host.contains(t)) return;
        closePanelOf(host);
        debugLog("recite.q_ctrl", `close_outside note=${data.noteID.slice(-8)}`, "recite");
    };
    document.addEventListener("pointerdown", onDocDown, true);
    livePanels.set(host, { panel, onDocDown });
    openHosts.add(host);

    // 左栏异步填充。联想题=题目本身，不依赖 IAL——同步直填（review P2-4：免 getBlockAttrs
    // 往返白等一拍，且联想语义两数据源〔DOM 文本/SQL markdown〕在 isAssociation 剥 heading
    // 前缀后判据一致）
    const originBody = panel.firstElementChild?.lastElementChild;
    if (!originBody) return;
    const fill = (els: HTMLElement[]) => {
        originBody.replaceChildren(); // 清「回查原文…」占位
        originBody.append(...inert(els));
    };
    const fillText = (text: string) => {
        originBody.replaceChildren();
        const d = document.createElement("div");
        d.textContent = text;
        originBody.append(d);
    };
    if (assoc) {
        fill(md2Divs(anchor.textContent ?? ""));
        return;
    }
    try {
        const attrs = await siyuan.getBlockAttrs(data.noteID).catch(() => null);
        if (!panel.isConnected) return;
        if (!attrs) { // 拉取失败与真无 refs 分开显文（review P2-4）
            fillText(say("原文回查失败", "原文回查失败"));
            debugLog("recite.q_ctrl", `attrs fetch failed note=${data.noteID.slice(-8)}`, "recite");
            return;
        }
        const refs = ((attrs[RECITE_REFS] as string) ?? "").split(",").filter(Boolean);
        if (!refs.length) {
            fillText(say("本条批注前没有原文段", "（本条批注前没有原文段）"));
            return;
        }
        const origins = await fetchOriginMarkdown(refs);
        if (!panel.isConnected) return;
        fill(md2Divs(origins.join("\n\n")));
    } catch (e) {
        if (panel.isConnected) fillText(say("原文回查失败", "原文回查失败"));
        debugLog("recite.q_ctrl", `origin fetch failed: ${e}`, "recite");
    }
}

/** 栏骨架：标签行（窄屏上下布局时区分两栏）+ 内容体（null=异步加载占位） */
function buildCol(cls: string, label: string, text: string | null): HTMLElement {
    const col = document.createElement("div");
    col.className = cls;
    const tag = document.createElement("div");
    tag.className = "recite-qctrl-panel__tag";
    tag.textContent = label;
    const body = document.createElement("div");
    body.className = "recite-qctrl-panel__body";
    if (text == null) {
        body.textContent = say("回查原文…", "回查原文…");
    } else if (!text) {
        const d = document.createElement("div");
        d.textContent = say("未仿写", "（未仿写）");
        body.append(d);
    } else {
        text.split("\n").filter(Boolean).forEach(line => {
            const l = document.createElement("div");
            l.textContent = line;
            body.append(l);
        });
    }
    col.append(tag, body);
    return col;
}

/**
 * 右栏实时读 DOM：锚点到下一锚点间的顶层块文本=当前复述（review P1-3 对齐 readExtractDoc
 * 的 writes 区间——控制块下方落笔同样计入复述，面板与对比文档左右一致；控制块被拖走时
 * 也不失控吃到文末）。keep 上下文与 q-ctrl/面板 UI 层不计；空块=零宽空格 \u200b 显式滤
 * （trim() 剔不掉）。
 */
function collectMine(anchor: HTMLElement): string {
    const lines: string[] = [];
    for (let el = anchor.nextElementSibling as HTMLElement | null; el; el = el.nextElementSibling as HTMLElement | null) {
        if (el.getAttribute(RECITE_NOTE)) break;
        if (el.getAttribute(RECITE_KEEP)) continue;
        if (isQCtrlHost(el) || el.classList.contains("recite-qctrl-panel")) continue;
        const t = el.textContent?.replaceAll("\u200b", "").trim();
        if (t) lines.push(t);
    }
    return lines.join("\n");
}
