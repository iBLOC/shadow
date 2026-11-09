import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

// ⚠️⚠️ **环境自带对象不许进判据** —— 这一段**原来**写成「运行时自带能用就用、
// 不能用才造一个」⇒ ⇒ 于是**判据读到的 storage 形状由运行时决定**：
// · 本机（Node 25 自带 webstorage）⇒ ⇒ `globalThis.localStorage` 是个**半残**的
//   原生对象（`clear` 不是函数）⇒ ⇒ 落到兜底分支 ⇒ ⇒ **plain object**
//   （`setItem` 是 own property ⇒ ⇒ `vi.spyOn` 能拦住）。
// · CI（Node 24 没有原生 localStorage）⇒ ⇒ 落到 jsdom 分支 ⇒ ⇒ jsdom 的
//   `localStorage` 是**Proxy**（为支持 `storage.foo` 这种命名属性）⇒ ⇒ 它的
//   `get` trap 直接返回**原型方法**⇒ ⇒ 你 `vi.spyOn(storage, 'setItem')` 装在
//   target 上的 own property **被绕过**⇒ ⇒ **「mock 装上了」≠「mock 生效了」**
//   ⇒ ⇒ 那条用例在 CI 上其实在跑「真存进去了」⇒ ⇒ 断言 `ok=false` 红。
//
// ⇒ ⇒ 修法：**无条件**装一份**形状固定**的替身（不引用运行时自带的对象）⇒ ⇒
//     每个测试文件读到的都是同一个东西（plain object ⇒ ⇒ own property ⇒ ⇒
//     spy 能拦住、能替换）⇒ ⇒ **本机与 CI 读的是同一个东西**⇒ ⇒ 「本机绿」
//     才可能是「CI 绿」。
//
// ⚠️ `Storage.length` 是**只读**属性 ⇒ ⇒ 直接 `stub.length = …` 报 TS2540
//   ⇒ ⇒ 改用 **getter**（长度实时算）⇒ ⇒ 读出来的值一样
//   ⇒ ⇒ 且不再需要「手动同步 length」这种**容易漏**的写法。
const store: Record<string, string> = {};
const deterministicStorage: Storage = {
  get length() { return Object.keys(store).length; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  getItem: (k) => store[k] ?? null,
  key: (i) => Object.keys(store)[i] ?? null,
  removeItem: (k) => { delete store[k]; },
  setItem: (k, v) => { store[k] = String(v); },
};
// ⚠️ `configurable: true` ⇒ ⇒ 测试自己 `vi.stubGlobal('localStorage', …)` 时
//   才改得动 ⇒ ⇒ 否则「替身」会反过来把用例钉死。
Object.defineProperty(globalThis, 'localStorage', {
  value: deterministicStorage,
  writable: true,
  configurable: true,
});

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue([]),
  convertFileSrc: vi.fn((p: string) => p),
}));

vi.mock('react-i18next', () => ({
  // ⚠️ **补上 `initReactI18next`** —— 真实的 `react-i18next` 导出它，
  // 而 `src/i18n/index.ts` 在**模块加载时**就要 `.use(initReactI18next)`。
  // 少了它 ⇒ 任何 import 了 `src/i18n` 的模块在测试里直接抛
  // 「No "initReactI18next" export is defined on the "react-i18next" mock」。
  //
  // 形状照 i18next 的第三方模块约定（`type: '3rdParty'` + `init`）。
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: unknown) => {
      // i18next has two second-argument shapes:
      //   t(key)              -> the key itself
      //   t(key, 'default')   -> the default string
      //   t(key, { count })   -> interpolation options
      // The old mock only handled the options form, so every
      // `t(key, 'default')` call exploded with
      // "Invalid regular expression: /{0}/g".
      if (opts === undefined || opts === null) return key;
      if (typeof opts === 'string') return opts;
      if (typeof opts !== 'object') return key;
      return Object.entries(opts as Record<string, unknown>).reduce(
        (acc, [k, v]) =>
          acc
            .replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g'), String(v))
            .replace(new RegExp(`\\{\\s*${k}\\s*\\}`, 'g'), String(v)),
        key
      );
    },
    i18n: { language: 'en' },
  }),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn().mockResolvedValue(undefined),
  openPath: vi.fn().mockResolvedValue(undefined),
}));

if (typeof Element !== 'undefined') {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = function () { return false; };
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function () {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = function () {};
  }
}

afterEach(() => {
  cleanup();
});

expect.extend({});
