import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Workflow, Play } from 'lucide-react';
import { useTelencephalonStore } from '../stores/telencephalonStore';
import { telencephalonClient, type FlowMeta } from '../lib/telencephalonClient';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';

export function FlowsPage() {
  const { t } = useTranslation();
  const flows = useTelencephalonStore((s) => s.flows);
  const refreshFlows = useTelencephalonStore((s) => s.refreshFlows);
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => { void refreshFlows(); }, [refreshFlows]);

  const run = async (f: FlowMeta) => {
    setRunning(f.id);
    setResult(null);
    try {
      const r = await telencephalonClient.runFlow(f.name, { example: 'input' });
      setResult(JSON.stringify(r.outputs, null, 2));
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1>{t('flows.title')}</h1>
          <p className="subtitle">{t('flows.subtitle')}</p>
        </div>
        <Button variant="ghost" icon={<RefreshCw size={18} />} onClick={() => void refreshFlows()}>
          {t('flows.refresh')}
        </Button>
      </header>

      <Card>
        <CardContent className="p-0">
          {flows.length === 0 ? (
            <EmptyState
              icon={<Workflow size={48} />}
              title={t('flows.emptyTitle')}
              description={t('flows.emptyHint')}
              size="sm"
              className="py-12"
            />
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left text-sm text-muted-foreground">
                  <th className="px-4 py-3 font-medium">{t('flows.name')}</th>
                  <th className="px-4 py-3 font-medium">{t('flows.version')}</th>
                  <th className="px-4 py-3 font-medium">{t('flows.tags')}</th>
                  <th className="px-4 py-3 font-medium">{t('flows.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {flows.map((f) => (
                  <tr key={f.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 text-sm font-medium">{f.name}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{f.version}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {(f.tags ?? []).join(', ')}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        size="sm"
                        variant="outline"
                        icon={<Play size={14} />}
                        loading={running === f.id}
                        onClick={() => void run(f)}
                      >
                        {running === f.id ? t('flows.running') : t('flows.run')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {result && (
        <pre className="max-h-64 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-sm">
          {result}
        </pre>
      )}
    </div>
  );
}
