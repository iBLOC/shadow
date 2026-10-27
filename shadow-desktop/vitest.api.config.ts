import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest config for the `tests/api-contract/**` suite that runs at packaging
 * time (`pnpm prebuild` and Tauri `beforeBuildCommand`). This config is
 * intentionally separate from `vitest.config.ts` so it can:
 *
 *   - Run in `node` environment (no jsdom, no React, no Tauri mocks).
 *   - Skip the `pnpm dev` web server — the suite talks to telencephalon
 *     directly on `localhost:60080`.
 *   - Skip the global Tauri mock so plain `fetch` reaches the network.
 *
 * The server is expected to be reachable when `pnpm prebuild` runs; the
 * tests skip with a clear console message via `tests/api-contract/server-check.ts`
 * when the port is not bound. Pass `RUN_API_TESTS=force-fail` to make missing
 * telencephalon a hard build error (CI release pipelines).
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/api-contract/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', 'dist-web/**'],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    // Coverage is irrelevant for integration tests — they're gate-style.
    reporters: ['default'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
