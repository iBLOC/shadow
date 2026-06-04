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
  plugins: [
    react(),
    {
      name: 'shadow-pwa',
      apply: 'build',
      generateBundle(_options, bundle) {
        const entry = Object.values(bundle).find(
          (f) => f.type === 'chunk' && f.isEntry,
        );
        if (entry && 'code' in entry) {
          const reg = `
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((r) => console.info('[PWA] SW registered:', r.scope))
      .catch((e) => console.warn('[PWA] SW failed:', e));
  });
}
`.trim();
          entry.code = `${reg}\n${entry.code}`;
        }
      },
    },
  ],
  base: './',
  define: {
    'import.meta.env.BUILD_TARGET': JSON.stringify('web'),
  },
  build: {
    outDir: 'dist-web',
    emptyOutDir: true,
    sourcemap: true,
    target: ['es2020', 'chrome100', 'firefox100', 'safari15'],
    rollupOptions: {
      input: {
        main: 'index.html',
        sw: 'src/sw.ts',
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'sw' ? '[name].js' : 'assets/[name]-[hash].js',
      },
    },
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
