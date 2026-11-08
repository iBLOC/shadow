/**
 * 端脑地址的**默认**与**构建期覆盖** —— **唯一**一处（其它模块都从这儿取）。
 *
 * ## 为什么单独一个文件
 *
 * ⚠️ **依赖方向**：这个文件**不 import 任何东西**（叶子）⇒ ⇒ 谁都能依赖它
 * ⇒ ⇒ 而 lib/platform.ts 依赖它 ⇒ ⇒ 于是「mock 掉 platform」的测试**不会**
 * 连带影响 store / client 的默认地址 ⇒ ⇒ 否则每加一个导出，
 * 每一份 mock 都得跟着补 —— **那是依赖方向反了的信号**（实测踩过）。
 *
 * ## 两条规则
 *
 * ① **默认值** = http://127.0.0.1:60080
 *    —— 桌面端 sidecar 绑的是 **IPv4** 的 127.0.0.1:60080
 *    （src-tauri/src/telencephalon_http.rs 的 DEFAULT_ADDR）
 *    ⇒ ⇒ localhost 在 IPv6 优先的机器上先解析成 ::1 ⇒ ⇒ 打到没人听的地址。
 *
 * ② **构建期地址** = VITE_PREFRONTAL_URL（web 形态没有 sidecar ⇒ 靠它指到真脑）
 *    ⇒ ⇒ 它是**默认值**，不是**覆盖值** ⇒ ⇒ 用户在设置里配过的地址仍然赢。
 */

/** 端脑的默认地址。 */
export const DEFAULT_TELEENCEPHALON_URL = 'http://127.0.0.1:60080';

/** 构建期指过来的端脑地址（没有 ⇒ undefined）。 */
export function buildTimeTelencephalonUrl(): string | undefined {
  if (typeof import.meta === 'undefined') return undefined;
  const v = import.meta.env?.VITE_PREFRONTAL_URL as string | undefined;
  return v && v.trim() ? v.trim() : undefined;
}
