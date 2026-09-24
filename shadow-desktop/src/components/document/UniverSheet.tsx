// DOC-01..DOC-05 — Univer spreadsheet editor surface.
//
// Inline React component (no micro-frontend framework — see
// shadow/docs/superpowers/architecture/2026-09-23-qiankun-evaluation.md
// for why qiankun was rejected). Univer is a React npm package
// (@univerjs/presets + @univerjs/sheets) and is mounted directly into
// shadow's main WebView via Tauri (no separate static-asset serving).
//
// The component is deliberately thin: the heavy lifting (load xlsx,
// save snapshot, publish to Feishu) is in the Tauri backend. This
// file only:
//   1. constructs the Univer instance on mount
//   2. loads the per-task workbook via the document_load Tauri command
//   3. debounces onChange → document_save
//   4. exposes a "Publish to Feishu" button → document_publish_feishu
//
// Why a hook + this component, not just inline JSX in DocumentPage:
//   - the Univer instance lifetime is the component lifetime; tearing
//     it down on unmount avoids leaking the heavy xlsx data into the
//     chat surface
//   - the auto-save debouncer needs stable refs to the univer API and
//     the latest taskId (props change when the user navigates to a
//     different task's /document/:taskId route)

import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { createUniver, FUniver, Univer } from '@univerjs/presets'
import { LocaleType, mergeLocales } from '@univerjs/core'
import { enUS } from '@univerjs/presets/preset-sheets-core/locales/en-US'
import { zhCN } from '@univerjs/sheets-zh'

export interface UniverSheetProps {
  taskId: string
  /** Path inside `~/.shadow/results/<taskId>/` to load. v1 always
   *  uses `summary.xlsx` (set by document_load in lib.rs). Kept as
   *  a prop so the future template registry (DOC-08) can swap it. */
  source?: string
  /** Feishu integration toggle (DOC-05). When false the
   *  "Publish to Feishu" button is hidden entirely. */
  feishuEnabled: boolean
  /** Called with the published Feishu share URL when publish
   *  succeeds. The 颞叶 result card uses this. */
  onPublished?: (url: string) => void
  /** Called when the user wants to abort (e.g. clicks "Back"). */
  onAbort?: () => void
}

const SAVE_DEBOUNCE_MS = 2000

