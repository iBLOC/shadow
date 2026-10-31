/**
 * `adminToken.ts` 的行为 —— **这把钥匙从哪来、带不带、什么时候不带**。
 *
 * ⚠️ 这几条钉的是 2026-10-31 那个洞的**前端那一半**：
 * 端脑不再认任何人了 ⇒ 前端**必须**真的带上那把钥匙 ⇒ ⇒ 而**带一个假的
 * （空的）比不带更糟**：旧实现里空的 `X-Admin-Token` 头与空串 `ct_eq`
 * 相等 ⇒ **过**（手机上整个 admin 面就是这么开着的）。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn();
let tauri = false;

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock('../platform', () => ({
  isTauri: () => tauri,
}));

async function loadModule() {
  const mod = await import('../adminToken');
  mod.__resetAdminTokenCache();
  return mod;
}

describe('adminToken', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    tauri = false;
    window.localStorage.clear();
  });

  it('asks the sidecar for the token in Tauri mode', async () => {
    tauri = true;
    invokeMock.mockResolvedValue('sidecar-token');
    const { getAdminToken } = await loadModule();

    expect(await getAdminToken()).toBe('sidecar-token');
    expect(invokeMock).toHaveBeenCalledWith('get_admin_token');
  });

  it('falls back to localStorage in web mode', async () => {
    window.localStorage.setItem('shadow-admin-token', 'from-storage');
    const { getAdminToken } = await loadModule();

    expect(await getAdminToken()).toBe('from-storage');
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('carries the token as X-Admin-Token', async () => {
    tauri = true;
    invokeMock.mockResolvedValue('sidecar-token');
    const { adminHeaders } = await loadModule();

    expect(await adminHeaders()).toEqual({ 'X-Admin-Token': 'sidecar-token' });
  });

  it('sends NO header when there is no token at all', async () => {
    // ⚠️ 这是最要紧的一条：**没有钥匙 ⇒ 不带那个头**。
    // 带一个空的 `X-Admin-Token:` 在旧实现里**等于带对的那把**（空串
    // ct_eq 相等）⇒ 宁可不带。
    const { adminHeaders } = await loadModule();

    expect(await adminHeaders()).toEqual({});
  });

  it('survives a sidecar that does not know the command', async () => {
    // 老版本的 sidecar 没有 `get_admin_token` ⇒ invoke 会抛 ⇒ 不该把
    // 整个页面带崩。
    tauri = true;
    invokeMock.mockRejectedValue(new Error('command not found'));
    const { getAdminToken, adminHeaders } = await loadModule();

    expect(await getAdminToken()).toBeUndefined();
    expect(await adminHeaders()).toEqual({});
  });

  it('never treats a blank value as a token', async () => {
    tauri = true;
    invokeMock.mockResolvedValue('   ');
    const { getAdminToken, adminHeaders } = await loadModule();

    expect(await getAdminToken()).toBeUndefined();
    expect(await adminHeaders()).toEqual({});
  });

  it('caches the token instead of asking the sidecar every time', async () => {
    tauri = true;
    invokeMock.mockResolvedValue('sidecar-token');
    const { getAdminToken } = await loadModule();

    await getAdminToken();
    await getAdminToken();

    expect(invokeMock).toHaveBeenCalledTimes(1);
  });
});
