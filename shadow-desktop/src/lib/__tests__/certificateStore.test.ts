import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('certificateStore', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it('starts with null certificate', async () => {
    const { useCertificateStore } = await import('../../stores/certificateStore');
    const { certificate } = useCertificateStore.getState();
    expect(certificate).toBeNull();
  });

  it('starts with isLoading false', async () => {
    const { useCertificateStore } = await import('../../stores/certificateStore');
    const { isLoading } = useCertificateStore.getState();
    expect(isLoading).toBe(false);
  });

  it('starts with null error', async () => {
    const { useCertificateStore } = await import('../../stores/certificateStore');
    const { error } = useCertificateStore.getState();
    expect(error).toBeNull();
  });

  it('clearCertificate clears certificate', async () => {
    const { useCertificateStore } = await import('../../stores/certificateStore');
    const { clearCertificate } = useCertificateStore.getState();

    clearCertificate();

    const { certificate, error } = useCertificateStore.getState();
    expect(certificate).toBeNull();
    expect(error).toBeNull();
  });

  it('clearCertificate removes shadow_id from localStorage', async () => {
    const { useCertificateStore } = await import('../../stores/certificateStore');
    const { clearCertificate } = useCertificateStore.getState();

    localStorage.setItem('shadow_id', 'test-id');
    clearCertificate();

    expect(localStorage.getItem('shadow_id')).toBeNull();
  });

  it('isCertificateValid returns false when no certificate', async () => {
    const { useCertificateStore } = await import('../../stores/certificateStore');
    const { isCertificateValid } = useCertificateStore.getState();

    const result = isCertificateValid();

    expect(result).toBe(false);
  });
});