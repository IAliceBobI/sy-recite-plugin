import type { Plugin } from "siyuan";
import { confirm, Menu } from "siyuan";
import { siyuan } from "../../sy-tomato-plugin/src/libs/siyuanApi";
import { NewNodeID } from "../../sy-tomato-plugin/src/libs/utils";
import { parseIAL } from "../../sy-tomato-plugin/src/libs/strUtils";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { buildMessages, OpenAIClient } from "../../sy-tomato-plugin/src/libs/openAI";
import { RECITE_AI, RECITE_OLD } from "./constants";
import { getAIConfig } from "./aiGrade";
import { setRecitePose } from "./mascot";

/**
 * AI 拆分（2026-08-28 □34 落地；□14/2026-08-30 起新入 Pro——v1.1.0 未发布=首版即收费零背刺；
 * 门禁形态=装饰 Pro 同款：浮条入口可见不藏、unpaid 点击 pushMsg 引导。AI 判卷永免费=刚需）：
 * 原文浮条「AI 拆分」→三选菜单（复述/仿写/方向锚点）→ 整篇顶层块带编号送用户自己的思源 AI
 * （非流式一次拿全），回 JSON 按块号定位插锚点块。锚点块=批注（不打 custom-recite-old，
 * 下游抽取/对比/判卷零改动），另挂 custom-recite-ai=模式值供重跑覆盖识别——删除只认此属性，
 * 用户手写批注永不动。定位用块号而非 substring 匹配（对 recite-drill skill 管线的一处有意
 * 偏离）：整篇一次请求、无长度护栏（设计假设：文章不会太长）。
 */
export type AISplitMode = "recite" | "imitate" | "direction";

// 三模式（= 锚点文风）：slug = custom-recite-ai 属性值（勿改，重跑覆盖识别靠它）；
// mark = 锚点行首符号（菜单项前缀，与锚点文本约定一致；▶︎/✍︎ 带 U+FE0E 文本呈现变体，
// 防 macOS 把 ✍ 渲染成彩色 emoji 与单色 ▶/☰ 风格跳脱）；数量由 AI 按叙事节拍自定，不做用户参数
export const AI_SPLIT_MODES: { slug: AISplitMode; mark: string; i18nKey: string }[] = [
    { slug: "recite", mark: "▶︎", i18nKey: "复述锚点" },
    { slug: "imitate", mark: "✍︎", i18nKey: "仿写锚点" },
    { slug: "direction", mark: "☰", i18nKey: "方向锚点" },
];

const GUIDE_KEY = "sy-recite-aisplit-guide";
let running = false; // 双保险防重入（FloatBar 按钮 disabled 之外）

/**
 * 各模式的锚点文风指令（2026-08-28 拍板定稿）：复述=节拍名+3~6 名词级关键词（不写完整句——
 * 锚点泄行文即废）；仿写=节拍+技法讲解；方向=剧情一句+情绪走向（凭印象半仿半创、大概齐就行，
 * 原「骨架大纲」模式重定义并入）。
 */
function splitPrompt(mode: AISplitMode, numbered: string): string {
    const modeLines: Record<AISplitMode, string[]> = {
        recite: [
            "锚点文本格式：「▶︎ 节拍号·节拍名｜关键词1 · 关键词2 · 关键词3」。节拍名 3~6 字概括",
            "本节拍；关键词 3~6 个名词级锚点（人物/道具/数字/台词关键词），用「 · 」分隔。",
            "严禁写出完整句子、不解释技法、不做行文示范——读者只凭锚点要能想起节拍，但拼不出原句。",
        ],
        imitate: [
            "锚点文本格式：「✍︎ 节拍号·节拍名｜此处用「技法名+一句话讲解」…」。指出该节拍值得",
            "学习的写作技法（如悬念前置、感官细节、对话推进）并讲清怎么用，不抄原句。",
        ],
        direction: [
            "锚点文本格式：「☰ 节拍号｜剧情：一句话；情绪：起点 → 终点」。剧情概括本节拍发生了",
            "什么（不引原文），情绪给出变化方向。供读者凭印象半仿半创，方向对、大概齐就行。",
        ],
    };
    return [
        "下面是一篇 markdown 文章的顶层块流，每块前有编号（#1、#2…）。请通读全文，按叙事节拍",
        "为它生成写作练习锚点：每个锚点插在所属节拍收尾的那个块之后。",
        ...modeLines[mode],
        "锚点数量按叙事节拍自定（一般 5~15 个，视篇幅），宁缺毋滥。",
        "文中可能已有用户手写批注（以 ▶︎/✍︎/☰ 开头的行或其它短备注）——这些节拍用户已自己拆过，",
        "跳过它们覆盖的节拍，不要重复插锚点。",
        "输出要求：只输出一个 JSON 数组，不要任何其他文字或 markdown 代码块围栏。每项形如",
        '{"after": 块编号, "text": "锚点文本"}，after 为锚点要插到其后的那个块的编号。',
        "",
        numbered,
    ].join("\n");
}

