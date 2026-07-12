import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Cloud, Server, Cpu, ArrowRight, Loader2 } from 'lucide-react';
import { prefrontalUrl } from '../lib/platform';
import { Button } from '../components/ui/button';

const NEURE_BASE = prefrontalUrl();

interface ModelCheckResult {
  hasCloud: boolean;
  hasLocal: boolean;
  isChecking: boolean;
}

export function ModelOnboardingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [result, setResult] = useState<ModelCheckResult>({ hasCloud: false, hasLocal: false, isChecking: true });

  useEffect(() => {
    const check = async () => {
      const [cloudResult, localResult] = await Promise.allSettled([
        fetch(`${NEURE_BASE}/models/providers`)
          .then(r => r.ok ? r.json() : Promise.reject(r.status))
          .then(d => Array.isArray(d) && d.length > 0),
        fetch(`${NEURE_BASE}/v1/models?engine=llm`)
          .then(r => r.ok ? r.json() : Promise.reject(r.status))
          .then(d => (d.data ?? []).some((m: { available?: boolean }) => m.available)),
      ]);
      setResult({
        hasCloud: cloudResult.status === 'fulfilled' && cloudResult.value,
        hasLocal: localResult.status === 'fulfilled' && localResult.value,
        isChecking: false,
      });
    };
    void check();
  }, []);

  useEffect(() => {
    if (!result.isChecking && (result.hasCloud || result.hasLocal)) {
      navigate('/', { replace: true });
    }
  }, [result, navigate]);

  if (result.isChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="animate-spin" size={18} />
          {t('onboarding.checking')}
        </div>
      </div>
    );
  }

  if (result.hasCloud || result.hasLocal) {
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-lg space-y-6 rounded-xl border border-border bg-card p-8">
        <div className="flex items-center gap-3">
          <Cpu className="text-primary" size={32} />
          <div>
            <h1 className="text-2xl font-bold">{t('onboarding.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('onboarding.subtitle')}</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">{t('onboarding.intro')}</p>

        <button
          onClick={() => navigate('/models')}
          className="flex w-full items-center gap-4 rounded-lg border-2 border-primary/40 bg-card p-5 text-left transition-colors hover:border-primary"
        >
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Server size={28} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">{t('onboarding.localTitle')}</h3>
              <span className="rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                {t('onboarding.recommended')}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{t('onboarding.localDesc')}</p>
          </div>
          <ArrowRight className="flex-shrink-0 text-muted-foreground" />
        </button>

        <button
          onClick={() => navigate('/models')}
          className="flex w-full items-center gap-4 rounded-lg border-2 border-border bg-card p-5 text-left transition-colors hover:border-foreground/40"
        >
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-md bg-blue-500/15 text-blue-500">
            <Cloud size={28} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold">{t('onboarding.cloudTitle')}</h3>
            <p className="text-sm text-muted-foreground">{t('onboarding.cloudDesc')}</p>
          </div>
          <ArrowRight className="flex-shrink-0 text-muted-foreground" />
        </button>

        <Button variant="outline" onClick={() => navigate('/')} fullWidth>
          {t('onboarding.skipForNow')}
        </Button>
      </div>
    </div>
  );
}
