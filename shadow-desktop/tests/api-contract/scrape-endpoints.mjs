#!/usr/bin/env node
/**
 * Static analysis pass over the cortex client source that extracts every
 * HTTP endpoint the desktop client depends on. Output is committed at
 * `tests/api-contract/endpoints.json`.
 *
 * Approach: for each file, look at every line that contains `request<`
 * or `fetch(` and grab the next 5 lines as a "window". Inside the window
 * extract:
 *   - the first path literal that begins with `/api/telencephalon/`
 *   - the first `method:` keyword
 *
 * If no method keyword is found in the window we default to GET. This
 * is lossy for unusual formatting but matches the project's prettier
 * output where method: 'POST' is on the line of the call or adjacent.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

const ADMIN_PREFIXES = ['/api/telencephalon/admin/'];

const SOURCES = [
  resolve(ROOT, 'src/lib/cortexClient.ts'),
  resolve(ROOT, 'src/pages/CortexStatusPage.tsx'),
  resolve(ROOT, 'tests/tauri-e2e/state-reset.ts'),
];

function isAdmin(p) {
  return ADMIN_PREFIXES.some((pre) => p.startsWith(pre));
}

function templatizePath(raw) {
  // Map each `${<ident>}` to its own placeholder. Falls back to
  // {id} for non-identifier expressions like `${encodeURIComponent(x)}`.
  return raw.replace(/\$\{([^}]+)\}/g, (_, expr) => {
    const trimmed = expr.trim();
    const ident = trimmed.startsWith('encodeURIComponent(')
      ? trimmed.slice('encodeURIComponent('.length, -1)
      : trimmed;
    return `{${ident}}`;
  });
}

function substituteParams(templatized) {
  return templatized
    .replaceAll('{id}', 'probe')
    .replaceAll('{name}', 'probe-agent')
    .replaceAll('{version}', '0.0.0')
    .replaceAll('{serverId}', 'probe-mcp')
    .replaceAll('{agentName}', 'probe-agent')
    .replaceAll('{providerId}', 'probe-provider')
    .replaceAll('{nodeId}', 'probe-node');
}

// Lines that look like the start of a `this.request<T>(` or `fetch(` call
// OR contain the start of a template-literal path.
const CALL_START = /\b(request\s*<[^>]+>\s*\(|fetch\s*\(\s*`?\$\{(?:this\.)?baseUrl\})/;

const seen = new Map();

for (const src of SOURCES) {
  if (!existsSync(src)) continue;
  const rel = src.replace(`${ROOT}${sep}`, '');
  const text = readFileSync(src, 'utf8');
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    if (!CALL_START.test(lines[i])) continue;
    // Look at the current line plus the next 5 lines for path + method.
    const window = lines.slice(i, i + 6).join('\n');

    // First path literal that begins with /api/telencephalon/.
    const pathMatch =
      window.match(/['"]([^'"\n]*\/api\/telencephalon\/[^'"\n]*)['"]/) ||
      window.match(/`([^`\n]*\/api\/telencephalon\/[^`\n]*)`/);
    if (!pathMatch) continue;
    const pathRaw = pathMatch[1];
    if (!pathRaw.startsWith('/api/telencephalon')) continue;

    const methodMatch = window.match(/method\s*:\s*['"]?([A-Z]+)['"]?/);
    const method = methodMatch ? methodMatch[1].toUpperCase() : 'GET';

    const templatized = templatizePath(pathRaw);
    const key = `${method} ${templatized}`;
    if (seen.has(key)) continue;

    seen.set(key, {
      method,
      path: templatized,
      probePath: substituteParams(templatized),
      needsAdmin: isAdmin(templatized),
      source: `${rel}:${i + 1}`,
    });
  }
}

const endpoints = Array.from(seen.values()).sort(
  (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
);

const output = {
  version: 1,
  scrapedAt: new Date().toISOString(),
  baseUrl: 'http://127.0.0.1:60080',
  endpointCount: endpoints.length,
  endpoints,
};

const outPath = resolve(__dirname, 'endpoints.json');
const dir = dirname(outPath);
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf8');

console.log(`[scrape-endpoints] wrote ${endpoints.length} endpoints to ${outPath}`);
