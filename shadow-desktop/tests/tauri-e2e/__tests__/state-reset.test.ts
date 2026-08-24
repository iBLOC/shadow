import { describe, expect, it, vi, beforeEach } from 'vitest';
import { stateReset } from '../state-reset';

describe('stateReset', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env.SHADOW_TEST_ADMIN_TOKEN = 'test-token';
  });

  it('POSTs to cortex admin endpoint with defaults', async () => {
    const mock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{}'),
    });
    vi.stubGlobal('fetch', mock);

    await stateReset();

    expect(mock).toHaveBeenCalledTimes(1);
    const [url, opts] = mock.mock.calls[0];
    expect(url).toBe('http://localhost:60080/api/cortex/admin/test/reset');
    expect(opts.method).toBe('POST');
    expect(opts.headers['X-Admin-Token']).toBe('test-token');
    const body = JSON.parse(opts.body);
    expect(body).toEqual({
      agents: true,
      conversations: true,
      mcp: true,
      lance: true,
      re_seed_default_lobes: true,
    });
  });

  it('merges flag overrides', async () => {
    const mock = vi.fn().mockResolvedValue({
      ok: true, status: 200, text: () => Promise.resolve('{}'),
    });
    vi.stubGlobal('fetch', mock);

    await stateReset({ agents: false });

    const body = JSON.parse(mock.mock.calls[0][1].body);
    expect(body.agents).toBe(false);
    expect(body.conversations).toBe(true);
  });

  it('throws when cortex returns non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 500, text: () => Promise.resolve('boom'),
    }));

    await expect(stateReset()).rejects.toThrow(/stateReset failed.*500/);
  });
});