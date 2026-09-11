// kernel 侧 Pro 门（□3）：读 petal 同目录的 tomato-settings.json（与前端 settingFactory 同文件）
// 复刻 verifyKeyRecite 验签——progressive 互通码优先、同公钥、纯本地零网络。绑定校验用
// getCloudUser 的当前登录（与前端 window.siyuan.user 同源），不信设置文件里的 userID 快照。
import { verifyUserSignPure } from "../../../sy-tomato-plugin/src/libs/userVerify";

const SETTINGS_FILE = "tomato-settings.json";
const CODE_RECITE = "_siyuanReciteCode_";
const CODE_PROG = "_siyuanProgressiveCode_";

export type ProReason = "ok" | "no-token" | "verify-failed" | "settings-unreadable";
export interface ProStatus {
  paid: boolean;
  reason: ProReason;
}

function ymd(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/** 读 tomato-settings.json（与前端 settingFactory 同文件同源；读失败返回 {}） */
export async function readSettings(): Promise<Record<string, any>> {
    try {
        const obj = await siyuan.storage.get(SETTINGS_FILE);
        const raw = await obj.text();
        return raw && raw.trim() ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

/** 未激活原因 → AI 可转述的引导文案（照 aiSplit 浮条同款话术基调） */
export function proGuidance(_reason: ProReason): string {
    return "AI 拆分是 Pro 功能，激活后即可使用（AI 判卷仍免费）。请在插件设置中粘贴激活码完成激活。";
}

export async function checkRecitePro(): Promise<ProStatus> {
    const cfg = await readSettings();
    const token = typeof cfg?.userToken === "string" ? cfg.userToken : "";
    if (!token) return { paid: false, reason: "no-token" };
    // 绑定校验与前端完全同源：前端 checkUserID 比的是 petal 文件里持久化的 userID 快照
    // （非实时登录——登出场景前端也保持 paid；换账号 2s 轮询落盘后此处自然跟随）
    const uid = typeof cfg?.userID === "string" ? cfg.userID : "";
    const now = ymd(Date.now());
    // progressive 互通码优先（与前端 verifyKeyRecite 同序）；name 型码免登录绑定，ldID 型须登录且一致
    if (verifyUserSignPure(token, CODE_PROG, now, uid).valid) return { paid: true, reason: "ok" };
    if (verifyUserSignPure(token, CODE_RECITE, now, uid).valid) return { paid: true, reason: "ok" };
    return { paid: false, reason: "verify-failed" };
}
