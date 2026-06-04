import { create } from 'zustand';
import { createCompanion, WebRtcCompanion, type VadState } from '../lib/webrtcCompanion';
import { prefrontalClient } from '../lib/prefrontalClient';

export type CompanionPhase =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'speaking'
  | 'processing'
  | 'barge_in'
  | 'error';

interface CompanionState {
  phase: CompanionPhase;
  transcript: string;
  partialTranscript: string;
  error: string | null;
  audioLevel: number;
  sessionId: string | null;
  isActive: boolean;
  turnCount: number;

  start: (prefrontalHost?: string) => Promise<boolean>;
  stop: () => Promise<void>;
  pushTurn: (userText: string, assistantText: string) => void;
  reset: () => void;
}

let companion: WebRtcCompanion | null = null;

const DEFAULT_HOST = 'http://localhost:8082';

async function createPrefrontalSession(_host: string): Promise<string> {
  // Use HTTP API so this works in both Tauri and web builds.
  // The Tauri-side `prefrontal_create_session` command still works in
  // desktop, but going through HTTP keeps the code path identical.
  const session = await prefrontalClient.createSession();
  return session.id;
}

export const useCompanionModeStore = create<CompanionState>((set, get) => ({
  phase: 'idle',
  transcript: '',
  partialTranscript: '',
  error: null,
  audioLevel: 0,
  sessionId: null,
  isActive: false,
  turnCount: 0,

  start: async (prefrontalHost?: string) => {
    if (get().isActive) return true;

    set({ phase: 'connecting', error: null, transcript: '', partialTranscript: '' });

    try {
      const host = prefrontalHost || DEFAULT_HOST;
      const sessionId = await createPrefrontalSession(host);

      const wsUrl = host
        .replace(/^http/, 'ws')
        .replace(/\/$/, '') + `/api/sessions/${sessionId}/ws`;

      companion = createCompanion({
        signalingUrl: wsUrl,
        sessionId,
      });

      companion.onVad((state: VadState) => {
        const phase = mapVadToPhase(state);
        set({ phase });
      });

      companion.onTranscription((text, done) => {
        if (done) {
          set((s) => ({
            transcript: s.transcript ? `${s.transcript}\n${text}` : text,
            partialTranscript: '',
            turnCount: s.turnCount + 1,
            phase: 'idle',
          }));
        } else {
          set({ partialTranscript: text, phase: 'processing' });
        }
      });

      const ok = await companion.start();
      if (!ok) {
        set({ phase: 'error', error: companion.error.value, isActive: false });
        return false;
      }

      set({ isActive: true, sessionId, phase: 'listening' });
      return true;
    } catch (e) {
      set({
        phase: 'error',
        error: e instanceof Error ? e.message : String(e),
        isActive: false,
      });
      return false;
    }
  },

  stop: async () => {
    if (companion) {
      await companion.stop();
      companion = null;
    }
    set({
      isActive: false,
      phase: 'idle',
      audioLevel: 0,
      sessionId: null,
    });
  },

  pushTurn: (userText: string, assistantText: string) => {
    set((s) => ({
      transcript: s.transcript
        ? `${s.transcript}\n👤 ${userText}\n🤖 ${assistantText}`
        : `👤 ${userText}\n🤖 ${assistantText}`,
      turnCount: s.turnCount + 1,
    }));
  },

  reset: () => {
    set({
      phase: 'idle',
      transcript: '',
      partialTranscript: '',
      error: null,
      audioLevel: 0,
      turnCount: 0,
    });
  },
}));

function mapVadToPhase(vad: VadState): CompanionPhase {
  switch (vad) {
    case 'speaking':
      return 'listening';
    case 'barge_in':
      return 'barge_in';
    case 'idle':
    case 'listening':
    case 'unknown':
    default:
      return 'idle';
  }
}
