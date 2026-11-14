import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, Phone, PhoneOff, Volume2, AlertCircle, RefreshCw } from 'lucide-react';
import { useCompanionModeStore } from '../stores/companionModeStore';
import { isTauri } from '../lib/platform';

function StatusBadge({ phase }: { phase: string }) {
  // ⚠️ label 存的是 **i18n 键**，渲染必须过 `t()` —— 之前直接输出键字符串，
  // 界面上永远是「voice.status.idle」这样的原文（翻译表里有词也到不了）。
  const { t } = useTranslation();
  const config: Record<string, { label: string; dot: string }> = {
    idle: { label: 'voice.status.idle', dot: 'bg-muted' },
    connecting: { label: 'voice.status.connecting', dot: 'bg-amber-500 animate-pulse' },
    listening: { label: 'voice.status.listening', dot: 'bg-green-500 animate-pulse' },
    speaking: { label: 'voice.status.speaking', dot: 'bg-blue-500 animate-pulse' },
    processing: { label: 'voice.status.processing', dot: 'bg-purple-500 animate-pulse' },
    barge_in: { label: 'voice.status.bargeIn', dot: 'bg-red-500 animate-pulse' },
    error: { label: 'voice.status.error', dot: 'bg-destructive' },
  };
  const entry = config[phase] ?? config.idle;
  return (
    <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5">
      <span className={`h-2 w-2 rounded-full ${entry.dot}`} aria-hidden="true" />
      <span className="text-sm font-medium">{t(entry.label)}</span>
    </div>
  );
}

export function VoicePage() {
  const { t } = useTranslation();
  const phase = useCompanionModeStore((s) => s.phase);
  const error = useCompanionModeStore((s) => s.error);
  const transcript = useCompanionModeStore((s) => s.transcript);
  const partialTranscript = useCompanionModeStore((s) => s.partialTranscript);
  const turnCount = useCompanionModeStore((s) => s.turnCount);
  const isActive = useCompanionModeStore((s) => s.isActive);
  const start = useCompanionModeStore((s) => s.start);
  const stop = useCompanionModeStore((s) => s.stop);
  const reset = useCompanionModeStore((s) => s.reset);

  const [starting, setStarting] = useState(false);
  const tauri = isTauri();

  useEffect(() => () => void stop(), [stop]);

  const handleToggle = async () => {
    if (isActive) {
      await stop();
    } else {
      setStarting(true);
      await start();
      setStarting(false);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{t('voice.title')}</h1>
          <p className="subtitle">{t('voice.subtitle')}</p>
        </div>
      </header>

      <div className="rounded-lg border bg-card p-8 space-y-6">
        <div className="flex flex-col items-center gap-6 py-6">
          <StatusBadge phase={phase} />

          <button
            onClick={handleToggle}
            disabled={starting}
            aria-label={isActive ? t('voice.stop') : t('voice.start')}
            className={`relative h-32 w-32 rounded-full flex items-center justify-center text-white transition-all ${
              isActive
                ? 'bg-destructive hover:bg-destructive/90'
                : 'bg-primary hover:bg-primary/90'
            } ${starting ? 'opacity-50' : ''}`}
          >
            {isActive ? <PhoneOff className="h-12 w-12" /> : <Phone className="h-12 w-12" />}
            {isActive && (
              <span className="absolute inset-0 rounded-full border-4 border-destructive/40 animate-ping" />
            )}
          </button>

          <div className="text-sm text-muted-foreground">
            {isActive ? t('voice.hint_active') : t('voice.hint_idle')}
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive max-w-md">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p>{error}</p>
                <button
                  onClick={() => {
                    reset();
                    void start();
                  }}
                  className="mt-2 inline-flex items-center gap-1 text-xs underline"
                >
                  <RefreshCw className="h-3 w-3" /> {t('common.retry')}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="border-t pt-6 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Volume2 className="h-4 w-4" />
            <span>{t('voice.transcript')} ({turnCount})</span>
          </div>
          <div className="min-h-32 rounded-md border bg-background p-4 text-sm space-y-2">
            {transcript || partialTranscript ? (
              <>
                {transcript && <p className="whitespace-pre-wrap">{transcript}</p>}
                {partialTranscript && (
                  <p className="text-muted-foreground italic whitespace-pre-wrap">
                    {partialTranscript}
                  </p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground italic">
                {isActive ? t('voice.speakingHint') : t('voice.startHint')}
              </p>
            )}
          </div>
        </div>

        {!tauri && (
          <div className="flex items-start gap-2 rounded-md border bg-muted/50 p-3 text-xs text-muted-foreground">
            <Mic className="h-4 w-4 mt-0.5 shrink-0" />
            <p>
              {t('voice.tip_native')}
              <br />
              {t('voice.tip_https')}
            </p>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <Mic className="h-3 w-3" /> {t('voice.mic')}
            </span>
            <span className="inline-flex items-center gap-1">
              <Volume2 className="h-3 w-3" /> {t('voice.opus')}
            </span>
          </div>
          <span>
            {t('voice.turns')}: {turnCount}
          </span>
        </div>
      </div>
    </div>
  );
}
