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
    // ⚠️ **端脑的门要凭据**（2026-11-05 真机实测）—— E2E 里那两条 lobe 配置
    //    PATCH 之所以 401，是**头名与钥匙两处都错**：spec 发的是 `X-Admin-Key`，
    //    而端脑只认 `x-admin-token`（`telencephalon/src/security/api_key.rs`）；
    //    且独立 server 的 admin 钥匙**默认是空** ⇒ ⇒ 端脑侧 **fail-closed**。
    // ⇒ ⇒ 这里把**同一把**钥匙同时给 admin 面与 shadow 读门（端脑那侧
    //    `standalone_shadow_key()` 回落 admin token ⇒ ⇒ 配了 admin 钥匙之后
    //    shadow 读门就**关上了** ⇒ ⇒ 客户端必须带上凭据）。
    // ⇒ ⇒ 没配 `SHADOW_E2E_ADMIN_KEY` 时**一个头都不加** ⇒ ⇒ 本地行为不变。
    // ⇒ ⇒ ⚠️ **这两个头必须嵌在 `extraHTTPHeaders` 里面** —— 2026-11-05 真机实测：
    //    spread 到 `use` 的**顶层**会被 Playwright **静默忽略**（既不报错也不告警，
    //    测试照样 pass ⇒ ⇒ 头一个都发不出去 ⇒ ⇒ 端脑那扇门一律 401）。
    // ⇒ ⇒ 实测（Playwright 1.62.1，用本地回显服务器量到的**请求头**）：
    //    正确嵌套时 `page.request` / `request` fixture / `page.goto` **都带上了**
    //    ⇒ ⇒ 一处配置就够，不必在每个调用点手写头。
    ...(process.env.SHADOW_E2E_ADMIN_KEY
      ? {
          extraHTTPHeaders: {
            'x-admin-token': process.env.SHADOW_E2E_ADMIN_KEY,
            'x-shadow-key': process.env.SHADOW_E2E_ADMIN_KEY,
          },
        }
      : {}),
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
