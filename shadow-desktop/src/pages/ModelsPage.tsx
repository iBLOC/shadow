import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Badge, EmptyState, Loading } from '../components/ui';
import { AddProviderModal } from '../components/business';
import { Plus, Trash2, Cpu, TestTube, CheckCircle, XCircle, ChevronDown, ChevronRight, Download, Brain, Mic, Ear, Trash } from 'lucide-react';
import type { ModelProvider } from '../components/business/AddProviderModal/types';

interface EngineModel {
  model_id: string;
  engine: string;
  local_path: string | null;
  size_bytes: number;
  loaded_at: string;
  source: string;
}

interface ModelDownloadTask {
  task_id: string;
  model_id: string;
  engine: string;
  reference: string;
  phase: 'pending' | 'downloading' | 'verifying' | 'loading' | 'ready' | 'failed' | string;
  progress: number;
  error: string | null;
  local_path: string | null;
}

const PREFRONTAL_URL = 'http://localhost:8082';
const API_BASE = 'http://localhost:8082';

const providerLogos: Record<string, { bg: string; text: string }> = {
  openai: { bg: '#10a37f', text: 'AI' },
  anthropic: { bg: '#d4a574', text: 'AN' },
  github_copilot: { bg: '#6e5494', text: 'GH' },
  google: { bg: '#4285f4', text: 'GO' },
  openrouter: { bg: '#7c3aed', text: 'OR' },
  vercel: { bg: '#000000', text: 'VC' },
  minimax: { bg: '#00d2d3', text: 'MM' },
  minimax_cn: { bg: '#00d2d3', text: 'MM' },
  moonshot: { bg: '#8b5cf6', text: 'MS' },
  moonshot_cn: { bg: '#8b5cf6', text: 'MS' },
  zhipu: { bg: '#7c3aed', text: 'ZP' },
  deepseek: { bg: '#6366f1', text: 'DS' },
  grok: { bg: '#f97316', text: 'GR' },
  ollama: { bg: '#ffffff', text: 'OLL' },
  lmstudio: { bg: '#8050d4', text: 'LM' },
  togetherai: { bg: '#7c3aed', text: 'TO' },
  groq: { bg: '#2ecc71', text: 'GQ' },
  cerebras: { bg: '#ff6b6b', text: 'CB' },
  fireworks_ai: { bg: '#f97316', text: 'FW' },
  perplexity: { bg: '#1e3a5f', text: 'PP' },
  mistral: { bg: '#f97316', text: 'MS' },
  cohere: { bg: '#f97316', text: 'CO' },
  huggingface: { bg: '#ffd21e', text: 'HF' },
  aws_bedrock: { bg: '#ff9900', text: 'AWS' },
  azure: { bg: '#0078d4', text: 'AZ' },
  nvidia: { bg: '#76b900', text: 'NV' },
  cloudflare: { bg: '#f38020', text: 'CF' },
  modelscope: { bg: '#f97316', text: 'MS' },
  siliconflow: { bg: '#10a37f', text: 'SF' },
  siliconflow_cn: { bg: '#10a37f', text: 'SF' },
  novita_ai: { bg: '#8b5cf6', text: 'NV' },
  friendli: { bg: '#7c3aed', text: 'FR' },
  upstage: { bg: '#f97316', text: 'UP' },
  abacus: { bg: '#10a37f', text: 'AB' },
  aihubmix: { bg: '#f97316', text: 'AH' },
  alibaba: { bg: '#ff6a00', text: 'AL' },
  alibaba_cn: { bg: '#ff6a00', text: 'AL' },
  tencent: { bg: '#ff6a00', text: 'TC' },
  stepfun: { bg: '#7c3aed', text: 'SF' },
  qwen: { bg: '#7c3aed', text: 'QW' },
  custom: { bg: '#7f8c8d', text: 'CST' },
};