/** 解析 AI 回复：容忍围栏/前后杂文字（掐头 [ 尾 ] 再 parse），结构不合法返回 [] 由调用方报错 */
function parsePlan(raw: string): { after: number; text: string }[] {
    const s = raw.indexOf("[");
    const e = raw.lastIndexOf("]");
    if (s < 0 || e <= s) return [];
    try {
        const arr = JSON.parse(raw.slice(s, e + 1));
        if (!Array.isArray(arr)) return [];
        return arr
            .map((it: any) => ({ after: Number(it?.after), text: String(it?.text ?? "").trim() }))
            .filter(p => Number.isInteger(p.after) && p.text);
    } catch {
        return [];
    }
}

/** 浮条入口：Pro 门禁（□14，装饰同款：入口可见不藏、unpaid 点击 pushMsg 引导）→ 首次点击
 * 引导 dialog（localStorage 免复发，弹出即记——引导是信息性的，取消也算读过）→ 三选菜单
 * （贴按钮弹出照 openSiteMenu 先例） */
export function startAISplit(plugin: Plugin, originID: string, runner: (mode: AISplitMode) => void, anchor?: HTMLElement) {
    if (!originID || running) return;
    if (document.body.classList.contains("recite-unpaid")) {
        void siyuan.pushMsg((plugin.i18n as any)["拆分Pro提示"] || "AI 拆分是 Pro 功能，激活后即可使用（AI 判卷仍免费）", 2500);
        return;
    }
    const t: any = plugin?.i18n ?? {};
    const say = (k: string, fb: string) => t[k] || fb;
    const openMenu = () => {
        // independent 第三参（2026-08-26 □7 踩坑）：confirm 确定的同步 click 栈内 open 单例菜单，
        // 会被同次冒泡到 window 的全局监听 remove 清空弹不出；independent 自管生命周期免疫
        const menu = new (Menu as any)("recite-ai-split", undefined, true) as Menu;
        AI_SPLIT_MODES.forEach(m => menu.addItem({
            label: `${m.mark} ${say(m.i18nKey, m.i18nKey)}`,
            click: () => runner(m.slug),
        }));
        setTimeout(() => {
            const r = anchor?.getBoundingClientRect();
            if (r) menu.open({ x: r.left, y: r.bottom }); // 左缘对齐按钮左缘自然右展（内核自带屏界翻转）
            else menu.open({ x: window.innerWidth - 16, y: window.innerHeight - 160, isLeft: true });
        }, 0);
    };
    if (localStorage.getItem(GUIDE_KEY)) {
        openMenu();
        return;
    }
    localStorage.setItem(GUIDE_KEY, "1");
    confirm(
        say("AI拆分引导标题", "AI 拆分 · 新手起步"),
        say("AI拆分引导内容", "AI 拆分帮你起步：它通读全文，按叙事节拍自动插入锚点批注（复述/仿写/方向三种文风），消耗你在「思源设置 → AI」配置的 AI 额度。拆分本身也是练习——熟练后建议自己写批注，自己拆的节拍才最贴自己的理解。"),
        openMenu,
    );
    // 弹层提层盖浮条（2026-08-28 vision-glm 终审 P1）：引导 dialog 常是会话首个弹窗，内核
    // zIndex 计数器自 10 起，头几个弹窗层级低于浮条根（12）会被盖。z-index 在内核 inline 挂
    // .b3-dialog 上，且 --open 类是 setTimeout 异步加的——同步选择器定位不到，走官方
    // window.siyuan.dialogs 尾元素（构造里同步 push + append）拿 .b3-dialog 改 1000 根治
    const dialogs = (window.siyuan as any)?.dialogs as any[] | undefined;
    const dlgEl = dialogs?.[dialogs.length - 1]?.element?.querySelector(".b3-dialog") as HTMLElement | undefined;
    dlgEl?.style.setProperty("z-index", "1000");
}

