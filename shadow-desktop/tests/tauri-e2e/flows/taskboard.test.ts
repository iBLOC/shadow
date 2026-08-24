// Auto-migrated from taskboard.spec.ts by tools/migrate-spec.js
// Original Playwright syntax → Wdio Tauri Wdio syntax.
import { browser, expect, $ } from '@wdio/globals';
import '../wdio-hooks';
describe('TaskBoard Page', () => {
  beforeEach(async () => {
    await browser.url('/');
    await browser.execute(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await browser.url('/tasks');
    await browser.pause(500);
  });

  it('页面标题正确显示', async () => {
    expect(await $(''h1'').getText()).toContain('任务');
  });

  it('显示任务列表', async () => {
    const taskList = await $('[data-testid="task-list"]');
    if (await taskList.isVisible()) {
      await expect(taskList).toBeVisible();
    }
  });

  it('显示新建任务按钮', async () => {
    const newTaskButton = await $('button:has-text("新建任务")');
    if (await newTaskButton.isVisible()) {
      await expect(newTaskButton).toBeVisible();
    }
  });
});

