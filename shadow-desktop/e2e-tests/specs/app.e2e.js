describe('Shadow Desktop App', () => {
  before(async () => {
    await browser.pause(5000);
  });

  it('should launch successfully', async () => {
    await browser.waitUntil(async () => {
      try {
        const body = await $('body');
        const text = await body.getText();
        return text && text.length > 0;
      } catch {
        return false;
      }
    }, { timeout: 60000, timeoutMsg: 'App did not load within 60s' });
    
    const body = await $('body');
    const text = await body.getText();
    console.log('App content length:', text.length);
    expect(text.length).toBeGreaterThan(0);
  });

  it('should have visible content', async () => {
    await browser.waitUntil(async () => {
      try {
        const body = await $('body');
        return await body.isDisplayed();
      } catch {
        return false;
      }
    }, { timeout: 30000, timeoutMsg: 'Page content did not load within 30s' });
    
    const body = await $('body');
    expect(await body.isDisplayed()).toBe(true);
  });
});
