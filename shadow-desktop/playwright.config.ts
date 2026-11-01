import { defineConfig, devices } from '@playwright/test';

/**
 * ⚠️ **服务地址可被环境变量换掉** —— 因为「用 dev server 跑」与「用构建产物跑」
 * 是**两种不同的证据**，缺一不可：
 *
 * ⚠️ **dev server**：改一行源码就生效 ⇒ ⇒ 但它要**逐模块 transform**
 * ⇒ ⇒ ⇒ 在被别人编译占满的机器上，浏览器**干等**（本轮实测：首屏 38 秒；
 * ⇒ ⇒ ⇒ 「/settings」的 load 事件 180 秒都没等到 ⇒ ⇒ ⇒ 页面全白）。
 * ⚠️ **构建产物**：浏览器只下一个 bundle ⇒ ⇒ 页面秒开 ⇒ ⇒ 但要**先构建一次**。
 * ⇒ ⇒ ⇒ 所以 baseURL 与 webServer 必须**一起**换掉 ⇒ ⇒ ⇒ 否则 spec 里的相对路径会打错地方。
 *
 * 用法（构建产物那条路）：
 *   pnpm exec vite build --config vite.config.web.ts --mode web
 *   SHADOW_E2E_SERVER_CMD=pnpm preview:web SHADOW_E2E_SERVER_URL=http://127.0.0.1:4173 \
 *   SHADOW_E2E_BASE_URL=http://127.0.0.1:4173 pnpm exec playwright test
 */
const baseURL = process.env.SHADOW_E2E_BASE_URL ?? 'http://localhost:5173';
const serverUrl = process.env.SHADOW_E2E_SERVER_URL ?? 'http://localhost:5173';
const serverCmd = process.env.SHADOW_E2E_SERVER_CMD ?? 'pnpm dev:web';

export default defineConfig({
  testDir: './tests/e2e-ui',
  globalSetup: './tests/e2e-ui/global-setup.ts',
  globalTeardown: './tests/e2e-ui/global-teardown.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: serverCmd,
    url: serverUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
