import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { isTauri, prefrontalUrl, neuronUrl } from '../lib/platform';

const NEURON_BASE = prefrontalUrl();

// Paths that should be accessible even without models
const MODEL_SETUP_PATHS = ['/models', '/models/download', '/providers', '/setup'];

interface AppInitializerProps {
  children?: React.ReactNode;
}

/**
 * Tauri mode: the cortex sidecar is gone (replaced by the in-process
 * encephalon crate), so there is no `:60080/models/providers` to probe.
 * "Cloud configured" = the provider manager (ProvidersPage) has an enabled
 * entry with a key or a fetched model list, or the setup wizard's legacy
 * provider config has an API key. "Local configured" = a standalone
 * neuron (:8083) answers with an available llm model.
 */
async function hasConfiguredModelsTauri(): Promise<boolean> {
  const [cloudRes, localRes] = await Promise.allSettled([
    (async () => {
      const entries = await invoke<
        Array<{ enabled: boolean; api_key?: string | null; models: unknown[] }>
      >('provider_list');
      const managed = entries.some(
        (e) => e.enabled && (Boolean(e.api_key) || e.models.length > 0)
      );
      const legacy = await invoke<{ api_key?: string | null }>('get_provider_config');
      return managed || Boolean(legacy?.api_key);
    })(),
    fetch(`${neuronUrl()}/v1/models?engine=llm`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .catch(() => ({ data: [] })),
  ]);
  const hasCloud = cloudRes.status === 'fulfilled' && cloudRes.value === true;
  const hasLocal =
    localRes.status === 'fulfilled' &&
    (localRes.value.data ?? []).some((m: { available?: boolean }) => m.available);
  return hasCloud || hasLocal;
}

/**
 * Web build: unchanged legacy probe against the deployed cortex/prefrontal.
 */
async function hasConfiguredModelsWeb(): Promise<boolean> {
  const [cloudRes, localRes] = await Promise.allSettled([
    fetch(`${NEURON_BASE}/models/providers`).then((r) => (r.ok ? r.json() : [])),
    fetch(`${NEURON_BASE}/v1/models?engine=llm`).then((r) => (r.ok ? r.json() : { data: [] })),
  ]);
  const hasCloud =
    cloudRes.status === 'fulfilled' && Array.isArray(cloudRes.value) && cloudRes.value.length > 0;
  const hasLocal =
    localRes.status === 'fulfilled' &&
    (localRes.value.data ?? []).some((m: { available?: boolean }) => m.available);
  return hasCloud || hasLocal;
}

export function AppInitializer({ children }: AppInitializerProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const init = async () => {
      const setupComplete = localStorage.getItem('shadow_setup_complete');
      if (!setupComplete) {
        navigate('/setup', { replace: true });
        setIsChecking(false);
        return;
      }

      // Allow access to model setup paths without checking
      if (MODEL_SETUP_PATHS.some(p => location.pathname.startsWith(p))) {
        setIsChecking(false);
        return;
      }

      if (location.pathname === '/onboarding') {
        setIsChecking(false);
        return;
      }

      try {
        const configured = await (isTauri() ? hasConfiguredModelsTauri() : hasConfiguredModelsWeb());
        if (!configured) {
          navigate('/onboarding', { replace: true });
        }
      } catch {
        navigate('/onboarding', { replace: true });
      }

      setIsChecking(false);
    };

    void init();
  }, [location.pathname, navigate]);

  if (isChecking) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">检查模型配置中…</div>
      </div>
    );
  }

  return children ? <>{children}</> : <Outlet />;
}
