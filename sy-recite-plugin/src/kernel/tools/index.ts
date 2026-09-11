import type { ToolDefinition } from "./common";
import { createReciteTool } from "./reciteTools";

export type { ToolDefinition } from "./common";

// recite 的 MCP 工具注册表：单一 `recite` 工具 + action 枚举（降低 AI 工具选择负担，
// 设计与实现细节见 reciteTools.ts）。
export function createMcpRegistry(): ToolDefinition[] {
    return [createReciteTool()];
}
