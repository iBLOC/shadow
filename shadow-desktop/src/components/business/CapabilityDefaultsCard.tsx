import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Card, CardContent, CardHeader, CardTitle, Loading } from '@/components/ui';
import {
  capabilityCandidatesByCapability,
  capabilityOptionsByCapability,
  mergeCapabilityDefaultsForPush,
  readCapabilityDefaultsSnapshot,
  unusableCapabilityDefaults,
  writeCapabilityDefaultsSnapshot,
  type CapabilityCandidateOption,
  type EngineResolvedInfo,
} from '@/lib/capabilityDefaults';
import { telencephalonClient, type ModelProvider } from '@/lib/telencephalonClient';

/**
 * 「**按能力分档**的默认模型」卡 —— 每一类能力各有一个默认模型。
 *
 * ## 为什么要有这张卡
 *
 * ⚠️ 以前「默认模型」只有**一个**槽（文本）⇒ ⇒ 「语音识别用哪个模型」
 * 「语音合成用哪个模型」这件事**界面上没人管** ⇒ ⇒ 端脑只能拿「第一个
 * 注册的引擎」⇒ ⇒ 用户选的语音模型**根本没人用**（失败长得像成功）。
 *
 * 现在每一类能力各有一个默认模型（端脑的 `Capability` 词表是单一真源，
 * 客户端照它渲染、不自己造词）。
 *
 * ## 写路径
 *
 * ⚠️ **先端脑、后本地**：端脑收下了才写 durable 副本 ⇒ ⇒ 端脑拒了（那个
 * 模型 id 没注册）而本地已经记下 ⇒ ⇒ 界面显示「已应用」⇒ ⇒ **失败长得像
 * 成功**。
 *
 * ⚠️ 下发的是**整份**（端脑那一面是整份替换）⇒ ⇒ 基线必须是「本地副本 ∪
 * 端脑当前值」⇒ ⇒ 否则会把另一边已有的档位抹掉。
 */
