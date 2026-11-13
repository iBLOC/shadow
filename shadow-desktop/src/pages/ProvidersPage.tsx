import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import {
  Plus,
  RefreshCw,
  X,
  Cloud,
  Server,
  Key,
  Link,
  Cpu,
  Loader2,
  AlertCircle,
  Check,
  Clock,
  Search,
  Circle,
  CheckCircle2,
} from 'lucide-react';
import { Button, EmptyState, Modal, Input } from '../components/ui';
import { cn } from '../lib/utils';
import { telencephalonClient } from '../lib/telencephalonClient';
import { AGENT_CAPABILITY_FALLBACK_LABELS } from '../lib/agentCapabilities';

// ---- backend contract (synapse catalog + encephalon ProviderManager) ----

type ApiStandard = 'openai' | 'claude';

interface ProviderPreset {
  id: string;
  name: string;
  base_url: string;
  api_standard: ApiStandard;
  default_model: string | null;
  requires_key: boolean;
}

interface ModelSummary {
  id: string;
  display_name?: string;
  context_length?: number;
  created_at?: number;
  /**
   * 能力（llm / asr / tts / embedding / vision / rerank / ocr）。
   *
   * ⚠️ 内置条目（neuron 目录）的模型**横跨七种能力** ⇒ ⇒ 不带它，界面分不出
   * ⚠️ 「这条是聊天模型还是语音模型」。
   */
  capability?: string;
  /**
   * 这条能力**从哪来**（`user` / `upstream` / `catalog` / `inferred` /
   * `default`）。
   *
   * ⚠️ 只给最终词、不说来源 ⇒ ⇒「上游真给的」与「系统猜的」在界面上长得
   * 一样 ⇒ ⇒ 猜错了用户也发现不了。`user` ⇒ 是用户自己在这张页面上改的。
   */
  capability_source?: string;
  /**
   * 盘上真的有吗？
   *
   * ⚠️ 内置条目里「目录里有、但**还没下载**」的模型也列出来 ⇒ ⇒ 不带这个
   * ⚠️ 标记 ⇒ ⇒ 界面会把「选了也跑不起来」的模型当成能用的。
   *
   * ⚠️ 没有这个字段 ＝ **不知道** ⇒ ⇒ 按「可用」处理。
   */
  available?: boolean;
}

interface ProviderEntry {
  id: string;
  name: string;
  preset_id?: string;
  base_url: string;
  api_standard: ApiStandard;
  api_key?: string;
  enabled: boolean;
  selected_model?: string;
  default_model?: string;
  models: ModelSummary[];
  last_refreshed_at?: string;
  last_error?: string;
  /**
   * 内置供应商（neuron）—— 大脑自带的那个**本地模型**供应商。
   *
   * ⚠️ 它在注册表里**只读**（读视图里合成，不在存储里）⇒ ⇒ 界面据此不给
   * 「启停 / 选模型 / 编辑 / 删除」—— 那些动作**写不进去** ⇒ ⇒ 按下去只会
   * 拿到 400（大脑那边明确拒），界面不能给用户一个必然失败的按钮。
   */
  builtin?: boolean;
}

interface CustomFormData {
  name: string;
  baseUrl: string;
  standard: ApiStandard;
  apiKey: string;
}

function StandardBadge({ standard }: { standard: ApiStandard }) {
  return (
    <span
      className={cn(
        'rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
        standard === 'claude'
          ? 'bg-orange-500/10 text-orange-600'
          : 'bg-emerald-500/10 text-emerald-600'
      )}
    >
      {standard === 'claude' ? 'Claude' : 'OpenAI'}
    </span>
  );
}

/**
 * 「内置」徽章 —— 大脑自带的供应商（neuron）**自报家门**用的。
 *
 * ⚠️ 为什么要有它：内置条目**不是用户的配置**，它是**大脑的一部分**
 * ⇒ ⇒ 界面上必须**一眼看出**「这条不是你能改的东西」⇒ ⇒ 否则用户会去
 * 点它 ⇒ ⇒ 拿到 400 ⇒ ⇒ 「功能坏了」。
 */
function BuiltinBadge() {
  const { t } = useTranslation();
  return (
    <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-600">
      {t('providers.builtinBadge') || '内置'}
    </span>
  );
}

// Mirrors synapse::providers::catalog::models_endpoint so the UI shows the
// exact URLs the backend will actually request (Claude tolerates /v1 bases).
interface DerivedEndpoint {
  method: 'GET' | 'POST';
  labelKey: string;
  labelFallback: string;
  url: string;
}

export function deriveEndpoints(baseUrl: string, standard: ApiStandard): DerivedEndpoint[] {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (!base) return [];
  if (standard === 'claude') {
    const b = /\/v1$/.test(base) ? base : `${base}/v1`;
    return [
      { method: 'GET', labelKey: 'providers.epModels', labelFallback: '模型列表', url: `${b}/models` },
      { method: 'POST', labelKey: 'providers.epChat', labelFallback: '对话补全', url: `${b}/messages` },
      {
        method: 'POST',
        labelKey: 'providers.epTokens',
        labelFallback: 'Token 计数',
        url: `${b}/messages/count_tokens`,
      },
    ];
  }
  return [
    { method: 'GET', labelKey: 'providers.epModels', labelFallback: '模型列表', url: `${base}/models` },
    { method: 'POST', labelKey: 'providers.epChat', labelFallback: '对话补全', url: `${base}/chat/completions` },
    { method: 'POST', labelKey: 'providers.epEmbeddings', labelFallback: '向量嵌入', url: `${base}/embeddings` },
  ];
}

