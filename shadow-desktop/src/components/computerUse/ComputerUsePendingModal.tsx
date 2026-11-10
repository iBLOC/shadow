// R-11 — preview-before-commit modal for computer-use actions.
//
// When the agent (through the MCP wire for cu_*, or via the ACP
// delegation path) wants to drive the host's mouse / keyboard, the
// shadow runtime emits a `computer_use_action` SSE event. The
// ConversationPage renders this modal and asks the user to Proceed
// or Cancel before any cu_* Tauri command runs.
//
// Why this exists: the computer-use gate (SHADOW_COMPUTER_USE_ENABLED
// + cu_set_enabled) controls whether the action PATH is even
// available. R-11 is the second layer — when the path IS available,
// the user gets one-shot confirmation per action. A future "trust
// this device for 5 minutes" toggle (capabilities doc §5.5) would
// elevate this to a session-level consent instead of per-action.

import { useTranslation } from 'react-i18next'
import { MousePointer, Keyboard, AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { invoke } from '@tauri-apps/api/core'
import { formatCuError } from '@/lib/cuErrors'

export type ComputerUseAction =
  | { kind: 'mouse_click'; x: number; y: number; button: 'left' | 'right' | 'middle' }
  | { kind: 'mouse_move'; x: number; y: number }
  | { kind: 'keyboard_type'; text: string }
  | { kind: 'keyboard_combo'; combo: string }

export interface ComputerUsePendingModalProps {
  action: ComputerUseAction | null
  onResolved: () => void
}

function actionLabel(
  action: ComputerUseAction,
  t: (key: string, opts?: Record<string, unknown>) => string,
): { icon: 'mouse' | 'keyboard'; label: string } {
  switch (action.kind) {
    case 'mouse_click':
      return {
        icon: 'mouse',
        label: t('conversation.computerUsePending.actionMouseClick', {
          x: action.x,
          y: action.y,
          button: t(`conversation.computerUsePending.${action.button}`),
        }),
      }
    case 'mouse_move':
      return {
        icon: 'mouse',
        label: t('conversation.computerUsePending.actionMouseMove', {
          x: action.x,
          y: action.y,
        }),
      }
    case 'keyboard_type':
      return {
        icon: 'keyboard',
        label: t('conversation.computerUsePending.actionKeyboardType', {
          count: [...action.text].length,
        }),
      }
    case 'keyboard_combo':
      return {
        icon: 'keyboard',
        label: t('conversation.computerUsePending.actionKeyboardCombo', {
          combo: action.combo,
        }),
      }
  }
}

export function ComputerUsePendingModal({
  action,
  onResolved,
}: ComputerUsePendingModalProps) {
  const { t } = useTranslation()
  const submitting = false // local-only state if needed

  if (!action) return null

  const { icon, label } = actionLabel(action, t)

  async function proceed() {
    if (!action) return
    try {
      switch (action.kind) {
        case 'mouse_click':
          await invoke('cu_mouse_click', {
            x: action.x,
            y: action.y,
            button: action.button,
          })
          break
        case 'mouse_move':
          await invoke('cu_mouse_move', { x: action.x, y: action.y })
          break
        case 'keyboard_type':
          await invoke('cu_keyboard_type', { text: action.text })
          break
        case 'keyboard_combo':
          await invoke('cu_keyboard_combo', { combo: action.combo })
          break
      }
    } catch (e) {
      // Surface the error in the console for v1; a richer error
      // path (re-prompt with "Action failed: <reason>") is P2.
      //
      // ⚠️ cu_* 的失败现在带**投递判定**（code/message/disposition）⇒ ⇒
      // 打印时把判定也带上 ⇒ ⇒ 「可能已经落地」这件事在日志里看得见
      // ⇒ ⇒ 不会再出现「失败长得像什么都没发生」。
      console.error(`cu_* action failed: ${formatCuError(e)}`, e)
    } finally {
      onResolved()
    }
  }

  return (
    <Dialog
      open={action !== null}
      onOpenChange={(open) => {
        if (!open) onResolved()
      }}
    >
      <DialogContent data-testid="computer-use-pending-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {icon === 'mouse' ? (
              <MousePointer className="h-4 w-4" />
            ) : (
              <Keyboard className="h-4 w-4" />
            )}
            {t('conversation.computerUsePending.title')}
          </DialogTitle>
          <DialogDescription>
            {t('conversation.computerUsePending.reviewBefore', {
              action: label,
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
          <code className="font-mono break-all">{label}</code>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={onResolved}
            disabled={submitting}
          >
            {t('conversation.computerUsePending.cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => void proceed()}
            disabled={submitting}
            data-testid="computer-use-proceed"
          >
            {t('conversation.computerUsePending.proceed')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}