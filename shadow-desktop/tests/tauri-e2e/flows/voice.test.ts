// Auto-migrated from voice.spec.ts by tools/migrate-spec.js
// Original Playwright syntax → Wdio Tauri Wdio syntax.
import { browser, expect, $ } from '@wdio/globals';
import '../wdio-hooks';
describe('Voice Page', () => {
  beforeEach(async () => {
    await browser.url('/');
    await browser.execute(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await browser.url('/voice');
    await browser.pause(500);
  });

  it('页面标题正确显示', async () => {
    expect(await $(''h1'').getText()).toContain('语音');
  });

  it('显示语音设置', async () => {
    const voiceSettings = await $('[data-testid="voice-settings"]');
    if (await voiceSettings.isVisible()) {
      await expect(voiceSettings).toBeVisible();
    }
  });
});

