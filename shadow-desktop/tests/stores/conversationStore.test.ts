import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useConversationStore } from '../../src/stores/conversationStore';
import type { Conversation, Message } from '../../src/types';

describe('ConversationStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useConversationStore.setState({
      conversations: [],
      activeConversationId: null,
    });
  });

  describe('initial state', () => {
    it('starts with empty conversations', () => {
      const state = useConversationStore.getState();
      expect(state.conversations).toEqual([]);
      expect(state.activeConversationId).toBeNull();
    });
  });

  describe('addConversation', () => {
    it('adds a new conversation and sets it as active', () => {
      const { addConversation } = useConversationStore.getState();
      
      const conversation: Conversation = {
        id: 'conv-1',
        title: 'Test Conversation',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      addConversation(conversation);
      
      const state = useConversationStore.getState();
      expect(state.conversations).toHaveLength(1);
      expect(state.conversations[0].id).toBe('conv-1');
      expect(state.activeConversationId).toBe('conv-1');
    });

    it('appends to existing conversations', () => {
      const conversation1: Conversation = {
        id: 'conv-1',
        title: 'First',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const conversation2: Conversation = {
        id: 'conv-2',
        title: 'Second',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      useConversationStore.getState().addConversation(conversation1);
      useConversationStore.getState().addConversation(conversation2);
      
      const state = useConversationStore.getState();
      expect(state.conversations).toHaveLength(2);
      expect(state.activeConversationId).toBe('conv-2');
    });
  });

  describe('removeConversation', () => {
    it('removes a conversation by id', () => {
      const conversation: Conversation = {
        id: 'conv-1',
        title: 'Test',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      useConversationStore.getState().addConversation(conversation);
      useConversationStore.getState().removeConversation('conv-1');
      
      const state = useConversationStore.getState();
      expect(state.conversations).toHaveLength(0);
    });

    it('clears activeConversationId if removed conversation was active', () => {
      const conversation: Conversation = {
        id: 'conv-1',
        title: 'Test',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      useConversationStore.getState().addConversation(conversation);
      expect(useConversationStore.getState().activeConversationId).toBe('conv-1');
      
      useConversationStore.getState().removeConversation('conv-1');
      
      const state = useConversationStore.getState();
      expect(state.activeConversationId).toBeNull();
    });
  });

  describe('updateConversation', () => {
    it('updates conversation fields', () => {
      const conversation: Conversation = {
        id: 'conv-1',
        title: 'Original Title',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      useConversationStore.getState().addConversation(conversation);
      useConversationStore.getState().updateConversation('conv-1', { title: 'Updated Title' });
      
      const state = useConversationStore.getState();
      expect(state.conversations[0].title).toBe('Updated Title');
    });
  });

  describe('setActiveConversation', () => {
    it('sets the active conversation id', () => {
      useConversationStore.getState().setActiveConversation('conv-1');
      
      const state = useConversationStore.getState();
      expect(state.activeConversationId).toBe('conv-1');
    });

    it('can set null to clear active', () => {
      useConversationStore.getState().setActiveConversation('conv-1');
      useConversationStore.getState().setActiveConversation(null);
      
      const state = useConversationStore.getState();
      expect(state.activeConversationId).toBeNull();
    });
  });

  describe('addMessage', () => {
    it('adds a message to a conversation', () => {
      const conversation: Conversation = {
        id: 'conv-1',
        title: 'Test',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      useConversationStore.getState().addConversation(conversation);
      
      const message: Message = {
        id: 'msg-1',
        role: 'user',
        content: 'Hello',
        timestamp: new Date(),
      };
      
      useConversationStore.getState().addMessage('conv-1', message);
      
      const state = useConversationStore.getState();
      expect(state.conversations[0].messages).toHaveLength(1);
      expect(state.conversations[0].messages[0].content).toBe('Hello');
    });

    it('updates updatedAt when adding message', () => {
      const beforeDate = new Date();
      const conversation: Conversation = {
        id: 'conv-1',
        title: 'Test',
        messages: [],
        createdAt: beforeDate,
        updatedAt: beforeDate,
      };
      
      useConversationStore.getState().addConversation(conversation);
      
      const message: Message = {
        id: 'msg-1',
        role: 'user',
        content: 'Hello',
        timestamp: new Date(),
      };
      
      useConversationStore.getState().addMessage('conv-1', message);
      
      const state = useConversationStore.getState();
      expect(state.conversations[0].updatedAt.getTime()).toBeGreaterThanOrEqual(beforeDate.getTime());
    });
  });

  describe('setSessionId', () => {
    it('sets sessionId on a conversation', () => {
      const conversation: Conversation = {
        id: 'conv-1',
        title: 'Test',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      useConversationStore.getState().addConversation(conversation);
      useConversationStore.getState().setSessionId('conv-1', 'session-123');
      
      const state = useConversationStore.getState();
      expect(state.conversations[0].sessionId).toBe('session-123');
    });
  });

  describe('clearConversations', () => {
    it('clears all conversations and resets active id', () => {
      const conversation: Conversation = {
        id: 'conv-1',
        title: 'Test',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      useConversationStore.getState().addConversation(conversation);
      useConversationStore.getState().clearConversations();
      
      const state = useConversationStore.getState();
      expect(state.conversations).toEqual([]);
      expect(state.activeConversationId).toBeNull();
    });
  });
});