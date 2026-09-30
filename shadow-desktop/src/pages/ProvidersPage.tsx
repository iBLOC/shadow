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

export function ProvidersPage() {
  const { t } = useTranslation();
  const [presets, setPresets] = useState<ProviderPreset[]>([]);
  const [providers, setProviders] = useState<ProviderEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  // is open — cleared on tab switch, preset change, and close.
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewModels, setPreviewModels] = useState<ModelSummary[] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewSelected, setPreviewSelected] = useState<string | null>(null);

  const resetPreview = () => {
    setPreviewLoading(false);
    setPreviewModels(null);
    setPreviewError(null);
    setPreviewSelected(null);
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
  }, []);

  useEffect(() => {
    loadAll();
    // The Rust side refreshes model lists from each provider's /models
    // endpoint every 10 min; the UI just re-reads the cache periodically.
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
    let addedId: string | undefined;
    const ok = await runAction(async () => {
      const entry = await invoke<ProviderEntry>('provider_add_preset', {
        presetId: selectedPreset.id,
        apiKey: presetKey.trim() || null,
      });
      addedId = entry.id;
      // Promote the preview-picked model to selected_model on the new entry.
      if (previewSelected) {
        await invoke('provider_select_model', {
          id: entry.id,
          modelId: previewSelected,
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
    let addedId: string | undefined;
    const ok = await runAction(async () => {
      const entry = await invoke<ProviderEntry>('provider_add_custom', {
        name: customForm.name.trim(),
        baseUrl: customForm.baseUrl.trim(),
        apiStandard: customForm.standard,
        apiKey: customForm.apiKey.trim() || null,
      });
      addedId = entry.id;
      // Promote the preview-picked model to selected_model on the new entry.
      if (previewSelected) {
        await invoke('provider_select_model', {
          id: entry.id,
          modelId: previewSelected,
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

  const handlePreviewPreset = async () => {
    if (!selectedPreset) return;
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewModels(null);
    try {
      const models = await invoke<ModelSummary[]>('provider_preview_fetch', {
        presetId: selectedPreset.id,
        baseUrl: null,
        apiStandard: selectedPreset.api_standard,
        apiKey: presetKey.trim() || null,
      });
      setPreviewModels(models);
      // Default selection: catalog hint → first entry.
      const defaultId =
        selectedPreset.default_model && models.some((m) => m.id === selectedPreset.default_model)
          ? selectedPreset.default_model
          : models[0]?.id ?? null;
      setPreviewSelected(defaultId);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewLoading(false);
    }
  };

  const handlePreviewCustom = async () => {
    if (!customForm.baseUrl.trim()) {
      setPreviewError('Base URL is required');
      return;
    }
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewModels(null);
    try {
      const models = await invoke<ModelSummary[]>('provider_preview_fetch', {
        presetId: null,
        baseUrl: customForm.baseUrl.trim(),
        apiStandard: customForm.standard,
        apiKey: customForm.apiKey.trim() || null,
      });
      setPreviewModels(models);
      setPreviewSelected(models[0]?.id ?? null);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewLoading(false);
    }
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
          {t('providers.previewHint') || '选择模型将在添加后自动选中'}
        </p>
      )}
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
      ? await runAction(() =>
          invoke('provider_set_api_key', {
            id: editing.id,
            apiKey: editKey.trim() || editing.api_key || '',
          })
        )
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
                provider.models[0]?.id ||
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
                        </div>
                        <p className="max-w-[220px] truncate text-xs text-muted-foreground">
                          {provider.base_url}
                        </p>
                      </div>
                    </div>
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
                          ? `${provider.models.length} 个可用`
                          : '尚未获取'}
                      </span>
                    </label>
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
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
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
                    <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Clock size={11} />
                      <span>
                        {t('providers.lastRefresh') || '上次更新'}: {formatTime(provider.last_refreshed_at)}
                      </span>
                    </div>
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
                    <Button variant="ghost" size="sm" onClick={() => openEdit(provider)}>
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
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

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
                {selectedPreset.requires_key ? (
                  <Input
                    label={t('providers.apiKey') || 'API Key'}
                    value={presetKey}
                    onChange={(e) => setPresetKey(e.target.value)}
                    placeholder="sk-..."
                    type="password"
                    autoFocus
                  />
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
                onChange={(e) => setCustomForm((f) => ({ ...f, baseUrl: e.target.value }))}
                placeholder="https://api.example.com/v1"
              />
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-foreground">
                  {t('providers.standard') || '接口标准'}
                </label>
                <select
                  value={customForm.standard}
                  onChange={(e) =>
                    setCustomForm((f) => ({ ...f, standard: e.target.value as ApiStandard }))
                  }
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="openai">OpenAI</option>
                  <option value="claude">Claude</option>
                </select>
              </div>
              <Input
                label={t('providers.apiKey') || 'API Key'}
                value={customForm.apiKey}
                onChange={(e) => setCustomForm((f) => ({ ...f, apiKey: e.target.value }))}
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
                    className="rounded-md border border-border bg-background px-3 py-2 text-sm"
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
