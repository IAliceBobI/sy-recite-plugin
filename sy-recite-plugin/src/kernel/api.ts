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

export async function createDocWithMd(box: string, path: string, markdown: string): Promise<string> {
  return await call("/api/filetree/createDocWithMd", { notebook: box, path, markdown });
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
