import { describe, expect, it, afterEach, vi } from 'vitest';

const ORIGINAL = process.env.SHADOW_TELENCEPHALON_URL;

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.SHADOW_TELENCEPHALON_URL;
  } else {
    process.env.SHADOW_TELENCEPHALON_URL = ORIGINAL;
  }
  vi.resetModules();
});

describe('tests/e2e-ui/config.ts — TELENCEPHALON_URL env override', () => {
  it('defaults to http://localhost:60080 when SHADOW_TELENCEPHALON_URL is unset', async () => {
    delete process.env.SHADOW_TELENCEPHALON_URL;
    vi.resetModules();
    const mod = await import('../e2e-ui/config');
    expect(mod.TEST_CONFIG.TELENCEPHALON_URL).toBe('http://localhost:60080');
  });

  it('honors SHADOW_TELENCEPHALON_URL when set', async () => {
    process.env.SHADOW_TELENCEPHALON_URL = 'http://10.0.0.42:60080';
    vi.resetModules();
    const mod = await import('../e2e-ui/config');
    expect(mod.TEST_CONFIG.TELENCEPHALON_URL).toBe('http://10.0.0.42:60080');
  });

  it('preserves MIMO_API_KEY / MIMO_API_BASE fields unchanged', async () => {
    delete process.env.SHADOW_TELENCEPHALON_URL;
    vi.resetModules();
    const mod = await import('../e2e-ui/config');
    expect(mod.TEST_CONFIG).toHaveProperty('MIMO_API_KEY');
    expect(mod.TEST_CONFIG).toHaveProperty('MIMO_API_BASE');
    expect(mod.TEST_CONFIG.MIMO_API_BASE).toBe('https://api.xiaomimimo.com/v1');
  });
});