import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Loader2, X } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { telencephalonClient } from '../../lib/telencephalonClient';
import type { NeuronCatalogEntry, NeuronPullJob } from '../../lib/telencephalonClient';
import { AGENT_CAPABILITY_FALLBACK_LABELS } from '../../lib/agentCapabilities';

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

/**
 * neuron **目录下载面** —— 「目录里有、还没下载」的本地模型从这条路进盘。
 *
 * ⚠️ **数据源是 `/v1/models`（neuron 目录面）**，不是 `/models/providers`
 * 里内置条目的读视图 —— 那边没有 `default_repo`／`engine`（发起下载要用的
 * 两样）。与移动端 NeuronDownloadSheet **同一数据源** ⇒ 两端看到的目录一致。
 *
 * ⚠️ 与 GGUF 那张卡（`modelDownloadService`，浏览器 IndexedDB 那条路）是
 * **两套互不相干的下载**：这边走端脑的 `/v1/models/pull`（**服务端**拉权重
 * 进 `$NEURON_MODEL_DIRS`）⇒ 多文件的 candle 仓库（如 moss-image ~27GB）
 * 也装得下；GGUF 那套装不下 ⇒ 不许混用。
 */
export function NeuronCatalogCard({ entry }: { entry: NeuronCatalogEntry }) {
  const { t } = useTranslation();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modelId = entry.id.includes('/')
    ? entry.id.substring(entry.id.indexOf('/') + 1)
    : entry.id;

  const capabilityLabel = entry.capabilities
    .map((c) => AGENT_CAPABILITY_FALLBACK_LABELS[c] ?? c)
    .join(' / ');

  const start = useCallback(async () => {
    if (!entry.default_repo) return;
    setStarting(true);
    setError(null);
    try {
      await telencephalonClient.neuron.pull({
        reference: entry.default_repo,
        engine: entry.engine,
        id: modelId,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  }, [entry.default_repo, entry.engine, modelId]);

  return (
    <Card data-testid={`neuron-catalog-${entry.id}`}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <CardTitle className="flex flex-wrap items-center gap-2">
              {modelId}
              {entry.available ? (
                <Badge variant="success">{t('neuronCatalog.downloaded')}</Badge>
              ) : (
                <Badge variant="secondary">{t('neuronCatalog.notDownloaded')}</Badge>
              )}
            </CardTitle>
            <CardDescription>
              {capabilityLabel ? `${capabilityLabel} · ` : ''}
              {entry.size_bytes ? formatBytes(entry.size_bytes) : t('neuronCatalog.sizeUnknown')}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {entry.default_repo && (
          <code className="text-xs text-muted-foreground block break-all">{entry.default_repo}</code>
        )}
        {error && <div className="text-xs text-destructive break-all">{error}</div>}
        {!entry.available && entry.default_repo && (
          <Button onClick={() => void start()} disabled={starting} icon={
            starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />
          }>
            {t('neuronCatalog.download')}
          </Button>
        )}
        {!entry.default_repo && !entry.available && (
          <div className="text-xs text-muted-foreground">{t('neuronCatalog.noRepo')}</div>
        )}
      </CardContent>
    </Card>
  );
}

/** 一条下载任务行（进度／取消）。 */
function PullJobRow({
  job,
  onChanged,
}: {
  job: NeuronPullJob;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [cancelling, setCancelling] = useState(false);
  const active = job.status === 'pending' || job.status === 'in_progress';
  const pct =
    job.total_bytes && job.total_bytes > 0
      ? Math.round((job.bytes_downloaded / job.total_bytes) * 100)
      : undefined;

  const cancel = useCallback(async () => {
    setCancelling(true);
    try {
      await telencephalonClient.neuron.pullCancel(job.job_id);
      onChanged();
    } finally {
      setCancelling(false);
    }
  }, [job.job_id, onChanged]);

  return (
    <div className="space-y-1 rounded-md border border-border p-2" data-testid={`neuron-pull-${job.job_id}`}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate">
          {job.engine}/{job.reference}
          {job.current_file ? ` · ${job.current_file}` : ''}
        </span>
        {job.status === 'failed' ? (
          <Badge variant="destructive">{t('neuronCatalog.failed')}</Badge>
        ) : job.status === 'completed' ? (
          <Badge variant="success">{t('neuronCatalog.done')}</Badge>
        ) : job.status === 'cancelled' ? (
          <Badge variant="secondary">{t('neuronCatalog.cancelled')}</Badge>
        ) : (
          <span className="text-muted-foreground">{job.status}</span>
        )}
      </div>
      {active && pct != null && <Progress value={pct} />}
      {active && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {formatBytes(job.bytes_downloaded)}
            {job.total_bytes ? ` / ${formatBytes(job.total_bytes)}` : ''}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void cancel()}
            disabled={cancelling}
            icon={cancelling ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
          >
            {t('neuronCatalog.cancel')}
          </Button>
        </div>
      )}
      {job.error && <div className="text-xs text-destructive break-all">{job.error}</div>}
    </div>
  );
}

/** 整个 neuron 目录段（目录条目 ＋ 在跑的下载任务）。 */
export function NeuronCatalogSection() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<NeuronCatalogEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<NeuronPullJob[]>([]);
  const jobsRef = useRef<NeuronPullJob[]>([]);

  const refreshJobs = useCallback(async () => {
    try {
      const next = await telencephalonClient.neuron.pullJobs();
      setJobs(next);
      jobsRef.current = next;
    } catch {
      // 读不到任务列表不炸整个段（目录还在）。
    }
  }, []);

  const refreshCatalog = useCallback(async () => {
    try {
      setEntries(await telencephalonClient.neuron.catalog());
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refreshCatalog();
    void refreshJobs();
  }, [refreshCatalog, refreshJobs]);

  // ⚠️ 有在跑的任务才轮询（5s）—— 目录面与任务面都会被任务完结影响
  //（available 翻绿）⇒ 任务全停了再各刷一次就够。
  useEffect(() => {
    const active = jobs.some((j) => j.status === 'pending' || j.status === 'in_progress');
    if (!active) return;
    const timer = window.setInterval(() => {
      void refreshJobs().then(() => {
        const stillActive = jobsRef.current.some(
          (j) => j.status === 'pending' || j.status === 'in_progress',
        );
        if (!stillActive) void refreshCatalog();
      });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [jobs, refreshJobs, refreshCatalog]);

  return (
    <section className="space-y-3" data-testid="neuron-catalog-section">      <div>
        <h2 className="text-lg font-semibold">{t('neuronCatalog.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('neuronCatalog.subtitle')}</p>
      </div>

      {jobs.filter((j) => j.status !== 'completed').length > 0 && (
        <div className="space-y-2">
          {jobs
            .filter((j) => j.status !== 'completed')
            .map((j) => (
              <PullJobRow key={j.job_id} job={j} onChanged={() => void refreshJobs()} />
            ))}
        </div>
      )}

      {loadError && (
        <Card>
          <CardContent className="text-sm text-destructive break-all">{loadError}</CardContent>
        </Card>
      )}

      {entries === null && !loadError && (
        <Card>
          <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t('neuronCatalog.loading')}
          </CardContent>
        </Card>
      )}

      {entries !== null && entries.length === 0 && (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            {t('neuronCatalog.empty')}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {(entries ?? []).map((e) => (
          <NeuronCatalogCard key={e.id} entry={e} />
        ))}
      </div>
    </section>
  );
}
