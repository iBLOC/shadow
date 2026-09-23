// R-01 — audio event notification chip rendered inside
// ConversationPage when the cortex SSE stream emits an
// `audio_event`. Pairs with the BC-01..05 baby-cry monitoring scenario
// (diencephalon audio pipeline → Notification → ACP → 颞叶 →
// ConversationPage). Until the cortex-side audio classification
// pipeline is wired end-to-end, this component renders when the
// type lands; no live data flows today but the surface is in place.
//
// The shape mirrors the `diencephalon::audio::AudioDetections`
// class the runtime will populate: class id + confidence + source
// label. We deliberately keep this thin — no spectrogram / waveform
// / playback — because the user already sees the audio happen
// (the agent is reacting to live audio on the host machine) and
// the chip is just a confirmation card.

import { Mic } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useTranslation } from 'react-i18next'

export interface AudioEventChipProps {
  classId: string
  confidence: number
  source: string
  timestamp?: number
}

function confidenceTone(
  c: number,
): 'destructive' | 'warning' | 'secondary' | 'success' {
  if (c >= 0.85) return 'success'
  if (c >= 0.6) return 'warning'
  if (c >= 0.3) return 'secondary'
  return 'destructive'
}

export function AudioEventChip({
  classId,
  confidence,
  source,
  timestamp,
}: AudioEventChipProps) {
  const { t } = useTranslation()
  return (
    <Card
      className="border-blue-500/40 bg-blue-500/5"
      data-testid="audio-event-chip"
    >
      <CardContent className="flex items-start gap-3 p-4">
        <Mic className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-500" />
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{t('audioEvent.title')}</p>
            <Badge variant={confidenceTone(confidence)}>
              {t('audioEvent.confidence', {
                pct: Math.round(confidence * 100),
              })}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {t('audioEvent.class', { classId })} · {source}
          </p>
          {timestamp && (
            <p className="font-mono text-[11px] text-muted-foreground">
              {new Date(timestamp).toISOString()}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}