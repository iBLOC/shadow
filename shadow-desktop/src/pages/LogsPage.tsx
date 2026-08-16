import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  Filter,
  Trash2,
} from 'lucide-react';
import { useErrorLogStore, type ErrorLogEntry } from '../stores/errorLogStore';
import { formatErrorForClipboard } from '../lib/errorFormatter';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Separator } from '../components/ui/separator';
import type { AppError } from '../stores/errorDialogStore';

type SourceFilter = 'all' | AppError['source'];

const SOURCE_OPTIONS: Array<{ value: SourceFilter; key: string }> = [
  { value: 'all', key: 'logsPage.filterAll' },
  { value: 'http', key: 'common.http' },
  { value: 'react', key: 'common.react' },
  { value: 'unhandled', key: 'common.unhandled' },
  { value: 'promise', key: 'common.promise' },
];

function entryToAppError(entry: ErrorLogEntry): AppError {
  return {
    id: entry.id,
    timestamp: entry.timestamp,
    source: entry.source,
    endpoint: entry.endpoint,
    method: entry.method,
    status: entry.status,
    statusText: entry.statusText,
    message: entry.message,
    stack: entry.stack,
  };
}

export function LogsPage() {
  const { t } = useTranslation();
  const entries = useErrorLogStore((s) => s.entries);
  const clear = useErrorLogStore((s) => s.clear);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (sourceFilter === 'all') return entries;
    return entries.filter((e) => e.source === sourceFilter);
  }, [entries, sourceFilter]);

  const handleCopy = async (entry: ErrorLogEntry) => {
    try {
      const text = formatErrorForClipboard(entryToAppError(entry));
      await navigator.clipboard.writeText(text);
      setCopiedId(entry.id);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // clipboard unavailable
    }
  };

  const handleExport = () => {
    const lines = [
      'id,timestamp,source,endpoint,method,status,message',
      ...filtered.map((e) =>
        [
          e.id,
          e.timestamp,
          e.source,
          e.endpoint ?? '',
          e.method ?? '',
          e.status ?? '',
          JSON.stringify(e.message),
        ].join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shadow-error-log-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sourceLabelKey: Record<AppError['source'], string> = {
    http: 'errorDialog.sourceHttp',
    react: 'errorDialog.sourceReact',
    unhandled: 'errorDialog.sourceUnhandled',
    promise: 'errorDialog.sourcePromise',
  };

  return (
    <div className="space-y-4 p-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t('logsPage.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('logsPage.subtitle', { count: entries.length })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select
              value={sourceFilter}
              onValueChange={(v) => setSourceFilter(v as SourceFilter)}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {t(opt.key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={filtered.length === 0}
          >
            <Download className="mr-1.5 h-4 w-4" />
            {t('logsPage.exportCsv')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={clear}
            disabled={entries.length === 0}
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            {t('logsPage.clear')}
          </Button>
        </div>
      </header>

      <Separator />

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {entries.length === 0
                ? t('logsPage.emptyNone')
                : t('logsPage.emptyFiltered')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((entry) => {
            const expanded = expandedId === entry.id;
            const copied = copiedId === entry.id;
            return (
              <Card key={entry.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <div
                    role="button"
                    tabIndex={0}
                    className="w-full text-left p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() =>
                      setExpandedId(expanded ? null : entry.id)
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setExpandedId(expanded ? null : entry.id);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="destructive" className="text-xs">
                            {t(sourceLabelKey[entry.source])}
                          </Badge>
                          {entry.status !== undefined && (
                            <Badge variant="outline" className="text-xs">
                              {entry.status}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {new Date(entry.timestamp).toLocaleString()}
                          </span>
                        </div>
                        {entry.endpoint && (
                          <p className="text-xs font-mono text-muted-foreground truncate">
                            {entry.method} {entry.endpoint}
                          </p>
                        )}
                        <p className="text-sm mt-1 break-words">
                          {entry.message}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleCopy(entry);
                        }}
                      >
                        {copied ? (
                          <>
                            <Check className="mr-1.5 h-4 w-4" />
                            {t('logsPage.copied')}
                          </>
                        ) : (
                          <>
                            <Copy className="mr-1.5 h-4 w-4" />
                            {t('logsPage.copy')}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                  {expanded && entry.stack && (
                    <div className="border-t bg-muted/30 p-4">
                      <pre className="text-xs overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap break-all">
                        {entry.stack}
                      </pre>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}