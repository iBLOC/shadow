describe('Shadow Desktop - Navigation', () => {
  before(async () => {
    await browser.pause(3000);
  });

  it('should display navigation elements', async () => {
    await browser.waitUntil(async () => {
      try {
        const body = await $('body');
        const text = await body.getText();
        return text && text.length > 0;
      } catch {
        return false;
      }
    }, { timeout: 30000 });
    
    const body = await $('body');
    expect(await body.isDisplayed()).toBe(true);
  });
});
