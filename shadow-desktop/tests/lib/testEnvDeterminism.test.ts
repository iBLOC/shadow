/**
 * ⚠️ **环境确定性守卫** —— 这一条盯的是「判据读到的 ambient 对象」。
 *
 * ⚠️⚠️ **为什么需要守卫** —— 2026-11-09 真 CI 红过一条：
 * `tests/lib/capabilityDefaults.test.ts` 里「存不进去（抛异常）⇒ ok=false」逐字红在 CI 上，
 * 而本机绿。根因（同一台机器，只翻一个开关的 A/B 实测）：
 * · 本机（Node 25 自带 webstorage）→ `tests/setup.ts` 落到兜底分支 → **plain object**（`setItem` 是 own property）
 *   → `vi.spyOn(storage, 'setItem')` 拦得住。
 * · CI（Node 24 没有原生 localStorage）→ 落到 jsdom 分支 → jsdom 的 `localStorage` 是 **Proxy**（为支持
 *   `storage.foo` 命名属性）→ 它的 `get` trap 直接返回**原型方法**→ 装在 target 上的 own property **被绕过**
 *   → **「mock 装上了」≠「mock 生效了」**→ 那条用例在 CI 上其实在跑「真存进去了」。
 *
 * ⇒ ⇒ 修法：`tests/setup.ts` 改成**无条件**装一份形状固定的替身（不引用运行时自带的对象）。
 * ⇒ ⇒ 这一条守卫把「可替换性」变成**常驻不变量**：以后若有人把安装又变回「有就用、没就造」。
 * ⇒ ⇒ 本条会在 **CI 的运行时形状下**红（本机默认环境下看不出来 ⇒ ⇒ 那是本条的脆弱面）。
 * ⇒ ⇒ 本地想看那一面：`pnpm test:ci-env`（用 `--no-experimental-webstorage` 复刻 CI 的运行时形状）。
 */
import { describe, it, expect, vi } from 'vitest';

describe('测试环境确定性（ambient 形状）', () => {
  it('ambient localStorage 的 setItem 必须是 own property（可被替换）', () => {
    const ls = globalThis.localStorage as Storage;
    expect(Object.prototype.hasOwnProperty.call(ls, 'setItem')).toBe(true);
  });

  it('「装上了」还得「生效了」：spy 装上后必须真的拦得住调用', () => {
    const ls = globalThis.localStorage as Storage;
    const spy = vi.spyOn(ls, 'setItem').mockImplementation(() => {
      throw new Error('probe: storage is replaceable');
    });
    let caught: string | null = null;
    try {
      ls.setItem('probe-key', 'probe-value');
    } catch (e) {
      caught = e instanceof Error ? e.message : String(e);
    }
    spy.mockRestore();
    expect(caught).toBe('probe: storage is replaceable');
  });

  it('globalThis.localStorage 与 window.localStorage 是同一个对象（产品两种写法命中同一份替身）', () => {
    expect(globalThis.localStorage).toBe(window.localStorage);
  });
});