export function UniverSheet(props: UniverSheetProps) {
  const { taskId, feishuEnabled, onPublished, onAbort } = props
  const containerRef = useRef<HTMLDivElement | null>(null)
  const univerRef = useRef<Univer | null>(null)
  const apiRef = useRef<FUniver | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  )
  const [errorMsg, setErrorMsg] = useState<string>('')

  useEffect(() => {
    let disposed = false
    async function mount() {
      if (!containerRef.current) return
      try {
        // Construct Univer — locale switcher based on the user's
        // preference (English is the default; Chinese locale is
        // bundled so PRC users get native labels without a runtime
        // fetch).
        const univer = createUniver({
          locale: LocaleType.ZH_CN,
          locales: {
            [LocaleType.ZH_CN]: mergeLocales(zhCN),
            [LocaleType.EN_US]: mergeLocales(enUS),
          },
        })
        if (disposed) {
          univer.dispose()
          return
        }
        univerRef.current = univer
        apiRef.current = FUniver.newAPI(univer)

        // Load the per-task xlsx. Failures here are surfaced in the
        // UI rather than thrown — the agent can still see something.
        const bytes = await invoke<number[]>('document_load', { taskId })
        const u8 = new Uint8Array(bytes)
        // DOC-01: open the workbook. Univer's FacAPI does the xlsx
        // parse in-worker. Errors here mean the task has no
        // summary.xlsx yet (agent hasn't produced one); surface as
        // an empty workbook so the user can still start typing.
        try {
          apiRef.current.createWorkbookFromBytes(u8, {
            // Pass the task id as the sheet title for orientation
            // — the user can rename it.
            sheetName: taskId,
          })
        } catch (e) {
          // No existing xlsx — start with an empty one. This is
          // the common case for tasks where the agent hasn't
          // produced a summary yet.
          apiRef.current.createWorkbook({ name: taskId })
        }
        if (disposed) return
        setStatus('ready')
      } catch (e) {
        setErrorMsg(String(e))
        setStatus('error')
      }
    }
    mount()
    return () => {
      disposed = true
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      univerRef.current?.dispose()
      univerRef.current = null
      apiRef.current = null
    }
  }, [taskId])

  // DOC-02 — debounced auto-save. We hook into Univer's
  // `onChange` via a tiny ad-hoc setInterval that watches the
  // workbook's dirty flag. The `setInterval` 250ms poll is cheap
  // (workbook dirty flag is a single boolean read) and keeps the
  // hook surface minimal — Univer's official lifecycle hooks
  // require us to register plugins we don't otherwise need.
  useEffect(() => {
    const t = setInterval(() => {
      if (status !== 'ready') return
      const api = apiRef.current
      if (!api) return
      try {
        const wb = api.getActiveWorkbook?.()
        if (!wb) return
        // No public dirty flag in v0.6 — instead we compare the
        // current snapshot to a stored baseline. Cheap and explicit.
        const snap = api.getWorkbookSnapshot?.(wb.getId?.())
        if (!snap) return
        if (snap === lastSnapshotRef.current) return
        lastSnapshotRef.current = snap
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(async () => {
          try {
            const bytes = await api.getWorkbookBlob?.(wb.getId?.())
            if (bytes) {
              await invoke('document_save', { taskId, snapshot: Array.from(bytes) })
            }
          } catch (e) {
            console.error('document_save failed', e)
          }
        }, SAVE_DEBOUNCE_MS)
      } catch {
        // Silently swallow — the poll is best-effort and Univer's
        // internal state can briefly be unavailable during a refresh.
      }
    }, 250)
    return () => clearInterval(t)
  }, [taskId, status])

  // DOC-03 — publish. Slices the current workbook into a
  // sheets-of-rows shape and hands it to the Tauri command which
  // orchestrates the create/write/share sequence with DOC-04
  // rollback on any failure.
  async function onPublish() {
    const api = apiRef.current
    if (!api) return
    try {
      const wb = api.getActiveWorkbook?.()
      if (!wb) return
      const sheets: string[][][] = []
      const meta = wb.getSheets?.() ?? []
      for (const s of meta) {
        const range = api.getRangeBySheet?.(s.id, 'A1:Z1000')
        const values: string[][] = []
        if (range?.getValues) {
          for (const row of range.getValues()) {
            values.push(row.map((v: unknown) => String(v ?? '')))
          }
        }
        sheets.push(values)
      }
      const title = taskId
      const sheet = await invoke<{ url: string }>('document_publish_feishu', {
        taskId,
        title,
        folderToken: null,
        sheets,
      })
      onPublished?.(sheet.url)
    } catch (e) {
      // Tauri command already returned the rollback error message
      // (DOC-04); show it inline so the user can retry or pick
      // a different sheet name.
      setErrorMsg(String(e))
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2 text-sm">
        <span className="font-mono">{taskId}</span>
        {status === 'loading' && (
          <span>{t('conversation.documentEditor.loading')}</span>
        )}
        {status === 'error' && (
          <span className="text-destructive">
            {t('conversation.documentEditorError.loadFailed')}: {errorMsg}
          </span>
        )}
        {status === 'ready' && (
          <span className="text-muted-foreground">
            {t('conversation.documentEditor.ready')}
          </span>
        )}
        <span className="flex-1" />
        {onAbort && (
          <button
            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
            onClick={onAbort}
          >
            {t('conversation.documentEditor.back')}
          </button>
        )}
        {feishuEnabled && status === 'ready' && (
          <button
            className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
            onClick={onPublish}
          >
            {t('conversation.documentEditor.publishToFeishu')}
          </button>
        )}
      </div>
      <div
        ref={containerRef}
        className="flex-1 min-h-0"
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  )
}

const lastSnapshotRef = { current: '' as string | null }
