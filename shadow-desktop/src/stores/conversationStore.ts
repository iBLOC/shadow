import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Conversation, Message } from '../types';

interface ConversationState {
  conversations: Conversation[];
  activeConversationId: string | null;
  addConversation: (conversation: Conversation) => void;
  removeConversation: (id: string) => void;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  setActiveConversation: (id: string | null) => void;
  addMessage: (conversationId: string, message: Message) => void;
  updateMessage: (conversationId: string, messageId: string, updates: Partial<Message>) => void;
  setSessionId: (conversationId: string, sessionId: string) => void;
  clearConversations: () => void;
}

export const useConversationStore = create<ConversationState>()(
  persist(
    (set) => ({
      conversations: [],
      activeConversationId: null,
      addConversation: (conversation) => set((state) => ({ 
        conversations: [...state.conversations, conversation],
        activeConversationId: conversation.id,
      })),
      removeConversation: (id) => set((state) => ({ 
        conversations: state.conversations.filter(c => c.id !== id),
        activeConversationId: state.activeConversationId === id ? null : state.activeConversationId,
      })),
      updateConversation: (id, updates) => set((state) => ({
        conversations: state.conversations.map(c => 
          c.id === id ? { ...c, ...updates, updatedAt: new Date() } : c
        )
      })),
      setActiveConversation: (id) => set({ activeConversationId: id }),
      addMessage: (conversationId, message) => set((state) => ({
        conversations: state.conversations.map(c => 
          c.id === conversationId 
            ? { 
                ...c, 
                messages: [...c.messages, message],
                updatedAt: new Date(),
              } 
            : c
        )
      })),
      updateMessage: (conversationId, messageId, updates) => set((state) => ({
        conversations: state.conversations.map(c =>
          c.id === conversationId
            ? {
                ...c,
                messages: c.messages.map(m =>
                  m.id === messageId ? { ...m, ...updates } : m
                ),
                updatedAt: new Date(),
              }
            : c
        )
      })),
      setSessionId: (conversationId, sessionId) => set((state) => ({
        conversations: state.conversations.map(c => 
          c.id === conversationId 
            ? { ...c, sessionId, updatedAt: new Date() }
            : c
        )
      })),
      clearConversations: () => set({ conversations: [], activeConversationId: null }),
    }),
    {
      name: 'prefrontal-conversation-storage',
    }
  )
);
