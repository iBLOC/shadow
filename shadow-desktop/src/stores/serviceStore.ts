import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeInvoke } from '../lib/tauriSafe';

export type ServiceName = 'resonance' | 'prefrontal' | 'hippocampus';
export type ServiceStatus = 'unknown' | 'checking' | 'healthy' | 'unhealthy' | 'offline';

export interface ServiceInfo {
  name: ServiceName;
  displayName: string;
  host: string;
  port: number;
  status: ServiceStatus;
  latency?: number;
  error?: string;
  lastCheck?: Date;
}

export interface ResonanceInstance {
  id: string;
  name: string;
  host: string;
  port?: number;
  apiKey?: string | null;
  isPrimary: boolean;
  status: 'connected' | 'disconnected' | 'connecting';
  latency?: number;
  version?: string;
  exposedAgents: string[];
  createdAt: number;
}

interface ServiceState {
  services: Record<ServiceName, ServiceInfo>;
  resonanceInstances: ResonanceInstance[];
  isChecking: boolean;

  checkService: (name: ServiceName) => Promise<void>;
  checkAllServices: () => Promise<void>;
  setServiceStatus: (
    name: ServiceName,
    status: ServiceStatus,
    latency?: number,
    error?: string,
  ) => void;

  addResonanceInstance: (
    instance: Omit<ResonanceInstance, 'id' | 'createdAt' | 'isPrimary'>,
  ) => void;
  updateResonanceInstance: (id: string, patch: Partial<ResonanceInstance>) => void;
  removeResonanceInstance: (id: string) => void;
  setPrimaryResonance: (id: string | null) => void;
  hasConfiguredResonance: () => boolean;
  getPrimaryResonance: () => ResonanceInstance | null;
}

const DEFAULT_RESONANCE: ServiceInfo = {
  name: 'resonance',
  displayName: 'Resonance',
  host: '',
  port: 8080,
  status: 'unknown',
};

const DEFAULT_SERVICES: Record<ServiceName, ServiceInfo> = {
  resonance: { ...DEFAULT_RESONANCE },
  prefrontal: {
    name: 'prefrontal',
    displayName: 'Prefrontal (Agent)',
    host: 'localhost',
    port: 8082,
    status: 'unknown',
  },
  hippocampus: {
    name: 'hippocampus',
    displayName: 'Hippocampus',
    host: 'localhost',
    port: 8081,
    status: 'unknown',
  },
};

const newResonanceId = () => `res-${Math.random().toString(36).slice(2, 10)}`;

