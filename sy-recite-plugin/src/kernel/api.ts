// kernel 侧思源 API 薄封装：一律走 siyuan.client.fetch（内核代理 REST + 插件 JWT 自鉴权）。
// 端点与参数同前端 siyuanApi 逐一对齐；勿 import 前端 siyuanApi——其依赖 window/fetch/Lute 全局。
import type { IFetchResponse } from "siyuan/kernel";

export interface KBlock {
  id: string;
  type?: string;
  markdown?: string;
  ial?: string;
  hpath?: string;
  box?: string;
  path?: string;
  content?: string;
  updated?: string;
}

export async function call(path: `/${string}`, payload?: Record<string, any>): Promise<any> {
  const resp: IFetchResponse = await siyuan.client.fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
  const d = await resp.json();
  if (d && typeof d.code === "number" && d.code !== 0) {
    throw new Error(`API ${path} code=${d.code} ${String(d.msg ?? "").slice(0, 120)}`.trim());
  }
  return d?.data ?? d;
}

/** 顶层子块平铺（保文档序、无翻页） */
export async function getChildBlocks(id: string): Promise<KBlock[]> {
  return (await call("/api/block/getChildBlocks", { id })) ?? [];
}

export async function sql<T = KBlock>(stmt: string): Promise<T[]> {
  return (await call("/api/query/sql", { stmt })) ?? [];
}

/** id→行 映射（调用方自持文档序，不走 SQL 乱序回排） */
export async function rowsById(ids: string[], selected: string): Promise<Map<string, KBlock>> {
  const map = new Map<string, KBlock>();
  if (!ids.length) return map;
  const ph = ids.map(id => `"${id}"`).join(",");
  const rows = await sql(`SELECT id, ${selected} FROM blocks WHERE id IN (${ph}) LIMIT 100000000`);
  rows.forEach(r => map.set(r.id, r));
  return map;
}

export async function getBlockAttrs(id: string): Promise<Record<string, string>> {
  return (await call("/api/attr/getBlockAttrs", { id })) ?? {};
}

export async function batchGetBlockAttrs(ids: string[]): Promise<Record<string, Record<string, string>>> {
  return (await call("/api/attr/batchGetBlockAttrs", { ids })) ?? {};
}

export async function setBlockAttrs(id: string, attrs: Record<string, string>): Promise<void> {
  await call("/api/attr/setBlockAttrs", { id, attrs });
}

export interface IOperation {
  action: string;
  id?: string;
  data?: string;
  previousID?: string;
  parentID?: string;
}

/** 事务提交；返回内核回显的 doOperations（insert op 的 id=真实生成的块 id——插后回填唯一通道） */
export async function transactions(ops: IOperation[]): Promise<IOperation[]> {
  if (!ops.length) return [];
  const ret = await call("/api/transactions", {
    reqId: Date.now(), // 内核必填字段（前端 siyuanApi 同款）
    session: "sy-recite-kernel",
    app: "sy-recite-kernel",
    transactions: [{ doOperations: ops, undoOperations: [] }],
  });
  return (ret ?? [])[0]?.doOperations ?? [];
}

export async function insertBlockAfter(data: string, previousID: string, dataType: "markdown" | "dom" = "markdown"): Promise<string> {
  const ret = await call("/api/block/insertBlock", { data, dataType, previousID });
  // markdown 通道显式 {: id="…"} 被认领；响应 doOperations[0].id=落位块 id（同前端 aiSplit 契约）
  return ((ret ?? [])[0] as any)?.doOperations?.[0]?.id ?? "";
}

