import { browser, expect } from '@wdio/globals';
import '../wdio-hooks';

describe('Shadow Desktop - 对话功能 (Tauri Wdio)', () => {
  before(async () => {
    await browser.url('http://localhost:1420');
    await browser.waitUntil(async () => {
      const url = await browser.getUrl();
      return url.length > 0;
    }, { timeout: 15_000 });
  });

  it('应该加载页面', async () => {
    // ⚠️ 断言的是「**应用真的挂上了**」（`#root` 在、且有内容）
    //   ⇒ ⇒ 原来的 `expect(text).toBeTruthy()` 在**白屏**上也会过（空白页没有字，
    //   但 404/错误页有字）⇒ ⇒ 那条断言证明不了「页面加载成功」。
    const root = await browser.$('#root');
    expect(await root.isExisting()).toBe(true);
    expect((await root.getText()).trim().length).toBeGreaterThan(0);
  });

  it('应该导航到对话页面', async () => {
    await browser.url('/conversation');
    await browser.waitUntil(async () => {
      const url = await browser.getUrl();
      return url.includes('/conversation') || url.includes('/setup') || url.includes('/onboarding');
    }, { timeout: 15_000 });
    const url = await browser.getUrl();
    expect(url).toMatch(/\/(conversation|setup|onboarding)/);
    expect(await browser.$('#root').isExisting()).toBe(true);
  });

  it('应该显示消息输入框', async () => {
    // ⚠️ 原写法是 `if (await input.isExisting()) { …断言… }` ⇒ ⇒ 输入框**不见了**
    //   的时候**零断言通过** ⇒ ⇒ 「输入框没了」也是绿的。
    //   ⇒ ⇒ 现在改成**显式的二选一断言**：要么输入框在，要么用户真的在
    //   引导流程里（那时本来就没有输入框）—— 两者都不是 ⇒ ⇒ 才红。
    const input = await browser.$('input[placeholder], textarea');
    const hasInput = await input.isExisting();
    const url = await browser.getUrl();
    const onboarding = url.includes('/setup') || url.includes('/onboarding');
    expect(hasInput || onboarding).toBe(true);
    if (hasInput) {
      await input.setValue('测试消息');
      expect(await input.getValue()).toContain('测试');
    }
  });
});