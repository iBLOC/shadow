import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Trash2, Check, Loader2, HardDrive, Cpu } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { useModelDownloadStore } from '../stores/modelDownloadStore';

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function ModelCard({ modelId }: { modelId: string }) {
  const { t } = useTranslation();
  const model = useModelDownloadStore((s) =>
    s.availableModels.find((m) => m.id === modelId),
  );
  const progress = useModelDownloadStore((s) => s.downloads[modelId]);
  const downloaded = useModelDownloadStore((s) => s.downloadedIds.has(modelId));
  const startDownload = useModelDownloadStore((s) => s.startDownload);
  const cancelDownload = useModelDownloadStore((s) => s.cancelDownload);
  const removeDownload = useModelDownloadStore((s) => s.removeDownload);

  if (!model) return null;

  const isDownloading = progress?.isDownloading ?? false;
  const isComplete = progress?.isComplete || downloaded;
  const pct = Math.round((progress?.progress ?? (downloaded ? 1 : 0)) * 100);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">
              <Cpu className="h-4 w-4" />
              {model.name}
              {model.recommended && <Badge variant="success">{t('modelDownload.recommended')}</Badge>}
              {isComplete && !isDownloading && (
                <Badge variant="success">{t('modelDownload.downloaded')}</Badge>
              )}
            </CardTitle>
            <CardDescription>
              {t('modelDownload.specs', {
                quant: model.quantization,
                ctx: model.contextLength.toLocaleString(),
                size: formatBytes(model.sizeBytes),
              })}
            </CardDescription>
          </div>
          <HardDrive className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <code className="text-xs text-muted-foreground block break-all">
          {model.repo}/{model.filename}
        </code>

        {(isDownloading || progress?.error) && (
          <div className="space-y-2">
            <Progress value={pct} />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {progress?.downloadedBytes
                  ? `${formatBytes(progress.downloadedBytes)} / ${formatBytes(progress.totalBytes)}`
                  : `${pct}%`}
              </span>
              {progress?.error && (
                <span className="text-destructive">{progress.error}</span>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          {!isDownloading && !isComplete && (
            <Button onClick={() => startDownload(model)} icon={<Download className="h-4 w-4" />}>
              {t('modelDownload.download')}
            </Button>
          )}
          {isDownloading && (
            <Button
              variant="destructive"
              onClick={() => cancelDownload(model.id)}
              icon={<Loader2 className="h-4 w-4 animate-spin" />}
            >
              {t('modelDownload.cancel')}
            </Button>
          )}
          {isComplete && !isDownloading && (
            <Button
              variant="outline"
              onClick={() => removeDownload(model.id)}
              icon={<Trash2 className="h-4 w-4" />}
            >
              {t('modelDownload.remove')}
            </Button>
          )}
          {isComplete && !isDownloading && (
            <Button variant="secondary" icon={<Check className="h-4 w-4" />} disabled>
              {t('modelDownload.ready')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ModelDownloadPage() {
  const { t } = useTranslation();
  const availableModels = useModelDownloadStore((s) => s.availableModels);
  const init = useModelDownloadStore((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{t('modelDownload.title')}</h1>
          <p className="subtitle">{t('modelDownload.subtitle')}</p>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {availableModels.map((m) => (
          <ModelCard key={m.id} modelId={m.id} />
        ))}
      </div>
    </div>
  );
}
