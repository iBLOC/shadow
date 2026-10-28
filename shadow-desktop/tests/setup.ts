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
    const stub: Storage = {
      length: 0,
      clear: () => { for (const k of Object.keys(store)) delete store[k]; stub.length = 0; },
      getItem: (k) => store[k] ?? null,
      key: (i) => Object.keys(store)[i] ?? null,
      removeItem: (k) => { delete store[k]; stub.length = Object.keys(store).length; },
      setItem: (k, v) => { store[k] = String(v); stub.length = Object.keys(store).length; },
    };
    Object.defineProperty(globalThis, 'localStorage', { value: stub, writable: true, configurable: true });
  }
}

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue([]),
  convertFileSrc: vi.fn((p: string) => p),
}));

vi.mock('react-i18next', () => ({
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
