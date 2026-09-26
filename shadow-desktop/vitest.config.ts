import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    // Exclude WebDriverIO + tauri-driver test files. They live under
    // `tests/wdio/**` and `tests/tauri-e2e/**` and import `@wdio/globals`,
    // which throws `No browser instance registered` outside the wdio runner.
    // They are run via `pnpm test:wdio` and `pnpm test:tauri` respectively.
    // `tests/e2e-ui/**` is auto-excluded by extension (.spec.ts, not .test.ts).
    exclude: [
      'node_modules/**',
      'dist/**',
      'dist-web/**',
      'tests/wdio/**',
      'tests/tauri-e2e/**',
      'tests/e2e-ui/**',
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