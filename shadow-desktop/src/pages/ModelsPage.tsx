import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button, Badge, EmptyState, Loading } from '../components/ui';
import { AddProviderModal } from '../components/business';
import { CapabilityDefaultsCard } from '../components/business/CapabilityDefaultsCard';
import type { ProviderTypeOption } from '../components/business/ProviderForm/types';
import {
  Plus, Trash2, Cpu, TestTube, CheckCircle, XCircle,
  ChevronDown, ChevronRight, Download, Brain, Mic, Ear,
  Trash, Package, RefreshCw, X, Loader2, AlertCircle, Ban, KeyRound
} from 'lucide-react';
import type { ModelProvider } from '../components/business/AddProviderModal/types';
import { isTauri } from '../lib/platform';
import { telencephalonClient } from '../lib/telencephalonClient';
import { adminHeaders } from '../lib/adminToken';

// ⚠️⚠️ **一张面，一个地址**（2026-11-02 起）。
//
// 这一页原来有**两个**后端地址：
//   * `API_BASE`   = `prefrontalUrl()` —— 大脑那张面（供应商 CRUD）；
//   * `NEURON_BASE` = `neuronUrl()`   —— **neuron 自己的端口**（本地模型）。
//
// ⇒ ⇒ 现在**只有一个**：大脑那张面。本地模型那一半也走大脑 —— neuron's
// route table 被端脑挂在**根**上 ⇒ ⇒ `/v1/models` 在大脑面上本来就有
// ⇒ ⇒ 用户拍板：「**坚持嵌入式，所有的入口都在大脑，由大脑负责路由和分发**」。
//
// ⚠️ **base 在「函数里」求值**，不在模块加载时 —— 用户改了大脑地址
// （store 的 `connection.baseUrl`）⇒ ⇒ 这一页必须跟着改 ⇒ ⇒ 而模块级的
// 常量在 import 时就定死了 ⇒ ⇒ 改完设置，这一页还在打老地址 ⇒ ⇒
// 「供应商来自新大脑、本地模型来自老机器」—— 同一个页面两张脸。

// Complete list of supported cloud providers
const CLOUD_PROVIDER_TYPES: ProviderTypeOption[] = [
  { id: 'xiaomi-mimo', name: 'Xiaomi MiMo', color: '#ff6900' },
  { id: 'openai', name: 'OpenAI', color: '#10a37f' },
  { id: 'anthropic', name: 'Anthropic', color: '#d4a574' },
  { id: 'deepseek', name: 'DeepSeek', color: '#6366f1' },
  { id: 'google', name: 'Google', color: '#4285f4' },
  { id: 'groq', name: 'Groq', color: '#2ecc71' },
  { id: 'minimax', name: 'MiniMax', color: '#00d2d3' },
  { id: 'minimax-cn', name: 'MiniMax 中国', color: '#00d2d3' },
  { id: 'moonshot', name: 'Moonshot AI', color: '#8b5cf6' },
  { id: 'moonshot-cn', name: 'Moonshot AI 中国', color: '#8b5cf6' },
  { id: 'zhipu', name: '智谱 AI', color: '#7c3aed' },
  { id: 'qwen', name: '通义千问', color: '#7c3aed' },
  { id: 'openrouter', name: 'OpenRouter', color: '#7c3aed' },
  { id: 'togetherai', name: 'Together AI', color: '#7c3aed' },
  { id: 'cerebras', name: 'Cerebras', color: '#ff6b6b' },
  { id: 'fireworks-ai', name: 'Fireworks AI', color: '#f97316' },
  { id: 'perplexity', name: 'Perplexity', color: '#1e3a5f' },
  { id: 'mistral', name: 'Mistral', color: '#f97316' },
  { id: 'cohere', name: 'Cohere', color: '#f97316' },
  { id: 'huggingface', name: 'Hugging Face', color: '#ffd21e' },
  { id: 'aws-bedrock', name: 'AWS Bedrock', color: '#ff9900' },
  { id: 'azure', name: 'Azure', color: '#0078d4' },
  { id: 'nvidia', name: 'NVIDIA', color: '#76b900' },
  { id: 'cloudflare', name: 'Cloudflare', color: '#f38020' },
  { id: 'modelscope', name: 'ModelScope', color: '#f97316' },
  { id: 'siliconflow', name: 'SiliconFlow', color: '#10a37f' },
  { id: 'siliconflow-cn', name: 'SiliconFlow 中国', color: '#10a37f' },
  { id: 'novita-ai', name: 'Novita AI', color: '#8b5cf6' },
  { id: 'friendli', name: 'Friendli', color: '#7c3aed' },
  { id: 'upstage', name: 'Upstage', color: '#f97316' },
  { id: 'abacus', name: 'Abacus', color: '#10a37f' },
  { id: 'aihubmix', name: 'AIHubMix', color: '#f97316' },
  { id: 'alibaba', name: 'Alibaba', color: '#ff6a00' },
  { id: 'alibaba-cn', name: 'Alibaba 中国', color: '#ff6a00' },
  { id: 'tencent', name: 'Tencent', color: '#ff6a00' },
  { id: 'stepfun', name: 'StepFun', color: '#7c3aed' },
  { id: 'ollama', name: 'Ollama', color: '#6e5494' },
  { id: 'lmstudio', name: 'LM Studio', color: '#8050d4' },
  { id: 'custom', name: 'Custom', color: '#7f8c8d' },
];

