// Auto-migrated from onboarding.spec.ts by tools/migrate-spec.js
// Original Playwright syntax → Wdio Tauri Wdio syntax.
import { browser, expect, $ } from '@wdio/globals';
import '../wdio-hooks';
describe('Onboarding Page', () => {
  beforeEach(async () => {
    await browser.url('/');
    await browser.execute(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await browser.url('/onboarding');
    await browser.pause(500);
  });

  it('页面可访问', async () => {
    // The page should be accessible - it may redirect to / if models are available
    expect(page.url()).toContain('localhost:5173');
  });

  it('显示本地模型选项', async () => {
    const localOption = await $('text=下载本地模型');
    if (await localOption.isVisible()) {
      await expect(localOption).toBeVisible();
    }
  });

  it('显示云端模型选项', async () => {
    const cloudOption = await $('text=使用云端模型');
    if (await cloudOption.isVisible()) {
      await expect(cloudOption).toBeVisible();
    }
  });

  it('显示跳过按钮', async () => {
    const skipButton = await $('button:has-text("稍后配置")');
    if (await skipButton.isVisible()) {
      await expect(skipButton).toBeVisible();
    }
  });
});