// ============================================
// 建档双通道（思源 3.8.9 结构化寻址适配；事实源=docs/addr-adapt/master-spec.md §2 与
// contract-createDocByParent.md，策略与前端 tomato siyuanApi.createDocSmart 同源、代码独立
// ——kernel/api.ts 本是独立拷贝，勿 import 前端件）。3.8.9 起 /api/filetree/createDocWithMd
// 旧 hPath 寻址受限（干净路径暂放行、脏路径报 legacy 类错，正式版随时可能全禁）。策略=旧端点
// 优先（3.8.8 全兼容+自动补建父级+同名静默认领），被内核以 legacy 类 reason 拒或端点被删
// （HTTP 404/非 JSON）→ 按路径记拒绝集、切 createDocByParent 新端点；C 档 parentID 直给
// （B0：reciteTools 建档父=originID 恒在手），不传退化 A 档 resolveParentChain 全段解析+
// 逐级补建+同名认领。穷尽后 throw DocCreateError（call 的 throw 语义保住——wrapHandler 兜成
// errorResponse 回 MCP）。最简形态：无 attr 分支（recite kernel 建档点均空 markdown、身份
// 属性由调用方尾部 setBlockAttrs 后挂——reciteTools.ts 假成功防护序勿挪）。goja 无
// navigator.locks/Lute——newNodeID 自产、并发窗口残留（与旧通道内核 createDocLock 全局锁
// 的差距诚实接受，nameConditions 乐观锁缓解，master-spec §2.1）。

/** 建档穷尽两通道后的显式失败。commitState=committed 时文档已落盘（排序/模板阶段失败但
 *  源已提交）勿盲目重试；unknown=请求可能已落地，docID 尽量携带供复核。 */
export class DocCreateError extends Error {
  constructor(
    public reason: string, // 内核 data.reason（legacyPathUnsupported/parentUnavailable/…）或封内合成码
    public lastMsg: string,
    public commitState: "none" | "committed" | "unknown" = "none",
    public docID?: string,
  ) {
    super(`doc create failed [${reason}] ${lastMsg}`.trim());
    this.name = "DocCreateError";
  }
}

/** 传输/响应形态层异常（区别于内核业务 {code,msg,data}）：http=HTTP 404（端点被删形态=
 *  legacy 信号，contract §8）、badJson=响应非 JSON（同上）、network=fetch 本身失败（瞬态，
 *  不作 legacy 信号）。 */
class EndpointTransportError extends Error {
  constructor(msg: string, public kind: "network" | "http" | "badJson", public status = 0) {
    super(msg);
    this.name = "EndpointTransportError";
  }
}

/** 旧端点拒绝集（按 "box|path" 记，决策 §4.2）：同路径后续建档直走新通道，异路径仍先试
 *  旧通道（contract §6 判定是路径级，全局置位会把一次脏路径事件放大成全会话切新）。
 *  ≤128 条、模块级不持久化；全禁形态下代价=每条新路径首建一次失败往返（建档非高频）。 */
const legacyPathRejects = new Set<string>();
function markLegacyRejected(key: string) {
  if (legacyPathRejects.size >= 128) legacyPathRejects.clear();
  legacyPathRejects.add(key);
}

/** kernel 侧留痕（无 tomato debugLog/Loki 通道，走插件 logger；单测无 logger 静默） */
function addrLog(msg: string) {
  try { siyuan.logger?.info(`[kernel] addr ${msg}`); } catch { /* 静默 */ }
}

/** 建档 hpath 末段净化（对齐前端 sanitizePathTail）：末段 / → 全角／、控制符 → 空格——
 *  旧端点内核按 / 劈段，名含 / 静默劈两层；前缀段是调用方故意拼的层级不动。幂等。 */
