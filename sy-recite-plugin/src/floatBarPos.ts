// 仿写浮条位置存档（lsfix 2026-10-13 家族战役）：浮条拖拽位原走 localStorage
// 「sy-recite-floatbar-pos」单键 JSON 串——思源桌面 Electron 壳每次启动给内核随机端口，
// origin 含端口变=localStorage 换格子清空，跨重启必丢（qeBallPos 同病根，群实报）。
// 改走 reciteFloatBarPos settingFactory 档（store 实体建在 tomato libs/stores.ts——
// 仓内 s/r 复用惯例，recite index.ts loadStore 已 load，漏登记=set/write 静默无效）；
// localStorage 降级为旧档一次性收编源。null=无存档（浮条回默认 200,200）。
// 读档必须留在组件初始化同步段（FloatBar.svelte 既有 P0-1 约束），本模块只做纯读写。
import { FLOATBAR_POS_KEY } from "./constants";
import { reciteFloatBarPos } from "../../sy-tomato-plugin/src/libs/stores";

/** 旧档解析（localStorage 单键 JSON 串）：非 JSON/缺 x/y 判无存档——沿用 FloatBar.svelte
 *  原 try/catch + pos?.x/pos?.y != null 容错语义（qeBall 是两个独立 string 键，语义不同源） */
export function parseLegacyFloatBarPos(raw: string | null): { x: number; y: number } | null {
    try {
        const pos = JSON.parse(raw ?? "null");
        if (pos?.x != null && pos?.y != null) return { x: pos.x, y: pos.y };
    } catch { /* 坏数据忽略 */ }
    return null;
}

/** 浮条位存档读取：reciteFloatBarPos 档优先；无档时收编 localStorage 旧档（固定端口环境
 *  有真值，桌面端随机端口 origin 下恒空）并落新档。均无→null（调用方回默认 200,200） */
export function loadFloatBarPos(): { x: number; y: number } | null {
    const p = reciteFloatBarPos.get();
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return p;
    const legacy = parseLegacyFloatBarPos(localStorage.getItem(FLOATBAR_POS_KEY));
    if (legacy) saveFloatBarPos(legacy);
    return legacy;
}

/** 浮条位落盘（拖拽松手/旧档收编共用）：set 后紧跟 write 确定性落盘
 *  （settingFactory.set 只写内存不落盘，搭车不可靠——stores.ts 注释） */
export function saveFloatBarPos(p: { x: number; y: number }) {
    reciteFloatBarPos.set(p);
    void reciteFloatBarPos.write();
}
