import { writable } from "svelte/store";

/** 移动端选块三钮显隐（2026-09-09 发版前 P1 拍板补）：初值由 index.ts loadStore 从
 *  settingCfg.mobileSelectBtns 灌入（undefined=开，缺省判 `!== false` 同 reciteTopBar）；
 *  设置面板 toggle 即时 set，FloatBar {#if} 响应式增删三钮。独立零依赖小模块——勿并进
 *  selml.ts（FloatBar import selml 会把 Events 单例牵进浮条模块序，2026-08-25 progressive
 *  实测坑：多引入 tomato 内部模块扰动 bundle 模块序致移动端浮条不渲染） */
export const selmlOn = writable(true);
