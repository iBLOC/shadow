// R-10 — computer-use entry surface. The Rust `cu_*` Tauri commands
// shipped in P5 (enigo/xcap) + P5+ (Windows UIA) had no React
// callers; this page is the canonical "computer-use home" the user
// reaches from the nav.
//
// The page does only what the v1 capability matrix supports:
//   - displays the gate state (FEISHU-style SHADOW_COMPUTER_USE_ENABLED
//     gate, atomically toggled at runtime via cu_set_enabled)
//   - exposes a "Take screenshot" button that calls cu_screenshot
//     and renders the returned PNG inline
//
// We deliberately do NOT expose mouse_move / mouse_click /
// keyboard_type as buttons here — those would invite the user to
// trigger actions without the agent's intent. The agent drives those
// through the ACP / MCP path; this page is for observation
// (screenshot) and gate toggle only. Per-action preview-before-commit
// (R-11 in the audit) is tracked separately.

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Camera, Power, AlertTriangle, Info } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatCuError } from '@/lib/cuErrors'

interface Screenshot {
  width: number
  height: number
  png: number[] // Tauri IPC serialises Vec<u8> as number[]
}

function bytesToDataUrl(png: number[]): string {
  // Reassemble the byte array into a Uint8Array, then base64-encode
  // for an <img src="data:image/png;base64,..."> tag. Doing this
  // client-side keeps the screen data inside the React process and
  // avoids a round-trip to a separate image-rendering service.
  const u8 = new Uint8Array(png)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < u8.length; i += chunk) {
    binary += String.fromCharCode(...u8.subarray(i, i + chunk))
  }
  return `data:image/png;base64,${btoa(binary)}`
}

export function ComputerUsePage() {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [toggling, setToggling] = useState(false)
  const [screenshot, setScreenshot] = useState<Screenshot | null>(null)
  const [shotError, setShotError] = useState<string>('')
  const [shotting, setShotting] = useState(false)

  useEffect(() => {
    let cancelled = false
    void invoke<boolean>('cu_get_enabled')
      .then((on) => {
        if (!cancelled) setEnabled(on)
      })
      .catch((e) => {
        // ⚠️ cu_* 的失败现在是一个**结构化对象**（code/message/disposition）
        // ⇒ ⇒ 不能直接 String(e)（那会变成 "[object Object]"）⇒ ⇒ 统一走
        // formatCuError（旧的字符串形状也仍然兼容）。
        if (!cancelled) setShotError(formatCuError(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const toggle = useCallback(async () => {
    if (enabled === null) return
    setToggling(true)
    try {
      await invoke('cu_set_enabled', { on: !enabled })
      setEnabled(!enabled)
    } catch (e) {
      setShotError(String(e))
    } finally {
      setToggling(false)
    }
  }, [enabled])

  const takeScreenshot = useCallback(async () => {
    setShotError('')
    setShotting(true)
    try {
      const next = await invoke<Screenshot>('cu_screenshot')
      setScreenshot(next)
    } catch (e) {
      setShotError(formatCuError(e))
    } finally {
      setShotting(false)
    }
  }, [])

  return (
    <div className="flex flex-col gap-4 p-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Power className="h-4 w-4" />
            {t('computerUse.gateTitle')}
          </CardTitle>
          <CardDescription>
            {t('computerUse.gateDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                'inline-block h-2.5 w-2.5 rounded-full',
                enabled === null
                  ? 'bg-muted-foreground'
                  : enabled
                    ? 'bg-green-500'
                    : 'bg-red-500',
              )}
            />
            <span className="text-sm">
              {enabled === null
                ? t('computerUse.gateUnknown')
                : enabled
                  ? t('computerUse.gateOn')
                  : t('computerUse.gateOff')}
            </span>
            <span className="flex-1" />
            <Button
              type="button"
              variant={enabled ? 'destructive' : 'default'}
              disabled={enabled === null || toggling}
              onClick={() => void toggle()}
              data-testid="cu-gate-toggle"
            >
              {enabled ? t('computerUse.gateTurnOff') : t('computerUse.gateTurnOn')}
            </Button>
          </div>
          {!enabled && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <p>{t('computerUse.gateWarning')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-4 w-4" />
            {t('computerUse.screenshotTitle')}
          </CardTitle>
          <CardDescription>
            {t('computerUse.screenshotDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={() => void takeScreenshot()}
              disabled={shotting}
              data-testid="cu-screenshot-button"
            >
              <Camera className="mr-1.5 h-3.5 w-3.5" />
              {shotting ? t('computerUse.capturing') : t('computerUse.capture')}
            </Button>
            {screenshot && (
              <span className="text-xs text-muted-foreground">
                {t('computerUse.captured', {
                  width: screenshot.width,
                  height: screenshot.height,
                })}
              </span>
            )}
          </div>
          {shotError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <p className="font-mono">{shotError}</p>
            </div>
          )}
          {screenshot ? (
            <img
              src={bytesToDataUrl(screenshot.png)}
              alt={t('computerUse.screenshotAlt')}
              className="w-full rounded-md border border-border"
              data-testid="cu-screenshot-img"
            />
          ) : (
            <div className="flex items-center justify-center rounded-md border border-dashed border-border p-12 text-xs text-muted-foreground">
              {t('computerUse.noScreenshotYet')}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Info className="h-3.5 w-3.5" />
            {t('computerUse.notesTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          <ul className="flex list-inside list-disc flex-col gap-1">
            <li>{t('computerUse.noteWindows')}</li>
            <li>{t('computerUse.noteOther')}</li>
            <li>{t('computerUse.noteMcp')}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}