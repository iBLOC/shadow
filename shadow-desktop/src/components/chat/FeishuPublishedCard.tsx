// DOC-03 share-URL card. Rendered inside ConversationPage when the
// `shadow:feishu-published` CustomEvent fires from DocumentPage's
// `onPublished` callback. Closes the gap that the audit flagged:
// the user gets a clickable Feishu link back in chat after the
// preview window closes.
//
// The card is intentionally compact — long Feishu URLs are
// truncated — and uses the same surface shape as ToolOutputCard so
// it slots into the existing message stream rendering loop without a
// new container type.

import { ExternalLink, FileSpreadsheet } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { FeishuPublished } from '@/types'
import { useTranslation } from 'react-i18next'

export interface FeishuPublishedCardProps {
  data: FeishuPublished
}

function truncateUrl(url: string, max = 56): string {
  if (url.length <= max) return url
  return `${url.slice(0, max - 1)}…`
}

export function FeishuPublishedCard({ data }: FeishuPublishedCardProps) {
  const { t } = useTranslation()
  return (
    <Card className="border-green-500/40 bg-green-500/5" data-testid="feishu-published-card">
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-500" />
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <p className="text-sm font-medium">{t('feishuPublished.title')}</p>
            <p className="text-xs text-muted-foreground truncate">
              {data.title}
            </p>
          </div>
        </div>
        <a
          href={data.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <code className="font-mono truncate flex-1">{truncateUrl(data.url)}</code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[11px]"
            // Clicking the button (vs the link) opens in the system
            // browser via the Tauri opener plugin — the link
            // element above does a regular new-tab navigation
            // which works in PWAs but is captured by Tauri in the
            // desktop shell. The button path is the canonical
            // "open in Feishu" affordance.
            onClick={(e) => {
              e.preventDefault()
              // Defer the actual openUrl call to the consumer so
              // tests can mock it; here we just bubble the event up
              // through window.openUrl (provided by the host) — the
              // Tauri opener plugin is wired in lib.rs as
              // tauri-plugin-opener. Falling back to the plain anchor
              // when opener is unavailable (e.g. web build).
              try {
                // Lazy import so the web build doesn't try to
                // resolve the Tauri plugin during SSR / type-check.
                // The plugin's openUrl is async; fire-and-forget.
                void import('@tauri-apps/plugin-opener')
                  .then((m) => m.openUrl(data.url))
                  .catch(() => window.open(data.url, '_blank'))
              } catch {
                window.open(data.url, '_blank')
              }
            }}
          >
            <ExternalLink className="mr-1 h-3 w-3" />
            {t('feishuPublished.open')}
          </Button>
        </a>
      </CardContent>
    </Card>
  )
}