import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const DEFAULT_SYSTEM_PROMPT = `You are Shadow, an AI assistant running locally on the user's device.
You are helpful, concise, and respect user privacy.
When unsure, ask for clarification instead of guessing.`;

interface PromptState {
  systemPrompt: string;
  customName: string | null;
  temperature: number;
  topP: number;
  maxTokens: number;

  setSystemPrompt: (value: string) => void;
  resetSystemPrompt: () => void;
  setCustomName: (value: string | null) => void;
  setTemperature: (value: number) => void;
  setTopP: (value: number) => void;
  setMaxTokens: (value: number) => void;
  resetAll: () => void;
}

export const DEFAULT_PROMPT_TEXT = DEFAULT_SYSTEM_PROMPT;

export const usePromptStore = create<PromptState>()(
  persist(
    (set) => ({
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      customName: null,
      temperature: 0.7,
      topP: 0.95,
      maxTokens: 4096,

      setSystemPrompt: (value) => set({ systemPrompt: value }),
      resetSystemPrompt: () => set({ systemPrompt: DEFAULT_SYSTEM_PROMPT }),
      setCustomName: (value) => set({ customName: value }),
      setTemperature: (value) =>
        set({ temperature: Math.max(0, Math.min(2, value)) }),
      setTopP: (value) => set({ topP: Math.max(0, Math.min(1, value)) }),
      setMaxTokens: (value) =>
        set({ maxTokens: Math.max(64, Math.min(32768, value)) }),
      resetAll: () =>
        set({
          systemPrompt: DEFAULT_SYSTEM_PROMPT,
          customName: null,
          temperature: 0.7,
          topP: 0.95,
          maxTokens: 4096,
        }),
    }),
    { name: 'shadow-prompt-settings' },
  ),
);
