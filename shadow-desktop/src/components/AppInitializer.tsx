import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { prefrontalUrl } from '../lib/platform';

const NEURE_BASE = prefrontalUrl();

// Paths that should be accessible even without models
const MODEL_SETUP_PATHS = ['/models', '/models/download', '/providers', '/setup'];

interface AppInitializerProps {
  children?: React.ReactNode;
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
        const [cloudRes, localRes] = await Promise.allSettled([
          fetch(`${NEURE_BASE}/models/providers`).then(r => r.ok ? r.json() : []),
          fetch(`${NEURE_BASE}/v1/models?engine=llm`).then(r => r.ok ? r.json() : { data: [] }),
        ]);
        const hasCloud = cloudRes.status === 'fulfilled' && Array.isArray(cloudRes.value) && cloudRes.value.length > 0;
        const hasLocal = localRes.status === 'fulfilled' && (localRes.value.data ?? []).some((m: { available?: boolean }) => m.available);
        if (!hasCloud && !hasLocal) {
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
