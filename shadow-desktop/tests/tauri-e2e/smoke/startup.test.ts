import { browser, expect } from '@wdio/globals';
import '../wdio-hooks';

const APP_URL = 'http://localhost:1420';

describe('Tauri startup smoke', () => {
  it('serves the desktop UI at root', async () => {
    await browser.url(APP_URL);
    const title = await browser.getTitle();
    expect(title).toContain('Shadow');
  });

  it('exposes the Tauri internals bridge', async () => {
    await browser.url(APP_URL);
    const hasTauri = await browser.execute(() => {
      // Tauri 2 injects window.__TAURI_INTERNALS__ at runtime.
      return typeof (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== 'undefined';
    });
    expect(hasTauri).toBe(true);
  });

  it('reaches telencephalon at :60080/health', async () => {
    const ok = await browser.execute(async () => {
      const r = await fetch('http://localhost:60080/health');
      return r.ok;
    });
    expect(ok).toBe(true);
  });
});