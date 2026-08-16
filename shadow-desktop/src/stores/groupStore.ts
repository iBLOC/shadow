import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type PairingState = 'idle' | 'awaiting' | 'paired' | 'error';

export interface PairedPeer {
  id: string;
  name: string;
  endpoint: string;
  pairedAt: number;
  capabilities: string[];
  fingerprint: string;
  lastSeen: number | null;
}

export interface OutgoingPairing {
  code: string;
  startedAt: number;
  expiresAt: number;
}

interface GroupState {
  peers: PairedPeer[];
  outgoing: OutgoingPairing | null;
  error: string | null;
  machineId: string | null;
  fingerprint: string | null;

  initFromTauri: () => Promise<void>;
  startPairing: () => Promise<OutgoingPairing>;
  cancelPairing: () => void;
  joinPairing: (code: string) => Promise<{ peer: PairedPeer } | null>;
  removePeer: (id: string) => void;
  setError: (msg: string | null) => void;
}

const STORAGE_KEY = 'shadow-group';
const PAIRING_TTL_MS = 5 * 60 * 1000;

function makePin(): string {
  const num = Math.floor(Math.random() * 1_000_000);
  return num.toString().padStart(6, '0');
}

function fp(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(16).padStart(8, '0').slice(0, 8);
}

export const useGroupStore = create<GroupState>()(
  persist(
    (set) => ({
      peers: [],
      outgoing: null,
      error: null,
      machineId: null,
      fingerprint: null,

      initFromTauri: async () => {
        if (typeof window === 'undefined') return;
        const win = window as unknown as {
          __TAURI_INTERNALS__?: unknown;
        };
        if (win.__TAURI_INTERNALS__) {
          try {
            const { safeInvoke } = await import('../lib/tauriSafe');
            const id = await safeInvoke<string>('get_machine_id');
            const fingerprint = id ? fp(id) : null;
            set({ machineId: id ?? null, fingerprint });
          } catch (_err) {
            void _err;
          }
        }
      },

      startPairing: async () => {
        const code = makePin();
        const now = Date.now();
        const outgoing: OutgoingPairing = {
          code,
          startedAt: now,
          expiresAt: now + PAIRING_TTL_MS,
        };
        set({ outgoing, error: null });
        return outgoing;
      },

      cancelPairing: () => set({ outgoing: null }),

      joinPairing: async (code) => {
        if (!/^\d{6}$/.test(code)) {
          set({ error: 'PIN must be 6 digits' });
          return null;
        }
        const peer: PairedPeer = {
          id: `peer-${code}`,
          name: `Paired-${code}`,
          endpoint: `pending://${code}`,
          pairedAt: Date.now(),
          capabilities: ['llm'],
          fingerprint: fp(`paired-${code}`),
          lastSeen: null,
        };
        set((s) => ({ peers: [...s.peers, peer], error: null }));
        return { peer };
      },

      removePeer: (id) =>
        set((s) => ({ peers: s.peers.filter((p) => p.id !== id) })),

      setError: (msg) => set({ error: msg }),
    }),
    { name: STORAGE_KEY, partialize: (s) => ({ peers: s.peers }) },
  ),
);