const DEFAULT_API_BASE: Record<string, string> = {
  'xiaomi-mimo': 'https://api.xiaomimimo.com/v1',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  deepseek: 'https://api.deepseek.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  groq: 'https://api.groq.com/openai/v1',
  minimax: 'https://api.minimax.chat/v1',
  'minimax-cn': 'https://api.minimaxi.com/v1',
  moonshot: 'https://api.moonshot.cn/v1',
  'moonshot-cn': 'https://api.moonshot.cn/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  qwen: 'https://dashscope.aliyuncs.com/api/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  togetherai: 'https://api.together.xyz/v1',
  cerebras: 'https://api.cerebras.ai/v1',
  'fireworks-ai': 'https://api.fireworks.ai/v1',
  perplexity: 'https://api.perplexity.ai',
  mistral: 'https://api.mistral.ai/v1',
  cohere: 'https://api.cohere.ai/v2',
  huggingface: 'https://api-inference.huggingface.co/v1',
  'aws-bedrock': 'https://bedrock-runtime.amazonaws.com',
  azure: 'https://{your-resource}.openai.azure.com',
  nvidia: 'https://integrate.api.nvidia.com/v1',
  cloudflare: 'https://api.cloudflare.com/v1',
  modelscope: 'https://api.modelscope.cn/v1',
  siliconflow: 'https://api.siliconflow.cn/v1',
  'siliconflow-cn': 'https://api.siliconflow.cn/v1',
  'novita-ai': 'https://api.novita.ai/v1',
  friendli: 'https://api.friendli.ai/v1',
  upstage: 'https://api.upstage.ai/v1',
  abacus: 'https://api.madebyabacus.com/v1',
  aihubmix: 'https://aihubmix.com/v1',
  alibaba: 'https://dashscope.aliyuncs.com/api/v1',
  'alibaba-cn': 'https://dashscope.aliyuncs.com/api/v1',
  tencent: 'https://api.hunyuan.cloud.tencent.com/v1',
  stepfun: 'https://api.stepfun.com/v1',
  ollama: 'http://localhost:11434/v1',
  lmstudio: 'http://localhost:1234/v1',
};

// Model type definitions
type ModelType = 'llm' | 'tts' | 'asr' | 'rerank' | 'embedding' | 'vision';

interface SourceRef {
  id: string;
  endpoint?: string;
  reference: string;
}

interface EngineModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
  engine: string;
  engine_impl: string;
  capabilities: string[];
  available: boolean;
  path?: string;
  size_bytes?: number;
  file_count?: number;
  sources: SourceRef[];
  source: string;
  default_repo?: string;
  is_default?: boolean;
}

interface ModelDownloadTask {
  job_id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | string;
  engine: string;
  reference: string;
  started_at: string;
  finished_at: string | null;
  bytes_downloaded: number;
  total_bytes: number | null;
  current_file: string;
  error: string | null;
  /** Display label for the task (model id). Pulled from the model
   *  the user clicked download on. */
  model_id?: string;
}

const MODEL_TYPE_TABS: { key: ModelType; label: string; icon: React.ReactNode }[] = [
  { key: 'llm', label: 'LLM', icon: <Brain size={16} /> },
  { key: 'tts', label: 'TTS', icon: <Mic size={16} /> },
  { key: 'asr', label: 'ASR', icon: <Ear size={16} /> },
  { key: 'rerank', label: 'Rerank', icon: <RefreshCw size={16} /> },
  { key: 'embedding', label: 'Embedding', icon: <Package size={16} /> },
  { key: 'vision', label: 'Vision', icon: <Cpu size={16} /> },
];

export function ModelsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'cloud' | 'local'>('local');

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1>{t('models.title')}</h1>
      </header>

      {/* ⚠️ 「按能力分档的默认模型」—— 能力段落地即可设（原来只有一个
      「默认模型」槽 ⇒ ⇒ 文本 / 语音识别 / 语音合成 **只能用同一个模型**
      ⇒ ⇒ 语音那一档根本没人管）。 */}
      <CapabilityDefaultsCard />

      {/* Main tabs: Cloud / Local */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        <button
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'cloud'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('cloud')}
        >
          {t('models.cloudProviders')}
        </button>
        <button
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'local'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('local')}
        >
          {t('models.localEngine')}
        </button>
      </div>

      {activeTab === 'cloud' ? (
        isTauri() ? <ProvidersMovedNotice /> : <CloudProvidersTab />
      ) : (
        <LocalEngineTab />
      )}
    </div>
  );
}

