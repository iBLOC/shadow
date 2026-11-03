/**
 * 会话的「归档 / 删除」两个状态 —— 桌面端这一半的**顺序**测试。
 *
 * ⚠️ 这组钉的是**顺序**，不是形状（形状由 telencephalonConversationLifecycle
 * 那组钉）：**先动端脑、后动本地** ⇒ ⇒ 端脑拒绝时**本地那份原样不动**
 * ⇒ ⇒ 界面不会说「归档好了」而端脑那边根本没这回事（失败长得像成功）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Conversation } from '../../types';

const archiveConversation = vi.fn();
const unarchiveConversation = vi.fn();
const deleteConversation = vi.fn();

vi.mock('../telencephalonClient', () => ({
  telencephalonClient: {
    archiveConversation: (...args: unknown[]) => archiveConversation(...args),
    unarchiveConversation: (...args: unknown[]) => unarchiveConversation(...args),
    deleteConversation: (...args: unknown[]) => deleteConversation(...args),
  },
}));

const conversation = (overrides: Partial<Conversation> = {}): Conversation => ({
  id: 'conv-1',
  title: 'Test',
  messages: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('conversation lifecycle — archive / delete', () => {
  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    archiveConversation.mockReset();
    unarchiveConversation.mockReset();
    deleteConversation.mockReset();
    const { useConversationStore } = await import('../../stores/conversationStore');
    useConversationStore.setState({ conversations: [], activeConversationId: null });
  });

  it('archives in the endbrain FIRST, then flips the local flag', async () => {
    const { useConversationStore } = await import('../../stores/conversationStore');
    useConversationStore.getState().addConversation(conversation({ sessionId: 'sess-1' }));
    archiveConversation.mockResolvedValue({ id: 'sess-1', archived: true });

    const { setConversationArchived } = await import('../conversationLifecycle');
    const outcome = await setConversationArchived('conv-1', true);

    expect(outcome.ok).toBe(true);
    expect(archiveConversation).toHaveBeenCalledWith('sess-1');
    expect(useConversationStore.getState().conversations[0].archived).toBe(true);
  });

  it('leaves the local copy ALONE when the endbrain refuses to archive', async () => {
    const { useConversationStore } = await import('../../stores/conversationStore');
    useConversationStore.getState().addConversation(conversation({ sessionId: 'sess-1' }));
    archiveConversation.mockRejectedValue(new Error('telencephalon 401: door admin'));

    const { setConversationArchived } = await import('../conversationLifecycle');
    const outcome = await setConversationArchived('conv-1', true);

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('401');
    expect(useConversationStore.getState().conversations[0].archived).toBeFalsy();
  });

  it('archives locally when there is no endbrain session at all', async () => {
    // 还没发过消息的本地草稿 ⇒ 端脑那边根本没有这份会话 ⇒ 只动本地。
    const { useConversationStore } = await import('../../stores/conversationStore');
    useConversationStore.getState().addConversation(conversation());

    const { setConversationArchived } = await import('../conversationLifecycle');
    const outcome = await setConversationArchived('conv-1', true);

    expect(outcome.ok).toBe(true);
    expect(archiveConversation).not.toHaveBeenCalled();
    expect(useConversationStore.getState().conversations[0].archived).toBe(true);
  });

  it('unarchives through the endbrain too', async () => {
    const { useConversationStore } = await import('../../stores/conversationStore');
    useConversationStore.getState().addConversation(
      conversation({ sessionId: 'sess-1', archived: true }),
    );
    unarchiveConversation.mockResolvedValue({ id: 'sess-1', archived: false });

    const { setConversationArchived } = await import('../conversationLifecycle');
    const outcome = await setConversationArchived('conv-1', false);

    expect(outcome.ok).toBe(true);
    expect(unarchiveConversation).toHaveBeenCalledWith('sess-1');
    expect(useConversationStore.getState().conversations[0].archived).toBe(false);
  });

  it('deletes in the endbrain FIRST — that also drops the hippocampus copy', async () => {
    const { useConversationStore } = await import('../../stores/conversationStore');
    useConversationStore.getState().addConversation(conversation({ sessionId: 'sess-1' }));
    deleteConversation.mockResolvedValue({ deleted: true, id: 'sess-1' });

    const { deleteConversationEverywhere } = await import('../conversationLifecycle');
    const outcome = await deleteConversationEverywhere('conv-1');

    expect(outcome.ok).toBe(true);
    expect(deleteConversation).toHaveBeenCalledWith('sess-1');
    expect(useConversationStore.getState().conversations).toHaveLength(0);
  });

  it('keeps the local entry when the endbrain refuses the delete', async () => {
    // ⚠️ 不许「本地删了、端脑里还留着」⇒ ⇒ 那种**看不见的孤儿**没人能重试。
    const { useConversationStore } = await import('../../stores/conversationStore');
    useConversationStore.getState().addConversation(conversation({ sessionId: 'sess-1' }));
    deleteConversation.mockRejectedValue(new Error('telencephalon 401: door admin'));

    const { deleteConversationEverywhere } = await import('../conversationLifecycle');
    const outcome = await deleteConversationEverywhere('conv-1');

    expect(outcome.ok).toBe(false);
    expect(useConversationStore.getState().conversations).toHaveLength(1);
  });
});
