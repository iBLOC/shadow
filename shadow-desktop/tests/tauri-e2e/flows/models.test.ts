// Auto-migrated from models.spec.ts by tools/migrate-spec.js
// Original Playwright syntax → Wdio Tauri Wdio syntax.
import { browser, expect, $ } from '@wdio/globals';
import '../wdio-hooks';
describe('Models Page', () => {
  beforeEach(async () => {
    // Set setup complete to skip onboarding
    await browser.url('/');
    await browser.execute(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await browser.url('/models');
    await browser.pause(500);
  });

  it('页面标题正确显示', async () => {
    expect(await $(''h1'').getText()).toContain('模型');
  });

  it('云供应商和本地模型 tab 切换', async () => {
    const cloudTab = await $('button:has-text("云端供应商")');
    const localTab = await $('button:has-text("本地引擎")');
    
    await expect(cloudTab).toBeVisible();
    await expect(localTab).toBeVisible();
    
    await cloudTab.click();
    await browser.pause(500);
    
    await localTab.click();
    await browser.pause(500);
  });

  it('添加供应商按钮存在', async () => {
    const cloudTab = await $('button:has-text("云端供应商")');
    await cloudTab.click();
    await browser.pause(500);
    
    const addButton = await $('button:has-text("添加供应商")');
    await expect(addButton).toBeVisible();
  });

  it('打开添加供应商模态框', async () => {
    const cloudTab = await $('button:has-text("云端供应商")');
    await cloudTab.click();
    await browser.pause(500);
    
    const addButton = await $('button:has-text("添加供应商")');
    await addButton.click();
    
    // Check for the modal heading
    expect(await $(''['heading', { name: '添加供应商' }]'').isDisplayed()).toBe(true);
  });

  it('模态框显示供应商列表', async () => {
    const cloudTab = await $('button:has-text("云端供应商")');
    await cloudTab.click();
    await browser.pause(500);
    
    const addButton = await $('button:has-text("添加供应商")');
    await addButton.click();
    
    // Check for provider buttons in the modal
    await expect(await $('button:has-text("Xiaomi MiMo")')).toBeVisible();
    await expect(await $('button:has-text("OpenAI")')).toBeVisible();
    await expect(await $('button:has-text("DeepSeek")')).toBeVisible();
    await expect(await $('button:has-text("Anthropic")')).toBeVisible();
  });

  it('选择供应商后自动填充 API 地址', async () => {
    const cloudTab = await $('button:has-text("云端供应商")');
    await cloudTab.click();
    await browser.pause(500);
    
    const addButton = await $('button:has-text("添加供应商")');
    await addButton.click();
    
    await $('button:has-text("Xiaomi MiMo")').click();
    
    const apiBaseInput = await $('input[placeholder*="api"]');
    await expect(apiBaseInput).toHaveValue('https://api.xiaomimimo.com/v1');
  });

  it('添加供应商成功', async () => {
    const cloudTab = await $('button:has-text("云端供应商")');
    await cloudTab.click();
    await browser.pause(500);
    
    const addButton = await $('button:has-text("添加供应商")');
    await addButton.click();
    
    const nameInput = await $('input[placeholder="OpenAI"]');
    await nameInput.fill('Test Provider');
    
    await $('button:has-text("DeepSeek")').click();
    
    // Use the button with exact text "添加" (not "添加供应商")
    const submitButton = await $('['button', { name: '添加', exact: true }]');
    await submitButton.click();
    
    await browser.pause(1000);
  });

  it('取消添加供应商', async () => {
    const cloudTab = await $('button:has-text("云端供应商")');
    await cloudTab.click();
    await browser.pause(500);
    
    const addButton = await $('button:has-text("添加供应商")');
    await addButton.click();
    
    const cancelButton = await $('button:has-text("取消")');
    await cancelButton.click();
    
    await browser.pause(500);
  });
});

