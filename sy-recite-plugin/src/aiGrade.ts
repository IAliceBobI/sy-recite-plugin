import type { Plugin } from "siyuan";
import { confirm } from "siyuan";
import { siyuan } from "../../sy-tomato-plugin/src/libs/siyuanApi";
import { NewNodeID, cancelSuperBlock } from "../../sy-tomato-plugin/src/libs/utils";
import { parseIAL } from "../../sy-tomato-plugin/src/libs/strUtils";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { OpenAIClient, buildMessages, appendChunk, stripThinkTag, getOfficialConfig } from "../../sy-tomato-plugin/src/libs/openAI";
import type { StreamState } from "../../sy-tomato-plugin/src/libs/openAI";
import { RECITE_COMPARE, RECITE_AI } from "./constants";
import { readExtractDoc } from "./extract";
import { buildPrompt, GRADER_TONES, DEFAULT_TONE_SLUG, TONE_SETTING_KEY } from "./promptCopy";
import { setRecitePose, parsePose, stripPoseLine, poseWithTone } from "./mascot";

/**
 * AI 当场判卷（2026-08-25，免费功能不进门禁）：对比文档浮条「AI 判卷」按钮 →
 * 复用判卷提示词（buildPrompt）+ 思源官方 AI 密钥流式生成，结果写入对比文档最末。
 * 结构朴素优先：判卷头（块引用「🧑‍🏫 AI 判卷 · 时间」挂 custom-recite-ai 仅作弱视觉）+
 * AI 输出拆成的普通块（流式期临时装在 super block 里承接多块 markdown，完成后 cancelSuperBlock
 * 拆包——照抄 tomato openAI.ts do_completions 的流式写块手法）；重复判卷覆盖旧节（见 deleteOldGradeSections）。
 */
let running = false; // 双保险防重入（FloatBar 按钮 disabled 之外，命令/其它入口共用）

/**
 * 密钥读取两级兜底：getOfficialConfig 读 window.siyuan.config（启动快照，思源启动后才配的
 * 密钥拿不到）→ 拿不到走 /api/system/getConf 实时读内核 conf.ai.providers（同插件 fetch 通道，
 * ToolbarBox 既有先例）。两级都无 → 返回 undefined 由调用方弹引导。
 */
export async function getAIConfig(): Promise<{ apiKey: string; baseURL: string; model: string } | undefined> {
    const snap = getOfficialConfig();
    if (snap) return snap;
    try {
        const ret = await siyuan.getConf();
        const providers = (ret?.conf?.ai as any)?.providers;
        if (Array.isArray(providers)) {
            for (const p of providers) {
                if (!p?.enabled || !p.apiKey || !p.baseURL) continue;
                const m = (p.models || []).find((mm: any) => mm?.enabled && mm.name);
                if (m) return { apiKey: p.apiKey, baseURL: p.baseURL, model: m.name };
            }
        }
    } catch (e) {
        debugLog("recite.aiGrade", `getConf fallback failed: ${e}`, "recite");
    }
    return undefined;
}

/**
 * 删旧判卷节（覆盖语义，2026-08-25）：判卷节天然在文档末尾（appendBlock 追加成节），顶层块流里
 * 第一个 custom-recite-ai 头块到文档末尾整段删除——旧追加语义攒下的多节一并清掉，只留最新一次。
 * 零旧节返回 0。调用时机在新流建立成功之后：请求失败时旧判卷原样保留，文档不动。
 */
async function deleteOldGradeSections(compareID: string): Promise<number> {
    const children = await siyuan.getChildBlocks(compareID);
    if (!children.length) return 0;
    const rows = await siyuan.getRows(children.map(c => c.id), "ial", true, [], true);
    const start = rows.findIndex(r => parseIAL(r?.ial ?? "")[RECITE_AI]);
    if (start < 0) return 0;
    await siyuan.deleteBlocks(children.slice(start).map(c => c.id));
    return children.length - start;
}

