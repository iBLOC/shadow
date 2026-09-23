// DOC-01..DOC-05 — /document/:taskId route wrapper. Mounts the
// <UniverSheet> with the per-task xlsx + a "Back" button that
// returns the user to the conversation surface.

import { useNavigate, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { UniverSheet } from '../components/document/UniverSheet'

export function DocumentPage() {
  const { taskId = '' } = useParams<{ taskId: string }>()
  const navigate = useNavigate()
  const [feishuEnabled, setFeishuEnabled] = useState(false)

  // Fetch the FEISHU_ENABLED setting once on mount. The Tauri command
  // toggles the runtime flag too (see DOC-05), but the v1 cut ships
  // a query-style call so the React side can read the initial
  // state without depending on a Tauri event stream.
  useEffect(() => {
    let cancelled = false
    invoke<boolean>('document_feishu_enabled')
      .then((v) => {
        if (!cancelled) setFeishuEnabled(v)
      })
      .catch(() => {
        // The command may not exist on older builds; treat as off.
      })
    return () => {
      cancelled = true
    }
  }, [taskId])

  if (!taskId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        missing task id
      </div>
    )
  }

  return (
    <UniverSheet
      taskId={taskId}
      feishuEnabled={feishuEnabled}
      onAbort={() => navigate(-1)}
      onPublished={(url) => {
        // DOC-03 success: open the share URL in the system browser
        // via tauri-plugin-opener (already a dep of shadow-desktop).
        // The 颞叶 result card also gets the URL via onPublished —
        // we use a side-channel (window event) so the chat surface
        // doesn't need to re-render this page to display the link.
        window.dispatchEvent(
          new CustomEvent('shadow:feishu-published', { detail: { taskId, url } }),
        )
        navigate('/conversation')
      }}
    />
  )
}
