// □5（仿写上下文升级战役）单题就地对照——q-ctrl 控制块纯函数层（aiGradeBlock.ts 同构）。
// 设计拍板（handoff 2026-09-08-2022 □5 mini-spec）：入口=极简控制块，抽取时每题写位后插
// ;;;sy-recite-plugin/q-ctrl + 一行 JSON（tail-card 同款 id 引用形态，存储≈零；重抽跟
// 锚点/写位一起重建=幂等天然成立）。渲染器在 qCtrlRender.ts（本文件不 import extract，
// extract 反向 import 本文件做回填——避免循环依赖，anno-chat/ai-grade 家族同构分工）。
// 内核契约（exp/apirenew-report.md + 6811 实测 2026-09-08）：custom 块 DOM=
// data-type="NodeCustomBlock" + data-info="sy-recite-plugin/q-ctrl" + data-content=JSON，
// 事务 HTML 通道（BlockDOM2Tree）落盘围栏 kramdown 正确；content 含纯 ;;; 行拒写——
// JSON.stringify 单行天然满足。事务插入的块 id 一律被内核重生成（预挂 data-node-id
// 无效，两种 id 格式实测均被重置）——故控制块走「插后回填」拿真实锚点 id。
import { siyuan } from "../../sy-tomato-plugin/src/libs/siyuanApi";
import { debugLog } from "../../sy-tomato-plugin/src/libs/logUtils";
import { RECITE_NOTE, RECITE_KEEP } from "./constants";

export const Q_CTRL_BLOCK_TYPE = "q-ctrl";
export const Q_CTRL_FENCE = ";;;sy-recite-plugin/q-ctrl";
/** data-info（内核 encodeCustomBlockInfo：encodeURIComponent 两段拼 /，本名无特殊字符即原样） */
const Q_CTRL_INFO = "sy-recite-plugin/q-ctrl";

export interface QCtrlData {
    v: 1;
    /** 锚点块 id（该题总结块，refs/题目都在它身上） */
    noteID: string;
}

export function buildQCtrlContent(noteID: string): string {
    return JSON.stringify({ v: 1, noteID });
}

/** 控制块宿主 HTML（事务 insert data 用）：DOM 构造让 outerHTML 自动转义 data-content 引号 */
export function buildQCtrlBlockDOM(noteID: string): string {
    const div = document.createElement("div");
    div.setAttribute("data-type", "NodeCustomBlock");
    div.setAttribute("data-info", Q_CTRL_INFO);
    div.setAttribute("data-content", buildQCtrlContent(noteID));
    return div.outerHTML;
}

/** 容错解析：坏 JSON/版本不符/noteID 缺失 → null（渲染层显占位） */
export function parseQCtrlContent(content: string): QCtrlData | null {
    let raw: unknown;
    try {
        raw = JSON.parse(content);
    } catch {
        return null;
    }
    if (typeof raw !== "object" || raw === null) return null;
    const o = raw as Record<string, unknown>;
    if (o.v !== 1 || typeof o.noteID !== "string" || !o.noteID.trim()) return null;
    return { v: 1, noteID: o.noteID };
}

/** readExtractDoc 的控制块判据：SQL/getChildBlocks 的 markdown 首行即围栏（6811 实测） */
export function isQCtrlMarkdown(markdown: string): boolean {
    return typeof markdown === "string" && markdown.startsWith(Q_CTRL_FENCE);
}

/** DOM 判据：块元素是否 q-ctrl 控制块宿主（writeZone 打标排除用） */
export function isQCtrlHost(el: Element): boolean {
    return !!el && el.getAttribute("data-type") === "NodeCustomBlock" && el.getAttribute("data-info") === Q_CTRL_INFO;
}

/** 最小注册面接口（siyuan 类型声明无 customBlockRenders，annoChatRender 同款结构化窄化） */
export interface CustomBlockPlugin {
    customBlockRenders?: Record<string, unknown>;
    i18n?: Record<string, string>;
}

