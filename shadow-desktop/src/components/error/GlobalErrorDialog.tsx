import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Check, ChevronDown, ChevronUp, Copy } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { Button } from '../ui/button';
import { Separator } from '../ui/separator';
import { useErrorDialogStore } from '../../stores/errorDialogStore';
import { formatErrorForClipboard } from '../../lib/errorFormatter';
import type { AppError } from '../../stores/errorDialogStore';

export function GlobalErrorDialog() {
  const { t } = useTranslation();
  const { current, dismiss, queue } = useErrorDialogStore();
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleCopy = async () => {
    if (!current) return;
    try {
      const text = formatErrorForClipboard(current);
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Clipboard write failed', e);
    }
  };

  if (!current) return null;

  const queueHint = queue.length > 0 ? t('errorDialog.queuedHint', { count: queue.length }) : '';

  const sourceLabelKey: Record<AppError['source'], string> = {
    http: 'errorDialog.sourceHttp',
    react: 'errorDialog.sourceReact',
    unhandled: 'errorDialog.sourceUnhandled',
    promise: 'errorDialog.sourcePromise',
  };

  return (
    <AlertDialog
      open={true}
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
    >
      <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            {t(sourceLabelKey[current.source])}
            {queueHint}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {current.endpoint ? (
              <span className="font-mono text-xs">
                {current.method} {current.endpoint}
                {current.status !== undefined &&
                  ` \u2192 ${current.status} ${current.statusText ?? ''}`}
              </span>
            ) : (
              <span>{t('errorDialog.sourceLabel', { source: current.source })}</span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border bg-muted/50 p-3">
            <p className="text-sm font-medium break-words">
              {current.message}
            </p>
          </div>

          {(current.stack || current.componentStack) && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setExpanded(!expanded)}
                className="w-full justify-between"
              >
                <span>{t('errorDialog.stackTrace')}</span>
                {expanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
              {expanded && (
                <pre className="text-xs bg-muted/50 p-3 rounded-md overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap break-all">
                  {current.componentStack ?? current.stack}
                </pre>
              )}
            </>
          )}

          <Separator />

          <div className="text-xs text-muted-foreground space-y-1">
            <p>{t('errorDialog.timeLabel', { timestamp: current.timestamp })}</p>
            {current.userAgent && (
              <p className="truncate" title={current.userAgent}>
                {t('errorDialog.userAgentLabel', { userAgent: current.userAgent })}
              </p>
            )}
          </div>
        </div>

        <AlertDialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopy}
          >
            {copied ? (
              <>
                <Check className="mr-1.5 h-4 w-4" />
                {t('errorDialog.copied')}
              </>
            ) : (
              <>
                <Copy className="mr-1.5 h-4 w-4" />
                {t('errorDialog.copy')}
              </>
            )}
          </Button>
          <AlertDialogAction onClick={dismiss}>{t('errorDialog.close')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}