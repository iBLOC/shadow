// R-09 — browser-use list surface. Pages-level panel showing the
// previews currently opened in this shadow session, with a close
// button per row and an ad-hoc "open URL" form (no task context
// required).
//
// We track previews in local React state (no Rust roundtrip for
// the list) because the v1 Rust side is stateless from the
// React app's perspective — preview_open returns immediately and
// preview_close closes by label. The actual OS-level WebView
// windows live independently; this list is the React app's view
// of "what I have open" for UX purposes only. Closing via this
// page invokes the real preview_close Tauri command.

import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink, Eye, Trash2 } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface PreviewEntry {
  taskId: string
  url: string
  openedAt: number
}

const initialEntries: PreviewEntry[] = []

export function PreviewsPage() {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<PreviewEntry[]>(initialEntries)
  const [adHocTaskId, setAdHocTaskId] = useState('')
  const [adHocUrl, setAdHocUrl] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const openAdHoc = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setError('')
      const tid = adHocTaskId.trim()
      const u = adHocUrl.trim()
      if (!tid || !u) return
      setSubmitting(true)
      try {
        await invoke('preview_open', { taskId: tid, url: u })
        setEntries((prev) => {
          // Replace any prior entry for the same task_id (preview_open
          // reuses the window), preserve insertion order otherwise.
          const filtered = prev.filter((e) => e.taskId !== tid)
          return [
            ...filtered,
            { taskId: tid, url: u, openedAt: Date.now() },
          ]
        })
        setAdHocTaskId('')
        setAdHocUrl('')
      } catch (err) {
        setError(String(err))
      } finally {
        setSubmitting(false)
      }
    },
    [adHocTaskId, adHocUrl],
  )

  const close = useCallback(async (taskId: string) => {
    try {
      await invoke('preview_close', { taskId })
      setEntries((prev) => prev.filter((e) => e.taskId !== taskId))
    } catch (err) {
      // Even if the Tauri side fails (e.g. the window is already
      // gone), drop the entry client-side — it's a UI affordance
      // for the user, not a system of record.
      setEntries((prev) => prev.filter((e) => e.taskId !== taskId))
      setError(String(err))
    }
  }, [])

  return (
    <div className="flex flex-col gap-6 p-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            {t('previews.adHocTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={openAdHoc} className="flex flex-col gap-3">
            <div className="grid grid-cols-[160px_1fr] items-center gap-2">
              <Label htmlFor="adhoc-task-id">
                {t('previews.taskIdLabel')}
              </Label>
              <Input
                id="adhoc-task-id"
                value={adHocTaskId}
                onChange={(e) => setAdHocTaskId(e.target.value)}
                placeholder="task-007"
                required
              />
            </div>
            <div className="grid grid-cols-[160px_1fr] items-center gap-2">
              <Label htmlFor="adhoc-url">{t('previews.urlLabel')}</Label>
              <Input
                id="adhoc-url"
                type="url"
                value={adHocUrl}
                onChange={(e) => setAdHocUrl(e.target.value)}
                placeholder="http://localhost:3000"
                required
              />
            </div>
            {error && (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            )}
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={submitting || !adHocTaskId.trim() || !adHocUrl.trim()}
                className="gap-1.5"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {submitting ? t('previews.opening') : t('previews.open')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('previews.openTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('previews.empty')}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {entries
                .slice()
                .sort((a, b) => b.openedAt - a.openedAt)
                .map((entry) => (
                  <li
                    key={entry.taskId}
                    className="flex items-center gap-3 py-2"
                    data-testid={`preview-row-${entry.taskId}`}
                  >
                    <code className="font-mono text-xs">{entry.taskId}</code>
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 truncate text-xs text-muted-foreground hover:text-foreground"
                    >
                      {entry.url}
                    </a>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-[11px] text-destructive hover:bg-destructive/10"
                      onClick={() => void close(entry.taskId)}
                    >
                      <Trash2 className="h-3 w-3" />
                      {t('previews.close')}
                    </Button>
                  </li>
                ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}