import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    // ⚠️⚠️ **全局替换的还原**（2026-11-09 真机实测加的）——
    //   vitest 默认 `unstubGlobals: false` ⇒ ⇒ 测试里 `vi.stubGlobal('fetch', …)`
    //   出去的东西**不会自动还原** ⇒ ⇒ 在**单 worker**下它会**泄漏给同一 worker
    //   的后续文件**（实测探针：leaked=true）⇒ ⇒ 后面那个文件可能拿到上一个文件的
    //   mock ⇒ ⇒ **失败长得像成功**。
    //   ⇒ ⇒ 这一行是**面向未来**的兜底（新文件即使忘了还原，也不会外泄）；
    //   ⇒ ⇒ 各测试文件仍各自显式还原（那是**可读**的一层，闸盯的就是它）。
    unstubGlobals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    // Exclude WebDriverIO + tauri-driver test files. They live under
    // `tests/wdio/**` and `tests/tauri-e2e/**` and import `@wdio/globals`,
    // which throws `No browser instance registered` outside the wdio runner.
    // They are run via `pnpm test:wdio` and `pnpm test:tauri` respectively.
    // `tests/e2e-ui/**` is auto-excluded by extension (.spec.ts, not .test.ts).
    //
    // `tests/api-contract/**` is excluded here on purpose: it is a real
    // HTTP-probing suite and needs the `node` environment, where
    // `AbortController` and `fetch` come from the same runtime. Under
    // jsdom they do not — undici's fetch rejects a jsdom AbortSignal with
    // "Expected signal (\"AbortSignal {}\") to be an instance of AbortSignal",
    // so every probe looked unreachable and the suite silently degraded
    // into a no-op. It has its own config: `vitest.api.config.ts`
    // (run via `pnpm test:api`).
    exclude: [
      'node_modules/**',
      'dist/**',
      'dist-web/**',
      'tests/wdio/**',
      'tests/tauri-e2e/**',
      'tests/e2e-ui/**',
      'tests/api-contract/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/**/index.ts'],
      thresholds: {
        statements: 50,
        branches: 40,
        functions: 45,
        lines: 50,
      },
    },
    testTimeout: 10000,
    webServer: {
      command: 'pnpm dev',
      port: 1420,
      reuseExistingServer: true,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});