export const useServiceStore = create<ServiceState>()(
  persist(
    (set, get) => ({
      services: { ...DEFAULT_SERVICES },
      resonanceInstances: [],
      isChecking: false,

      checkService: async (name) => {
        const service = get().services[name];

        if (name === 'resonance') {
          const primary = get().getPrimaryResonance();
          if (!primary) {
            set((state) => ({
              services: {
                ...state.services,
                resonance: {
                  ...service,
                  status: 'unknown',
                  error: 'No Resonance instance configured',
                  lastCheck: new Date(),
                },
              },
            }));
            return;
          }
        }

        if (name === 'prefrontal' || name === 'hippocampus') {
          try {
            const result = await safeInvoke<{ status: string; error?: string }>('service_get', { name });
            if (!result) {
              set((state) => ({
                services: {
                  ...state.services,
                  [name]: { ...service, status: 'unknown', error: 'Service not found', lastCheck: new Date() },
                },
              }));
              return;
            }
            const status: ServiceStatus = result.status === 'running' ? 'healthy' : 'offline';
            set((state) => ({
              services: {
                ...state.services,
                [name]: {
                  ...service,
                  status,
                  error: result.error,
                  lastCheck: new Date(),
                },
              },
            }));
          } catch (e) {
            set((state) => ({
              services: {
                ...state.services,
                [name]: {
                  ...service,
                  status: 'offline',
                  error: e instanceof Error ? e.message : 'Failed to check service',
                  lastCheck: new Date(),
                },
              },
            }));
          }
          return;
        }

        if (!service.host) {
          set((state) => ({
            services: {
              ...state.services,
              [name]: {
                ...service,
                status: 'unknown',
                error: `${service.displayName} host not configured`,
                lastCheck: new Date(),
              },
            },
          }));
          return;
        }

        set((state) => ({
          services: {
            ...state.services,
            [name]: { ...service, status: 'checking' },
          },
        }));

        const { host, port } = service;
        const endpoints = ['/health', '/api/health', '/api/v1/health', '/'];
        let result: { ok: boolean; latency?: number; error?: string } = {
          ok: false,
          error: 'No health endpoint',
        };

        for (const endpoint of endpoints) {
          const checkResult = await checkEndpoint(host, port, endpoint);
          if (checkResult.ok) {
            result = { ok: true, latency: checkResult.latency, error: '' };
            break;
          }
          if (endpoint === endpoints[endpoints.length - 1]) {
            result = {
              ok: false,
              latency: checkResult.latency,
              error: checkResult.error,
            };
          }
        }

        const status: ServiceStatus = result.ok ? 'healthy' : 'offline';
        set((state) => ({
          services: {
            ...state.services,
            [name]: {
              ...service,
              status,
              latency: result.latency,
              error: result.error,
              lastCheck: new Date(),
            },
          },
        }));
      },

      checkAllServices: async () => {
        set({ isChecking: true });
        const services = Object.keys(get().services) as ServiceName[];
        await Promise.all(services.map((name) => get().checkService(name)));
        set({ isChecking: false });
      },

      setServiceStatus: (name, status, latency, error) => {
        set((state) => ({
          services: {
            ...state.services,
            [name]: {
              ...state.services[name],
              status,
              latency,
              error,
              lastCheck: new Date(),
            },
          },
        }));
      },

      addResonanceInstance: (instance) => {
        const id = newResonanceId();
        const isFirst = get().resonanceInstances.length === 0;
        const newInstance: ResonanceInstance = {
          ...instance,
          id,
          isPrimary: isFirst,
          createdAt: Date.now(),
        };
        set((state) => {
          const instances = isFirst
            ? state.resonanceInstances.map((r) => ({ ...r, isPrimary: false }))
            : state.resonanceInstances;
          return { resonanceInstances: [...instances, newInstance] };
        });
        const primary = newInstance.isPrimary
          ? newInstance
          : get().getPrimaryResonance() ?? newInstance;
        if (primary) {
          set((state) => ({
            services: {
              ...state.services,
              resonance: {
                ...state.services.resonance,
                host: primary.host,
                port: primary.port ?? 8080,
                displayName: primary.name,
                name: 'resonance' as ServiceName,
              },
            },
          }));
        }
        return newInstance;
      },

      updateResonanceInstance: (id, patch) => {
        set((state) => {
          let next = state.resonanceInstances.map((r) =>
            r.id === id ? { ...r, ...patch } : r,
          );
          if (patch.isPrimary) {
            next = next.map((r) => ({ ...r, isPrimary: r.id === id }));
          }
          return { resonanceInstances: next };
        });
        const updated = get().resonanceInstances.find((r) => r.id === id);
          if (updated?.isPrimary) {
            set((state) => ({
              services: {
                ...state.services,
                resonance: {
                  ...state.services.resonance,
                  host: updated.host,
                  port: updated.port ?? 8080,
                  displayName: updated.name,
                  name: 'resonance' as ServiceName,
                },
              },
            }));
          }
      },

      removeResonanceInstance: (id) => {
        set((state) => {
          const removed = state.resonanceInstances.find((r) => r.id === id);
          const remaining = state.resonanceInstances.filter((r) => r.id !== id);
          let promoted = remaining.find((r) => r.isPrimary);
          if (removed?.isPrimary && !promoted && remaining.length > 0) {
            promoted = remaining[0];
          }
          const finalInstances = promoted
            ? remaining.map((r) => ({ ...r, isPrimary: r.id === promoted!.id }))
            : remaining;
          const services = { ...state.services };
          if (promoted) {
            services.resonance = {
              ...services.resonance,
              host: promoted.host,
              port: promoted.port ?? 8080,
              displayName: promoted.name,
              name: 'resonance' as ServiceName,
            };
          } else {
            services.resonance = { ...DEFAULT_RESONANCE } as ServiceInfo;
          }
          return { resonanceInstances: finalInstances, services };
        });
      },

      setPrimaryResonance: (id) => {
        set((state) => ({
          resonanceInstances: state.resonanceInstances.map((r) => ({
            ...r,
            isPrimary: r.id === id,
          })),
        }));
        const primary = get().getPrimaryResonance();
        if (primary) {
          set((state) => ({
            services: {
              ...state.services,
              resonance: {
                ...state.services.resonance,
                host: primary.host,
                port: primary.port ?? 8080,
                displayName: primary.name,
                name: 'resonance' as ServiceName,
              },
            },
          }));
        } else {
          set((state) => ({
            services: {
              ...state.services,
              resonance: { ...DEFAULT_RESONANCE } as ServiceInfo,
            },
          }));
        }
      },

      hasConfiguredResonance: () => get().resonanceInstances.length > 0,

      getPrimaryResonance: () =>
        get().resonanceInstances.find((r) => r.isPrimary) ?? null,
    }),
    {
      name: 'shadow-service-store',
      partialize: (state) => ({
        services: state.services,
        resonanceInstances: state.resonanceInstances,
      }),
    },
  ),
);

const checkEndpoint = async (
  host: string,
  port: number,
  path = '/health',
): Promise<{ ok: boolean; latency?: number; error?: string }> => {
  if (!host) return { ok: false, error: 'Host not configured' };
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`http://${host}:${port}${path}`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const latency = Date.now() - start;

    if (response.ok) return { ok: true, latency };
    return { ok: false, latency, error: `HTTP ${response.status}` };
  } catch (e) {
    const latency = Date.now() - start;
    const error = e instanceof Error ? e.message : 'Connection failed';
    return { ok: false, latency, error };
  }
};