function EndpointList({ baseUrl, standard }: { baseUrl: string; standard: ApiStandard }) {
  const { t } = useTranslation();
  const endpoints = deriveEndpoints(baseUrl, standard);
  if (endpoints.length === 0) return null;
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-2.5">
      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
        {t('providers.endpointsTitle') || '接口地址（由请求地址自动推导）'}
      </p>
      <div className="flex flex-col gap-1">
        {endpoints.map((e) => (
          <div key={e.url} className="flex items-center gap-2 text-[11px]">
            <span
              className={cn(
                'w-9 shrink-0 rounded px-1 py-0.5 text-center font-mono text-[9px] font-semibold',
                e.method === 'GET' ? 'bg-sky-500/10 text-sky-600' : 'bg-violet-500/10 text-violet-600'
              )}
            >
              {e.method}
            </span>
            <span className="shrink-0 text-muted-foreground">
              {t(e.labelKey) || e.labelFallback}
            </span>
            <code className="min-w-0 flex-1 truncate font-mono text-foreground/80" title={e.url}>
              {e.url}
            </code>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTime(iso?: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return `${diffMin} 分钟前`;
    if (diffMin < 24 * 60) return `${Math.floor(diffMin / 60)} 小时前`;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function formatContext(len?: number): string {
  if (!len) return '';
  if (len >= 1024 * 1024) return `${Math.round(len / 1024 / 1024)}M ctx`;
  if (len >= 1024) return `${Math.round(len / 1024)}K ctx`;
  return `${len} ctx`;
}

/**
 * 外部工具（opencode / Claude Code / Codex）里的一条供应商。
 *
 * ⚠️ **只有长度，没有材料** —— 扫描这条路的返回**绝不含** api key
 * ⇒ ⇒ 材料只走「读文件 → 直接交给大脑」与「大脑 → 明文 → 直接写文件」
 * ⇒ ⇒ 两条路，**从不上桌**。
 */
interface ExternalProviderPreview {
  tool: string;
  tool_display: string;
  /** 外部那个 id（opencode: minimax-cn；codex: OPENAI_API_KEY）。 */
  source_id: string;
  /** ⚠️ **只报长度** ⇒ ⇒ 材料不进界面、不进日志。 */
  key_len: number | null;
  base_url: string | null;
  /** 协议族（openai / anthropic）。 */
  provider: string;
  /** 材料来自哪个文件的哪个字段（**不含材料**）。 */
  origin: string;
}
export function ProvidersPage() {
  const { t } = useTranslation();
  const [presets, setPresets] = useState<ProviderPreset[]>([]);
  const [providers, setProviders] = useState<ProviderEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // ---- 模型类型（人工覆盖）----
  // ⚠️ 词表从**端脑**下发（`Capability::ALL` 单一真源）⇒ 客户端不自己造词。
  const [capWords, setCapWords] = useState<string[]>([
    'llm',
    'asr',
    'tts',
    'vad',
    'rerank',
    'embedding',
    'vision',
    'forecast',
    'image_gen',
  ]);
  /** 正在保存覆盖的模型 id（逐行禁用 + 转圈）。 */
  const [savingTypeOf, setSavingTypeOf] = useState<string | null>(null);
  const [typeError, setTypeError] = useState<string | null>(null);

  // Add modal: preset flow (select card → key) + custom form.
  const [showAddModal, setShowAddModal] = useState(false);
  const [addTab, setAddTab] = useState<'preset' | 'custom'>('preset');
  const [selectedPreset, setSelectedPreset] = useState<ProviderPreset | null>(null);
  const [presetKey, setPresetKey] = useState('');
  const [customForm, setCustomForm] = useState<CustomFormData>({
    name: '',
    baseUrl: '',
    standard: 'openai',
    apiKey: '',
  });
  const [adding, setAdding] = useState(false);

  // Pre-save model-list preview for the Add form. Lives only while the modal
  // is open — cleared on tab switch, preset change, and close. The preview
  // auto-runs once the API key settles (debounce); `manualModel` is the
  // fallback when the provider's /models endpoint yields nothing.
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewModels, setPreviewModels] = useState<ModelSummary[] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewSelected, setPreviewSelected] = useState<string | null>(null);
  const [manualModel, setManualModel] = useState('');

  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelAutoFetch = () => {
    if (previewTimer.current) {
      clearTimeout(previewTimer.current);
      previewTimer.current = null;
    }
  };
  // Fires once typing pauses long enough for the key to be complete.
  const scheduleAutoFetch = (fn: () => void, delay = 700) => {
    cancelAutoFetch();
    previewTimer.current = setTimeout(fn, delay);
  };
  useEffect(() => cancelAutoFetch, []);

  const resetPreview = () => {
    cancelAutoFetch();
    setPreviewLoading(false);
    setPreviewModels(null);
    setPreviewError(null);
    setPreviewSelected(null);
    setManualModel('');
  };

  // Edit modal: preset providers edit only the key; custom edit everything.
  const [editing, setEditing] = useState<ProviderEntry | null>(null);
  const [editKey, setEditKey] = useState('');
  const [editForm, setEditForm] = useState<CustomFormData>({
    name: '',
    baseUrl: '',
    standard: 'openai',
    apiKey: '',
  });

  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  // 外部工具（opencode / Claude Code / Codex）—— ⚠️ **本机文件** ⇒ ⇒
  // ⇒ ⇒ 只有桌面端读得到（大脑可能在手机上）⇒ ⇒ 这块是**桌面端独有**的。
  const [externalOpen, setExternalOpen] = useState(false);
  const [externalItems, setExternalItems] = useState<ExternalProviderPreview[]>([]);
  const [externalBusy, setExternalBusy] = useState<string | null>(null);
  const [externalMsg, setExternalMsg] = useState<string | null>(null);
  /** 正在往哪个外部工具导出（null ＝ 没在导出）。 */
  const [exportTarget, setExportTarget] = useState<ProviderEntry | null>(null);
  /** 导出目标：`${tool}|${source_id}`。 */
  const [exportChoice, setExportChoice] = useState('');

  const loadAll = useCallback(async () => {
    try {
      const [p, list] = await Promise.all([
        invoke<ProviderPreset[]>('provider_presets'),
        invoke<ProviderEntry[]>('provider_list'),
      ]);
      setPresets(p);
      setProviders(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
    // ⚠️ 词表单独取（读不到不挡列表 —— 列表是主内容，词表只是下拉选项）。
    try {
      const view = await telencephalonClient.listCapabilityOverrides();
      if (view.capabilities?.length) setCapWords(view.capabilities);
    } catch {
      // 保留内置的 9 档兜底（端脑词表就是这 9 档）。
    }
  }, []);

  /**
   * 改一条模型的类型（写人工覆盖 ⇒ **立刻重读**，让来源徽章同步翻新）。
   *
   * ⚠️ `null` = 清掉覆盖（回到自动判定）。
   * ⚠️ **失败要说真话**：端脑会拒未知词/未连接，把原话带出来。
   */
  const changeModelType = useCallback(
    async (modelId: string, word: string | null) => {
      setSavingTypeOf(modelId);
      setTypeError(null);
      try {
        await telencephalonClient.putCapabilityOverrides({ [modelId]: word });
        await loadAll();
      } catch (err) {
        setTypeError(err instanceof Error ? err.message : String(err));
      } finally {
        setSavingTypeOf(null);
      }
    },
    [loadAll],
  );

  useEffect(() => {
    loadAll();
    // ⚠️ 这里只是**重读**大脑那份缓存（每分钟一次）。
    // ⚠️ 旧注释写的是「Rust 侧每 10 分钟去各家的 /models 拉一遍」—— **那是假的**：
    // ⇒ ⇒ provider_manager.rs 里**没有任何定时器**（provider_refresh /
    // ⇒ ⇒ provider_refresh_all 只在**用户点按钮**时调用）⇒ ⇒ 模型列表要靠
    // ⇒ ⇒ 那个「刷新」按钮才更新 ⇒ ⇒ 注释得说真话，否则会以为它自己在动。
    const timer = setInterval(loadAll, 60_000);
    return () => clearInterval(timer);
  }, [loadAll]);

  const runAction = async (action: () => Promise<unknown>) => {
    try {
      setError(null);
      await action();
      await loadAll();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  };

  const handleAddPreset = async () => {
    if (!selectedPreset) return;
    if (selectedPreset.requires_key && !presetKey.trim()) {
      setError('API Key is required');
      return;
    }
    setAdding(true);
    const ok = await runAction(async () => {
      const entry = await invoke<ProviderEntry>('provider_add_preset', {
        presetId: selectedPreset.id,
        apiKey: presetKey.trim() || null,
      });
      // Manual model (fetch failed) wins over the preview selection.
      const modelToSelect = manualModel.trim() || previewSelected;
      if (modelToSelect) {
        await invoke('provider_select_model', {
          id: entry.id,
          modelId: modelToSelect,
        });
      }
    });
    setAdding(false);
    if (ok) {
      setShowAddModal(false);
      setSelectedPreset(null);
      setPresetKey('');
      resetPreview();
    }
  };

  const handleAddCustom = async () => {
    if (!customForm.name.trim() || !customForm.baseUrl.trim()) {
      setError('Name and base URL are required');
      return;
    }
    setAdding(true);
    const ok = await runAction(async () => {
      const entry = await invoke<ProviderEntry>('provider_add_custom', {
        name: customForm.name.trim(),
        baseUrl: customForm.baseUrl.trim(),
        apiStandard: customForm.standard,
        apiKey: customForm.apiKey.trim() || null,
      });
      // Manual model (fetch failed) wins over the preview selection.
      const modelToSelect = manualModel.trim() || previewSelected;
      if (modelToSelect) {
        await invoke('provider_select_model', {
          id: entry.id,
          modelId: modelToSelect,
        });
      }
    });
    setAdding(false);
    if (ok) {
      setShowAddModal(false);
      setCustomForm({ name: '', baseUrl: '', standard: 'openai', apiKey: '' });
      resetPreview();
    }
  };

  // ---- pre-save model preview ----

  interface PreviewOpts {
    presetId: string | null;
    baseUrl: string | null;
    apiStandard: ApiStandard;
    apiKey: string | null;
    defaultModel?: string | null;
  }

  const fetchPreview = async (opts: PreviewOpts) => {
    cancelAutoFetch();
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewModels(null);
    setManualModel('');
    try {
      const models = await invoke<ModelSummary[]>('provider_preview_fetch', {
        presetId: opts.presetId,
        baseUrl: opts.baseUrl,
        apiStandard: opts.apiStandard,
        apiKey: opts.apiKey,
      });
      setPreviewModels(models);
      // Default selection: catalog hint → first entry.
      const defaultId =
        opts.defaultModel && models.some((m) => m.id === opts.defaultModel)
          ? opts.defaultModel
          : models[0]?.id ?? null;
      setPreviewSelected(defaultId);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : String(err));
      setPreviewSelected(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const previewPresetOpts = (apiKey: string | null): PreviewOpts | null =>
    selectedPreset
      ? {
          presetId: selectedPreset.id,
          baseUrl: null,
          apiStandard: selectedPreset.api_standard,
          apiKey,
          defaultModel: selectedPreset.default_model,
        }
      : null;

  const handlePreviewPreset = () => {
    const opts = previewPresetOpts(presetKey.trim() || null);
    if (opts) void fetchPreview(opts);
  };

  const handlePreviewCustom = () => {
    const base = customForm.baseUrl.trim();
    if (!base) {
      setPreviewError('Base URL is required');
      return;
    }
    void fetchPreview({
      presetId: null,
      baseUrl: base,
      apiStandard: customForm.standard,
      apiKey: customForm.apiKey.trim() || null,
    });
  };

  // Custom form: auto-probe once the base URL looks like a URL and the key
  // has settled. Called from the field updaters with the post-keystroke
  // snapshot, so both "paste URL after key" and the reverse order fire.
  const maybeAutoFetchCustom = (form: CustomFormData) => {
    const base = form.baseUrl.trim();
    const key = form.apiKey.trim();
    if (/^https?:\/\//i.test(base) && base.length > 12 && key.length >= 8) {
      scheduleAutoFetch(() =>
        void fetchPreview({
          presetId: null,
          baseUrl: base,
          apiStandard: form.standard,
          apiKey: key,
        })
      );
    } else {
      cancelAutoFetch();
    }
  };

  const showManualFallback =
    !previewLoading && (previewError !== null || (previewModels !== null && previewModels.length === 0));

  const renderManualModelFallback = () => {
    if (!showManualFallback) return null;
    const manual = manualModel.trim();
    return (
      <div className="flex flex-col gap-1.5">
        <Input
          label={t('providers.manualModelLabel') || '手动填写模型 ID'}
          value={manualModel}
          onChange={(e) => setManualModel(e.target.value)}
          placeholder={t('providers.manualModelPlaceholder') || '例如 gpt-4o-mini'}
        />
        <p
          className={cn(
            'text-[11px]',
            manual ? 'text-primary' : 'text-muted-foreground'
          )}
        >
          {manual
            ? (t('providers.manualModelInUse') || '将使用手动填写的模型') + `: ${manual}`
            : t('providers.manualModelHint') ||
              '自动获取失败时，可直接填写模型 ID，添加后作为默认模型'}
        </p>
      </div>
    );
  };

  const renderPreviewArea = () => (
    <div className="flex flex-col gap-2 rounded-md border border-dashed border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">
          {t('providers.previewTitle') || '可用模型预览'}
          {previewModels && (
            <span className="ml-2 font-normal text-muted-foreground">
              {(t('providers.previewCount', { count: previewModels.length }) as string) ||
                `共 ${previewModels.length} 个`}
            </span>
          )}
        </span>
      </div>
      {previewLoading && (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 size={12} className="animate-spin" />
          <span>{t('providers.testing') || '测试中…'}</span>
        </div>
      )}
      {previewError && (
        <div className="flex items-start gap-2 py-1 text-xs text-red-500">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span className="line-clamp-3">
            {(t('providers.previewErrorPrefix') || '获取失败：') + previewError}
          </span>
        </div>
      )}
      {previewModels && !previewLoading && !previewError && (
        previewModels.length === 0 ? (
          <div className="py-2 text-xs text-muted-foreground">
            {t('providers.previewEmpty') || '未获取到模型，请检查地址与 API Key'}
          </div>
        ) : (
          <>
            <p className="text-[11px] text-muted-foreground">
              {t('providers.previewHint') || '选择模型将在添加后自动选中'}
            </p>
            <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
              {previewModels.map((m) => {
                const picked = previewSelected === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPreviewSelected(m.id)}
                    className={cn(
                      'flex items-center gap-2 rounded border px-2 py-1.5 text-left text-xs transition-colors',
                      picked
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border bg-background text-foreground hover:border-primary/50'
                    )}
                  >
                    {picked ? (
                      <CheckCircle2 size={14} className="shrink-0 text-primary" />
                    ) : (
                      <Circle size={14} className="shrink-0 text-muted-foreground" />
                    )}
                    <span className="flex-1 truncate">
                      <span className="font-medium">{m.display_name || m.id}</span>
                      {m.display_name && m.display_name !== m.id && (
                        <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">{m.id}</span>
                      )}
                    </span>
                    {m.context_length && (
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {formatContext(m.context_length)}
                      </span>
                    )}
                    {picked && (
                      <span className="shrink-0 text-[10px] font-medium text-primary">
                        {t('providers.previewSelected') || '已选'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )
      )}
      {!previewModels && !previewLoading && !previewError && (
        <p className="py-2 text-[11px] text-muted-foreground">
          {t('providers.autoFetchHint') || '填写 API Key 后将自动获取可用模型'}
        </p>
      )}
      {renderManualModelFallback()}
    </div>
  );

  const openEdit = (provider: ProviderEntry) => {
    setEditing(provider);
    setEditKey('');
    setEditForm({
      name: provider.name,
      baseUrl: provider.base_url,
      standard: provider.api_standard,
      apiKey: '',
    });
  };

  const handleUpdate = async () => {
    if (!editing) return;
    const isPreset = !!editing.preset_id;
    const ok = isPreset
      ? await runAction(async () => {
          await invoke('provider_set_api_key', {
            id: editing.id,
            apiKey: editKey.trim() || editing.api_key || '',
          });
          // A new key usually means a new account — refresh models now
          // instead of waiting for the periodic loop.
          await invoke('provider_refresh', { id: editing.id });
        })
      : await runAction(() =>
          invoke('provider_update_custom', {
            id: editing.id,
            name: editForm.name.trim(),
            baseUrl: editForm.baseUrl.trim(),
            apiStandard: editForm.standard,
            apiKey: editForm.apiKey.trim() || null,
          })
        );
    if (ok) setEditing(null);
  };

  const handleRefresh = async (id: string) => {
    setRefreshingId(id);
    await runAction(() => invoke('provider_refresh', { id }));
    setRefreshingId(null);
  };

  const scanExternal = useCallback(async () => {
    try {
      setExternalBusy('scan');
      const items = await invoke<ExternalProviderPreview[]>('external_tools_scan');
      setExternalItems(items);
      setExternalMsg(null);
    } catch (err) {
      setExternalMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setExternalBusy(null);
    }
  }, []);

  const importExternal = async (tool: string, sourceId: string) => {
    setExternalBusy(`${tool}|${sourceId}`);
    setExternalMsg(null);
    try {
      await invoke('external_tools_import', { tool, sourceId });
      setExternalMsg(`已导入 ${tool} / ${sourceId}`);
      await loadAll();
      await scanExternal();
    } catch (err) {
      setExternalMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setExternalBusy(null);
    }
  };

  const exportExternal = async () => {
    if (!exportTarget || !exportChoice) return;
    const [tool, sourceId] = exportChoice.split('|');
    setExternalBusy('export');
    setExternalMsg(null);
    try {
      const report = await invoke<{
        tool: string;
        changed: string[];
        written: string;
        backup: string | null;
      }>('external_tools_export', { tool, sourceId, providerId: exportTarget.id });
      setExternalMsg(
        `已写回 ${report.written}（改动 ${report.changed.join('、') || '无'}）` +
          (report.backup ? `；备份 ${report.backup}` : '')
      );
      setExportTarget(null);
    } catch (err) {
      setExternalMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setExternalBusy(null);
    }
  };
  const availablePresets = presets.filter(
    (p) => !providers.some((prov) => prov.preset_id === p.id)
  );

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-md bg-foreground text-background">
            <Cloud size={32} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              {t('providers.title') || '大模型服务提供商'}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('providers.subtitle') || '选择预设供应商只需填写 API Key，模型列表自动获取并定期更新'}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button
            variant="ghost"
            icon={<Link size={16} />}
            onClick={() => {
              const next = !externalOpen;
              setExternalOpen(next);
              if (next) scanExternal();
            }}
          >
            {t('providers.externalTools') || '外部工具'}
          </Button>
          <Button
            variant="ghost"
            icon={<RefreshCw size={16} />}
            onClick={() => runAction(() => invoke('provider_refresh_all'))}
          >
            {t('common.refresh') || '刷新模型'}
          </Button>
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => {
              setShowAddModal(true);
              setAddTab('preset');
              setSelectedPreset(null);
              setPresetKey('');
              resetPreview();
            }}
          >
            {t('providers.add') || '添加提供商'}
          </Button>
        </div>
      </header>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
          <AlertCircle size={16} />
          <span className="flex-1">{error}</span>
          <Button size="icon" variant="ghost" className="ml-auto" onClick={() => setError(null)}>
            <X size={14} />
          </Button>
        </div>
      )}

      {externalOpen && (
        <div className="rounded-lg border border-border bg-background p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-medium text-foreground">
                {t('providers.externalToolsTitle') || '外部工具的模型配置'}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('providers.externalToolsHint') ||
                  '读取本机 opencode / Claude Code / Codex 的配置装载进来，或把供应商写回那些工具'}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw size={14} />}
              onClick={() => scanExternal()}
              disabled={externalBusy === 'scan'}
            >
              {t('common.refresh') || '刷新'}
            </Button>
          </div>
          {externalMsg && (
            <p className="mt-2 text-xs text-muted-foreground">{externalMsg}</p>
          )}
          {externalItems.length > 0 ? (
            <div className="mt-3 flex flex-col gap-2">
              {externalItems.map((item) => (
                <div
                  key={`${item.tool}|${item.source_id}`}
                  className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">
                      {item.tool_display} · {item.source_id}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {item.provider}
                      </span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.base_url || '（没有 base URL ⇒ 用大脑的预设目录）'} · key {item.key_len ?? 0} 位
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={externalBusy !== null}
                    onClick={() => importExternal(item.tool, item.source_id)}
                  >
                    {externalBusy === `${item.tool}|${item.source_id}` ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      t('providers.importFromTool') || '导入'
                    )}
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              {t('providers.externalToolsEmpty') ||
                '本机没有找到已安装的外部工具（opencode / Claude Code / Codex）'}
            </p>
          )}
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : providers.length === 0 ? (
          <EmptyState
            icon={<Cloud size={48} />}
            title={t('providers.empty') || '暂未配置提供商'}
            description={
              t('providers.emptyHint') || '点击上方按钮添加第一个提供商 — 预设供应商只需一个 API Key'
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {providers.map((provider) => {
              const effectiveModel =
                provider.selected_model ||
                provider.default_model ||
                (provider.builtin
                  ? provider.models.find((m) => m.available !== false)?.id
                  : provider.models[0]?.id) ||
                '';
              return (
                <div
                  key={provider.id}
                  className={cn(
                    'rounded-lg border p-4 transition-colors',
                    provider.enabled
                      ? 'border-border bg-background'
                      : 'border-border/50 bg-muted/50'
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-md text-gray-500">
                        {provider.preset_id ? <Cpu size={20} /> : <Server size={20} />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-foreground">{provider.name}</h3>
                          <StandardBadge standard={provider.api_standard} />
                          {provider.builtin && <BuiltinBadge />}
                        </div>
                        <p className="max-w-[220px] truncate text-xs text-muted-foreground">
                          {provider.base_url}
                        </p>
                      </div>
                    </div>
                    {!provider.builtin && (
                      <button
                        onClick={() =>
                          runAction(() =>
                            invoke('provider_set_enabled', {
                              id: provider.id,
                              enabled: !provider.enabled,
                            })
                          )
                        }
                        className={cn(
                          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                          provider.enabled ? 'bg-primary' : 'bg-muted'
                        )}
                      >
                        <span
                          className={cn(
                            'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                            provider.enabled ? 'translate-x-6' : 'translate-x-1'
                          )}
                        />
                      </button>
                    )}
                  </div>

                  {provider.api_key && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <Key size={12} />
                      <span>API Key: {provider.api_key.substring(0, 8)}…</span>
                    </div>
                  )}

                  {/* Model picker fed by the provider's own /models endpoint. */}
                  <div className="mt-3">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      {t('providers.model') || '模型'}
                      <span className="ml-2 font-normal">
                        {provider.models.length > 0
                          ? provider.builtin
                            ? t('providers.modelsDownloaded', {
                                downloaded: provider.models.filter(
                                  (m) => m.available !== false
                                ).length,
                                total: provider.models.length,
                              })
                            : `${provider.models.length} 个可用`
                          : '尚未获取'}
                      </span>
                    </label>
                    {provider.builtin ? (
                      // ⚠️ 内置条目（neuron）的模型**可以选** —— 选哪个本地模型
                      // ⇒ ⇒ 由大脑那边**记住**（它在注册表里是只读的条目 ⇒ ⇒
                      // ⇒ ⇒ 但「选中哪个模型」这件事**允许写**）。
                      //
                      // ⚠️⚠️ **没下载的不能选** ⇒ ⇒ 选了也跑不起来 ⇒ ⇒ 那是
                      // ⇒ ⇒ 「失败长得像成功」⇒ ⇒ 大脑那边也会拒（400）⇒ ⇒
                      // ⇒ ⇒ 界面不该给一个必然失败的选择。
                      <select
                        value={effectiveModel}
                        onChange={(e) =>
                          runAction(() =>
                            invoke('provider_select_model', {
                              id: provider.id,
                              modelId: e.target.value || null,
                            })
                          )
                        }
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                        disabled={provider.models.length === 0}
                      >
                        {provider.models.length === 0 && (
                          <option value="">
                            {t('providers.builtinNoModels') || '还没有本地模型'}
                          </option>
                        )}
                        {provider.models.map((m) => (
                          <option key={m.id} value={m.id} disabled={m.available === false}>
                            {m.capability ? `${m.capability} · ` : ''}
                            {m.display_name || m.id}
                            {m.available === false
                              ? ` · ${t('providers.modelNotDownloaded') || '未下载'}`
                              : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select
                        value={effectiveModel}
                        onChange={(e) =>
                          runAction(() =>
                            invoke('provider_select_model', {
                              id: provider.id,
                              modelId: e.target.value || null,
                            })
                          )
                        }
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                        disabled={provider.models.length === 0}
                      >
                        {provider.models.length === 0 && (
                          <option value="">{provider.default_model || '点击下方刷新获取模型'}</option>
                        )}
                        {provider.models.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.display_name || m.id}
                            {formatContext(m.context_length) && ` · ${formatContext(m.context_length)}`}
                          </option>
                        ))}
                      </select>
                    )}
                    {!provider.builtin && provider.models.length > 0 && (
                      // **模型类型**（人工覆盖）—— 可折叠：一家可能上百条模型，
                      // 展开会把卡片撑爆。默认收起，但**计数**要露出来
                      // （否则用户不知道这里能改）。
                      <details
                        className="mt-3 rounded-md border border-border"
                        data-testid={`model-types-${provider.id}`}
                      >
                        <summary className="cursor-pointer select-none px-2.5 py-1.5 text-xs text-muted-foreground">
                          {t('providers.modelType.title') || '模型类型'} ·{' '}
                          {provider.models.length}
                          {provider.models.some(
                            (m) => m.capability_source === 'user',
                          ) && (
                            <span className="ml-1.5 text-foreground">
                              ·{' '}
                              {provider.models.filter(
                                (m) => m.capability_source === 'user',
                              ).length}{' '}
                              {t('providers.modelType.customCount') || '条自定义'}
                            </span>
                          )}
                        </summary>
                        <div className="max-h-72 overflow-y-auto border-t border-border">
                          {provider.models.map((m) => (
                            <div
                              key={m.id}
                              className="flex items-center gap-2 border-b border-border/50 px-2.5 py-1 last:border-b-0"
                              data-testid={`model-type-row-${m.id}`}
                            >
                              <span
                                className="min-w-0 flex-1 truncate text-xs text-foreground"
                                title={m.id}
                              >
                                {m.display_name || m.id}
                              </span>
                              <span
                                className={cn(
                                  'shrink-0 rounded px-1 py-0.5 text-[10px]',
                                  m.capability_source === 'user'
                                    ? 'bg-primary/15 text-primary'
                                    : m.capability_source === 'upstream'
                                      ? 'bg-muted text-muted-foreground'
                                      : m.capability_source === 'catalog'
                                        ? 'bg-muted text-muted-foreground'
                                        : 'bg-muted text-muted-foreground',
                                )}
                                title={
                                  t(
                                    `providers.modelType.sourceHint_${m.capability_source ?? 'default'}`,
                                  ) || ''
                                }
                              >
                                {t(
                                  `providers.modelType.source_${m.capability_source ?? 'default'}`,
                                ) ||
                                  m.capability_source ||
                                  'default'}
                              </span>
                              {savingTypeOf === m.id ? (
                                <Loader2
                                  size={12}
                                  className="shrink-0 animate-spin text-muted-foreground"
                                />
                              ) : null}
                              <select
                                className="w-28 shrink-0 rounded border border-border bg-background px-1.5 py-1 text-[11px] text-foreground"
                                value={
                                  m.capability_source === 'user'
                                    ? (m.capability ?? '')
                                    : ''
                                }
                                disabled={savingTypeOf === m.id}
                                onChange={(e) =>
                                  void changeModelType(
                                    m.id,
                                    e.target.value || null,
                                  )
                                }
                              >
                                <option value="">
                                  {t('providers.modelType.auto') || '自动'}
                                </option>
                                {capWords.map((w) => (
                                  <option key={w} value={w}>
                                    {AGENT_CAPABILITY_FALLBACK_LABELS[w] || w}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ))}
                        </div>
                        {typeError && (
                          <div className="flex items-start gap-1.5 border-t border-border px-2.5 py-1.5 text-[11px] text-red-500">
                            <AlertCircle size={11} className="mt-0.5 shrink-0" />
                            <span className="break-all">{typeError}</span>
                          </div>
                        )}
                      </details>
                    )}
                    {!provider.builtin && (
                      // ⚠️ 内置条目的模型清单是**活的**（neuron 下载完就有）
                      // ⇒ ⇒ 没有「上次更新」这回事 ⇒ ⇒ 不显示一个永远「—」的行。
                      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Clock size={11} />
                        <span>
                          {t('providers.lastRefresh') || '上次更新'}: {formatTime(provider.last_refreshed_at)}
                        </span>
                      </div>
                    )}
                    {provider.last_error && (
                      <div className="mt-1.5 flex items-start gap-1.5 text-[11px] text-red-500">
                        <AlertCircle size={11} className="mt-0.5 shrink-0" />
                        <span className="line-clamp-2">{provider.last_error}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={
                        refreshingId === provider.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <RefreshCw size={14} />
                        )
                      }
                      onClick={() => handleRefresh(provider.id)}
                      disabled={refreshingId === provider.id}
                    >
                      {t('providers.refreshModels') || '刷新模型'}
                    </Button>
                    {!provider.builtin && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Link size={14} />}
                          onClick={() => {
                            setExportTarget(provider);
                            setExportChoice('');
                            if (!externalOpen) setExternalOpen(true);
                            if (externalItems.length === 0) scanExternal();
                          }}
                        >
                          {t('providers.exportToTool') || '导出'}
                        </Button>                        <Button variant="ghost" size="sm" onClick={() => openEdit(provider)}>
                          {t('common.edit') || '编辑'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-600"
                          onClick={() => runAction(() => invoke('provider_remove', { id: provider.id }))}
                        >
                          {t('common.delete') || '删除'}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ---- 导出到外部工具 ---- */}
      <Modal
        isOpen={exportTarget !== null}
        onClose={() => setExportTarget(null)}
        title={t('providers.exportToTool') || '导出到外部工具'}
        description={
          t('providers.exportHint') ||
          '把这条供应商的密钥写进本机外部工具自己的凭据文件（会先备份）'
        }
      >
        <div className="flex flex-col gap-4">
          <select
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
            value={exportChoice}
            onChange={(e) => setExportChoice(e.target.value)}
          >
            <option value="">
              {t('providers.exportPick') || '选择目标（工具 + 字段）'}
            </option>
            {externalItems.map((item) => (
              <option
                key={`${item.tool}|${item.source_id}`}
                value={`${item.tool}|${item.source_id}`}
              >
                {item.tool_display} · {item.source_id}
              </option>
            ))}
          </select>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setExportTarget(null)}>
              {t('common.cancel') || '取消'}
            </Button>
            <Button
              variant="primary"
              disabled={!exportChoice || externalBusy === 'export'}
              onClick={() => exportExternal()}
            >
              {externalBusy === 'export' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                t('providers.exportConfirm') || '写回'
              )}
            </Button>
          </div>
        </div>
      </Modal>
      {/* ---- add modal: preset (key only) / custom (everything) ---- */}
      <Modal
        isOpen={showAddModal}
        onClose={() => { setShowAddModal(false); resetPreview(); }}
        title={t('providers.add') || '添加提供商'}
      >
        <div className="flex flex-col gap-4">
          <div className="flex gap-1 rounded-md bg-muted p-1">
            <button
              className={cn(
                'flex-1 rounded px-3 py-1.5 text-sm transition-colors',
                addTab === 'preset' ? 'bg-background font-medium shadow' : 'text-muted-foreground'
              )}
              onClick={() => {
                setAddTab('preset');
                resetPreview();
              }}
            >
              {t('providers.presetTab') || '预设供应商'}
            </button>
            <button
              className={cn(
                'flex-1 rounded px-3 py-1.5 text-sm transition-colors',
                addTab === 'custom' ? 'bg-background font-medium shadow' : 'text-muted-foreground'
              )}
              onClick={() => {
                setAddTab('custom');
                resetPreview();
              }}
            >
              {t('providers.customTab') || '自定义'}
            </button>
          </div>

          {addTab === 'preset' ? (
            !selectedPreset ? (
              <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto">
                {availablePresets.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => {
                      setSelectedPreset(preset);
                      setPresetKey('');
                      resetPreview();
                      // Keyless runtimes (ollama, neuron) can be probed
                      // immediately — no key to wait for.
                      if (!preset.requires_key) {
                        void fetchPreview({
                          presetId: preset.id,
                          baseUrl: null,
                          apiStandard: preset.api_standard,
                          apiKey: null,
                          defaultModel: preset.default_model,
                        });
                      }
                    }}
                    className="flex items-center justify-between gap-2 rounded-md border border-border p-3 text-left transition-colors hover:border-primary hover:bg-primary/5"
                  >
                    <div>
                      <div className="text-sm font-medium text-foreground">{preset.name}</div>
                      <div className="max-w-[140px] truncate text-[11px] text-muted-foreground">
                        {preset.base_url}
                      </div>
                    </div>
                    <StandardBadge standard={preset.api_standard} />
                  </button>
                ))}
                {availablePresets.length === 0 && (
                  <div className="col-span-2 py-6 text-center text-sm text-muted-foreground">
                    所有预设供应商均已添加
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{selectedPreset.name}</span>
                      <StandardBadge standard={selectedPreset.api_standard} />
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Link size={11} />
                      <span className="max-w-[240px] truncate">{selectedPreset.base_url}</span>
                    </div>
                  </div>
                  <Check size={16} className="text-primary" />
                </div>
                <EndpointList baseUrl={selectedPreset.base_url} standard={selectedPreset.api_standard} />
                {selectedPreset.requires_key ? (
                  <>
                    <Input
                      label={t('providers.apiKey') || 'API Key'}
                      value={presetKey}
                      onChange={(e) => {
                        const v = e.target.value;
                        setPresetKey(v);
                        // Auto-probe the provider's /models endpoint once the
                        // key settles; short fragments just cancel the timer.
                        const key = v.trim();
                        if (key.length >= 8) {
                          const opts = previewPresetOpts(key);
                          if (opts) scheduleAutoFetch(() => void fetchPreview(opts));
                        } else {
                          cancelAutoFetch();
                        }
                      }}
                      placeholder="sk-..."
                      type="password"
                      autoFocus
                    />
                    {!previewModels && !previewError && !previewLoading && (
                      <p className="text-[11px] text-muted-foreground">
                        {t('providers.autoFetchHint') || '填写 API Key 后将自动获取可用模型'}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t('providers.keylessHint') || '本地运行时无需 API Key，直接添加即可'}
                  </p>
                )}
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={
                      previewLoading ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Search size={14} />
                      )
                    }
                    onClick={handlePreviewPreset}
                    disabled={previewLoading}
                  >
                    {t('providers.testFetch') || '测试并获取模型'}
                  </Button>
                </div>
                {renderPreviewArea()}
                <div className="flex justify-end gap-3 border-t border-border pt-4">
                  <Button variant="ghost" onClick={() => { setSelectedPreset(null); resetPreview(); }}>
                    {t('common.back') || '返回'}
                  </Button>
                  <Button
                    variant="primary"
                    icon={adding ? <Loader2 size={14} className="animate-spin" /> : undefined}
                    onClick={handleAddPreset}
                    disabled={adding}
                  >
                    {t('providers.addAndFetch') || '添加并获取模型'}
                  </Button>
                </div>
              </>
            )
          ) : (
            <>
              <Input
                label={t('providers.name') || '供应商名称'}
                value={customForm.name}
                onChange={(e) => setCustomForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="My Gateway"
              />
              <Input
                label={t('providers.baseUrl') || '请求地址'}
                value={customForm.baseUrl}
                onChange={(e) => {
                  const next = { ...customForm, baseUrl: e.target.value };
                  setCustomForm(next);
                  maybeAutoFetchCustom(next);
                }}
                placeholder="https://api.example.com/v1"
              />
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-foreground">
                  {t('providers.standard') || '接口标准'}
                </label>
                <select
                  value={customForm.standard}
                  onChange={(e) => {
                    const next = { ...customForm, standard: e.target.value as ApiStandard };
                    setCustomForm(next);
                    maybeAutoFetchCustom(next);
                  }}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="openai">OpenAI</option>
                  <option value="claude">Claude</option>
                </select>
              </div>
              {customForm.baseUrl.trim() ? (
                <EndpointList baseUrl={customForm.baseUrl} standard={customForm.standard} />
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  {t('providers.endpointsPending') || '填入请求地址后自动生成接口地址'}
                </p>
              )}
              <Input
                label={t('providers.apiKey') || 'API Key'}
                value={customForm.apiKey}
                onChange={(e) => {
                  const next = { ...customForm, apiKey: e.target.value };
                  setCustomForm(next);
                  maybeAutoFetchCustom(next);
                }}
                placeholder="sk-...（可选）"
                type="password"
              />
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  icon={
                    previewLoading ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Search size={14} />
                    )
                  }
                  onClick={handlePreviewCustom}
                  disabled={previewLoading || !customForm.baseUrl.trim()}
                >
                  {t('providers.testFetch') || '测试并获取模型'}
                </Button>
              </div>
              {renderPreviewArea()}
              <div className="flex justify-end gap-3 border-t border-border pt-4">
                <Button variant="ghost" onClick={() => { setShowAddModal(false); resetPreview(); }}>
                  {t('common.cancel') || '取消'}
                </Button>
                <Button
                  variant="primary"
                  icon={adding ? <Loader2 size={14} className="animate-spin" /> : undefined}
                  onClick={handleAddCustom}
                  disabled={adding}
                >
                  {t('providers.addAndFetch') || '添加并获取模型'}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ---- edit modal: preset → key only; custom → everything ---- */}
      <Modal
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title={t('providers.edit') || '编辑提供商'}
      >
        {editing && (
          <div className="flex flex-col gap-4">
            {editing.preset_id ? (
              <>
                <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{editing.name}</span>
                      <StandardBadge standard={editing.api_standard} />
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {t('providers.presetLocked') || '预设供应商的地址与接口标准固定，仅可更换 API Key'}
                    </div>
                  </div>
                </div>
                <Input
                  label={t('providers.newApiKey') || '新 API Key'}
                  value={editKey}
                  onChange={(e) => setEditKey(e.target.value)}
                  placeholder={
                    editing.api_key
                      ? `${editing.api_key.substring(0, 6)}…（留空保持不变）`
                      : 'sk-...'
                  }
                  type="password"
                />
              </>
            ) : (
              <>
                <Input
                  label={t('providers.name') || '供应商名称'}
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                />
                <Input
                  label={t('providers.baseUrl') || '请求地址'}
                  value={editForm.baseUrl}
                  onChange={(e) => setEditForm((f) => ({ ...f, baseUrl: e.target.value }))}
                />
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-foreground">
                    {t('providers.standard') || '接口标准'}
                  </label>
                  <select
                    value={editForm.standard}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, standard: e.target.value as ApiStandard }))
                    }
                    className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                  >
                    <option value="openai">OpenAI</option>
                    <option value="claude">Claude</option>
                  </select>
                </div>
                <Input
                  label={t('providers.newApiKey') || '新 API Key'}
                  value={editForm.apiKey}
                  onChange={(e) => setEditForm((f) => ({ ...f, apiKey: e.target.value }))}
                  placeholder={
                    editing.api_key
                      ? `${editing.api_key.substring(0, 6)}…（留空保持不变）`
                      : 'sk-...'
                  }
                  type="password"
                />
              </>
            )}
            <div className="flex justify-end gap-3 border-t border-border pt-4">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                {t('common.cancel') || '取消'}
              </Button>
              <Button variant="primary" onClick={handleUpdate}>
                {t('common.save') || '保存'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