export async function aiGrade(plugin: Plugin, compareID: string) {
    if (!compareID || running) return;
    running = true;
    const t: any = plugin?.i18n ?? {};
    const say = (k: string, fallback: string) => t[k] || fallback;
    try {
        const attrs = await siyuan.getBlockAttrs(compareID);
        const extractID = attrs?.[RECITE_COMPARE]; // 对比文档身份属性 → 抽取文档 id（数据源）
        if (!extractID) {
            await siyuan.pushMsg("请在对比文档中点击「AI 判卷」", 2500);
            return;
        }
        const entries = await readExtractDoc(extractID);
        if (!entries.length) {
            await siyuan.pushMsg("抽取文档里没有批注（旧版布局请先「重新写」）", 3000);
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
        // 先建流后动文档：请求失败（密钥/网络/模型）时原文档分毫不动；流已建立才覆盖旧判卷节
        const tone = (plugin as any)?.settingCfg?.[TONE_SETTING_KEY];
        const toneHit = GRADER_TONES.find(t => t.slug === tone);
        const client = new OpenAIClient(cfg.apiKey, cfg.baseURL);
        const stream = await client.createStreamPublic(cfg.model, buildMessages(await buildPrompt(entries, tone, true)));
        if (!stream) {
            await siyuan.pushMsg(say("AI请求失败", "AI 请求失败，请检查网络与密钥后重试"), 3500);
            return;
        }
        setRecitePose("wait", 0); // 小宠物出场打盹等分（流已建立才算真开始等；stayMs=0 不自动退）
        const removedOld = await deleteOldGradeSections(compareID);
        // 判卷头：块引用 + 时间戳 + custom-recite-ai（仅 CSS 弱视觉，正文不依赖任何属性）；
        // 非中立档头行带当次判官档位名（判卷历史可追溯用的什么口吻）
        const toneLabel = toneHit && toneHit.slug !== DEFAULT_TONE_SLUG
            ? ` · ${say(toneHit.i18nKey, toneHit.i18nKey.split("·")[1])}` : "";
        const now = new Date();
        const p2 = (n: number) => String(n).padStart(2, "0");
        const stamp = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())} ${p2(now.getHours())}:${p2(now.getMinutes())}`;
        const hdrID = NewNodeID();
        const bodyID = NewNodeID();
        await siyuan.appendBlock(`> 🧑‍🏫 ${say("AI判卷标题", "AI 判卷")}${toneLabel} · ${stamp}\n{: id="${hdrID}" ${RECITE_AI}="1"}`, compareID);
        if (!(await siyuan.checkBlockExist(hdrID))) { // 预置 id 未生效（markdown IAL 异常）即止损
            await siyuan.pushMsg("判卷块创建失败，请重试", 3000);
            setRecitePose("error");
            return;
        }
        await siyuan.insertBlockAfter(`{: id="${bodyID}"}`, hdrID);
        // 流式写块（tomato 手法）：单块 super block 承接任意多块 markdown，IAL 保 id 增量重写；
        // <pose> 协议行在 write 内统一剥离（流式期截末尾残片，完整行整体删），正文零污染
        const write = (txt: string) => siyuan.safeUpdateBlock(bodyID, `{{{row\n\n${stripPoseLine(txt)}\n\n}}}\n{: id="${bodyID}"}`);
        let respLen = 0;
        let resp = ""; // 提到 try 外：流结束后 parsePose 还要用（协议行成绩驱动宠物）
        try {
            let state: StreamState = { texts: [], reasoning_texts: [], count: 0 };
            for await (const chunk of stream) {
                const r = appendChunk(state, chunk);
                state = r.state;
                resp = r.display;
                if (state.count % 50 === 0) await write(resp);
            }
            if (!resp.trim()) { // 空响应（上游异常收流）：清掉刚建的两块，文档回到判卷前
                await siyuan.deleteBlocks([hdrID, bodyID]).catch(() => { });
                await siyuan.pushMsg(say("AI响应中断", "AI 响应中断，已还原文档，请重试"), 3500);
                setRecitePose("error");
                return;
            }
            respLen = resp.length;
            await write(stripThinkTag(resp));
        } catch (e) { // 流中途断（网络掉线等）：清块还原 + 报错
            debugLog("recite.aiGrade", `stream error: ${e}`, "recite");
            await siyuan.deleteBlocks([hdrID, bodyID]).catch(() => { });
            await siyuan.pushMsg(say("AI响应中断", "AI 响应中断，已还原文档，请重试"), 3500);
            setRecitePose("error");
            return;
        }
        await cancelSuperBlock(bodyID); // 拆掉流式临时 sb，正文还原为普通块组合
        // 宠物按成绩摆表情：协议行成绩 × 判官等级组合（gentle-great/strict-poor 特征态 CSS
        // 门禁内生效）；AI 没回标记（undefined）保守回落 idle 待机脸，6s 自动退场
        const grade = parsePose(resp);
        setRecitePose(grade ? poseWithTone(grade, toneHit?.slug) : "idle");
        debugLog("recite.aiGrade", `compare=${compareID} hdr=${hdrID} model=${cfg.model} tone=${toneHit?.slug ?? DEFAULT_TONE_SLUG} entries=${entries.length} chars=${respLen} removedOld=${removedOld} pose=${grade ?? "none"}`, "recite");
        await siyuan.pushMsg(say("判卷完成", "AI 判卷完成，结果已插入文档末尾"), 2500);
    } finally {
        running = false;
    }
}