function sanitizePathTail(pathReadable: string): string {
  const idx = pathReadable.lastIndexOf("/");
  const head = idx < 0 ? "" : pathReadable.slice(0, idx + 1);
  const tail = (idx < 0 ? pathReadable : pathReadable.slice(idx + 1))
    .replace(/[\t\r\n\u2028\u2029]/g, " ").replace(/\//g, "／");
  return head + tail;
}

/** 用户字符串级净化（对齐前端 sanitizeName）：A 档补建中间段用——含 / 标题会污染整条
 *  hpath 旧寻址链（亲手造 legacy 脏数据，contract §10）。幂等。 */
function sanitizeName(name: string): string {
  return name.replace(/[\t\r\n\u2028\u2029]/g, " ").replace(/\//g, "／");
}

/** 标题建档前净化：两端 trim + 512 rune 截断。trim=新端点 3.8.9 invalidTitle 拒前导/尾随
 *  空白（含全角空格 U+3000，JS .trim() 全覆盖；句中空白无碍）——触发案例=digestDocTitle
 *  取内容前 10 字恰以空格收尾；trim 在控制符→空格替换之后（sanitizeName 先行，否则替出的
 *  空格漏网）、截断在 trim 之后（超长截 512 后截断点可恰落空白——出口再 trim 钉死两端净）。
 *  截断对齐旧端点静默截断语义（评审#7②：新端点 invalidTitle 拒超长——封内截断防「截断
 *  建档」变 throw）；rune 感知防 UTF-16 代理对劈半。trim 后空串由调用方空检查兜住。 */
function sanitizeTitleForKernel(title: string): string {
  const t = title.trim();
  const runes = Array.from(t);
  if (runes.length <= 512) return t;
  addrLog(`title ${runes.length} runes clipped to 512 (kernel legacy silent-truncation parity)`);
  return runes.slice(0, 512).join("").trim();
}

/** 完整响应版 call（建档族封内专用，call 对外 throw 语义不动——决策 §4.1）：返
 *  {code,msg,data} 全量信封供读 data.reason 分诊；404/非 JSON/fetch 失败以
 *  EndpointTransportError throw（404 与 badJson=端点被删形态 → legacy 信号）。 */
async function callFull(path: `/${string}`, payload: Record<string, unknown>): Promise<{ code?: number; msg?: string; data?: any }> {
  let resp: IFetchResponse;
  try {
    resp = await siyuan.client.fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    throw new EndpointTransportError(e instanceof Error ? e.message : String(e), "network");
  }
  if (resp.status === 404) throw new EndpointTransportError(`HTTP 404 ${path}`, "http", 404);
  // 显式 false 才当 HTTP 失败（undefined=非标准响应形态放行走 json；思源业务错恒走
  // 200+{code:-1} 信封，5xx 罕见——body 可解析则照常分诊，不可解析落 badJson）
  if (resp.ok === false) return { code: resp.status, msg: `HTTP ${resp.status} ${path}` };
  try {
    return await resp.json();
  } catch (e) {
    throw new EndpointTransportError(`non-JSON response from ${path}`, "badJson", resp.status);
  }
}

/** createDocByParent/resolveDocPath 的同名乐观锁条件（contract §2/§7：三键必在、
 *  title 非 null、parentID/expectedID 可 null） */
interface DocNameCondition {
  parentID: string | null;
  title: string;
  expectedID: string | null;
}

/** 新端点链路中间态重试信号（补建中间段遇 parentUnavailable/planChanged 时上抛，
 *  由 createDocSmart 清拒绝集整链重试一次） */
class ChainRetrySignal extends Error {
  constructor(public reason: string, public msg: string) {
    super(reason);
  }
}

/** createDocByParent 单发（未知字段零携带——内核 DisallowUnknownFields，contract §2：
 *  旧接口的 path 等字段顺手传进来会直接解码失败）。返回成败结构不 throw，供
 *  resolveParentChain（中间段）与 createDocSmart（叶子）各自按 reason 分诊。 */
async function createByParentOnce(
  box: string,
  parentID: string | null, // 根级固定 null（传笔记本 ID 不可靠：boxDocEnabled 默认关，contract §4）
  id: string,
  title: string,
  markdown: string, // 空串合法（建空文档）
  nameConditions?: DocNameCondition[],
): Promise<{ ok: boolean; id?: string; reason?: string; msg?: string; commitState?: string }> {
  const req: Record<string, unknown> = {
    notebook: box,
    parentID,
    id,
    title: { format: "plain", text: title },
    markdown,
  };
  if (nameConditions?.length) req.nameConditions = nameConditions;
  const resp = await callFull("/api/filetree/createDocByParent", req);
  if (resp.code === 0) {
    const dataID = resp.data?.id; // 新端点返 {id,document} 对象——封内解包保「调用点拿 id 字符串」契约
    return { ok: true, id: typeof dataID === "string" && dataID ? dataID : id };
  }
  const f = resp.data ?? {};
  return {
    ok: false,
    reason: typeof f.reason === "string" ? f.reason : `code=${resp.code}`,
    msg: resp.msg ?? "",
    commitState: typeof f.commitState === "string" ? f.commitState : "none",
    id: typeof f.id === "string" ? f.id : undefined,
  };
}

/** A 档全段解析+逐级补建（createDocSmart 新通道专用，3.8.9+）：resolveDocPath 逐级精确
 *  匹配标题。resolved=全段命中（含末段）=同名认领——对齐旧端点 hpathBtMap 复用语义（评审
 *  #7①）；ambiguous=取首候选+留痕续解析余段（决策 §4.5：中间层全是插件自管目录，不弹选择）；
 *  missing=自 nextIndex 起逐级补建中间段（叶子由调用方携真实 markdown 落）。首个补建段带
 *  missing 响应的 nameConditions 乐观锁（并发改动链路内核报 planChanged，评审#7③）。
 *  resolve 查询与补建落盘同用 sanitizeTitleForKernel∘sanitizeName 净化段名——原段名查、
 *  trim 名建会让带空白中间段首轮 miss 补建落盘 trim 名后，此后每次同 hpath 查询恒 miss→
 *  重复补建（思源允许同名兄弟）；两函数均幂等，已净化的段再过不变。 */
async function resolveParentChain(
  box: string,
  segments: string[], // 全段（含末段叶子，均非空）
): Promise<{ claimID?: string; parentID: string | null; nameConditions?: DocNameCondition[] }> {
  let start: { kind: "root" } | { kind: "document"; id: string } = { kind: "root" };
  let rest = segments.map(s => sanitizeTitleForKernel(sanitizeName(s)));
  for (;;) {
    const resp = await callFull("/api/filetree/resolveDocPath", { notebook: box, start, segments: rest });
    if (resp.code !== 0) {
      const reason = resp.data?.reason;
      throw new DocCreateError(typeof reason === "string" ? reason : `code=${resp.code}`, resp.msg ?? "");
    }
    const d = resp.data ?? {};
    if (d.status === "resolved") {
      const leafID = d.resolved?.id;
      if (leafID) return { claimID: leafID, parentID: null };
      // 空 segments+root start 形态 resolved=null（无段可解析=根）——交调用方根级建档
      return { parentID: null };
    }
    if (d.status === "ambiguous") {
      const first: string | undefined = d.candidates?.[0]?.id;
      addrLog(`resolveDocPath ambiguous at #${d.nextIndex} "${rest[d.nextIndex] ?? ""}" — 取首候选 ${first}（决策：不弹选择）`);
      if (!first) throw new DocCreateError("pathAmbiguous", "ambiguous response carries no candidate");
      start = { kind: "document", id: first };
      rest = rest.slice(d.nextIndex + 1);
      continue;
    }
    // missing：nextIndex=首个缺失段。resolved=已解析最深文档（nextIndex=0 时为 null=根）
    const from = typeof d.nextIndex === "number" ? d.nextIndex : 0;
    let parentID: string | null = d.resolved?.id ?? null;
    let conditions: DocNameCondition[] | undefined = Array.isArray(d.nameConditions) ? d.nameConditions : undefined;
    for (let i = from; i < rest.length - 1; i++) { // 只补中间段，叶子留给调用方
      const segTitle = sanitizeTitleForKernel(sanitizeName(rest[i]));
      if (!segTitle) throw new DocCreateError("invalidTitle", `empty segment #${i} in [${rest.join("/")}]`);
      const nid = newNodeID();
      const r = await createByParentOnce(box, parentID, nid, segTitle, "", i === from ? conditions : undefined);
      if (!r.ok) {
        if (r.reason === "parentUnavailable" || r.reason === "planChanged") {
          throw new ChainRetrySignal(String(r.reason), r.msg ?? "");
        }
        throw new DocCreateError(r.reason ?? "writeFailed", r.msg ?? "", (r.commitState ?? "none") as "none" | "committed" | "unknown", r.id);
      }
      parentID = r.id ?? nid;
      conditions = undefined; // 乐观锁只挂首个补建段（后续段挂自建父下，独占无竞态）
    }
    // 末段即首个缺失段时，乐观锁随叶子建档；中间段全建完则叶子挂自建父下、无需锁
    return { parentID, nameConditions: from === rest.length - 1 ? conditions : undefined };
  }
}

/** 建档双通道统一入口：旧端点 code=0 直通；legacy 类 reason（legacyPathUnsupported/
 *  pathAmbiguous/indexUnavailable）或端点被删（404/非 JSON）→ 记拒绝集切新通道；
 *  其余 code≠0 直接 throw（保 kernel call 的显式报错语义）。data 空兜底序=回填预生成
 *  id → SQL 回查 → 仍不中=索引窗（文档已落盘）返 ""+留痕不 throw 不重试（评审#2：误判
 *  失败诱重试会建重复文档）。parentUnavailable/planChanged 清拒绝集整链重试一次；
 *  commitState=committed 当成功（防重复建档）。 */
export async function createDocSmart(
  box: string,
  hpath: string,
  markdown: string,
  opts: { id?: string; parentID?: string } = {},
): Promise<string> {
  // 出口末段净化（幂等）：两通道共用净化后 path（查建同源）；末段即新端点 title（发送前
  // 两端 trim——旧通道 path 原样：3.8.9 起旧端点已全禁恒拒，无标题一致性负担）
  const path = sanitizePathTail(hpath);
  const segs = path.split("/").filter(s => s !== "");
  const title = sanitizeTitleForKernel(segs.pop() ?? "");
  if (!title) throw new DocCreateError("invalidTitle", `empty document title in hpath "${path}"`);
  // ""（非法值，封内拒绝）与 undefined（不传=A 档全段解析）显式区分（评审2轮#6）
  if (opts.parentID === "") throw new DocCreateError("parentUnavailable", "parentID: empty string is not a valid parent (use null or omit)");
  const rejectKey = `${box}|${path}`;

  // ── 旧通道：该路径不在拒绝集才试（旧端点独有自动补建+同名静默认领，故旧优先——决策 §4.3）──
  let id = "";
  if (!legacyPathRejects.has(rejectKey)) {
    try {
      const resp = await callFull("/api/filetree/createDocWithMd", opts.id
        ? { notebook: box, path, markdown, id: opts.id }
        : { notebook: box, path, markdown });
      if (resp.code === 0) {
        id = typeof resp.data === "string" ? resp.data : "";
        if (!id) {
          // data 空兜底：①回填预生成 id（已随文档落盘最稳）②SQL 回查（值 " 双写转义——
          // /api/query 只收语句串无参数化通道；catch 归空=前端 call 吞错同语义——回查
          // 失败勿落新通道重复建档）③仍不中=索引窗返 ""（旧静默契约，不 throw）
          const esc = (s: string) => s.replaceAll(`"`, `""`);
          const rows = await sql<KBlock>(`select id from blocks where box="${esc(box)}" and hpath="${esc(path)}" and type='d' limit 1`).catch(() => [] as KBlock[]);
          id = opts.id ?? rows[0]?.id ?? "";
          if (!id) {
            addrLog(`createDocWithMd code=0 but data empty (kernel data:null window) path=${path} — silent "" per legacy contract`);
            return "";
          }
        }
      } else {
        const reason = resp.data?.reason;
        if (reason === "legacyPathUnsupported" || reason === "pathAmbiguous" || reason === "indexUnavailable"
          // issue #28（渐进仓反馈，recite 同款双通道）：3.8.9 旧端点父级自动补建恒败——事务内
          // 新父文档 metadata 未提交、预检重解析父链必 miss（kernel v3.8.9
          // treenode/document_legacy.go），裸错误回包无 reason 只有 msg 哨兵串；切新通道
          // 逐级补建绕开（3.8.8 及更早无此错误串，零误伤）
          || (!reason && resp.msg === "document metadata is not ready")) {
          markLegacyRejected(rejectKey); // 记拒绝集，进新通道
        } else {
          throw new DocCreateError(typeof reason === "string" ? reason : `code=${resp.code}`, resp.msg ?? "");
        }
      }
    } catch (e) {
      if (e instanceof DocCreateError) throw e;
      if (e instanceof EndpointTransportError && e.kind !== "network") {
        // HTTP 404/非 JSON=端点被删形态（附加加固）：legacy 信号，记拒绝集切新通道
        markLegacyRejected(rejectKey);
      }
      // network：瞬态不记拒绝集（下次仍先试旧通道），本轮落新通道兜底
    }
  }
  if (id) return id;

  // ── 新通道（3.8.9+；旧内核上 404 → EndpointTransportError 转 DocCreateError throw）──
  const newID = opts.id ?? newNodeID();
  for (let attempt = 0; ; attempt++) {
    try {
      let parentID: string | null;
      let leafConditions: DocNameCondition[] | undefined;
      if (opts.parentID !== undefined) {
        parentID = opts.parentID; // C 档：父 id 直给跳过解析；同名预检靠调用方 find-first（recite 撞名去重现成）
      } else {
        const chain = await resolveParentChain(box, [...segs, title]);
        if (chain.claimID) return chain.claimID; // A 档全段命中=同名认领，复用不建孪生
        parentID = chain.parentID;
        leafConditions = chain.nameConditions;
      }
      const r = await createByParentOnce(box, parentID, newID, title, markdown, leafConditions);
      if (r.ok) return r.id ?? newID;
      if (r.commitState === "committed") {
        // 排序/模板阶段失败但源已提交——文档其实已建成，当成功防重复建档（contract §3.1）
        return r.id ?? newID;
      }
      if ((r.reason === "parentUnavailable" || r.reason === "planChanged") && attempt === 0) {
        // 链路被并发改动：清拒绝集（旧通道有机会复通）+整链重解析重试一次
        legacyPathRejects.clear();
        continue;
      }
      throw new DocCreateError(r.reason ?? "writeFailed", r.msg ?? "", (r.commitState ?? "none") as "none" | "committed" | "unknown", r.id);
    } catch (e) {
      if (e instanceof ChainRetrySignal) {
        if (attempt === 0) {
          legacyPathRejects.clear();
          continue;
        }
        throw new DocCreateError(e.reason, e.msg);
      }
      if (e instanceof EndpointTransportError) {
        // 新端点不可达：404=旧内核无此端点（未落盘 none）；网络/非 JSON=请求可能已落地
        // （unknown，携 newID 供复核）
        const committed = e.kind === "http" ? "none" : "unknown";
        throw new DocCreateError(e.kind === "http" ? "newEndpointUnavailable" : "writeFailed", e.message, committed, e.kind === "http" ? undefined : newID);
      }
      throw e;
    }
  }
}

/** 建档（兼容壳，三参调用方零改动）：实体=createDocSmart 双通道。行为差异=寻址被拒穷尽
 *  两通道后从「call throw 带 msg」变「throw DocCreateError（含 reason/commitState）」；
 *  data:null 索引窗仍返 ""（旧静默契约）。可选第 4 参 parentID（B0 机械传参，评审#6）。 */
export async function createDocWithMd(box: string, path: string, markdown: string, parentID?: string): Promise<string> {
  return await createDocSmart(box, path, markdown, { parentID });
}

export async function removeDocByID(id: string): Promise<void> {
  await call("/api/filetree/removeDocByID", { id });
}

export async function listDocsByPath(notebook: string, path: string): Promise<any[]> {
  return (await call("/api/filetree/listDocsByPath", { notebook, path, sort: 15 }))?.files ?? [];
}

export async function getBlockInfo(id: string): Promise<any> {
  return await call("/api/block/getBlockInfo", { id });
}

export async function getHPathByID(id: string, notebook: string): Promise<string> {
  return await call("/api/filetree/getHPathByID", { id, notebook });
}

/** 摘指定卡组的卡（抽取文档原地重插前清孤儿卡，2026-09-14 闪卡继承）；deckID 传快速
 *  卡组只摘该组——用户手动加进其他卡组的卡不动（前端 FloatBar 制卡同语义） */
export async function removeRiffCards(blockIDs: string[], deckID: string): Promise<unknown> {
  if (!blockIDs?.length) return null;
  return call("/api/riff/removeRiffCards", { deckID, blockIDs });
}

export async function renameDoc(notebook: string, path: string, title: string): Promise<void> {
  await call("/api/filetree/renameDoc", { notebook, path, title });
}


/**
 * 思源式块 id：yyyymmddhhmmss-xxxxxxx（14 位时间戳+随机 7 位 [0-9a-z]，内核 IsNodeIDPattern
 * 严校验、markdown 通道预置 id 亦过此关）。前端用 Lute.NewNodeID 全局，goja 无 Lute——自实现。
 */
export function newNodeID(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  let rnd = "";
  for (let i = 0; i < 7; i++) rnd += Math.floor(Math.random() * 36).toString(36);
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${rnd}`;
}
