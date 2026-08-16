import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCortexStore } from '../stores/cortexStore';
import { cortexClient, type FlowMeta } from '../lib/cortexClient';

export function FlowsPage() {
  const { t } = useTranslation();
  const flows = useCortexStore((s) => s.flows);
  const refreshFlows = useCortexStore((s) => s.refreshFlows);
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => { void refreshFlows(); }, [refreshFlows]);

  const run = async (f: FlowMeta) => {
    setRunning(f.id);
    setResult(null);
    try {
      const r = await cortexClient.runFlow(f.name, { example: 'input' });
      setResult(JSON.stringify(r.outputs, null, 2));
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-xl mb-4">{t('flows.title')}</h1>
      <button onClick={refreshFlows} className="mb-4 px-3 py-1 bg-blue-500 text-white rounded">{t('flows.refresh')}</button>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b">
            <th className="text-left p-2">{t('flows.name')}</th>
            <th className="text-left p-2">{t('flows.version')}</th>
            <th className="text-left p-2">{t('flows.tags')}</th>
            <th className="text-left p-2">{t('flows.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {flows.map((f) => (
            <tr key={f.id} className="border-b">
              <td className="p-2">{f.name}</td>
              <td className="p-2">{f.version}</td>
              <td className="p-2">{(f.tags ?? []).join(', ')}</td>
              <td className="p-2">
                <button
                  onClick={() => run(f)}
                  disabled={running === f.id}
                  className="px-2 py-1 bg-green-500 text-white rounded"
                >
                  {running === f.id ? t('flows.running') : t('flows.run')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {result && (
        <pre className="mt-4 p-3 bg-gray-100 rounded text-sm overflow-auto max-h-64">
          {result}
        </pre>
      )}
    </div>
  );
}