export function CapabilityDefaultsCard() {
  const { t } = useTranslation();
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [candidates, setCandidates] = useState<
    Record<string, CapabilityCandidateOption[]>
  >({});
  // ⚠️ **端脑说的「哪几档按引擎 id 解析」＋「那些档此刻注册了哪些 id」**
  // ⇒ ⇒ 没有它，客户端只能拿目录面那套 id 去填 asr/tts ⇒ ⇒ 端脑永远解析
  // 不到 ⇒ ⇒ **存得进去、用不了**（失败长得像成功）。
  const [engineInfo, setEngineInfo] = useState<EngineResolvedInfo>({
    engineResolved: [],
    registered: {},
  });
  // ⚠️ **llm 档的路由注册要用供应商明细**（id/base_url/模型归属）——
  // 分档卡的 llm 行选了云模型 ⇒ 顺手把它注册成远端引擎（见 apply）。
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [view, providers] = await Promise.all([
        telencephalonClient.getCapabilityDefaults(),
        telencephalonClient.listProviders(),
      ]);
      const remote = view.defaults ?? {};
      setCapabilities(view.capabilities ?? []);
      setDefaults(remote);
      setProviders(providers);
      // ⚠️ **目录面只是「有哪些模型可以下载」** ⇒ ⇒ 按引擎 id 解析的那两档
      // ⇒ ⇒ 候选取**已注册面**（端脑真解析引擎用的那套 id）⇒ ⇒ 否则用户
      // 选一个端脑永远解析不到的 id ⇒ ⇒ 存得进去、用不了。
      const info: EngineResolvedInfo = {
        engineResolved: view.engine_resolved ?? [],
        registered: view.registered ?? {},
      };
      setEngineInfo(info);
      // ⚠️ **chat→llm 的别名已撤**（2026-11-13 晚）：端脑**读面**做了词表
      // 归一（`normalize_word`）⇒ ⇒ 云模型到客户端时 `capabilities[0]`
      // 已经是 `llm` ⇒ ⇒ 这里按词直分组就够了。
      // 撤掉客户端补丁的意义：**两端不再各写一份归一**（移动端的 Dart
      // 孪生也就不会与桌面漂开）。
      setCandidates(
        capabilityOptionsByCapability(
          capabilityCandidatesByCapability(providers),
          info,
        ),
      );

      // ⚠️ **端脑刚重启 ⇒ 它的运行态槽是空的** ⇒ ⇒ 而本机还留着 durable
      // 副本 ⇒ ⇒ 这时候把副本**再下发一遍**（与移动端「开机下发」同一
      // 套路）⇒ ⇒ 否则用户会发现「重启一次，设置全没了」。
      const snapshot = readCapabilityDefaultsSnapshot();
      if (Object.keys(remote).length === 0 && Object.keys(snapshot).length > 0) {
        try {
          await telencephalonClient.setCapabilityDefaults(snapshot);
          setDefaults(snapshot);
        } catch (e) {
          // ⚠️ 重下发失败**要说真话**（不是静默吞掉）⇒ ⇒ 但不挡住界面。
          setError(String(e));
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ⚠️ **哪些档的当前默认值此刻用不了** —— 端脑说「按引擎 id 解析」的
  // 那些档，其 id 必须已注册 ⇒ ⇒ 没注册就是「配了也跑不起来」。
  // ⚠️ 但 `image_gen` 那一档另有**云供应商模型表**那条腿（端脑 images
  // 门面按 id 先查云端）⇒ ⇒ 把目录面一并传进去，别把「能用」报成
  // 「用不了」（与移动端同一判据，见 `CATALOG_RESOLVED_TIERS`）。
  const unusable = unusableCapabilityDefaults(
    defaults,
    engineInfo,
    capabilityCandidatesByCapability(providers),
  );

  const apply = useCallback(
    async (capability: string, model: string) => {
      setSaving(capability);
      setError(null);
      setNotice(null);
      const next = mergeCapabilityDefaultsForPush(
        readCapabilityDefaultsSnapshot(),
        defaults,
        capability,
        model,
      );
      try {
        // ⚠️ **先端脑** —— 端脑收下了才落本地。
        await telencephalonClient.setCapabilityDefaults(next);
        // ⚠️ **llm 档的路由真消费面是 `lobes/models`**（capability-defaults
        // 的 llm 分档不进会话路由 —— 真机读数：钉了也路由不变）⇒ ⇒ 选了
        // 云模型就把它**注册成远端引擎＋设全局默认**（key 不出大脑，端脑按
        // 供应商 id 自己解析）；清空 ⇒ `default_model: null`（回落本地）；
        // 内置权重模型（builtin-neuron，无独立供应商端点）⇒ 不动路由 ——
        // 它的引擎要等权重下载后才注册，这里不替它做主。
        if (capability === 'llm') {
          const owner = model
            ? providers.find(
                (p) =>
                  p.id !== 'builtin-neuron' &&
                  !!p.api_base &&
                  (p.models ?? []).some((m) => m.id === model),
              )
            : undefined;
          if (model && owner) {
            // ⚠️ **路由键是「上游模型 id」（`model_id`），不是供应商目录的
            // 复合 id** —— 真机读数：注册成目录 id ⇒ 上游回 `Model not
            // exist`（移动端 `upstreamModelIdOf` 的语义就是它）。
            const upstream =
              owner.models.find((m) => m.id === model)?.model_id?.trim() ||
              model;
            await telencephalonClient.setLobeModels({
              providers: [
                { id: owner.id, base_url: owner.api_base!, model: upstream },
              ],
              default_model: upstream,
            });
          } else if (!model) {
            await telencephalonClient.setLobeModels({
              providers: [],
              default_model: null,
            });
          }
        }
        // ⚠️ **本地副本存没存住，要说真话** —— 端脑那份已经是权威了 ⇒ ⇒
        // 存不住 ≠ 这次没生效；但「重启后这一档会回到默认」**必须让用户
        // 知道** ⇒ ⇒ 否则用户以为「持久了」⇒ ⇒ 失败长得像成功。
        const write = writeCapabilityDefaultsSnapshot(next);
        setDefaults(next);
        setNotice(
          write.ok
            ? t('capabilityDefaults.applied')
            : t('capabilityDefaults.appliedButNotCached') +
                (write.error ? ' (' + write.error + ')' : ''),
        );
      } catch (e) {
        // ⚠️ 说真话：把端脑的原话带出来（它会说清是「键不认识」还是
        // 「模型没注册」）⇒ ⇒ 不许只弹一句「失败」。
        setError(`${t('capabilityDefaults.failed')}: ${String(e)}`);
      } finally {
        setSaving(null);
      }
    },
    [defaults, providers, t],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('capabilityDefaults.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          {t('capabilityDefaults.hint')}
        </p>

        {error && (
          <Alert variant="destructive">
            <p className="text-sm">{error}</p>
          </Alert>
        )}
        {notice && !error && (
          <p className="text-sm text-muted-foreground">{notice}</p>
        )}

        {/* ⚠️ **当前默认值此刻用不了** ⇒ ⇒ 必须说出来 ——
            「存得进去、用不了」若界面不吭声 ⇒ ⇒ 用户以为配好了 ⇒ ⇒
            真到用语音时才发现 503 ⇒ ⇒ 失败长得像成功。 */}
        {unusable.length > 0 && (
          <Alert variant="destructive">
            <p className="text-sm">{t('capabilityDefaults.unusableNow')}</p>
            <ul className="mt-1 list-disc pl-5 text-sm">
              {unusable.map((u) => (
                <li key={u.capability}>
                  {t(`capabilityDefaults.${u.capability}`, u.capability)} · {u.modelId}
                </li>
              ))}
            </ul>
          </Alert>
        )}

        {isLoading ? (
          <Loading text={t('common.loading')} />
        ) : capabilities.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('capabilityDefaults.empty')}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {capabilities.map((cap) => {
              const value = defaults[cap] ?? '';
              const list = candidates[cap] ?? [];
              // ⚠️ **当前值不在候选里也要显示出来** —— 那个模型可能已经被
              // 删了，也可能是本地权重 ⇒ ⇒ 抹掉它 = 静默改掉用户设置。
              const known = list.some((c) => c.id === value);
              return (
                <label key={cap} className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">
                    {CAPABILITY_FALLBACK_LABELS[cap]
                      ? t(
                          `capabilityDefaults.${cap}`,
                          CAPABILITY_FALLBACK_LABELS[cap],
                        )
                      : t(`capabilityDefaults.${cap}`, cap)}
                  </span>
                  <select
                    className="rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground"
                    value={value}
                    disabled={saving === cap}
                    onChange={(e) => void apply(cap, e.target.value)}
                  >
                    <option value="">{t('capabilityDefaults.unset')}</option>
                    {list.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                    {value && !known && <option value={value}>{value}</option>}
                  </select>
                </label>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * 能力词的**兜底显示**（认得出的能力走 i18n 键）。
 *
 * ⚠️ **认不出的词原样显示**（不吞）—— 端脑加了新能力时，界面也要能看见
 * 它，而不是把它悄悄藏起来。
 */
const CAPABILITY_FALLBACK_LABELS: Record<string, string> = {
  llm: '文本模型',
  asr: '语音识别',
  tts: '语音合成',
  vad: '语音活动检测',
  rerank: '重排模型',
  embedding: '向量模型',
  vision: '视觉模型',
  forecast: '预测模型',
};
