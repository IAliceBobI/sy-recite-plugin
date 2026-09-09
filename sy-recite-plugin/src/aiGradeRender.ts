// □8（3.8.3 升级战役）仿写判卷结果自定义块——ai-grade 渲染器。
// 注册面（exp/apirenew-report.md 硬事实）：plugin.customBlockRenders["ai-grade"] =
// { render({element, content}) => dispose? }；element=DIV.custom-block__content
// （块 id 在宿主 [data-node-id]，内核对 content 元素已做 30 类编辑器事件隔离，卡内按钮不扰编辑器）；
// 事务/切页签 dispose→render 成对；旧内核（<3.8.3）无此注册面 → renderFallback <pre> 显围栏原文。
// 卡形态（□8 六分叉拍板，anno-chat 同构）：头行（判卷图标+标题+meta 判官档·时间+pose 成绩徽章+
// 制卡钮）+ 判卷全文层（默认折叠，点击展开）；制卡钮=挂内建卡包后按钮退场（官方竖线标记自动出现）。
// 全免费零新墙（判卷链现状分层不动，分叉 6 拍板 A）。
import { siyuan } from "../../sy-tomato-plugin/src/libs/siyuanApi";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { GRADER_TONES } from "./promptCopy";
import { reciteIcon } from "./reciteIcons";
import { AI_GRADE_BLOCK_TYPE, fmtGradeStamp, parseAiGradeContent, renderGradeLines } from "./aiGradeBlock";

/** 最小注册面接口（siyuan 类型声明无 customBlockRenders，结构化窄化避免 as any 满天飞） */
export interface CustomBlockPlugin {
    customBlockRenders?: Record<string, unknown>;
    i18n?: Record<string, string>;
}

/** 渲染回调无 plugin 实参，注册时存模块级引用（i18n/特性检测共用） */
let pluginRef: CustomBlockPlugin | null = null;

/** 特性检测：3.8.3+ 且渲染器已注册（旧内核=转卡链回落引用块形态，aiGrade.ts 分流判据）。
 *  等价性假设：customBlockRenders 字段与 custom 块渲染能力同版本（3.8.3）引入——依据
 *  exp/apirenew-report.md 实测矩阵；未来内核若只加字段不加渲染（假阳）须改此判据。 */
export function supportsAiGradeBlock(): boolean {
    try {
        const renders = pluginRef?.customBlockRenders;
        return !!renders && typeof renders[AI_GRADE_BLOCK_TYPE] === "object";
    } catch {
        return false;
    }
}

export function registerAiGradeRender(plugin: CustomBlockPlugin): void {
    if (!plugin.customBlockRenders) return; // <3.8.3：不注册，官方 fallback 兜底
    pluginRef = plugin;
    plugin.customBlockRenders[AI_GRADE_BLOCK_TYPE] = {
        render: ({ element, content }: { element: HTMLElement; content: string }) => {
            renderCard(element, content);
        },
    };
}

const say = (k: string, fallback: string): string => pluginRef?.i18n?.[k] || fallback;

/** pose 协议行成绩 → 徽章（<pose> 三档同源；未知档不显） */
const POSE_BADGES: Record<string, { cls: string; i18nKey: string }> = {
    great: { cls: "great", i18nKey: "成绩·佳" },
    medium: { cls: "medium", i18nKey: "成绩·中" },
    poor: { cls: "poor", i18nKey: "成绩·差" },
};

/** 宿主块 id：content 元素自身不带，上爬最近 [data-node-id]（探针同款判法） */
function blockIdOf(element: HTMLElement): string {
    return element.closest("[data-node-id]")?.getAttribute("data-node-id") ?? "";
}

