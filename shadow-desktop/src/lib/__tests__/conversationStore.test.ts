import { beforeEach, describe, expect, it, vi } from 'vitest';

const createMockConversation = (overrides = {}) => ({
  id: 'conv-1',
  title: 'Test Conversation',
  messages: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  modelId: 'test-model',
  ...overrides,
});

const createMockMessage = (overrides = {}) => ({
  id: 'msg-1',
  role: 'user' as const,
  content: 'Hello',
  createdAt: new Date(),
  ...overrides,
});

describe('conversationStore', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it('starts with empty conversations array', async () => {
    const { useConversationStore } = await import('../../stores/conversationStore');
    const { conversations } = useConversationStore.getState();
    expect(conversations).toEqual([]);
  });

  it('starts with null activeConversationId', async () => {
    const { useConversationStore } = await import('../../stores/conversationStore');
    const { activeConversationId } = useConversationStore.getState();
    expect(activeConversationId).toBeNull();
  });

  it('addConversation adds conversation and sets it as active', async () => {
    const { useConversationStore } = await import('../../stores/conversationStore');
    const { addConversation } = useConversationStore.getState();
    
    const conv = createMockConversation();
    addConversation(conv);
    
    const { conversations, activeConversationId } = useConversationStore.getState();
    expect(conversations).toHaveLength(1);
    expect(conversations[0].id).toBe('conv-1');
    expect(activeConversationId).toBe('conv-1');
  });

  it('removeConversation removes conversation by id', async () => {
    const { useConversationStore } = await import('../../stores/conversationStore');
    const { addConversation, removeConversation } = useConversationStore.getState();
    
    const conv = createMockConversation();
    addConversation(conv);
    removeConversation('conv-1');
    
    const { conversations } = useConversationStore.getState();
    expect(conversations).toHaveLength(0);
  });

  it('removeConversation clears activeConversationId if removed', async () => {
    const { useConversationStore } = await import('../../stores/conversationStore');
    const { addConversation, removeConversation } = useConversationStore.getState();
    
    const conv = createMockConversation();
    addConversation(conv);
    removeConversation('conv-1');
    
    const { activeConversationId } = useConversationStore.getState();
    expect(activeConversationId).toBeNull();
  });

  it('removeConversation preserves other conversations', async () => {
    const { useConversationStore } = await import('../../stores/conversationStore');
    const { addConversation, removeConversation } = useConversationStore.getState();
    
    addConversation(createMockConversation({ id: 'conv-1' }));
    addConversation(createMockConversation({ id: 'conv-2' }));
    removeConversation('conv-1');
    
    const { conversations } = useConversationStore.getState();
    expect(conversations).toHaveLength(1);
    expect(conversations[0].id).toBe('conv-2');
  });

  it('updateConversation updates conversation fields', async () => {
    const { useConversationStore } = await import('../../stores/conversationStore');
    const { addConversation, updateConversation } = useConversationStore.getState();
    
    addConversation(createMockConversation());
    updateConversation('conv-1', { title: 'Updated Title' });
    
    const { conversations } = useConversationStore.getState();
    expect(conversations[0].title).toBe('Updated Title');
  });

  it('updateConversation updates updatedAt timestamp', async () => {
    vi.useFakeTimers();
    const initialTime = new Date('2025-01-01T00:00:00Z');
    vi.setSystemTime(initialTime);
    
    const { useConversationStore } = await import('../../stores/conversationStore');
    const { addConversation, updateConversation } = useConversationStore.getState();
    
    addConversation(createMockConversation());
    
    vi.setSystemTime(new Date('2025-01-02T00:00:00Z'));
    updateConversation('conv-1', { title: 'Updated' });
    
    const { conversations } = useConversationStore.getState();
    expect(conversations[0].updatedAt.getTime()).toBe(new Date('2025-01-02T00:00:00Z').getTime());
    
    vi.useRealTimers();
  });

  it('setActiveConversation sets active conversation id', async () => {
    const { useConversationStore } = await import('../../stores/conversationStore');
    const { addConversation, setActiveConversation } = useConversationStore.getState();
    
    addConversation(createMockConversation({ id: 'conv-1' }));
    addConversation(createMockConversation({ id: 'conv-2' }));
    setActiveConversation('conv-2');
    
    const { activeConversationId } = useConversationStore.getState();
    expect(activeConversationId).toBe('conv-2');
  });

  it('setActiveConversation can set null', async () => {
    const { useConversationStore } = await import('../../stores/conversationStore');
    const { addConversation, setActiveConversation } = useConversationStore.getState();
    
    addConversation(createMockConversation());
    setActiveConversation(null);
    
    const { activeConversationId } = useConversationStore.getState();
    expect(activeConversationId).toBeNull();
  });

  it('addMessage appends message to conversation', async () => {
    const { useConversationStore } = await import('../../stores/conversationStore');
    const { addConversation, addMessage } = useConversationStore.getState();
    
    addConversation(createMockConversation());
    addMessage('conv-1', createMockMessage());
    
    const { conversations } = useConversationStore.getState();
    expect(conversations[0].messages).toHaveLength(1);
    expect(conversations[0].messages[0].content).toBe('Hello');
  });

  it('setSessionId updates sessionId on conversation', async () => {
    const { useConversationStore } = await import('../../stores/conversationStore');
    const { addConversation, setSessionId } = useConversationStore.getState();
    
    addConversation(createMockConversation());
    setSessionId('conv-1', 'session-123');
    
    const { conversations } = useConversationStore.getState();
    expect(conversations[0].sessionId).toBe('session-123');
  });

  it('clearConversations resets store state', async () => {
    const { useConversationStore } = await import('../../stores/conversationStore');
    const { addConversation, clearConversations } = useConversationStore.getState();
    
    addConversation(createMockConversation());
    clearConversations();
    
    const { conversations, activeConversationId } = useConversationStore.getState();
    expect(conversations).toEqual([]);
    expect(activeConversationId).toBeNull();
  });
});