/**
 * Tauri mode: the telencephalon `/models/providers` CRUD this tab used is gone
 * (sidecar replaced by the embedded encephalon). Cloud provider management
 * — including preset picking, API keys and per-provider model fetching —
 * lives in ProvidersPage now.
 */
function ProvidersMovedNotice() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-border p-8 text-center">
      <Cpu size={48} className="text-muted-foreground" />
      <div>
        <h3 className="text-base font-medium text-foreground">
          {t('models.providersMoved', '云供应商管理已移至「大模型服务提供商」页面')}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(
            'models.providersMovedDesc',
            '选择预设供应商只需填写 API Key，模型列表自动获取并定期更新'
          )}
        </p>
      </div>
      <Button variant="primary" onClick={() => navigate('/providers')}>
        {t('models.openProviders', '打开供应商管理')}
      </Button>
    </div>
  );
}

// ============================================
// Cloud Providers Tab (original functionality)
// ============================================
function CloudProvidersTab() {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<Record<string, 'success' | 'error' | null>>({});
  const [isLoading, setIsLoading] = useState(true);

  const loadProviders = useCallback(async () => {
    try {
      // ⚠️ **必须带 `X-Admin-Token`** —— `/models/providers` 这张面管着用户的
      // 云端 LLM 密钥、而且能**改这台大脑的上游指向** ⇒ 端脑正在把它放到
      // admin 门后面（**没配 token ⇒ fail-closed**）。
      // ⇒ 拿不到钥匙时**就不带那个头**（端脑回 401，说人话）——
      // 绝不塞一个空值头（空串与空串 `ct_eq` 相等 ⇒ 等于带对了）。
      const BRAIN_BASE = telencephalonClient.getBaseUrl();
      const response = await fetch(`${BRAIN_BASE}/models/providers`, {
        headers: await adminHeaders(),
      });
      if (!response.ok) throw new Error('Failed to load');
      const result = await response.json();
      setProviders(result);
    } catch (e) {
      console.error('Failed to load providers:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadProviders(); }, [loadProviders]);

  const handleDeleteProvider = async (id: string) => {
    try {
      const BRAIN_BASE = telencephalonClient.getBaseUrl();
      await fetch(`${BRAIN_BASE}/models/providers/${id}`, {
        method: 'DELETE',
        headers: await adminHeaders(),
      });
      await loadProviders();
    } catch (e) {
      console.error('Failed to delete provider:', e);
    }
  };

  const handleDeleteModel = async (providerId: string, modelId: string) => {
    try {
      const BRAIN_BASE = telencephalonClient.getBaseUrl();
      await fetch(`${BRAIN_BASE}/models/${providerId}/${modelId}`, {
        method: 'DELETE',
        headers: await adminHeaders(),
      });
      await loadProviders();
    } catch (e) {
      console.error('Failed to delete model:', e);
    }
  };

  const testConnection = async (provider: ModelProvider) => {
    setTestingConnection(provider.id);
    setConnectionStatus(prev => ({ ...prev, [provider.id]: null }));
    try {
      const BRAIN_BASE = telencephalonClient.getBaseUrl();
      const response = await fetch(`${BRAIN_BASE}/models/providers/${provider.id}/test`, {
        method: 'POST',
        headers: await adminHeaders(),
      });
      setConnectionStatus(prev => ({ ...prev, [provider.id]: response.ok ? 'success' : 'error' }));
    } catch {
      setConnectionStatus(prev => ({ ...prev, [provider.id]: 'error' }));
    } finally {
      setTestingConnection(null);
    }
  };

  if (isLoading) return <Loading fullScreen text={t('common.loading')} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button variant="primary" icon={<Plus size={18} />} onClick={() => setShowAddProvider(true)}>
          {t('models.addProvider')}
        </Button>
      </div>

      {providers.length === 0 ? (
        <EmptyState
          icon={<Cpu size={48} />}
          title={t('models.noProviders')}
          description={t('models.noProvidersDesc')}
          action={{ label: t('models.addFirstProvider'), onClick: () => setShowAddProvider(true) }}
        />
      ) : (
        providers.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            isExpanded={expandedProvider === provider.id}
            onToggle={() => setExpandedProvider(expandedProvider === provider.id ? null : provider.id)}
            onDelete={() => handleDeleteProvider(provider.id)}
            onDeleteModel={(modelId) => handleDeleteModel(provider.id, modelId)}
            onTest={() => testConnection(provider)}
            isTesting={testingConnection === provider.id}
            connectionStatus={connectionStatus[provider.id]}
          />
        ))
      )}

      <AddProviderModal 
        isOpen={showAddProvider} 
        onClose={() => setShowAddProvider(false)} 
        onSuccess={loadProviders}
        providerTypes={CLOUD_PROVIDER_TYPES}
        defaultApiBase={DEFAULT_API_BASE}
      />
    </div>
  );
}

function ProviderCard({ provider, isExpanded, onToggle, onDelete, onDeleteModel, onTest, isTesting, connectionStatus }: {
  provider: ModelProvider;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onDeleteModel: (modelId: string) => void;
  onTest: () => void;
  isTesting: boolean;
  connectionStatus: 'success' | 'error' | null | undefined;
}) {
  const { t } = useTranslation();

  const LOGOS: Record<string, { bg: string; text: string }> = {
    'xiaomi-mimo': { bg: '#ff6900', text: 'MiMo' },
    openai: { bg: '#10a37f', text: 'AI' },
    anthropic: { bg: '#d4a574', text: 'AN' },
    google: { bg: '#4285f4', text: 'GO' },
    deepseek: { bg: '#6366f1', text: 'DS' },
    minimax: { bg: '#00d2d3', text: 'MM' },
    moonshot: { bg: '#8b5cf6', text: 'MS' },
    zhipu: { bg: '#7c3aed', text: 'ZP' },
    qwen: { bg: '#7c3aed', text: 'QW' },
    custom: { bg: '#7f8c8d', text: 'CST' },
  };

  const logo = LOGOS[provider.provider_type] || LOGOS.custom;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex cursor-pointer items-center gap-4 p-4 transition-colors hover:bg-muted/50" onClick={onToggle}>
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md text-sm font-bold" style={{ background: logo.bg, color: '#fff' }}>
          {logo.text}
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-foreground">{provider.name}</h3>
          <span className="text-xs capitalize text-muted-foreground">{provider.provider_type}</span>
        </div>
        <div className="flex items-center gap-3 text-muted-foreground">
          <Badge variant="default">{t('models.modelsCount', { count: provider.models.length })}</Badge>
          {connectionStatus === 'success' && <CheckCircle size={16} className="text-green-500" />}
          {connectionStatus === 'error' && <XCircle size={16} className="text-red-500" />}
          {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
        </div>
      </div>

      {isExpanded && (
        <div className="flex flex-col gap-4 border-t border-border bg-muted/30 p-4">
          {provider.api_base && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t('models.apiBase')}:</span>
              <code className="rounded border border-border bg-card px-2 py-0.5 font-mono text-xs text-foreground">{provider.api_base}</code>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {provider.models.map((model) => (
              <div key={model.id} className="flex items-center gap-3 rounded-md border border-border bg-card p-3">
                <div className="flex-1">
                  <span className="text-sm font-medium text-foreground">{model.name}</span>
                  <span className="block font-mono text-xs text-muted-foreground">{model.model_id}</span>
                </div>
                <div className="flex gap-2">
                  {model.is_default && <Badge variant="success" size="sm">{t('models.default')}</Badge>}
                  {model.supports_vision && <Badge variant="info" size="sm">{t('models.vision')}</Badge>}
                </div>
                <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); onDeleteModel(model.id); }}>
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex gap-2 border-t border-border pt-3">
            <Button variant="secondary" size="sm" icon={<TestTube size={14} />} loading={isTesting} onClick={(e) => { e.stopPropagation(); onTest(); }}>
              {t('models.testConnection')}
            </Button>
            <Button variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={(e) => { e.stopPropagation(); onDelete(); }}>
              {t('common.delete')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Local Engine Tab (new implementation)
// ============================================
function LocalEngineTab() {
  const { t } = useTranslation();
  const [models, setModels] = useState<EngineModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<ModelType>('llm');
  // Keyed by `job_id` (server-authoritative id, not model id, so
  // concurrent downloads of the same model don't collide).
  const [jobs, setJobs] = useState<Record<string, ModelDownloadTask>>({});
  const [downloadTarget, setDownloadTarget] = useState<EngineModel | null>(null);
  // Display label for each job — tracked separately from the
  // server payload so we can show "Llama 3 8B" instead of the
  // raw `llm/llama-3-8b` engine-qualified id.
  const [jobLabels, setJobLabels] = useState<Record<string, string>>({});

  // Fetch models filtered by current engine type via the neuron API.
  // The API response already groups entries that share the same
  // (engine, id) across multiple repositories into a single row
  // whose `sources` lists each repo separately.
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const BRAIN_BASE = telencephalonClient.getBaseUrl();
      const r = await fetch(`${BRAIN_BASE}/v1/models?engine=${activeType}`, {
        // ⚠️ **门罩住整张面**（2026-11-03）⇒ ⇒ `/v1/*` 现在也在门型表管辖内
        // ⇒ ⇒ 不递钥匙就是 401 ⇒ ⇒ 带读门的全部钥匙（影子锁 ∪ admin token）。
        headers: await telencephalonClient.readHeaders(),
      });
      if (r.status === 404) { setModels([]); return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = await r.json();
      setModels(body.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unreachable');
    } finally {
      setLoading(false);
    }
  }, [activeType]);

  useEffect(() => { load(); }, [load]);

  const handleRelease = async (modelId: string, engine: string) => {
    try {
      // `model.id` is `<engine>/<id>` (e.g. `llm/gemma-4-e4b-it`).
      // The neuron route is `DELETE /v1/models/{engine}/{id}` — strip
      // the leading `<engine>/` so the URL is `…/llm/gemma-4-e4b-it`,
      // not `…/llm/llm/gemma-4-e4b-it` (which 400s with a
      // "model not found" because the second `llm` is treated as
      // part of the id and fails `validate_model_id`).
      const bareId = modelId.startsWith(`${engine}/`)
        ? modelId.slice(engine.length + 1)
        : modelId;
      const BRAIN_BASE = telencephalonClient.getBaseUrl();
      const r = await fetch(
        `${BRAIN_BASE}/v1/models/${engine}/${encodeURIComponent(bareId)}`,
        {
          method: 'DELETE',
          // ⚠️ 删模型是**写操作** ⇒ ⇒ 落写门（admin）⇒ ⇒ 必须带 admin token。
          headers: await telencephalonClient.readHeaders(),
        },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // Fetch the live job list from neuron, deduped by job_id. Also
  // captures a friendly model label the first time we see a job.
  // Returns whether the runtime answered, so polling can back off
  // when neuron isn't running instead of erroring every interval.
  const refreshJobs = useCallback(async (): Promise<boolean> => {
    try {
      const BRAIN_BASE = telencephalonClient.getBaseUrl();
      const r = await fetch(`${BRAIN_BASE}/v1/models/pull`, {
        headers: await telencephalonClient.readHeaders(),
      });
      if (!r.ok) return false;
      const body = await r.json();
      const list: ModelDownloadTask[] = body.data ?? [];
      setJobs(() => {
        const next: Record<string, ModelDownloadTask> = {};
        for (const job of list) {
          next[job.job_id] = job;
        }
        return next;
      });
      setJobLabels(prev => {
        const next: Record<string, string> = { ...prev };
        for (const job of list) {
          if (!next[job.job_id]) {
            // Fall back to the reference tail (last path segment)
            // until the user clicks a download again.
            next[job.job_id] = job.reference.split(':').pop() || job.reference;
          }
        }
        return next;
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  // Job polling with backoff: 1s while something downloads, 5s idle, and a
  // full stop after 3 consecutive failures (neuron not running) — every
  // further request would only spam the error log. The reconnect hint
  // restarts polling via pollSession.
  const [neuronDown, setNeuronDown] = useState(false);
  const [pollSession, setPollSession] = useState(0);
  const pollFailures = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      const ok = await refreshJobs();
      if (cancelled) return;
      if (ok) {
        pollFailures.current = 0;
        setNeuronDown(false);
      } else {
        pollFailures.current += 1;
        if (pollFailures.current >= 3) {
          setNeuronDown(true);
          return;
        }
      }
      const anyActive = Object.values(jobs).some(j =>
        j.status === 'pending' || j.status === 'in_progress'
      );
      timer = setTimeout(tick, anyActive ? 1000 : 5000);
    };
    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshJobs, pollSession]);

  const retryNeuron = () => {
    pollFailures.current = 0;
    setNeuronDown(false);
    setPollSession(s => s + 1);
  };

  // After any job transitions to completed, refresh the catalog
  // so the card flips from "supported" to "installed".
  useEffect(() => {
    const completedCount = Object.values(jobs).filter(
      j => j.status === 'completed'
    ).length;
    if (completedCount > 0) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs]);

  const cancelJob = async (jobId: string) => {
    try {
      const BRAIN_BASE = telencephalonClient.getBaseUrl();
      await fetch(`${BRAIN_BASE}/v1/models/pull/${jobId}`, {
          method: 'DELETE',
          headers: await telencephalonClient.readHeaders(),
        });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    refreshJobs();
  };

  const clearFinished = () => {
    setJobs(prev => {
      const next: Record<string, ModelDownloadTask> = {};
      const activeIds = new Set<string>();
      for (const [id, job] of Object.entries(prev)) {
        if (job.status === 'pending' || job.status === 'in_progress') {
          next[id] = job;
          activeIds.add(id);
        }
      }
      // Drop labels whose job is no longer in the queue.
      setJobLabels(labels =>
        Object.fromEntries(Object.entries(labels).filter(([id]) => activeIds.has(id)))
      );
      return next;
    });
  };

  // Server already returns models filtered by engine type — no client filtering needed.
  const available = models.filter(m => m.available);
  const supported = models.filter(m => !m.available);

  // Jobs that are still active — used to disable the download
  // button on supported cards.
  const activeJobModelIds = new Set(
    Object.values(jobs)
      .filter(j => j.status === 'pending' || j.status === 'in_progress')
      .map(j => j.model_id)
      .filter((id): id is string => Boolean(id))
  );

  const activeJobs = Object.values(jobs).filter(
    j => j.status === 'pending' || j.status === 'in_progress'
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Model type tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
        {MODEL_TYPE_TABS.map(tab => (
          <button
            key={tab.key}
            className={`flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              activeType === tab.key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveType(tab.key)}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Refresh button (search removed — only supported models shown) */}
      <div className="flex items-center justify-end">
        <Button variant="ghost" size="icon" onClick={load} aria-label={t('common.refresh')}>
          <RefreshCw size={16} />
        </Button>
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
          {error}
        </div>
      )}

      {/* Runtime unreachable — polling stopped to avoid error spam */}
      {neuronDown && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-600">
          <span>
            {t(
              'models.neuronDown',
              '本地推理引擎未连接（neuron :8083）。模型列表与下载需要 neuron 运行。'
            )}
          </span>
          <Button variant="ghost" size="sm" onClick={retryNeuron}>
            {t('common.retry', '重试')}
          </Button>
        </div>
      )}

      {/* Download queue */}
      {(activeJobs.length > 0 || Object.keys(jobs).length > 0) && (
        <DownloadQueue
          jobs={Object.values(jobs)}
          labels={jobLabels}
          onCancel={cancelJob}
          onClearFinished={clearFinished}
        />
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loading text={t('models.loadingModelList')} />
        </div>
      )}

      {/* Available models (downloaded) */}
      {!loading && available.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-foreground">{t('models.installedModels')}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {available.map(model => (
              <InstalledModelCard
                key={model.id}
                model={model}
                onRelease={() => handleRelease(model.id, model.engine)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Supported models (not downloaded) */}
      {!loading && supported.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-foreground">{t('models.recommendedModels')}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {supported.map(model => (
              <SupportedModelCard
                key={model.id}
                model={model}
                isDownloading={activeJobModelIds.has(model.id)}
                onDownload={() => setDownloadTarget(model)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && available.length === 0 && supported.length === 0 && (
        <EmptyState
          icon={<Package size={48} />}
          title={t('models.noModelsOfType')}
          description={t('models.noModelsOfTypeDesc')}
        />
      )}

      {/* Download dialog with source repo selection */}
      {downloadTarget && (
        <DownloadModelDialog
          model={downloadTarget}
          onClose={() => setDownloadTarget(null)}
          onSubmit={async (source, reference) => {
            const target = downloadTarget;
            setDownloadTarget(null);
            try {
              const BRAIN_BASE = telencephalonClient.getBaseUrl();
              const r = await fetch(`${BRAIN_BASE}/v1/models/pull`, {
                method: 'POST',
                // ⚠️ 触发下载是**写操作** ⇒ ⇒ 落写门（admin）⇒ ⇒ 带 admin token。
                headers: {
                  'Content-Type': 'application/json',
                  ...(await telencephalonClient.readHeaders()),
                },
                body: JSON.stringify({
                  id: target.id.split('/').pop() || target.id,
                  engine: target.engine,
                  reference,
                  source,
                }),
              });
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
              const body = await r.json();
              // Tag the new job with the human-readable model id so
              // the queue row can show it immediately (the next poll
              // refresh from server will reconcile).
              setJobLabels(prev => ({ ...prev, [body.job_id]: target.id }));
              setJobs(prev => ({
                ...prev,
                [body.job_id]: {
                  job_id: body.job_id,
                  status: 'pending',
                  engine: target.engine,
                  reference,
                  started_at: new Date().toISOString(),
                  finished_at: null,
                  bytes_downloaded: 0,
                  total_bytes: null,
                  current_file: '',
                  error: null,
                  model_id: target.id,
                },
              }));
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          }}
        />
      )}
    </div>
  );
}

/// Visual representation of a single download job. Renders a
/// progress bar when bytes are flowing, plus status / error text
/// and a cancel button for active jobs.
function DownloadJobRow({ job, label, onCancel }: {
  job: ModelDownloadTask;
  label: string;
  onCancel: (jobId: string) => void;
}) {
  const { t } = useTranslation();
  const isActive = job.status === 'pending' || job.status === 'in_progress';
  const isDone = job.status === 'completed';
  const isFailed = job.status === 'failed' || job.status === 'cancelled';

  const pct = job.total_bytes && job.total_bytes > 0
    ? Math.min(100, Math.round((job.bytes_downloaded / job.total_bytes) * 100))
    : 0;
  const downloadedMB = (job.bytes_downloaded / 1024 / 1024).toFixed(1);
  const totalMB = job.total_bytes ? (job.total_bytes / 1024 / 1024).toFixed(1) : '?';

  const statusColor =
    isDone ? 'text-green-600' :
    isFailed ? (job.status === 'cancelled' ? 'text-muted-foreground' : 'text-red-500') :
    'text-blue-600';

  const StatusIcon =
    isDone ? CheckCircle :
    job.status === 'cancelled' ? Ban :
    isFailed ? XCircle :
    Loader2;

  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-start gap-3">
        <StatusIcon
          size={16}
          className={`mt-0.5 flex-shrink-0 ${statusColor} ${isActive && !isDone ? 'animate-spin' : ''}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium text-foreground">{label}</span>
            <span className={`text-xs font-medium ${statusColor}`}>
              {isActive ? t('models.downloading') :
               isDone ? t('models.installed') :
               job.status === 'cancelled' ? t('models.cancelled') :
               t('models.failed')}
              {isActive && job.total_bytes ? ` · ${pct}%` : ''}
            </span>
          </div>

          <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
            {job.current_file || job.reference}
          </div>

          {(isActive || isDone) && (
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full transition-all ${isDone ? 'bg-green-500' : 'bg-blue-500'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {downloadedMB} / {totalMB} MB
              </span>
            </div>
          )}

          {job.error && (
            <div className="mt-1 flex flex-col gap-2">
              <div className="flex items-start gap-1 text-xs text-red-500">
                <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                <span className="break-all">{job.error}</span>
              </div>
              {job.error.includes('401') && (
                <div className="flex items-center gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 text-xs text-yellow-600 dark:text-yellow-300">
                  <KeyRound size={14} className="flex-shrink-0" />
                  <span>{t('models.gatedModelHint')}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.location.href = '/settings'}
                    className="ml-auto"
                  >
                    {t('models.goToSettings')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {isActive && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onCancel(job.job_id)}
            aria-label={t('models.cancelDownload')}
            title={t('models.cancelDownload')}
          >
            <X size={14} />
          </Button>
        )}
      </div>
    </div>
  );
}

/// Floating-ish panel listing all download jobs (active + recent).
/// Persists across type-tab switches because it's rendered in the
/// parent `LocalEngineTab` (not inside the type-tab scoped data).
function DownloadQueue({ jobs, labels, onCancel, onClearFinished }: {
  jobs: ModelDownloadTask[];
  labels: Record<string, string>;
  onCancel: (jobId: string) => void;
  onClearFinished: () => void;
}) {
  const { t } = useTranslation();
  const active = jobs.filter(j => j.status === 'pending' || j.status === 'in_progress');
  const finished = jobs.filter(j => j.status !== 'pending' && j.status !== 'in_progress');
  const hasFinished = finished.length > 0;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {t('models.downloadQueue')}
          {active.length > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500/15 px-1.5 text-xs font-medium text-blue-600">
              {active.length}
            </span>
          )}
        </h3>
        {hasFinished && (
          <Button variant="ghost" size="sm" onClick={onClearFinished}>
            {t('models.clearFinished')}
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {/* Active first (sorted by started_at desc from server) */}
        {jobs
          .slice()
          .sort((a, b) => (a.started_at < b.started_at ? 1 : -1))
          .map(job => (
            <DownloadJobRow
              key={job.job_id}
              job={job}
              label={labels[job.job_id] ?? job.reference.split(':').pop() ?? job.reference}
              onCancel={onCancel}
            />
          ))}
      </div>
    </div>
  );
}

/// Maps the neuron `engine_impl` string to a friendly label and
/// accent colour so the underlying runtime is immediately visible
/// on every card.
function RuntimeBadge({ impl }: { impl: string }) {
  if (!impl) return null;
  const meta: Record<string, { label: string; color: string }> = {
    candle:   { label: 'candle',   color: 'bg-blue-500/10  text-blue-700  dark:text-blue-300  border-blue-500/30' },
    burn:     { label: 'burn',     color: 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30' },
    mistralrs:{ label: 'mistralrs',color: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30' },
    litert:   { label: 'litert',   color: 'bg-pink-500/10  text-pink-700  dark:text-pink-300  border-pink-500/30' },
    ort:      { label: 'ort',      color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' },
    ultralytics:{ label: 'ultralytics', color: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 border-yellow-500/30' },
  };
  const m = meta[impl] ?? { label: impl, color: 'bg-muted text-muted-foreground border-border' };
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium ${m.color}`}
      title={`底层引擎 / runtime: ${impl}`}
    >
      ⚙ {m.label}
    </span>
  );
}

function InstalledModelCard({ model, onRelease }: {
  model: EngineModel;
  onRelease: () => void;
}) {
  const { t } = useTranslation();
  const sizeStr = model.size_bytes
    ? `${(model.size_bytes / 1024 / 1024).toFixed(0)} MB`
    : '';

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-medium text-foreground">{model.id}</h4>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <RuntimeBadge impl={model.engine_impl} />
          </div>
        </div>
        {sizeStr && <Badge variant="outline" size="sm">{sizeStr}</Badge>}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <CheckCircle size={12} className="text-green-500" />
        <span>{t('models.installed')}</span>
      </div>
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" icon={<Trash size={14} />} onClick={onRelease}>
          {t('models.releaseModel')}
        </Button>
      </div>
    </div>
  );
}

function SupportedModelCard({ model, isDownloading, onDownload }: {
  model: EngineModel;
  isDownloading: boolean;
  onDownload: () => void;
}) {
  const { t } = useTranslation();
  const sourceBadge = (id: string) => {
    if (id === 'modelscope') return { label: 'ModelScope', emoji: '🔧' };
    if (id === 'hf-mirror') return { label: 'HF Mirror', emoji: '🪞' };
    if (id === 'huggingface') return { label: 'HuggingFace', emoji: '🤗' };
    return { label: id, emoji: '📦' };
  };

  // Render each source on its own badge — multiple badges if the
  // model is offered on multiple repositories.
  const sourceBadges = (model.sources ?? []).map(s => {
    const b = sourceBadge(s.id);
    return (
      <Badge key={s.id} variant="outline" size="sm">
        {b.emoji} {b.label}
      </Badge>
    );
  });

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-medium text-foreground">{model.id}</h4>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <RuntimeBadge impl={model.engine_impl} />
          </div>
        </div>
        <div className="flex flex-shrink-0 flex-wrap justify-end gap-1">
          {sourceBadges}
        </div>
      </div>
      {model.default_repo && (
        <div className="text-xs text-muted-foreground truncate">
          {model.default_repo}
        </div>
      )}
      <div className="flex justify-end">
        <Button
          variant="primary"
          size="sm"
          icon={<Download size={14} />}
          loading={isDownloading}
          onClick={onDownload}
        >
          {t('models.download')}
        </Button>
      </div>
    </div>
  );
}

function DownloadModelDialog({ model, onClose, onSubmit }: {
  model: EngineModel;
  onClose: () => void;
  onSubmit: (sourceId: string, reference: string) => void;
}) {
  const { t } = useTranslation();
  const availableSources = model.sources ?? [];

  const [selectedSource, setSelectedSource] = useState(() => {
    if (model.default_repo) {
      const match = availableSources.find(s => s.reference === model.default_repo);
      if (match) return match.id;
    }
    return availableSources[0]?.id ?? '';
  });

  const sourceName = (id: string) =>
    id === 'modelscope' ? 'ModelScope'
    : id === 'hf-mirror' ? 'HF Mirror'
    : id === 'huggingface' ? 'HuggingFace'
    : id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-border bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-foreground">{t('models.downloadTitle')}</h3>

        <div className="rounded-md border border-border bg-muted p-3 text-sm">
          <div className="font-medium text-foreground">{model.id}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <RuntimeBadge impl={model.engine_impl} />
            <Badge variant="outline" size="sm">{model.engine}</Badge>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm text-muted-foreground">{t('models.selectRepo')}</label>
          <div className="flex flex-col gap-2">
            {availableSources.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                {t('models.noRepoAvailable')}
              </div>
            ) : (
              availableSources.map(s => (
                <label key={s.id} className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-background p-3 hover:bg-muted/30">
                  <input
                    type="radio"
                    name="source"
                    value={s.id}
                    checked={selectedSource === s.id}
                    onChange={(e) => setSelectedSource(e.target.value)}
                    className="h-4 w-4"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-foreground">{sourceName(s.id)}</div>
                    <div className="font-mono text-xs text-muted-foreground truncate">{s.reference}</div>
                  </div>
                  {s.reference === model.default_repo && (
                    <span className="text-xs text-muted-foreground">({t('models.default')})</span>
                  )}
                </label>
              ))
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            icon={<Download size={14} />}
            onClick={() => {
              const src = availableSources.find(s => s.id === selectedSource);
              if (src) onSubmit(src.id, src.reference);
            }}
            disabled={!selectedSource}
          >
            {t('models.download')}
          </Button>
        </div>
      </div>
    </div>
  );
}
