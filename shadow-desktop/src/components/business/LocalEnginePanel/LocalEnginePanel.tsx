import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Badge, EmptyState, Loading } from '../../ui';
import {
  Cpu, CheckCircle, XCircle, Download, Brain, Mic, Ear,
  Trash, Package, RefreshCw, X, Loader2, AlertCircle, Ban, KeyRound
} from 'lucide-react';
import { telencephalonClient } from '../../../lib/telencephalonClient';

// ⚠️ **一张面，一个地址**（2026-11-02 起）——
// 本地模型（`/v1/models*`）由**大脑那张面**转发（neuron's route table
// 挂在端脑面的根上）⇒ ⇒ 客户端**不需要**知道 neuron's 端口。
//
// ⚠️ **base 在「函数里」求值** —— 用户改了大脑地址（store 的
// `connection.baseUrl`）⇒ ⇒ 这一页必须跟着改 ⇒ ⇒ 模块级常量在 import
// 时就定死了 ⇒ ⇒ 改完设置，这一页还在打老地址。

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

export function LocalEnginePanel() {
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
  const refreshJobs = useCallback(async () => {
    try {
      const BRAIN_BASE = telencephalonClient.getBaseUrl();
      const r = await fetch(`${BRAIN_BASE}/v1/models/pull`, {
        headers: await telencephalonClient.readHeaders(),
      });
      if (!r.ok) return;
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
    } catch { /* non-fatal */ }
  }, []);

  // Initial fetch + interval polling. Polling rate is dynamic:
  // tighter (1s) when something is in flight, relaxed (5s) when idle.
  useEffect(() => {
    refreshJobs();
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      refreshJobs();
      const anyActive = Object.values(jobs).some(j =>
        j.status === 'pending' || j.status === 'in_progress'
      );
      if (timer) clearInterval(timer);
      timer = setInterval(tick, anyActive ? 1000 : 5000);
    };
    tick();

    return () => { if (timer) clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshJobs]);

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
        // ⚠️ 取消下载是**写操作** ⇒ ⇒ 落写门（admin）⇒ ⇒ 必须带 admin token。
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
/// parent `LocalEnginePanel` (not inside the type-tab scoped data).
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
