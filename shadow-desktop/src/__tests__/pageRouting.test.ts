import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guard against orphaned page modules.
 *
 * A page that is written but never routed is invisible to the user: the
 * code compiles, the tests pass, and the feature simply does not exist.
 * This repo has hit that twice — `RecordingPage.tsx` (superseded by
 * `RecordingPanel` inside the conversation page) and
 * `PromptSettingsPage.tsx` (fully built, with i18n copy, but never mounted)
 * both sat in `src/pages` while nothing referenced them.
 *
 * The check has two directions:
 *   1. every page module is mounted by the router,
 *   2. every page the router mounts actually exists.
 */

const root = join(__dirname, '..');
const pagesDir = join(root, 'pages');
const appSource = readFileSync(join(root, 'App.tsx'), 'utf8');

const pageFiles = readdirSync(pagesDir).filter(
  (f) => f.endsWith('.tsx') && !f.includes('__tests__'),
);

describe('page routing', () => {
  it('has page modules to check', () => {
    expect(pageFiles.length).toBeGreaterThan(0);
  });

  it('mounts every page module in the router', () => {
    const orphans: string[] = [];
    for (const file of pageFiles) {
      const source = readFileSync(join(pagesDir, file), 'utf8');
      const exported = [...source.matchAll(/export function (\w+)/g)].map((m) => m[1]);
      const component = exported.find((name) => name.endsWith('Page'));
      if (!component) continue;
      if (!appSource.includes(component)) {
        orphans.push(`${file} (${component})`);
      }
    }
    expect(orphans, 'page modules that no route mounts').toEqual([]);
  });

  it('routes only to page modules that exist', () => {
    const missing: string[] = [];
    const routed = [...appSource.matchAll(/element=\{<(\w+)\s*\/>/g)].map((m) => m[1]);
    for (const component of routed) {
      if (!component.endsWith('Page')) continue;
      const file = `${component}.tsx`;
      if (!pageFiles.includes(file)) missing.push(file);
    }
    expect(missing, 'routed page modules that do not exist').toEqual([]);
  });
});