export function ModelsPage() {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<Record<string, 'success' | 'error' | null>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadProviders();
  }, []);

  const loadProviders = async () => {
    try {
      const response = await fetch(`${API_BASE}/models/providers`);
      if (!response.ok) throw new Error('Failed to load');
      const result = await response.json();
      setProviders(result);
    } catch (e) {
      console.error('Failed to load providers:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteProvider = async (id: string) => {
    try {
      const response = await fetch(`${API_BASE}/models/providers/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete');
      await loadProviders();
    } catch (e) {
      console.error('Failed to delete provider:', e);
    }
  };

  const handleDeleteModel = async (providerId: string, modelId: string) => {
    try {
      const response = await fetch(`${API_BASE}/models/${providerId}/${modelId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete');
      await loadProviders();
    } catch (e) {
      console.error('Failed to delete model:', e);
    }
  };

  const testConnection = async (provider: ModelProvider) => {
    setTestingConnection(provider.id);
    setConnectionStatus(prev => ({ ...prev, [provider.id]: null }));
    try {
      const response = await fetch(`${API_BASE}/models/providers/${provider.id}/test`, { method: 'POST' });
      setConnectionStatus(prev => ({ ...prev, [provider.id]: response.ok ? 'success' : 'error' }));
    } catch {
      setConnectionStatus(prev => ({ ...prev, [provider.id]: 'error' }));
    } finally {
      setTestingConnection(null);
    }
  };

  const getProviderLogo = (providerType: string) => providerLogos[providerType] || providerLogos.custom;

  if (isLoading) return <Loading fullScreen text="Loading models..." />;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1>{t('models.title')}</h1>
          <p className="subtitle">{t('models.configureProviders')}</p>
        </div>
        <Button variant="primary" icon={<Plus size={18} />} onClick={() => setShowAddProvider(true)}>
          {t('models.addProvider')}
        </Button>
      </header>

      <div className="flex flex-col gap-4">
        {providers.length === 0 ? (
          <EmptyState
            icon={<Cpu size={48} />}
            title={t('models.noProviders')}
            description={t('models.noProvidersDesc')}
            action={{ label: t('models.addFirstProvider'), onClick: () => setShowAddProvider(true) }}
          />
        ) : (
          providers.map((provider) => {
            const logo = getProviderLogo(provider.provider_type);
            const isExpanded = expandedProvider === provider.id;

            return (
              <div key={provider.id} className="overflow-hidden rounded-lg border border-border bg-card">
                <div
                  className="flex cursor-pointer items-center gap-4 p-4 transition-colors hover:bg-muted/50"
                  onClick={() => setExpandedProvider(isExpanded ? null : provider.id)}
                >
                  <div
                    className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md text-sm font-bold"
                    style={{ background: logo.bg, color: provider.provider_type === 'ollama' ? '#333' : '#fff' }}
                  >
                    {logo.text}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-foreground">{provider.name}</h3>
                    <span className="text-xs capitalize text-muted-foreground">{provider.provider_type}</span>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <Badge variant="default">{t('models.modelsCount', { count: provider.models.length })}</Badge>
                    {connectionStatus[provider.id] === 'success' && <CheckCircle size={16} className="text-green-500" />}
                    {connectionStatus[provider.id] === 'error' && <XCircle size={16} className="text-red-500" />}
                    {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="flex flex-col gap-4 border-t border-border bg-muted/30 p-4">
                    {provider.api_base && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">{t('models.apiBase')}:</span>
                        <code className="rounded border border-border bg-card px-2 py-0.5 font-mono text-xs text-foreground">
                          {provider.api_base}
                        </code>
                      </div>
                    )}

                    <div>
                      <h4 className="mb-3 text-sm font-semibold text-foreground">
                        {t('models.models', { count: provider.models.length })}
                      </h4>
                      <div className="flex flex-col gap-2">
                        {provider.models.map((model) => (
                          <div key={model.id} className="flex items-center gap-3 rounded-md border border-border bg-card p-3">
                            <div className="flex-1">
                              <span className="text-sm font-medium text-foreground">{model.name}</span>
                              <span className="block font-mono text-xs text-muted-foreground">{model.model_id}</span>
                            </div>
                            <div className="flex gap-2">
                              {model.is_default && <Badge variant="success" size="sm">{t('models.default')}</Badge>}
                              {model.supports_vision && <Badge variant="info" size="sm">{t('models.visionSupport')}</Badge>}
                              {model.supports_function_calling && <Badge variant="accent" size="sm">{t('models.functions')}</Badge>}
                            </div>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={(e) => { e.stopPropagation(); handleDeleteModel(provider.id, model.id); }}
                              aria-label={t('common.delete')}
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2 border-t border-border pt-3">
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<TestTube size={14} />}
                        loading={testingConnection === provider.id}
                        onClick={(e) => { e.stopPropagation(); testConnection(provider); }}
                      >
                        {t('models.testConnection')}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        icon={<Trash2 size={14} />}
                        onClick={(e) => { e.stopPropagation(); handleDeleteProvider(provider.id); }}
                      >
                        {t('common.delete')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <AddProviderModal isOpen={showAddProvider} onClose={() => setShowAddProvider(false)} onSuccess={loadProviders} />
      <LocalEngineModelsSection onChanged={loadProviders} />
    </div>
  );
}

function engineIcon(engine: string) {
  if (engine === 'llm') return <Brain size={16} />;
  if (engine === 'tts') return <Mic size={16} />;
  if (engine === 'asr') return <Ear size={16} />;
  return <Cpu size={16} />;
}

function LocalEngineModelsSection({ onChanged }: { onChanged: () => void }) {
  const { t: taskT } = useTranslation();
  const [models, setModels] = useState<EngineModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDownload, setShowDownload] = useState(false);
  const [tasks, setTasks] = useState<Record<string, ModelDownloadTask>>({});

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${PREFRONTAL_URL}/api/engine-models`);
      if (r.status === 404) { setModels([]); return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = await r.json();
      setModels(body.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unreachable');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleRelease = async (modelId: string) => {
    try {
      const r = await fetch(`${PREFRONTAL_URL}/api/engine-models/${modelId}/release`, { method: 'POST' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const pollTask = async (taskId: string) => {
    for (let i = 0; i < 30; i++) {
      try {
        const r = await fetch(`${PREFRONTAL_URL}/api/engine-models/download/${taskId}`);
        if (!r.ok) return;
        const body: ModelDownloadTask = await r.json();
        setTasks((prev) => ({ ...prev, [taskId]: body }));
        if (body.phase === 'ready' || body.phase === 'failed') {
          if (body.phase === 'ready') { await load(); onChanged(); }
          return;
        }
      } catch { return; }
      await new Promise((r) => setTimeout(r, 2000));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{taskT('models.localEngineTitle')}</h2>
          <p className="subtitle">{taskT('models.localEngineDesc', { url: PREFRONTAL_URL })}</p>
        </div>
        <Button variant="primary" icon={<Download size={18} />} onClick={() => setShowDownload(true)}>
          {taskT('models.downloadNewModel')}
        </Button>
      </header>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
          {taskT('models.prefrontalUnreachable', { error })}
        </div>
      )}

      {loading && models.length === 0 ? (
        <Loading fullScreen text={taskT('models.loadingModelList')} />
      ) : models.length === 0 ? (
        <EmptyState
          icon={<Cpu size={48} />}
          title={taskT('models.noEngineModels')}
          description={taskT('models.noEngineModelsHint')}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {models.map((m) => (
            <div key={m.model_id} className="flex items-center gap-3 rounded-md border border-border bg-card p-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                {engineIcon(m.engine)}
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-foreground">{m.model_id}</div>
                <div className="text-xs text-muted-foreground">
                  {taskT('models.modelMeta', { engine: m.engine, size: (m.size_bytes / (1024 * 1024)).toFixed(1), source: m.source })}
                </div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => handleRelease(m.model_id)} aria-label={taskT('models.releaseModel')}>
                <Trash size={16} />
              </Button>
            </div>
          ))}
        </div>
      )}

      {Object.values(tasks).length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-foreground">{taskT('models.downloadTasks')}</h3>
          {Object.values(tasks).map((t) => (
            <div key={t.task_id} className="flex items-center gap-3 rounded-md border border-border bg-card p-3 text-sm">
              <span className="flex-1 text-foreground">{t.model_id || t.task_id.slice(0, 8)}</span>
              <span className="text-muted-foreground">{taskT('models.taskPhase', { phase: t.phase, progress: (t.progress * 100).toFixed(0) })}</span>
              {t.error && <span className="text-red-500">{t.error}</span>}
            </div>
          ))}
        </div>
      )}

      {showDownload && (
        <DownloadModelDialog
          onClose={() => setShowDownload(false)}
          onSubmit={async (req) => {
            setShowDownload(false);
            try {
              const r = await fetch(`${PREFRONTAL_URL}/api/engine-models`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(req),
              });
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
              const body = await r.json();
              pollTask(body.task_id);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          }}
        />
      )}
    </div>
  );
}

function DownloadModelDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (req: { model_id?: string; engine: string; reference: string; revision?: string; sha256?: string }) => void;
}) {
  const { t: dialogT } = useTranslation();
  const [modelId, setModelId] = useState('');
  const [engine, setEngine] = useState('llm');
  const [reference, setReference] = useState('');
  const [sha256, setSha256] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-border bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-foreground">{dialogT('models.newModelTitle')}</h3>
        <div className="flex flex-col gap-2">
          <label className="text-sm text-muted-foreground">{dialogT('models.modelIdLabel')}</label>
          <input
            className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground focus:border-foreground focus:outline-none"
            value={modelId} onChange={(e) => setModelId(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm text-muted-foreground">{dialogT('models.engineLabel')}</label>
          <select
            className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground focus:border-foreground focus:outline-none"
            value={engine} onChange={(e) => setEngine(e.target.value)}
          >
            <option value="llm">{dialogT('models.engineTypeLLM')}</option>
            <option value="tts">{dialogT('models.engineTypeTTS')}</option>
            <option value="asr">{dialogT('models.engineTypeASR')}</option>
            <option value="rerank">{dialogT('models.engineTypeRerank')}</option>
            <option value="embedding">{dialogT('models.engineTypeEmbedding')}</option>
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm text-muted-foreground">{dialogT('models.referenceLabel')}</label>
          <textarea
            className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground focus:border-foreground focus:outline-none"
            value={reference} onChange={(e) => setReference(e.target.value)} rows={2}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm text-muted-foreground">{dialogT('models.sha256Label')}</label>
          <input
            className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground focus:border-foreground focus:outline-none"
            value={sha256} onChange={(e) => setSha256(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={onClose}>{dialogT('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={!reference.trim()}
            onClick={() => onSubmit({
              model_id: modelId.trim() || undefined,
              engine,
              reference: reference.trim(),
              sha256: sha256.trim() || undefined,
            })}
          >
            {dialogT('models.startDownload')}
          </Button>
        </div>
      </div>
    </div>
  );
}
