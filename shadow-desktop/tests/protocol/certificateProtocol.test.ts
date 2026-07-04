import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('mTLS certificate protocol', () => {
  let store: import('../../src/stores/certificateStore').CertificateState;

  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    const { useCertificateStore } = await import('../../src/stores/certificateStore');
    store = useCertificateStore.getState();
  });

  describe('certificate lifecycle', () => {
    it('full lifecycle: request, validate, load, clear, invalidate', async () => {
      const { useCertificateStore } = await import('../../src/stores/certificateStore');

      // Request certificate
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          cert: 'test-cert-pem',
          key: 'test-key-pem',
          ca_cert: 'test-ca-pem',
          serial: '123456',
          expires_at: futureDate,
        }),
      });

      const ok = await useCertificateStore.getState().requestCertificate('https://resonance.local:8080');
      expect(ok).toBe(true);

      // Validate the stored certificate
      const state = useCertificateStore.getState();
      expect(state.certificate).not.toBeNull();
      expect(state.certificate!.cert).toBe('test-cert-pem');
      expect(state.certificate!.key).toBe('test-key-pem');
      expect(state.certificate!.caCert).toBe('test-ca-pem');
      expect(state.certificate!.serial).toBe('123456');
      expect(state.certificate!.shadowId).toMatch(/^[a-f0-9-]+$/);

      // isCertificateValid returns true
      expect(useCertificateStore.getState().isCertificateValid()).toBe(true);

      // loadCertificate returns the certificate
      const loaded = useCertificateStore.getState().loadCertificate();
      expect(loaded).not.toBeNull();
      expect(loaded!.serial).toBe('123456');

      // Clear and invalidate
      useCertificateStore.getState().clearCertificate();
      expect(useCertificateStore.getState().certificate).toBeNull();
      expect(useCertificateStore.getState().isCertificateValid()).toBe(false);
      expect(useCertificateStore.getState().loadCertificate()).toBeNull();
    });
  });

  describe('isCertificateValid', () => {
    it('returns false for expired certificate', async () => {
      const { useCertificateStore } = await import('../../src/stores/certificateStore');
      const pastDate = new Date(Date.now() - 86400000).toISOString();

      // Set an expired certificate directly
      useCertificateStore.setState({
        certificate: {
          shadowId: 'test',
          cert: 'pem',
          key: 'pem',
          caCert: 'pem',
          serial: '1',
          expiresAt: pastDate,
        },
      });

      expect(useCertificateStore.getState().isCertificateValid()).toBe(false);
    });

    it('returns false for malformed expiration date', async () => {
      const { useCertificateStore } = await import('../../src/stores/certificateStore');

      useCertificateStore.setState({
        certificate: {
          shadowId: 'test',
          cert: 'pem',
          key: 'pem',
          caCert: 'pem',
          serial: '1',
          expiresAt: 'not-a-date',
        },
      });

      expect(useCertificateStore.getState().isCertificateValid()).toBe(false);
    });

    it('returns true for future expiration date', async () => {
      const { useCertificateStore } = await import('../../src/stores/certificateStore');
      const futureDate = new Date(Date.now() + 90 * 86400000).toISOString();

      useCertificateStore.setState({
        certificate: {
          shadowId: 'test',
          cert: 'pem',
          key: 'pem',
          caCert: 'pem',
          serial: '1',
          expiresAt: futureDate,
        },
      });

      expect(useCertificateStore.getState().isCertificateValid()).toBe(true);
    });
  });

  describe('requestCertificate errors', () => {
    it('returns false on network error', async () => {
      const { useCertificateStore } = await import('../../src/stores/certificateStore');
      global.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

      const ok = await useCertificateStore.getState().requestCertificate('https://resonance.local:8080');
      expect(ok).toBe(false);
      expect(useCertificateStore.getState().error).toContain('Network failure');
    });

    it('returns false on HTTP error', async () => {
      const { useCertificateStore } = await import('../../src/stores/certificateStore');
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      });

      const ok = await useCertificateStore.getState().requestCertificate('https://resonance.local:8080');
      expect(ok).toBe(false);
      expect(useCertificateStore.getState().error).toBe('Error: Certificate request failed');
    });

    it('stores malformed response but isCertificateValid returns false', async () => {
      const { useCertificateStore } = await import('../../src/stores/certificateStore');
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ unexpected: 'response' }),
      });

      const ok = await useCertificateStore.getState().requestCertificate('https://resonance.local:8080');
      // Store accepts the response (no runtime validation)
      expect(ok).toBe(true);
      // But without valid expiresAt, isCertificateValid returns false
      expect(useCertificateStore.getState().isCertificateValid()).toBe(false);
    });

    it('sets loading state during request', async () => {
      const { useCertificateStore } = await import('../../src/stores/certificateStore');

      let resolvePromise!: (value: unknown) => void;
      global.fetch = vi.fn().mockReturnValue(new Promise((r) => { resolvePromise = r; }));

      const promise = useCertificateStore.getState().requestCertificate('https://resonance.local:8080');

      expect(useCertificateStore.getState().isLoading).toBe(true);
      expect(useCertificateStore.getState().error).toBeNull();

      resolvePromise({
        ok: true,
        status: 200,
        json: async () => ({
          cert: 'c', key: 'k', ca_cert: 'ca', serial: '1',
          expires_at: new Date(Date.now() + 86400000).toISOString(),
        }),
      });

      await promise;
      expect(useCertificateStore.getState().isLoading).toBe(false);
    });
  });

  describe('loadCertificate', () => {
    it('returns null for expired certificate', async () => {
      const { useCertificateStore } = await import('../../src/stores/certificateStore');
      const pastDate = new Date(Date.now() - 86400000).toISOString();

      useCertificateStore.setState({
        certificate: {
          shadowId: 'test', cert: 'pem', key: 'pem', caCert: 'pem',
          serial: '1', expiresAt: pastDate,
        },
      });

      expect(useCertificateStore.getState().loadCertificate()).toBeNull();
    });

    it('returns null when no certificate exists', async () => {
      const { useCertificateStore } = await import('../../src/stores/certificateStore');
      useCertificateStore.setState({ certificate: null });
      expect(useCertificateStore.getState().loadCertificate()).toBeNull();
    });
  });
});
