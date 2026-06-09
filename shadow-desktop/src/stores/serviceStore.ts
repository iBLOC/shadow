import { create } from 'zustand';

export type ServiceName = 'resonance' | 'prefrontal' | 'neure' | 'hippocampus';
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

interface ServiceState {
  services: Record<ServiceName, ServiceInfo>;
  isChecking: boolean;
  
  checkService: (name: ServiceName) => Promise<void>;
  checkAllServices: () => Promise<void>;
  setServiceStatus: (name: ServiceName, status: ServiceStatus, latency?: number, error?: string) => void;
}

const DEFAULT_SERVICES: Record<ServiceName, ServiceInfo> = {
  resonance: {
    name: 'resonance',
    displayName: 'Resonance',
    host: 'localhost',
    port: 8080,
    status: 'unknown',
  },
  prefrontal: {
    name: 'prefrontal',
    displayName: 'Prefrontal (Agent)',
    host: 'localhost',
    port: 8082,
    status: 'unknown',
  },
  neure: {
    name: 'neure',
    displayName: 'Neure (Embedded Engine)',
    host: 'localhost',
    port: 8085,
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

const checkEndpoint = async (host: string, port: number, path: string = '/health'): Promise<{ ok: boolean; latency?: number; error?: string }> => {
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
    
    if (response.ok) {
      return { ok: true, latency };
    }
    return { ok: false, latency, error: `HTTP ${response.status}` };
  } catch (e) {
    const latency = Date.now() - start;
    const error = e instanceof Error ? e.message : 'Connection failed';
    return { ok: false, latency, error };
  }
};

export const useServiceStore = create<ServiceState>((set, get) => ({
  services: { ...DEFAULT_SERVICES },
  isChecking: false,

  checkService: async (name: ServiceName) => {
    const service = get().services[name];
    set((state) => ({
      services: {
        ...state.services,
        [name]: { ...service, status: 'checking' },
      },
    }));

    const { host, port } = service;
    
    const endpoints = ['/health', '/api/health', '/api/v1/health', '/'];
    let result = { ok: false, latency: undefined as number | undefined, error: 'No health endpoint' as string };

    for (const endpoint of endpoints) {
      const checkResult = await checkEndpoint(host, port, endpoint);
      if (checkResult.ok) {
        result = { ok: true, latency: checkResult.latency ?? undefined, error: '' };
        break;
      }
      if (endpoint === endpoints[endpoints.length - 1]) {
        result = { ok: false, latency: checkResult.latency, error: checkResult.error ?? 'Connection failed' };
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

    await Promise.all(
      services.map((name) => get().checkService(name))
    );

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
}));
