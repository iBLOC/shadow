import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Conversation-page display preferences (Settings → UI). Kept separate
 * from themeStore so each surface grows independently; persisted to
 * localStorage like the other UI stores.
 */
interface ChatDisplayState {
  /** Show total tokens + generation speed under assistant replies. */
  showTokenStats: boolean;
  setShowTokenStats: (show: boolean) => void;
}

export const useChatDisplayStore = create<ChatDisplayState>()(
  persist(
    (set) => ({
      showTokenStats: false,
      setShowTokenStats: (showTokenStats) => set({ showTokenStats }),
    }),
    {
      name: 'shadow-chat-display-store',
    },
  ),
);
