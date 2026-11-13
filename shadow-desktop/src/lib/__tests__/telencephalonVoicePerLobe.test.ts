/**
 * 语音面的 **per-lobe** 契约（桌面端）：
 *
 * 端脑的 `select_asr` / `select_tts` 的解析链是
 * **显式 model → 叶区覆盖（请求体的 `lobe`）→ 全局分档默认 → 第一个注册的引擎**。
 *
 * ⚠️ **叶区是请求体里的 `lobe`，不是 `conversation_id`**（2026-11-13 订正）：
 * 端脑**没有**「会话 → 叶区」那张映射 ⇒ ⇒ 递 `conversation_id` 会被 serde
 * 静默丢掉 ⇒ ⇒ 用户配的叶区语音模型永远不生效（失败长得像成功）。
 *
 * ⚠️ 这里钉的是**请求体形状**（字段名与服务端 serde 一致）；「端脑真的按它
 * 解析叶区」由 telencephalon 的 `capability_defaults_and_agent_declaration`
 * 集成判据钉（`a_lobe_scoped_asr_default_wins_...`）。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAdminTokenMock = vi.fn();

vi.mock('../adminToken', () => ({
  getAdminToken: (...args: unknown[]) => getAdminTokenMock(...args),
  // ⚠️ `synthesizeSpeech` 走的是裸 fetch ＋ `adminHeaders()`（不走
  // `request()`）⇒ 这个导出**必须**在 mock 里，否则整条用例在 import 期
  // 就炸（报的错与「请求体不对」长得完全不一样）。
  adminHeaders: async () => ({ 'X-Admin-Token': 'k' }),
}));

describe('telencephalonClient voice per-lobe', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let client: import('../telencephalonClient').TelencephalonClient;

  beforeEach(async () => {
    getAdminTokenMock.mockReset();
    getAdminTokenMock.mockResolvedValue('k');
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ text: '你好' }),
      // synthesizeSpeech 读的是二进制体。
      blob: async () => new Blob(),
    });
    global.fetch = mockFetch;
    const { TelencephalonClient } = await import('../telencephalonClient');
    client = new TelencephalonClient({ baseUrl: 'http://localhost:60080' });
  });

  const bodyOf = (call = 0): Record<string, unknown> =>
    JSON.parse((mockFetch.mock.calls[call][1] as RequestInit).body as string);

  it('transcribeAudio 带 lobe ⇒ 请求体里是 lobe', async () => {
    await client.transcribeAudio('AAAA', 'wav', 'zh', undefined, 'temporal');
    expect(bodyOf().lobe).toBe('temporal');
  });

  it('⚠️ 不带 lobe ⇒ 不带这个字段（走全局，旧行为不变）', async () => {
    await client.transcribeAudio('AAAA', 'wav', 'zh');
    expect('lobe' in bodyOf()).toBe(false);
  });

  it('⚠️ 绝不发 conversation_id（端脑没有那张映射 ⇒ 只会被静默丢掉）', async () => {
    await client.transcribeAudio('AAAA', 'wav', 'zh', undefined, 'temporal');
    expect('conversation_id' in bodyOf()).toBe(false);
  });

  it('显式 model 与 lobe 能同时带上（model 仍然最高优先）', async () => {
    await client.transcribeAudio('AAAA', 'wav', 'zh', 'whisper-1', 'temporal');
    expect(bodyOf().model).toBe('whisper-1');
    expect(bodyOf().lobe).toBe('temporal');
  });

  it('synthesizeSpeech 同样带 lobe', async () => {
    await client.synthesizeSpeech('你好', 'alloy', undefined, 'temporal');
    expect(bodyOf().lobe).toBe('temporal');
  });

  it('⚠️ synthesizeSpeech 不带 lobe ⇒ 不带这个字段', async () => {
    await client.synthesizeSpeech('你好');
    expect('lobe' in bodyOf()).toBe(false);
    expect('conversation_id' in bodyOf()).toBe(false);
  });
});
