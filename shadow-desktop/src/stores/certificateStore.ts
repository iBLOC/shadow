import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CertificateData {
  shadowId: string;
  cert: string;
  key: string;
  caCert: string;
  serial: string;
  expiresAt: string;
}

interface CertificateState {
  certificate: CertificateData | null;
  isLoading: boolean;
  error: string | null;
  
  requestCertificate: (resonanceUrl: string) => Promise<boolean>;
  loadCertificate: () => CertificateData | null;
  clearCertificate: () => void;
  isCertificateValid: () => boolean;
}

export const useCertificateStore = create<CertificateState>()(
  persist(
    (set, get) => ({
      certificate: null,
      isLoading: false,
      error: null,

      requestCertificate: async (resonanceUrl: string) => {
        set({ isLoading: true, error: null });
        
        try {
          const shadowId = localStorage.getItem('shadow_id') || crypto.randomUUID();
          localStorage.setItem('shadow_id', shadowId);
          
          const response = await fetch(`${resonanceUrl}/api/v1/shadow/cert/issue`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              shadow_id: shadowId,
              common_name: `shadow-${shadowId.slice(0, 8)}`,
              organization: 'Shadow User',
              expires_in_days: 90,
            }),
          });

          if (!response.ok) {
            throw new Error('Certificate request failed');
          }

          const data = await response.json();
          
          const certData: CertificateData = {
            shadowId,
            cert: data.cert,
            key: data.key,
            caCert: data.ca_cert,
            serial: data.serial,
            expiresAt: data.expires_at,
          };

          set({ certificate: certData, isLoading: false });
          return true;
        } catch (error) {
          set({ error: String(error), isLoading: false });
          return false;
        }
      },

      loadCertificate: () => {
        const { certificate, isCertificateValid } = get();
        if (certificate && isCertificateValid()) {
          return certificate;
        }
        return null;
      },

      clearCertificate: () => {
        set({ certificate: null, error: null });
        localStorage.removeItem('shadow_id');
      },

      isCertificateValid: () => {
        const { certificate } = get();
        if (!certificate) return false;
        
        try {
          const expiresAt = new Date(certificate.expiresAt);
          const now = new Date();
          return expiresAt > now;
        } catch {
          return false;
        }
      },
    }),
    {
      name: 'shadow-certificate',
      partialize: (state) => ({
        certificate: state.certificate,
      }),
    }
  )
);
