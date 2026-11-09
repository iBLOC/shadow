import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

// jsdom (≥ 20) does not auto-expose `localStorage` as a global; tests that
// reference the bare `localStorage` identifier throw `localStorage.clear is
// not a function`. Wire the jsdom storage into globalThis once at setup so
// every test file gets a working Storage instance.
if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage?.clear !== 'function') {
  if (typeof window !== 'undefined' && typeof window.localStorage?.clear === 'function') {
    Object.defineProperty(globalThis, 'localStorage', {
      value: window.localStorage,
      writable: true,
      configurable: true,
    });
  } else {
    // Last-resort in-memory stub so the identifier resolves and `.clear()` exists.
    const store: Record<string, string> = {};
    // ⚠️ `Storage.length` 是**只读**属性 ⇒ ⇒ 直接 `stub.length = …` 报 TS2540
    //   ⇒ ⇒ 改用 **getter**（长度实时算）⇒ ⇒ 读出来的值一样
    //   ⇒ ⇒ 且不再需要「手动同步 length」这种**容易漏**的写法。
    const stub: Storage = {
      get length() { return Object.keys(store).length; },
      clear: () => { for (const k of Object.keys(store)) delete store[k]; },
      getItem: (k) => store[k] ?? null,
      key: (i) => Object.keys(store)[i] ?? null,
      removeItem: (k) => { delete store[k]; },
      setItem: (k, v) => { store[k] = String(v); },
    };
    Object.defineProperty(globalThis, 'localStorage', { value: stub, writable: true, configurable: true });
  }
}

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