export async function aiSplit(plugin: Plugin, originID: string, mode: AISplitMode) {
    if (!originID || running) return;
    running = true;
    const t: any = plugin?.i18n ?? {};
    const say = (k: string, fb: string) => t[k] || fb;
    try {
        const children = await siyuan.getChildBlocks(originID);
        if (!children.length) {
            await siyuan.pushMsg("文档是空的，没有可拆分的内容", 2500);
            return;
        }
        const rows = await siyuan.getRows(children.map(c => c.id), "ial,markdown", true, [], true);
        // 旧 AI 锚点从送 AI 的块流剔除（重跑覆盖：AI 看到的与最终形态一致，编号即插入定位基准）；
        // 用户批注保留在文内，由 prompt 约束避开其节拍
        const oldAnchorIDs: string[] = [];
        const seen: { id: string; markdown: string }[] = [];
        children.forEach((c, i) => {
            const ial = parseIAL(rows[i]?.ial ?? "");
            if (AI_SPLIT_MODES.some(m => ial[RECITE_AI] === m.slug)) oldAnchorIDs.push(c.id);
            else seen.push({ id: c.id, markdown: rows[i]?.markdown ?? "" });
        });
        if (!seen.some(b => b.markdown.trim())) {
            await siyuan.pushMsg("文档里没有正文可拆分", 2500);
            return;
        }
        const cfg = await getAIConfig();
        if (!cfg) {
            confirm(
                say("未配置AI", "未配置 AI"),
                say("未配置AI内容", "未检测到可用的 AI 配置。请到「思源设置 → AI」配置并启用模型提供商（API 密钥），保存后回来重试。"),
                () => { },
            );
            return;
        }
        setRecitePose("wait", 0); // 陪等（stayMs=0 不自动退，成败再改摆）
        // 非流式一次拿全（OpenAIClient.createCompletionPublic：请求失败返回 undefined）——
        // 此时文档分毫未动；JSON 定不了位只是少插几条，不整体失败
        const numbered = seen.map((b, i) => `#${i + 1} ${b.markdown}`).join("\n\n");
        const client = new OpenAIClient(cfg.apiKey, cfg.baseURL);
        const resp = await client.createCompletionPublic(cfg.model, buildMessages(splitPrompt(mode, numbered)));
        if (!resp) {
            await siyuan.pushMsg(say("AI请求失败", "AI 请求失败，请检查网络与密钥后重试"), 3500);
            setRecitePose("error");
            return;
        }
        const msg: any = resp?.choices?.[0]?.message;
        const plan = parsePlan(typeof msg?.content === "string" && msg.content ? msg.content : msg?.reasoning_content ?? "");
        if (!plan.length) {
            await siyuan.pushMsg(say("AI返回异常", "AI 返回内容无法解析，请重试"), 3500);
            setRecitePose("error");
            return;
        }
        // 请求成功才动文档：先删旧 AI 锚点（只认 custom-recite-ai 三模式值，手写批注永不动）
        if (oldAnchorIDs.length) await siyuan.deleteBlocks(oldAnchorIDs);
        // 按编号升序逐点插 markdown 块（预置 id；同编号多条链式顺插在后防倒序）；out-of-range 跳过计数
        plan.sort((a, b) => a.after - b.after);
        let prevKey = -1;
        let prevID = "";
        const inserted: string[] = [];
        let failed = 0;
        for (const p of plan) {
            if (p.after < 1 || p.after > seen.length) {
                failed++;
                continue;
            }
            const target = p.after === prevKey ? prevID : seen[p.after - 1].id;
            const id = NewNodeID();
            await siyuan.insertBlockAfter(`${p.text}\n{: id="${id}"}`, target, "markdown");
            if (await siyuan.checkBlockExist(id)) {
                inserted.push(id);
                prevKey = p.after;
                prevID = id;
            } else {
                failed++;
            }
        }
        if (!inserted.length) {
            await siyuan.pushMsg(say("拆分失败", "锚点块插入失败，请重试"), 3500);
            setRecitePose("error");
            return;
        }
        // 最后统一挂属性（防「打 custom 标记后 ~2s 内 insertBlock 竞态继承」坑，recite-drill 踩过）：
        // custom-recite-ai 标模式供重跑识别；显式空值清 custom-recite-old——刚开仿写模式就点拆分时，
        // 插在原文块后的锚点会竞态继承 old 标记错失批注身份（CSS 染色认属性存在性，空值即删）
        for (const id of inserted) {
            await siyuan.setBlockAttrs(id, { [RECITE_AI]: mode, [RECITE_OLD]: "" } as AttrType);
        }
        setRecitePose("great", 1600);
        debugLog("recite.aiSplit", `origin=${originID} mode=${mode} plan=${plan.length} inserted=${inserted.length} failed=${failed} removedOld=${oldAnchorIDs.length} model=${cfg.model}`, "recite");
        await siyuan.pushMsg(
            failed
                ? say("拆分完成·失败", `已插入 ${inserted.length} 个锚点（${failed} 个定位失败跳过）`)
                    .replace("{n}", String(inserted.length)).replace("{m}", String(failed))
                : say("拆分完成", `已插入 ${inserted.length} 个锚点`).replace("{n}", String(inserted.length)),
            2500,
        );
    } catch (e) { // 请求失败/异常：文档分毫不动（动文档的步骤都在请求成功之后）
        debugLog("recite.aiSplit", `request error: ${e}`, "recite");
        await siyuan.pushMsg(say("AI请求失败", "AI 请求失败，请检查网络与密钥后重试"), 3500);
        setRecitePose("error");
    } finally {
        running = false;
    }
}
