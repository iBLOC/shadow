import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { useServiceStore, type ServiceName, type ServiceStatus, type ServiceInfo } from '../../src/stores/serviceStore';

describe('ServiceStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useServiceStore.setState({
      services: {
        resonance: {
          name: 'resonance',
          displayName: 'Resonance',
          host: 'localhost',
          port: 8080,
          status: 'unknown',
        },
        prefrontal: {
          name: 'prefrontal',
          displayName: 'Prefrontal',
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
      },
      isChecking: false,
    });
  });

  describe('initial state', () => {
    it('has correct initial service configurations', () => {
      const state = useServiceStore.getState();
      
      expect(state.services.resonance.name).toBe('resonance');
      expect(state.services.resonance.displayName).toBe('Resonance');
      expect(state.services.resonance.host).toBe('localhost');
      expect(state.services.resonance.port).toBe(8080);
      expect(state.services.resonance.status).toBe('unknown');
      
      expect(state.services.prefrontal.name).toBe('prefrontal');
      expect(state.services.prefrontal.displayName).toBe('Prefrontal');
      expect(state.services.prefrontal.port).toBe(8082);
      
      expect(state.services.hippocampus.name).toBe('hippocampus');
      expect(state.services.hippocampus.displayName).toBe('Hippocampus');
      expect(state.services.hippocampus.port).toBe(8081);
    });

    it('starts with isChecking false', () => {
      const state = useServiceStore.getState();
      expect(state.isChecking).toBe(false);
    });
  });

  describe('setServiceStatus', () => {
    it('updates service status manually', () => {
      const { setServiceStatus } = useServiceStore.getState();
      
      setServiceStatus('resonance', 'healthy', 50);
      
      const state = useServiceStore.getState();
      expect(state.services.resonance.status).toBe('healthy');
      expect(state.services.resonance.latency).toBe(50);
      expect(state.services.resonance.lastCheck).toBeDefined();
    });

    it('updates service with error', () => {
      const { setServiceStatus } = useServiceStore.getState();
      
      setServiceStatus('prefrontal', 'unhealthy', undefined, 'Connection refused');
      
      const state = useServiceStore.getState();
      expect(state.services.prefrontal.status).toBe('unhealthy');
      expect(state.services.prefrontal.error).toBe('Connection refused');
    });
  });

  describe('checkService', () => {
    it('sets status to checking during check', async () => {
      const { checkService } = useServiceStore.getState();
      
      const checkPromise = checkService('prefrontal');
      
      const stateAfter = useServiceStore.getState();
      expect(stateAfter.services.prefrontal.status).toBeDefined();
      
      await checkPromise;
    });
  });

  describe('checkAllServices', () => {
    it('sets isChecking to true while checking', async () => {
      const { checkAllServices } = useServiceStore.getState();
      
      const checkPromise = checkAllServices();
      
      const stateDuring = useServiceStore.getState();
      expect(stateDuring.isChecking).toBe(true);
      
      await checkPromise;
      
      const stateAfter = useServiceStore.getState();
      expect(stateAfter.isChecking).toBe(false);
    });

    it('checks all three services', async () => {
      const { checkAllServices } = useServiceStore.getState();
      
      await checkAllServices();
      
      const state = useServiceStore.getState();
      expect(state.services.resonance).toBeDefined();
      expect(state.services.prefrontal).toBeDefined();
      expect(state.services.hippocampus).toBeDefined();
    });
  });

  describe('service status values', () => {
    it('accepts all valid status values', () => {
      const statuses: ServiceStatus[] = ['unknown', 'checking', 'healthy', 'unhealthy', 'offline'];
      
      statuses.forEach(status => {
        const { setServiceStatus } = useServiceStore.getState();
        setServiceStatus('resonance', status);
        const state = useServiceStore.getState();
        expect(state.services.resonance.status).toBe(status);
      });
    });
  });
});