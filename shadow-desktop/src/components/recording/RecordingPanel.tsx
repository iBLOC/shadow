// RecordingPanel — main-pane UI for a unified-inbox recording session.
//
// Renders the live recording surface (mode toggle, start/stop button, real-time
// event stream, summary report) for an audio/video conversation. The active
// session entry from the conversation store is the source of truth for the
// sidebar item; backend bookkeeping (events, report) is fetched on demand from
// the cortex recording_store via `recording_*` Tauri commands.
//
// start/stop results are written back through `onSessionChange` so the parent
// page can sync the conversation store entry (timestart, endedAt, wallclock).

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, Video, Square, Play, FileText, Loader2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { Conversation, RecordingMode } from '../../types';

interface BackendRecordingSession {
  id: string;
  mode: RecordingMode;
  started_at: string;
  ended_at: string | null;
  wallclock_start_ms: number;
}

interface RecordingEvent {
  id: string;
  session_id: string;
  event_type: 'audio' | 'video';
  start_rel_ms: number;
  end_rel_ms: number;
  content: string;
  person_ids: string[];
  confidence: number;
}

interface SummaryReport {
  id: string;
  session_id: string;
  text: string;
  topics: string[];
  person_names: string[];
  event_count: number;
  time_range: [number, number];
}

interface RecordingPanelProps {
  session: Conversation;
  onSessionChange: (id: string, updates: Partial<Conversation>) => void;
}

const POLL_INTERVAL_MS = 2000;

function fmtElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function RecordingPanel({ session, onSessionChange }: RecordingPanelProps) {
  const { t } = useTranslation();
  const isAudio = session.kind !== 'video';
  const [events, setEvents] = useState<RecordingEvent[]>([]);
  const [report, setReport] = useState<SummaryReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const live = session.recordingEndedAt === null || session.recordingEndedAt === undefined;

  // 实时轮询：活动会话的 events（与原 RecordingPage 行为一致）。
  useEffect(() => {
    if (!live) return;
    const tick = async () => {
      try {
        const evts = await invoke<RecordingEvent[]>('recording_events', {
          sessionId: session.id,
        });
        setEvents(evts);
      } catch (e) {
        // 会话可能刚结束/不存在 — 静默，下轮再试。
        console.warn('recording_events poll failed', e);
      }
    };
    pollRef.current = setInterval(() => void tick(), POLL_INTERVAL_MS);
    void tick();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [session.id, live]);

  // 加载历史事件（已经结束的会话）：首次挂载拉一次。
  useEffect(() => {
    if (live) return;
    let cancelled = false;
    (async () => {
      try {
        const evts = await invoke<RecordingEvent[]>('recording_events', {
          sessionId: session.id,
        });
        if (!cancelled) setEvents(evts);
        const r = await invoke<SummaryReport | null>('recording_report', {
          sessionId: session.id,
        }).catch(() => null);
        if (!cancelled && r) setReport(r);
      } catch {
        /* noop */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session.id, live]);

  const start = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const s = await invoke<BackendRecordingSession>('recording_start', {
        mode: isAudio ? 'audio' : 'video',
      });
      onSessionChange(session.id, {
        recordingStartedAt: s.started_at,
        recordingEndedAt: s.ended_at,
        recordingWallclockStartMs: s.wallclock_start_ms,
      });
      setEvents([]);
      setReport(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [isAudio, onSessionChange, session.id]);

  const stop = useCallback(async () => {
    if (!live) return;
    setBusy(true);
    try {
      const ended = await invoke<BackendRecordingSession>('recording_stop', {
        sessionId: session.id,
      });
      onSessionChange(session.id, { recordingEndedAt: ended.ended_at });
      const r = await invoke<SummaryReport>('recording_report', {
        sessionId: session.id,
      });
      setReport(r);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [live, onSessionChange, session.id]);

  const elapsed = session.recordingWallclockStartMs
    ? Date.now() - session.recordingWallclockStartMs
    : 0;

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-2">
      {/* 会话控制 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isAudio ? (
              <Mic className="h-4 w-4" />
            ) : (
              <Video className="h-4 w-4" />
            )}
            {t('recording.title')}
          </CardTitle>
          <CardDescription>
            {t(
              isAudio ? 'recording.audioDescription' : 'recording.videoDescription',
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            {live ? (
              <>
                <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-red-500" />
                <span className="font-mono text-lg">{fmtElapsed(elapsed)}</span>
                <span className="text-xs text-muted-foreground">
                  {t('recording.eventCount', { count: events.length })}
                </span>
                <span className="flex-1" />
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void stop()}
                  disabled={busy}
                  className="gap-1.5"
                  data-testid="recording-stop"
                >
                  <Square className="h-4 w-4" />
                  {busy ? t('recording.stopping') : t('recording.stop')}
                </Button>
              </>
            ) : (
              <>
                <span className="inline-block h-3 w-3 rounded-full bg-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {t('recording.idle')}
                </span>
                <span className="flex-1" />
                <Button
                  type="button"
                  onClick={() => void start()}
                  disabled={busy}
                  className="gap-1.5"
                  data-testid="recording-start"
                >
                  <Play className="h-4 w-4" />
                  {busy ? t('recording.starting') : t('recording.start')}
                </Button>
              </>
            )}
          </div>
          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {/* 总结报告 */}
      {report && (
        <Card className="border-green-500/40 bg-green-500/5" data-testid="recording-report">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-green-500" />
              {t('recording.reportTitle')}
            </CardTitle>
            <CardDescription>
              {t('recording.reportMeta', {
                count: report.event_count,
                persons: report.person_names.join(', ') || '—',
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-card p-3 text-sm">
              {report.text}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* 实时事件流 */}
      {events.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('recording.eventsTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border">
            {events.map((e) => (
              <div key={e.id} className="flex items-start gap-3 py-2">
                {e.event_type === 'audio' ? (
                  <Mic className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
                ) : (
                  <Video className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="font-mono">
                      [{fmtElapsed(e.start_rel_ms)} – {fmtElapsed(e.end_rel_ms)}]
                    </span>
                    {e.person_ids.length > 0 && (
                      <span className="rounded-full bg-muted px-1.5">
                        {e.person_ids.join(', ')}
                      </span>
                    )}
                  </div>
                  <p className="text-sm">{e.content}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 加载指示（stop 期间报告生成中） */}
      {busy && (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          {t('recording.generatingReport')}
        </div>
      )}
    </div>
  );
}
