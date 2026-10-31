import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { isTauri, prefrontalUrl, neuronUrl } from '../lib/platform';
import { adminHeaders } from '../lib/adminToken';

/**
 * ⚠️ **两个 base，两张面 —— 以前这里只写了一个，而名字在说谎。**
 *
 * * `CORTEX_BASE` = **端脑面**（`prefrontalUrl()`）⇒ 上面的路由
 *   （`/models/providers`、`/api/telencephalon/*`）在这儿；
 * * `NEURON_BASE` = **neuron 面**（`neuronUrl()`）⇒ **本地模型**的路由
 *   （`/v1/models`、`/v1/info`）在这儿。
 *
 * ⚠️⚠️ **旧代码把本地模型那一发也打到了端脑面**（变量叫 `NEURON_BASE`，
 * 内容却是 `prefrontalUrl()`）⇒ ⇒ 端脑面上**根本没有** `/v1/models`
 * （neuron 自己的 router 只在 `build_full_app` 里 merge 到根；嵌入式端脑面
 * `cortex_router` 上只有 `/api/telencephalon/neuron/preview/models`）
 * ⇒ ⇒ 那一发恒 **404** ⇒ ⇒ `hasLocal` **一直**是 false ⇒ ⇒
 * ⇒ 「有没有配好模型」**完全**取决于「云那半」⇒ ⇒ 而云那半一旦上锁 ⇒
 * ⇒ **必然**把用户踢回向导（见下面的三态判定）。
 */
const CORTEX_BASE = prefrontalUrl();
const NEURON_BASE = neuronUrl();

// Paths that should be accessible even without models
const MODEL_SETUP_PATHS = ['/models', '/models/download', '/providers', '/setup'];

interface AppInitializerProps {
  children?: React.ReactNode;
}

/**
 * 「有没有配好模型」的三态。
 *
 * ⚠️ **为什么不能只有「有 / 没有」两态** —— 因为「**问不到**」既不是「有」
 * 也不是「没有」：
 *
 * * `/models/providers` 在端脑那边**被放到了 admin 门后面** ⇒ **没配 token
 *   ⇒ 401** ⇒ 而 **web 部署没有 sidecar ⇒ 没有 admin token ⇒ 问不到**是
 *   **常态**，不是异常；
 * * 探测失败 / 端脑没起 / 网关 5xx ⇒ 也是「问不到」。
 *
 * ⇒ ⇒ 以前「问不到」被折成「**没有**」⇒ ⇒ `hasCloud=false` ⇒ ⇒
 * ⇒ `if (!configured) navigate('/onboarding')` ⇒ ⇒ **用户明明配好了，
 * 却被踢回向导**（⇒ 「失败长得像成功」的又一个实例）。
 *
 * ⇒ ⇒ 现在：**只有「确认没配」才说「没配」**；问不到 ⇒ `unknown` ⇒
 * ⇒ **不踢**（宁可让用户自己逛，也别断言他没配好）。
 */
type ModelConfigState = 'configured' | 'not-configured' | 'unknown';

/**
 * Tauri mode: the cortex sidecar is gone (replaced by the in-process
 * encephalon crate), so there is no `:60080/models/providers` to probe.
 * "Cloud configured" = the provider manager (ProvidersPage) has an enabled
 * entry with a key or a fetched model list, or the setup wizard's legacy
 * provider config has an API key. "Local configured" = a standalone
 * neuron (:8083) answers with an available llm model.
 */
async function hasConfiguredModelsTauri(): Promise<ModelConfigState> {
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
  if (hasCloud || hasLocal) return 'configured';
  // ⚠️ `invoke` 抛了 ⇒ **问不到**（不是「没配」）。
  return cloudRes.status === 'fulfilled' ? 'not-configured' : 'unknown';
}

/**
 * Web build: probe the deployed cortex (端脑面) for cloud providers and the
 * neuron surface for local models.
 *
 * ⚠️ **两张面，两个 base** —— `/models/providers` 在**端脑面**，
 * `/v1/models` 在**neuron 面** ⇒ 以前两发都打端脑面 ⇒ 本地那发恒 404。
 */
async function hasConfiguredModelsWeb(): Promise<ModelConfigState> {
  // ⚠️ `/models/providers` 在端脑那边**被放到了 admin 门后面** ⇒ 这一发
  // 必须带钥匙 ⇒ 拿不到钥匙 ⇒ 401 ⇒ ⇒ 而 401 是「**问不到**」，
  // 不是「没配」（见上面 `ModelConfigState` 的说明）。
  const headers = await adminHeaders();
  const [cloudRes, localRes] = await Promise.allSettled([
    fetch(`${CORTEX_BASE}/models/providers`, { headers }).then((r) => {
      if (!r.ok) return { known: false, count: 0 };
      return r.json().then((d) => ({ known: true, count: Array.isArray(d) ? d.length : 0 }));
    }),
    // ⚠️ **本地模型在 neuron 面** ⇒ 打 `NEURON_BASE`（= `neuronUrl()`），
    // 不是端脑面（端脑面上没有 `/v1/models` ⇒ 恒 404 ⇒ `hasLocal` 恒 false）。
    fetch(`${NEURON_BASE}/v1/models?engine=llm`).then((r) => (r.ok ? r.json() : { data: [] })),
  ]);
  const hasCloud =
    cloudRes.status === 'fulfilled' && cloudRes.value.known && cloudRes.value.count > 0;
  const cloudKnown = cloudRes.status === 'fulfilled' && cloudRes.value.known;
  const hasLocal =
    localRes.status === 'fulfilled' &&
    (localRes.value.data ?? []).some((m: { available?: boolean }) => m.available);
  if (hasCloud || hasLocal) return 'configured';
  // ⚠️ **问不到 ⇒ 不能说「没配好」** ⇒ 只在**确认**没配的时候才这么说。
  return cloudKnown ? 'not-configured' : 'unknown';
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
        const state = await (isTauri() ? hasConfiguredModelsTauri() : hasConfiguredModelsWeb());
        // ⚠️ **只有「确认没配」才把用户踢去向导。**
        //
        // ⚠️ `unknown` = **问不到**（端脑那扇门关着 / 端脑没起 / 网络不通）
        // ⇒ ⇒ **不能**当成「用户没配模型」⇒ ⇒ 不踢（宁可让用户自己逛，
        // 也别把「问不到」说成「没配好」—— 那是「失败长得像成功」）。
        if (state === 'not-configured') {
          navigate('/onboarding', { replace: true });
        }
      } catch {
        // ⚠️ 探测本身炸了 ⇒ 也是「问不到」⇒ **不踢**。
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
