import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Cloud, Server, Cpu, ArrowRight, Loader2 } from 'lucide-react';
import { prefrontalUrl, neuronUrl } from '../lib/platform';
import { adminHeaders } from '../lib/adminToken';
import { Button } from '../components/ui/button';

/**
 * ⚠️ **两张面，两个 base**（与 `AppInitializer` 同款）：
 * * `CORTEX_BASE` = **端脑面**（`prefrontalUrl()`）⇒ `/models/providers`；
 * * `NEURON_BASE` = **neuron 面**（`neuronUrl()`）⇒ `/v1/models`（**本地**模型）。
 *
 * ⚠️⚠️ 以前两发都打端脑面 ⇒ ⇒ 端脑面上**没有** `/v1/models` ⇒ ⇒ 恒 404
 * ⇒ ⇒ `hasLocal` **一直**是 false ⇒ ⇒ ⇒ **本地明明装了模型的用户，
 * 也会被这一页说成「没配模型」**（失败长得像成功）。
 */
const CORTEX_BASE = prefrontalUrl();
const NEURON_BASE = neuronUrl();

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
      // ⚠️ `/models/providers` 在端脑那边**正在被放到 admin 门后面**
      // ⇒ 这一发**必须带钥匙**，否则 ⇒ 401 ⇒ ⇒ `hasCloud` 恒为 false ⇒ ⇒
      // ⇒ **用户明明配好了模型，却被判定成「没配好」⇒ 踢回设置向导**
      // ⇒ ⇒ **那是个失败长得像成功的坑**（页面看起来像「你还没配」）。
      const headers = await adminHeaders();
      const [cloudResult, localResult] = await Promise.allSettled([
        fetch(`${CORTEX_BASE}/models/providers`, { headers })
          .then(r => r.ok ? r.json() : Promise.reject(r.status))
          .then(d => Array.isArray(d) && d.length > 0),
        // ⚠️ **本地模型在 neuron 面** ⇒ 打 `NEURON_BASE`（= `neuronUrl()`）。
        fetch(`${NEURON_BASE}/v1/models?engine=llm`)
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
