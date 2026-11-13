import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Card, CardContent, CardHeader, CardTitle, Loading } from '@/components/ui';
import {
  capabilityCandidatesByCapability,
  capabilityOptionsByCapability,
  type CapabilityCandidateOption,
} from '@/lib/capabilityDefaults';
import {
  telencephalonClient,
  type CapabilityDefaultsView,
  type LobeManifestSummary,
  type LobeRoutingView,
  type ModelProvider,
} from '@/lib/telencephalonClient';

/**
 * 桌面端这份逐叶区覆盖的 **durable 副本键**（仅供「大脑重启后重下发」用）。
 *
 * ⚠️ 端脑那张表是**内存态**（与全局分档默认同一模式）⇒ ⇒ 大脑进程重启
 * 一次就空了 ⇒ ⇒ 没有副本 = 「重启一次，叶区设置全丢」（失败长得像成功）。
 * 移动端把它存在自己的路由设置里、开机重放；桌面端用 localStorage 这一份。
 */
const LOBE_DEFAULTS_STORAGE_KEY = 'brain_lobe_capability_defaults';

function readLobeSnapshot(): Record<string, Record<string, string>> {
  try {
    const raw = globalThis.localStorage?.getItem(LOBE_DEFAULTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, Record<string, string>> = {};
    for (const [lobe, caps] of Object.entries(parsed as Record<string, unknown>)) {
      if (!caps || typeof caps !== 'object' || Array.isArray(caps)) continue;
      const one: Record<string, string> = {};
      for (const [cap, id] of Object.entries(caps as Record<string, unknown>)) {
        if (typeof id === 'string' && id.trim()) one[cap] = id.trim();
      }
      if (Object.keys(one).length > 0) out[lobe] = one;
    }
    return out;
  } catch {
    return {};
  }
}

/** 写 durable 副本 —— **存不住要说真话**（返回 false 时界面会提示）。 */
function writeLobeSnapshot(table: Record<string, Record<string, string>>): boolean {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return false;
    storage.setItem(LOBE_DEFAULTS_STORAGE_KEY, JSON.stringify(table));
    return true;
  } catch {
    return false;
  }
}

/**
 * 「**每个叶区用什么模型**」矩阵 —— 叶区 × 模型类型，每格各选各的。
 *
 * ## 为什么要有这张卡
 *
 * 模型使用的**最小单位是叶区**：全局默认只说「没单独指定的叶区用哪个」，
 * 而「颞叶的语音识别换一个引擎」「枕叶出图换一个引擎」是**逐叶区**的事。
 * 能力页以前只有**全局**一维 ⇒ ⇒ 用户只能让所有叶区共用一个模型
 * ⇒ ⇒ 与「按大脑分区调度」这件事对不上。
 *
 * ## 两条写路径（各归各的面，别混）
 *
 * - **文本模型（llm）** ⇒ `POST /lobes/models` 的 `lobe_models`（三态：
 *   不在表里＝跟随全局；`null`＝强制本地；串＝该模型）。这一面还负责
 *   **把云模型注册成 neuron 的远端引擎** —— 所以它必须留在路由面。
 * - **语音识别 / 语音合成 / 图片生成** ⇒ `PUT /lobes/capability-defaults`
 *   的 `lobe_defaults`（端脑 voice / images 面带 `lobe` 时先查这一格）。
 *
 * ⚠️ **两张表都是「只装显式覆盖」** —— 从 `GET /lobes/routing` 读回当前
 * 覆盖表再合并写回。「跟随全局」**不进表**（把生效值回填会把「跟随全局」
 * 钉死：改全局默认时那些叶区不再跟着走）。
 *
 * ## 候选取哪一面
 *
 * - 按引擎 id 解析的档（端脑 `engine_resolved`：asr / tts / image_gen）⇒
 *   **已注册面**（`registered`）—— 目录面那套 id 端脑解析不到
 *   ⇒ ⇒ 存得进去、用不了。
 * - llm ⇒ 供应商目录里标 `chat` 的模型（与 `CapabilityDefaultsCard` 的
 *   组合层别名同一口径）。
 */
