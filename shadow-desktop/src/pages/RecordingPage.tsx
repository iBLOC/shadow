// 记录模式 — 录音/录像会话 UI (recording-mode spec §8)。
//
// 交互面：模式选择（🎤 录音 / 🎬 录像）、开始/停止大按钮、
// 实时事件流（轮询 recording_events，2s 间隔）、会话历史列表、
// 报告卡片（recording_report，展示总结正文 + 参与人 + LanceGraph
// 边数量）。事件渲染复用 chat 流的 chip 风格（AudioEventChip 的
// 蓝色调 / 视频事件绿色调），报告卡片复用 FeishuPublishedCard 的
// 成功卡片模式。

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Mic,
  Video,
  Square,
  Play,
  History,
  FileText,
  Loader2,
} from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type RecordingMode = 'audio' | 'video'

interface RecordingSession {
  id: string
  mode: RecordingMode
  started_at: string
  ended_at: string | null
  wallclock_start_ms: number
}

interface RecordingEvent {
  id: string
  session_id: string
  event_type: 'audio' | 'video'
  start_rel_ms: number
  end_rel_ms: number
  content: string
  person_ids: string[]
  confidence: number
}

interface SummaryReport {
  id: string
  session_id: string
  text: string
  topics: string[]
  person_names: string[]
  event_count: number
  time_range: [number, number]
}

const POLL_INTERVAL_MS = 2000

function fmtElapsed(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

function fmtRel(ms: number): string {
  return fmtElapsed(ms)
}

export function RecordingPage() {
  const { t } = useTranslation()
  const [mode, setMode] = useState<RecordingMode>('audio')
  const [session, setSession] = useState<RecordingSession | null>(null)
  const [events, setEvents] = useState<RecordingEvent[]>([])
  const [report, setReport] = useState<SummaryReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<RecordingSession[]>([])
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 会话历史（进入页面拉一次）。
  const refreshHistory = useCallback(async () => {
    try {
      const list = await invoke<RecordingSession[]>('recording_list')
      setHistory(list)
    } catch {
      // 忽略 — 列表为空即可。
    }
  }, [])

  useEffect(() => {
    void refreshHistory()
  }, [refreshHistory])

  // 实时轮询：活动会话的 status + events。
  useEffect(() => {
    if (!session || session.ended_at) return
    const tick = async () => {
      try {
        const st = await invoke<{ event_count: number }>('recording_status', {
          sessionId: session.id,
        })
        if (st.event_count !== events.length) {
          const evts = await invoke<RecordingEvent[]>('recording_events', {
            sessionId: session.id,
          })
          setEvents(evts)
        }
      } catch (e) {
        // 会话可能刚结束/不存在 — 静默，下轮再试。
        console.warn('recording_status poll failed', e)
      }
    }
    pollRef.current = setInterval(() => void tick(), POLL_INTERVAL_MS)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [session, events.length])

  const start = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const s = await invoke<RecordingSession>('recording_start', { mode })
      setSession(s)
      setEvents([])
      setReport(null)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }, [mode])

  const stop = useCallback(async () => {
    if (!session) return
    setBusy(true)
    try {
      const ended = await invoke<RecordingSession>('recording_stop', {
        sessionId: session.id,
      })
      setSession(ended)
      // 拉取总结报告（后端 report 命令幂等：已有则返回已有）。
      const r = await invoke<SummaryReport>('recording_report', {
        sessionId: session.id,
      })
      setReport(r)
      void refreshHistory()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }, [session, refreshHistory])

  const elapsed = session
    ? Date.now() - session.wallclock_start_ms
    : 0
  const live = session !== null && session.ended_at === null

  return (
    <div className="flex flex-col gap-4 p-2">
      {/* 会话控制 */}
      <Card>
        <CardHeader>
          <CardTitle>{t('recording.title')}</CardTitle>
          <CardDescription>{t('recording.description')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={mode === 'audio' ? 'default' : 'outline'}
              disabled={live}
              onClick={() => setMode('audio')}
              className="gap-1.5"
              data-testid="recording-mode-audio"
            >
              <Mic className="h-4 w-4" />
              {t('recording.modeAudio')}
            </Button>
            <Button
              type="button"
              variant={mode === 'video' ? 'default' : 'outline'}
              disabled={live}
              onClick={() => setMode('video')}
              className="gap-1.5"
              data-testid="recording-mode-video"
            >
              <Video className="h-4 w-4" />
              {t('recording.modeVideo')}
            </Button>
          </div>

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
                      [{fmtRel(e.start_rel_ms)} – {fmtRel(e.end_rel_ms)}]
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

      {/* 会话历史 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            {t('recording.historyTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('recording.historyEmpty')}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {history.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-2 text-sm">
                  {s.mode === 'audio' ? (
                    <Mic className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Video className="h-4 w-4 text-muted-foreground" />
                  )}
                  <code className="font-mono text-xs">{s.id}</code>
                  <span className="flex-1" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-[11px]"
                    onClick={async () => {
                      setSession(s)
                      setEvents(await invoke<RecordingEvent[]>('recording_events', { sessionId: s.id }))
                      const r = await invoke<SummaryReport | null>('recording_report', {
                        sessionId: s.id,
                      }).catch(() => null)
                      if (r) setReport(r)
                    }}
                  >
                    {t('recording.viewReport')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* 加载指示（stop 期间报告生成中） */}
      {busy && live === false && (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          {t('recording.generatingReport')}
        </div>
      )}
    </div>
  )
}
