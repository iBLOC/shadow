import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite config for the **web** build (`pnpm build:web`).
 *
 * Differences from `vite.config.ts` (the Tauri build):
 * - No `clearScreen: false` (no Rust errors to surface).
 * - No fixed port (any web server can host `dist/`).
 * - Relative asset paths so the bundle can be served from any subdirectory
 *   (e.g. `https://user.github.io/shadow-desktop/`).
 * - Adds a `define` so `import.meta.env.BUILD_TARGET === 'web'`.
 * - Drops Tauri-specific env defaults; only the web-relevant envs are kept.
 */
export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    'import.meta.env.BUILD_TARGET': JSON.stringify('web'),
  },
  build: {
    outDir: 'dist-web',
    emptyOutDir: true,
    sourcemap: true,
    target: ['es2020', 'chrome100', 'firefox100', 'safari15'],
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
  preview: {
    port: 4173,
    host: '0.0.0.0',
  },
});