export function LobeModelMatrixCard() {
  const { t } = useTranslation();
  const [lobes, setLobes] = useState<LobeManifestSummary[]>([]);
  const [routing, setRouting] = useState<LobeRoutingView | null>(null);
  const [capabilityView, setCapabilityView] = useState<CapabilityDefaultsView | null>(
    null,
  );
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [lobeList, routingView, caps, providerList] = await Promise.all([
        telencephalonClient.getLobeManifests(),
        telencephalonClient.getLobeRouting(),
        telencephalonClient.getCapabilityDefaults(),
        telencephalonClient.listProviders(),
      ]);
      setLobes(lobeList);
      setRouting(routingView);
      setCapabilityView(caps);
      setProviders(providerList);
      setLoaded(true);

      // ⚠️ **端脑刚重启 ⇒ 它那张逐叶区表是空的**，而本机还留着 durable
      // 副本 ⇒ ⇒ 再下发一遍（与全局分档卡/移动端开机重放同一套路）。
      const remoteLobeTable = caps.lobe_defaults ?? {};
      const snapshot = readLobeSnapshot();
      if (
        Object.keys(remoteLobeTable).length === 0 &&
        Object.keys(snapshot).length > 0
      ) {
        try {
          const view = await telencephalonClient.setCapabilityDefaults(
            caps.defaults ?? {},
            snapshot,
          );
          setCapabilityView(view);
        } catch (e) {
          // 重下发失败**要说真话**，但不挡住界面。
          setError(String(e));
        }
      } else if (Object.keys(remoteLobeTable).length > 0) {
        // 端脑那份是权威 ⇒ 顺手把副本对齐（别的客户端写的也镜像下来）。
        writeLobeSnapshot(remoteLobeTable);
      }
    } catch (e) {
      // ⚠️ **读不到 ≠ 没有**（三态）—— 错误已经进 `error` 那条 Alert；
      // 这时**不许**再把空态画出来（「读不到」与「没有」同屏是这一族
      // 最老的坑：㔖/㔛 两条都记过）。
      setLobes([]);
      setLoaded(false);
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** 按引擎 id 解析的档（端脑说了算）—— 客户端不自己列举。 */
  const engineTiers = useMemo(
    () => (capabilityView?.engine_resolved ?? []).filter((c) => c !== 'llm'),
    [capabilityView],
  );

  /**
   * llm 的候选（本地权重 ＋ 云模型）。
   *
   * ⚠️ 组件目录把对话模型标成 `chat`、端脑词表是 `llm` ⇒ ⇒ 组合层合并
   * （与 `CapabilityDefaultsCard` 同一处约定）。
   */
  const llmOptions = useMemo(() => {
    const grouped = capabilityCandidatesByCapability(providers);
    grouped['llm'] = [...(grouped['llm'] ?? []), ...(grouped['chat'] ?? [])];
    delete grouped['chat'];
    return capabilityOptionsByCapability(grouped, {
      engineResolved: [],
      registered: {},
    })['llm'] ?? [];
  }, [providers]);

  /** 引擎档的候选（已注册面）。 */
  const engineOptions = useMemo(() => {
    const opts: Record<string, CapabilityCandidateOption[]> = {};
    const resolved = capabilityView?.engine_resolved ?? [];
    for (const cap of resolved) {
      const ids = capabilityView?.registered?.[cap] ?? [];
      if (ids.length > 0) {
        opts[cap] = ids.map((id) => ({ id, label: id, usableNow: true }));
      }
    }
    return opts;
  }, [capabilityView]);

  /** 某叶区某引擎档的**覆盖**（空串 = 跟随全局）。
   *
   *  ⚠️ 读的是 `capability-defaults` 的 `lobe_defaults`（**同一张表**，但
   *  它随 PUT 的响应一起回来 ⇒ ⇒ 写完立刻刷新，不必再多读一次路由视图）。 */
  const overrideOf = (lobe: string, cap: string): string =>
    capabilityView?.lobe_defaults?.[lobe]?.[cap] ?? '';

  /** 全局分档默认（给「跟随全局」那一行显示当前值）。 */
  const globalDefaultOf = (cap: string): string =>
    capabilityView?.defaults?.[cap] ?? '';

  /** 某叶区 llm 的覆盖：`undefined` = 跟随全局；`null` = 强制本地。 */
  const lobeLlmOf = (lobe: string): string | null | undefined =>
    routing?.lobe_models?.[lobe];

  /**
   * 写**某个叶区某一档引擎**（asr / tts / image_gen）的覆盖。
   *
   * ⚠️ **先重读当前视图再合并** —— 这一面是整份替换，拿页面打开时那份
   * 当基线会把别处（另一台设备 / 移动端）刚写的叶区覆盖抹掉。
   */
  const applyEngineTier = useCallback(
    async (lobe: string, cap: string, modelId: string) => {
      setSaving(`${lobe}:${cap}`);
      setError(null);
      setNotice(null);
      try {
        const fresh = await telencephalonClient.getCapabilityDefaults();
        const merged: Record<string, Record<string, string>> = {};
        for (const [name, caps] of Object.entries(fresh.lobe_defaults ?? {})) {
          merged[name] = { ...caps };
        }
        const one = merged[lobe] ?? {};
        if (modelId) {
          one[cap] = modelId;
        } else {
          delete one[cap];
        }
        if (Object.keys(one).length > 0) {
          merged[lobe] = one;
        } else {
          delete merged[lobe];
        }
        const view = await telencephalonClient.setCapabilityDefaults(
          fresh.defaults ?? {},
          merged,
        );
        setCapabilityView(view);
        // ⚠️ **存不住要说真话** —— 端脑那份已经生效了（这是权威），但下次
        // 大脑重启时这一格会回到默认 ⇒ ⇒ 不许假装持久住了。
        const cached = writeLobeSnapshot(merged);
        setNotice(
          cached
            ? t('lobeModelMatrix.applied')
            : t('lobeModelMatrix.appliedButNotCached'),
        );
      } catch (e) {
        // ⚠️ 说真话：端脑的原话（键不认识 / 叶区不认识 / llm 不许进这张表）。
        setError(`${t('lobeModelMatrix.failed')}: ${String(e)}`);
      } finally {
        setSaving(null);
      }
    },
    [t],
  );

  /**
   * 写**某个叶区**的对话模型覆盖（`''` = 跟随全局、`'__local__'` = 强制本地）。
   *
   * ⚠️ 同样是「读当前覆盖表 → 合并 → 整份下发」。
   */
  const applyLobeLlm = useCallback(
    async (lobe: string, value: string) => {
      setSaving(`${lobe}:llm`);
      setError(null);
      setNotice(null);
      try {
        const fresh = await telencephalonClient.getLobeRouting();
        const merged: Record<string, string | null> = {
          ...(fresh.lobe_models ?? {}),
        };
        if (value === '') {
          delete merged[lobe];
        } else if (value === '__local__') {
          merged[lobe] = null;
        } else {
          merged[lobe] = value;
        }
        // ⚠️ `providers: []` = 不注册新引擎；`default_model` 不给 = 不动全局。
        const view = await telencephalonClient.setLobeModels({
          providers: [],
          lobe_models: merged,
        });
        setRouting((prev) =>
          prev ? { ...prev, lobe_models: view.overrides ?? merged } : prev,
        );
        if ((view.unknown ?? []).length > 0) {
          setError(
            t('lobeModelMatrix.unknownLobes', { lobes: view.unknown.join(', ') }),
          );
        } else {
          setNotice(t('lobeModelMatrix.applied'));
        }
      } catch (e) {
        setError(`${t('lobeModelMatrix.failed')}: ${String(e)}`);
      } finally {
        setSaving(null);
      }
    },
    [t],
  );

  const globalLlm = routing?.default_model ?? '';

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('lobeModelMatrix.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {t('lobeModelMatrix.hint')}
        </p>

        {error && (
          <Alert variant="destructive">
            <p className="text-sm">{error}</p>
          </Alert>
        )}
        {notice && !error && (
          <p className="text-sm text-muted-foreground">{notice}</p>
        )}

        {isLoading ? (
          <Loading text={t('common.loading')} />
        ) : !loaded ? null : lobes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('lobeModelMatrix.empty')}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {lobes.map((lobe) => (
              <section key={lobe.name} className="rounded-md border border-input p-3">
                <h4 className="text-sm font-medium">{lobe.name}</h4>
                {lobe.description && (
                  <p className="mb-2 text-xs text-muted-foreground">
                    {lobe.description}
                  </p>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  {/* 文本模型（llm）—— 路由面 */}
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium">
                      {t('capabilityDefaults.llm', '文本模型')}
                    </span>
                    <select
                      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground"
                      value={
                        lobeLlmOf(lobe.name) === undefined
                          ? ''
                          : lobeLlmOf(lobe.name) === null
                            ? '__local__'
                            : (lobeLlmOf(lobe.name) as string)
                      }
                      disabled={saving === `${lobe.name}:llm`}
                      onChange={(e) => void applyLobeLlm(lobe.name, e.target.value)}
                    >
                      <option value="">
                        {globalLlm
                          ? t('lobeModelMatrix.followGlobalWith', { model: globalLlm })
                          : t('lobeModelMatrix.followGlobalLocal')}
                      </option>
                      <option value="__local__">{t('lobeModelMatrix.forceLocal')}</option>
                      {llmOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  {/* 按引擎 id 解析的档（asr / tts / image_gen）—— 分档面 */}
                  {engineTiers.map((cap) => {
                    const override = overrideOf(lobe.name, cap);
                    const options = engineOptions[cap] ?? [];
                    const globalValue = globalDefaultOf(cap);
                    const known = options.some((o) => o.id === override);
                    return (
                      <label key={cap} className="flex flex-col gap-1 text-sm">
                        <span className="font-medium">
                          {t(`capabilityDefaults.${cap}`, cap)}
                        </span>
                        <select
                          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground"
                          value={override}
                          disabled={saving === `${lobe.name}:${cap}`}
                          onChange={(e) =>
                            void applyEngineTier(lobe.name, cap, e.target.value)
                          }
                        >
                          <option value="">
                            {globalValue
                              ? t('lobeModelMatrix.followGlobalWith', {
                                  model: globalValue,
                                })
                              : t('lobeModelMatrix.followGlobalLocal')}
                          </option>
                          {options.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                          {/* ⚠️ 当前值不在候选里也显示（引擎可能已注销）——
                              抹掉它 = 静默改掉用户设置。 */}
                          {override && !known && (
                            <option value={override}>{override}</option>
                          )}
                        </select>
                      </label>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