function renderCard(element: HTMLElement, content: string): void {
    const data = parseAiGradeContent(content);
    if (!data) {
        const tip = document.createElement("div");
        tip.className = "recite-aigrade-card__broken";
        tip.textContent = say("判卷内容无法解析", "判卷内容无法解析");
        element.append(tip);
        return;
    }
    const card = document.createElement("div");
    card.className = "recite-aigrade-card";

    // ---- 头行：判卷图标+标题+meta（判官档·时间）+ pose 徽章 + 制卡钮（已挂卡不显）----
    const head = document.createElement("div");
    head.className = "recite-aigrade-card__head";
    const icon = document.createElement("span");
    icon.className = "recite-aigrade-card__icon";
    icon.innerHTML = reciteIcon("iconReciteJudge", 14);
    const title = document.createElement("span");
    title.className = "recite-aigrade-card__title";
    title.textContent = say("AI判卷标题", "AI 判卷");
    const toneHit = GRADER_TONES.find(t => t.slug === data.tone);
    const meta = document.createElement("span");
    meta.className = "recite-aigrade-card__meta";
    meta.textContent = `${say(toneHit?.i18nKey ?? "判官·中立", "中立")} · ${fmtGradeStamp(data.ts)}`;
    head.append(icon, title, meta);
    const badge = POSE_BADGES[data.pose ?? ""];
    if (badge) {
        const b = document.createElement("span");
        b.className = `recite-aigrade-card__badge recite-aigrade-card__badge--${badge.cls}`;
        b.textContent = say(badge.i18nKey, badge.i18nKey);
        head.append(b);
    }
    const mkBtn = document.createElement("button");
    mkBtn.className = "recite-aigrade-card__mk";
    mkBtn.setAttribute("aria-label", say("制成闪卡", "制成闪卡"));
    mkBtn.hidden = true; // 已挂卡检测通过才显（挂过的卡按钮退场）
    mkBtn.innerHTML = `${reciteIcon("iconReciteCard", 12)}<span>${say("制成闪卡", "制成闪卡")}</span>`;
    head.append(mkBtn);
    card.append(head);

    // ---- 判卷全文层（默认折叠；展开=题头/列表/段落静态流）----
    const body = document.createElement("div");
    body.className = "recite-aigrade-card__body";
    body.hidden = true;
    // □3 遗漏点清单（<missed> 协议回传；旧卡/无遗漏不渲染）：置顶于全文流之前——
    // 展开先见「漏了什么」短清单，再读全文点评
    if (data.missed?.length) {
        const missedBox = document.createElement("div");
        missedBox.className = "recite-aigrade-card__missed";
        const mh = document.createElement("div");
        mh.className = "recite-aigrade-card__missed-h";
        mh.textContent = say("遗漏点", "遗漏点");
        missedBox.append(mh);
        for (const m of data.missed) {
            const li = document.createElement("div");
            li.className = "recite-aigrade-card__missed-li";
            li.textContent = m;
            missedBox.append(li);
        }
        body.append(missedBox);
    }
    for (const line of renderGradeLines(data.text)) {
        const el = document.createElement(line.type === "li" || line.type === "p" || line.type === "h" ? "div" : "span");
        el.className = `recite-aigrade-card__l-${line.type}`;
        el.textContent = line.text ?? "";
        body.append(el);
    }
    const toggle = document.createElement("button");
    toggle.className = "recite-aigrade-card__toggle";
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML = `${reciteIcon("iconDown", 12)}<span class="recite-aigrade-card__tlabel"></span>`;
    const tLabel = toggle.querySelector(".recite-aigrade-card__tlabel") as HTMLElement;
    const tUse = toggle.querySelector("use") as SVGUseElement;
    const syncToggle = (open: boolean) => {
        body.hidden = !open;
        toggle.setAttribute("aria-expanded", String(open));
        tLabel.textContent = open ? say("收起点评", "收起点评") : say("展开点评", "展开点评");
        tUse.setAttribute("xlink:href", open ? "#iconUp" : "#iconDown");
    };
    syncToggle(false);
    toggle.addEventListener("click", () => syncToggle(body.hidden));
    card.append(toggle, body);
    element.append(card);

    // ---- 制卡：挂内建卡包（addRiffCards 默认 deck）→ 官方竖线标记自动出现、按钮退场 ----
    void setupMakeCard(mkBtn, blockIdOf(element));
}

/** 制卡按钮装配：先异步查 IAL custom-riff-decks（已挂卡=保持 hidden 退场），未挂才显+绑点击 */
async function setupMakeCard(btn: HTMLButtonElement, blockID: string): Promise<void> {
    if (!blockID) return;
    try {
        const attrs = await siyuan.getBlockAttrs(blockID);
        if (!btn.isConnected) return; // 渲染宿主已被替换（dispose 后晚归）
        if (attrs?.["custom-riff-decks"]) return; // 已是卡：按钮退场
    } catch {
        return; // 检测失败宁缺毋滥（按钮不显，刷新后重试）
    }
    btn.hidden = false;
    btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
            // siyuan.call 内核拒绝只 warn 不 throw —— 判空防假成功（按钮退场后再无入口）
            const r = await siyuan.addRiffCards([blockID]);
            if (!r) throw new Error("addRiffCards rejected");
            btn.remove();
            void siyuan.pushMsg(say("已加入闪卡", "已加入闪卡（快速卡组），可在闪卡复习中查看"), 2500).catch?.(() => {});
            debugLog("recite.ai_grade_block", `card_made id=${blockID}`, "recite");
        } catch {
            btn.disabled = false;
            void siyuan.pushMsg(say("闪卡创建失败", "闪卡创建失败"), 2500).catch?.(() => {});
        }
    });
}
