export interface ResetFlags {
  agents?: boolean;
  conversations?: boolean;
  mcp?: boolean;
  lance?: boolean;
  re_seed_default_lobes?: boolean;
}

export async function stateReset(flags: ResetFlags = {}): Promise<void> {
  const body = {
    agents: true,
    conversations: true,
    mcp: true,
    lance: true,
    re_seed_default_lobes: true,
    ...flags,
  };
  const resp = await fetch('http://localhost:60080/api/telencephalon/admin/test/reset', {
    method: 'POST',
    headers: {
      'X-Admin-Token': process.env.SHADOW_TEST_ADMIN_TOKEN ?? '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    throw new Error(`stateReset failed: ${resp.status} ${await resp.text()}`);
  }
}