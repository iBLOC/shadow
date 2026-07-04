import { useTranslation } from 'react-i18next';
import { Play, Square, RefreshCw, CheckCircle, XCircle, Loader2, AlertCircle, Brain } from 'lucide-react';
import { useEffect, useState } from 'react';
import { safeInvoke } from '../lib/tauriSafe';
import { useCortexStore } from '../stores/cortexStore';
import { cortexClient, type LobeInfo } from '../lib/cortexClient';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { cn } from '../lib/utils';

function LobeCard({ lobe }: { lobe: LobeInfo }) {
  const { t } = useTranslation();
  const healthy = lobe.health_status === 'healthy';
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Brain className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">{lobe.agent_card.name}</CardTitle>
              <CardDescription className="text-xs">
                {lobe.kind} • {lobe.agent_card.metadata.input_modalities.join(', ') || '—'}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {healthy ? (
              <CheckCircle size={16} className="text-green-500" />
            ) : (
              <XCircle size={16} className="text-muted-foreground" />
            )}
            <Badge variant={healthy ? 'success' : 'outline'}>
              {lobe.health_status}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {lobe.agent_card.description && (
          <p className="mb-3 text-xs text-muted-foreground">{lobe.agent_card.description}</p>
        )}
        <div className="flex flex-wrap gap-1">
          {lobe.skills.slice(0, 5).map((s) => (
            <Badge key={s} variant="outline" className="text-xs">
              {s}
            </Badge>
          ))}
          {lobe.skills.length > 5 && (
            <Badge variant="outline" className="text-xs">
              +{lobe.skills.length - 5}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ServicesPage() {
  const { t } = useTranslation();
  const cortex = useCortexStore();
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setBusy(true);
    try {
      await cortex.refreshStatus();
      await cortex.refreshLobes();
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStart = async () => {
    setBusy(true);
    try {
      await cortex.startCortex();
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    try {
      await cortex.stopCortex();
    } finally {
      setBusy(false);
    }
  };

  const isRunning = cortex.status === 'running';
  const isStarting = cortex.status === 'starting';
  const isStopping = cortex.status === 'stopping';

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{t('services.title')}</h1>
          <p className="subtitle">{t('services.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isRunning ? 'success' : 'outline'}>
            {cortex.status}
          </Badge>
          <Button
            size="icon"
            variant="ghost"
            onClick={refresh}
            disabled={busy}
            title={t('services.refresh')}
            aria-label={t('services.refresh')}
          >
            <RefreshCw size={16} className={cn(busy && 'animate-spin')} />
          </Button>
        </div>
      </header>

      <div className="mb-4 flex gap-2">
        {isRunning ? (
          <Button
            variant="destructive"
            onClick={handleStop}
            disabled={busy || isStopping}
            icon={<Square size={16} />}
          >
            {t('services.stop')}
          </Button>
        ) : (
          <Button
            onClick={handleStart}
            disabled={busy || isStarting}
            icon={<Play size={16} />}
          >
            {t('services.start')}
          </Button>
        )}
      </div>

      {!isRunning && cortex.error && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span className="flex-1">{cortex.error}</span>
        </div>
      )}

      <div className="mb-4 rounded-md border border-border bg-muted/20 p-3 text-sm">
        <span className="text-muted-foreground">{t('services.address')}: </span>
        <span className="font-mono">{cortex.connection.baseUrl}</span>
        {cortex.cortexId && (
          <span className="ml-3 text-muted-foreground">
            {t('services.cortexId')}: <span className="font-mono">{cortex.cortexId}</span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cortex.lobes.map((lobe) => (
          <LobeCard key={lobe.name} lobe={lobe} />
        ))}
      </div>

      {isRunning && cortex.lobes.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('services.noLobes')}</p>
      )}

      {!isRunning && (
        <p className="text-sm text-muted-foreground">{t('services.startHint')}</p>
      )}
    </div>
  );
}