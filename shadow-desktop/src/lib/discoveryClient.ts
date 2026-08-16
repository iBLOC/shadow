export interface DiscoveredDevice {
  id: string;
  name: string;
  type: 'agent' | 'engine' | 'router';
  capabilities: DeviceCapability[];
  host: string;
  port: number;
  version?: string;
  lastSeen: string;
  metadata?: Record<string, unknown>;
}

export type DeviceCapability = 'llm' | 'tts' | 'asr' | 'vad';

export interface DiscoveryClientOptions {
  baseUrl?: string;
}

export class DiscoveryClient {
  private baseUrl: string;

  constructor(options: DiscoveryClientOptions = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:8082';
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: globalThis.RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  async startDiscovery(): Promise<void> {
    await this.request('/api/discovery/start', { method: 'POST' });
  }

  async stopDiscovery(): Promise<void> {
    await this.request('/api/discovery/stop', { method: 'POST' });
  }

  async getDiscoveredDevices(): Promise<DiscoveredDevice[]> {
    return this.request<DiscoveredDevice[]>('/api/discovery/devices');
  }

  async listAllDiscovered(): Promise<DiscoveredDevice[]> {
    return this.request<DiscoveredDevice[]>('/api/discovery/list');
  }

  async broadcastDiscovery(): Promise<void> {
    await this.request('/api/discovery/broadcast', { method: 'POST' });
  }

  async testConnection(host: string, port: number): Promise<boolean> {
    try {
      const response = await fetch(`http://${host}:${port}/health`, {
        method: 'GET',
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export const discoveryClient = new DiscoveryClient();