let pluginRef: CustomBlockPlugin | null = null;

/** qCtrlRender 注册渲染器时回填 pluginRef（特性检测/i18n 共用，aiGradeRender 同款模式） */
export function markQCtrlPlugin(plugin: CustomBlockPlugin): void {
    pluginRef = plugin;
}

/** 特性检测：3.8.3+ 且渲染器已注册（回填判据；旧内核=围栏原文一行，不回填） */
export function supportsQCtrlBlock(): boolean {
    try {
        const renders = pluginRef?.customBlockRenders;
        return !!renders && typeof renders[Q_CTRL_BLOCK_TYPE] === "object";
    } catch {
        return false;
    }
}

/**
 * 回填区间扫描纯函数（backfillQCtrlBlocks 核心，单测面）：顶层块的 note/keep 属性序列 →
 * 每题 [锚点id, 区间末块id]。区间末=锚点到下一锚点（或文末）之间最后一个非 keep 块——
 * 抽取时刻即写位（空写位是区间末块；多行题续行在锚点后不破坏判定）；keep 段在组前/文末
 * 属区间外不挪落点（判定顺序 keep 先，与 readExtractDoc 一致消灭未来分叉点，review P2-5）。
 * 锚点后无普通块（理论不发生——units 每题带写位）跳过该题。
 */
export function qCtrlAnchorTails(props: { id: string; note?: string | null; keep?: string | null }[]): [string, string][] {
    const pairs: [string, string][] = [];
    let noteID: string | null = null;
    let tailID: string | null = null;
    const flush = () => {
        if (noteID && tailID) pairs.push([noteID, tailID]);
        noteID = null;
        tailID = null;
    };
    props.forEach(p => {
        if (p.keep) return;                    // keep：区间外不挪落点
        if (p.note) { flush(); noteID = p.id; } // 锚点：开新题（自己不算写位）
        else tailID = p.id;                     // 普通块（写位/复述/续行）：刷新区间末
    });
    flush();
    return pairs;
}

/**
 * 回填控制块：文档建成读真实锚点 id（事务插入的块 id 一律被内核重生成，前向引用拿不到），
 * 逐题在写位后插控制块（qCtrlAnchorTails 定位）。IAL 走 cache-first batchGetBlockAttrs
 * （identifyNotes 同源：文档刚建完 SQL ial 列有秒级索引窗）。单事务批量插；返回回填题数。
 */
export async function backfillQCtrlBlocks(extractID: string): Promise<number> {
    if (!supportsQCtrlBlock()) return 0; // 旧内核：不回填（围栏形态可接受）
    const children = await siyuan.getChildBlocks(extractID).catch(() => []);
    if (!children.length) return 0;
    const ials = await siyuan.batchGetBlockAttrs(children.map(c => c.id)).catch(() => null);
    if (!ials) return 0;
    const pairs = qCtrlAnchorTails(children.map(c => {
        const ial = ials[c.id] ?? {};
        return { id: c.id, note: ial[RECITE_NOTE], keep: ial[RECITE_KEEP] };
    }));
    const ops: IOperation[] = pairs.flatMap(([noteID, tailID]) =>
        siyuan.transInsertBlocksAfter([buildQCtrlBlockDOM(noteID)], tailID));
    if (ops.length) {
        // siyuan.call 内核拒绝只返回 null 不 reject（仓内已知）——判空防「日志说回填了
        // 实际被吞」的假成功（review P2-2）
        const r = await siyuan.transactions(ops).catch(e => {
            debugLog("recite.q_ctrl", `backfill tx failed: ${e}`, "recite");
            return null;
        });
        if (!r) {
            debugLog("recite.q_ctrl", `backfill tx rejected extract=${extractID.slice(-8)} units=${ops.length}`, "recite");
            return 0;
        }
    }
    debugLog("recite.q_ctrl", `backfill extract=${extractID.slice(-8)} blocks=${children.length} units=${ops.length}`, "recite");
    return ops.length;
}
