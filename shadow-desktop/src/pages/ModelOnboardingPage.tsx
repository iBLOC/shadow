import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Cloud, Server, Cpu, ArrowRight, Loader2 } from 'lucide-react';
import {
  combineModelConfig,
  probeCloudProviders,
  probeLocalModels,
  type ModelConfigState,
} from '../lib/modelConfigProbe';
import { Button } from '../components/ui/button';

/**
 * ⚠️ **两张面，两个 base —— 现在由 lib/modelConfigProbe.ts 自己拥有。**
 *
 * * **端脑面** ⇒ /models/providers（云供应商）；
 * * **neuron 面** ⇒ /v1/models（**本地**模型）。
 *
 * ⚠️⚠️ 以前两发都打端脑面 ⇒ ⇒ 端脑面上**没有** /v1/models ⇒ ⇒ 恒 404
 * ⇒ ⇒ hasLocal **一直**是 false ⇒ ⇒ ⇒ **本地明明装了模型的用户，
 * 也会被这一页说成「没配模型」**（失败长得像成功）。
 *
 * ⇒ ⇒ 现在 base **只在一个模块里** ⇒ ⇒ 打不错面。
 */

interface ModelCheckResult {
  /**
   * ⚠️ **三态**（`configured` / `not-configured` / `unknown`）。
   *
   * ⚠️ 以前这里是两个 boolean ⇒ ⇒ 「问不到」（401 / 网络错）被折成
   * ⇒ ⇒ `hasCloud=false` ⇒ ⇒ 界面上说「你没配模型」⇒ ⇒
   * ⇒ ⇒ **用户明明配好了，却被说成没配** ⇒ ⇒ **失败长得像成功**。
   */
  state: ModelConfigState;
  isChecking: boolean;
}

export function ModelOnboardingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [result, setResult] = useState<ModelCheckResult>({ state: 'unknown', isChecking: true });

  useEffect(() => {
    const check = async () => {
      // ⚠️ `/models/providers` 在端脑那边**正在被放到 admin 门后面**
      // ⇒ 这一发**必须带钥匙**，否则 ⇒ 401 ⇒ ⇒ **问不到** ⇒ ⇒
      // ⇒ ⇒ **不能**当成「没配」（否则用户明明配好了却被说成没配）
      // ⇒ ⇒ ⇒ 为什么用专门模块：判定逻辑**不在这里写** ⇒ ⇒ 在
      // ⇒ ⇒ ⇒ `lib/modelConfigProbe.ts` ⇒ ⇒ 与 `AppInitializer` 共用同一份 ⇒ ⇒ 改一处两边一起好
      // ⇒ ⇒ ⇒ （以前两处各写各的 ⇒ ⇒ 一处好了另一处没好 ⇒ ⇒ 而用户看到的恰恰是没好那一处）。
      const [cloud, local] = await Promise.all([
        probeCloudProviders(),
        probeLocalModels(),
      ]);
      setResult({ state: combineModelConfig(cloud, local), isChecking: false });
    };
    void check();
  }, []);

  useEffect(() => {
    // ⚠️ **只有「确认配好了」才放人走**（`configured`）。
    // ⚠️ `unknown`（问不到）⇒ **不放也不拒** ⇒ ⇒ 这一页会如实说
    // ⇒ ⇒ 「问不到端脑的模型配置」，而不是断言「你没配模型」。
    if (!result.isChecking && result.state === 'configured') {
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

  if (result.state === 'configured') {
    return null;
  }

  // ⚠️⚠️ **「问不到」不是「没配」** ⇒ ⇒ 这一页**必须说真话**：
  // ⇒ ⇒ 门关着（401）/ 端脑没起 ⇒ ⇒ **都不是「你没配模型」**
  // ⇒ ⇒ ⇒ 所以这里显示的是「问不到」，不是「配置你的第一个模型」。
  // ⇒ ⇒ ⇒ 否则用户会去**重复配置已经配好的东西** ⇒ ⇒ 而真正的原因
  // ⇒ ⇒ ⇒ （门关着 / 端脑没起）**一个字都没人告诉他**。
  if (result.state === 'unknown') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-lg space-y-6 rounded-xl border border-border bg-card p-8">
          <div className="flex items-center gap-3">
            <Server className="text-primary" size={32} />
            <div>
              <h1 className="text-2xl font-bold">{t('onboarding.unreachableTitle')}</h1>
              <p className="text-sm text-muted-foreground">{t('onboarding.unreachableHint')}</p>
            </div>
          </div>

          <Button variant="outline" onClick={() => navigate('/')} fullWidth>
            {t('onboarding.skipForNow')}
          </Button>
        </div>
      </div>
    );
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
