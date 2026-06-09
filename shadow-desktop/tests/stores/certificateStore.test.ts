import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCertificateStore } from '../../src/stores/certificateStore';
import type { CertificateData } from '../../src/stores/certificateStore';

const mockFetch = vi.fn();
global.fetch = mockFetch as any;

const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

const sampleCert: CertificateData = {
 shadowId: 'shadow-abc123',
 cert: '-----BEGIN CERTIFICATE-----\nMIICert\n-----END CERTIFICATE-----',
 key: '-----BEGIN PRIVATE KEY-----\nMIIKey\n-----END PRIVATE KEY-----',
 caCert: '-----BEGIN CA CERT-----\nMIICA\n-----END CA CERT-----',
 serial: '01:23:45:67:89',
 expiresAt: futureDate,
};

const expiredCert: CertificateData = {
 ...sampleCert,
 shadowId: 'shadow-old',
 expiresAt: pastDate,
};

describe('CertificateStore', () => {
 beforeEach(() => {
 mockFetch.mockReset();
 localStorage.clear();
 useCertificateStore.setState({
 certificate: null,
 isLoading: false,
 error: null,
 });
 });

 describe('initial state', () => {
 it('starts with no certificate', () => {
 const state = useCertificateStore.getState();
 expect(state.certificate).toBeNull();
 expect(state.isLoading).toBe(false);
 expect(state.error).toBeNull();
 });
 });

 describe('requestCertificate', () => {
 it('issues a certificate on successful response', async () => {
 mockFetch.mockResolvedValueOnce({
 ok: true,
 json: () =>
 Promise.resolve({
 cert: sampleCert.cert,
 key: sampleCert.key,
 ca_cert: sampleCert.caCert,
 serial: sampleCert.serial,
 expires_at: sampleCert.expiresAt,
 }),
 });

 const { requestCertificate } = useCertificateStore.getState();
 const result = await requestCertificate('https://resonance.example.com');

 expect(result).toBe(true);
 expect(mockFetch).toHaveBeenCalledWith(
 'https://resonance.example.com/api/v1/shadow/cert/issue',
 expect.objectContaining({ method: 'POST' })
 );

 const state = useCertificateStore.getState();
 expect(state.certificate).not.toBeNull();
 expect(state.certificate?.cert).toBe(sampleCert.cert);
 expect(state.certificate?.shadowId).toBeTruthy();
 expect(state.isLoading).toBe(false);
 });

 it('persists shadow_id to localStorage', async () => {
 mockFetch.mockResolvedValueOnce({
 ok: true,
 json: () =>
 Promise.resolve({
 cert: sampleCert.cert,
 key: sampleCert.key,
 ca_cert: sampleCert.caCert,
 serial: sampleCert.serial,
 expires_at: sampleCert.expiresAt,
 }),
 });

 const { requestCertificate } = useCertificateStore.getState();
 await requestCertificate('https://r.example.com');

 expect(localStorage.getItem('shadow_id')).toBeTruthy();
 });

 it('reuses existing shadow_id when present', async () => {
 localStorage.setItem('shadow_id', 'existing-id');
 mockFetch.mockResolvedValueOnce({
 ok: true,
 json: () =>
 Promise.resolve({
 cert: sampleCert.cert,
 key: sampleCert.key,
 ca_cert: sampleCert.caCert,
 serial: sampleCert.serial,
 expires_at: sampleCert.expiresAt,
 }),
 });

 const { requestCertificate } = useCertificateStore.getState();
 await requestCertificate('https://r.example.com');

 expect(localStorage.getItem('shadow_id')).toBe('existing-id');
 expect(useCertificateStore.getState().certificate?.shadowId).toBe('existing-id');
 });

 it('returns false and sets error on non-OK response', async () => {
 mockFetch.mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({}) });

 const { requestCertificate } = useCertificateStore.getState();
 const result = await requestCertificate('https://r.example.com');

 expect(result).toBe(false);
 expect(useCertificateStore.getState().error).toBeTruthy();
 });

 it('returns false and sets error on fetch throw', async () => {
 mockFetch.mockRejectedValueOnce(new Error('connection refused'));

 const { requestCertificate } = useCertificateStore.getState();
 const result = await requestCertificate('https://r.example.com');

 expect(result).toBe(false);
 expect(useCertificateStore.getState().error).toContain('connection refused');
 });
 });

 describe('isCertificateValid', () => {
 it('returns false when no certificate', () => {
 const { isCertificateValid } = useCertificateStore.getState();
 expect(isCertificateValid()).toBe(false);
 });

 it('returns true when certificate expires in the future', () => {
 useCertificateStore.setState({ certificate: sampleCert });
 const { isCertificateValid } = useCertificateStore.getState();
 expect(isCertificateValid()).toBe(true);
 });

 it('returns false when certificate is expired', () => {
 useCertificateStore.setState({ certificate: expiredCert });
 const { isCertificateValid } = useCertificateStore.getState();
 expect(isCertificateValid()).toBe(false);
 });

 it('returns false when expiresAt is invalid string', () => {
 useCertificateStore.setState({
 certificate: { ...sampleCert, expiresAt: 'not-a-date' },
 });
 const { isCertificateValid } = useCertificateStore.getState();
 expect(isCertificateValid()).toBe(false);
 });
 });

 describe('loadCertificate', () => {
 it('returns null when no certificate stored', () => {
 const { loadCertificate } = useCertificateStore.getState();
 expect(loadCertificate()).toBeNull();
 });

 it('returns the certificate when valid', () => {
 useCertificateStore.setState({ certificate: sampleCert });
 const { loadCertificate } = useCertificateStore.getState();
 expect(loadCertificate()).toEqual(sampleCert);
 });

 it('returns null when stored certificate is expired', () => {
 useCertificateStore.setState({ certificate: expiredCert });
 const { loadCertificate } = useCertificateStore.getState();
 expect(loadCertificate()).toBeNull();
 });
 });

 describe('clearCertificate', () => {
 it('clears certificate, error, and shadow_id', () => {
 localStorage.setItem('shadow_id', 'shadow-123');
 useCertificateStore.setState({ certificate: sampleCert, error: 'oops' });
 const { clearCertificate } = useCertificateStore.getState();

 clearCertificate();

 const state = useCertificateStore.getState();
 expect(state.certificate).toBeNull();
 expect(state.error).toBeNull();
 expect(localStorage.getItem('shadow_id')).toBeNull();
 });
 });
});
