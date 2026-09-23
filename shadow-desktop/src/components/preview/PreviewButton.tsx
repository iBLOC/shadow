// R-08 — browser-use entry point inside TaskDetailDialog. Opens a
// small URL-prompt dialog; on submit, calls the Rust
// `preview_open(task_id, url)` Tauri command which spawns a
// dedicated Tauri WebviewWindow (see src-tauri/src/preview_window.rs
// + the qiankun doc for why this is per-window and not embedded).
//
// The button itself is intentionally tiny — a "Preview" label with
// an external-link icon — because the dialog does the real work.
// This keeps the task overview scannable while still making the
// capability discoverable.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink, Eye } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface PreviewButtonProps {
  taskId: string
  /** Optional default URL pre-filled (e.g. when the task already has
   *  a deployment URL in metadata). Lets the user skip the "what
   *  URL" step when the answer is obvious. */
  defaultUrl?: string
}

export function PreviewButton({ taskId, defaultUrl = '' }: PreviewButtonProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState(defaultUrl)
  const [error, setError] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      // R-08 main call: spawn the WebviewWindow. Backend reuses
      // an existing preview-<task_id> window if open (per
      // preview_window.rs semantics).
      await invoke('preview_open', { taskId, url })
      setOpen(false)
    } catch (err) {
      setError(String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 text-xs"
        onClick={() => {
          setUrl(defaultUrl)
          setOpen(true)
        }}
        // TaskDetailDialog renders many buttons; data-testid lets
        // the upcoming e2e harness target this one specifically.
        data-testid={`preview-button-${taskId}`}
      >
        <Eye className="h-3.5 w-3.5" />
        {t('preview.openInWindow')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('preview.dialogTitle', { taskId })}</DialogTitle>
            <DialogDescription>
              {t('preview.dialogDescription')}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="preview-url">{t('preview.urlLabel')}</Label>
              <Input
                id="preview-url"
                type="url"
                placeholder="http://localhost:3000"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                autoFocus
                required
              />
              <p className="text-[11px] text-muted-foreground">
                {t('preview.urlHint')}
              </p>
            </div>
            {error && (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={submitting}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={submitting || !url.trim()}
                className="gap-1.5"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {submitting ? t('preview.opening') : t('preview.open')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}