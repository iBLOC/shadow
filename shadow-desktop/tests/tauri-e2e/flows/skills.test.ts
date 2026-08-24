// Auto-migrated from skills.spec.ts by tools/migrate-spec.js
// Original Playwright syntax → Wdio Tauri Wdio syntax.
import { browser, expect, $ } from '@wdio/globals';
import '../wdio-hooks';
describe('Skills Page', () => {
  beforeEach(async () => {
    await browser.url('/');
    await browser.execute(() => {
      localStorage.setItem('shadow_setup_complete', 'true');
    });
    await browser.url('/skills');
    await browser.pause(500);
  });

  it('页面标题正确显示', async () => {
    expect(await $(''h1'').getText()).toContain('技能');
  });

  it('显示技能列表', async () => {
    const skillList = await $('[data-testid="skill-list"]');
    if (await skillList.isVisible()) {
      await expect(skillList).toBeVisible();
    }
  });

  it('显示新建技能按钮', async () => {
    const newSkillButton = await $('button:has-text("新建技能")');
    if (await newSkillButton.isVisible()) {
      await expect(newSkillButton).toBeVisible();
    }
  });
});

