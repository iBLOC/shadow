import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSubsystemStore } from '../../../stores/subsystemStore';
import { Badge } from '../../ui/badge';
import { RefreshCw } from 'lucide-react';

interface SettingsCardProps {
  title?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

function SettingsCard({ title, icon, children }: SettingsCardProps) {
  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-border bg-card">
      {title && (
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          {icon && <div className="text-muted-foreground">{icon}</div>}
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          </div>
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

interface SettingRowProps {
  label: string;
  children: React.ReactNode;
}

function SettingRow({ label, children }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
      <div>
        <div className="text-sm font-medium text-foreground">{label}</div>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function ThalamusPanel() {
  const { t } = useTranslation();
  const store = useSubsystemStore();
  const sensors = store.thalamusSensors;
  const refreshAll = store.refreshAll;

  return (
    <SettingsCard title={t('subsystem.thalamus.title')} icon={<RefreshCw size={20} />}>
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">{t('subsystem.thalamus.sensors')}</span>
          <Badge variant="outline">{sensors.length}</Badge>
        </div>
        {sensors.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('subsystem.thalamus.noSensors')}</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {sensors.map((s) => (
              <Badge key={s} variant="secondary" size="sm">{s}</Badge>
            ))}
          </div>
        )}
      </div>
      <SettingRow label={t('subsystem.thalamus.refresh')}>
        <button
          onClick={() => void refreshAll()}
          className="text-xs text-primary hover:underline"
        >
          {t('common.refresh')}
        </button>
      </SettingRow>
    </SettingsCard>
  );
}

function HippocampusPanel() {
  const { t } = useTranslation();
  const store = useSubsystemStore();
  const stats = store.hippocampusStats as { memory_count: number; session_count: number; graph_node_count: number } | null;
  const recent = store.hippocampusRecent;

  return (
    <SettingsCard title={t('subsystem.hippocampus.title')} icon={<RefreshCw size={20} />}>
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center">
          <div className="text-2xl font-bold">{stats?.memory_count ?? '-'}</div>
          <div className="text-xs text-muted-foreground">{t('subsystem.hippocampus.memories')}</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold">{stats?.session_count ?? '-'}</div>
          <div className="text-xs text-muted-foreground">{t('subsystem.hippocampus.sessions')}</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold">{stats?.graph_node_count ?? '-'}</div>
          <div className="text-xs text-muted-foreground">{t('subsystem.hippocampus.graphNodes')}</div>
        </div>
      </div>
      <SettingRow label={t('subsystem.hippocampus.recent')}>
        <Badge variant="outline">{recent.length}</Badge>
      </SettingRow>
    </SettingsCard>
  );
}

function NeurePanel() {
  const { t } = useTranslation();
  const store = useSubsystemStore();
  const models = store.neureModels as Array<{ model_id: string; capability: string; quantization: string | null }>;

  return (
    <SettingsCard title={t('subsystem.neure.title')} icon={<RefreshCw size={20} />}>
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">{t('subsystem.neure.models')}</span>
          <Badge variant="outline">{models.length}</Badge>
        </div>
        {models.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('subsystem.neure.noModels')}</p>
        ) : (
          <div className="space-y-2">
            {models.map((m) => (
              <div key={m.model_id} className="flex items-center justify-between text-xs">
                <span className="font-mono">{m.model_id}</span>
                <div className="flex gap-1">
                  <Badge variant="secondary" size="sm">{m.capability}</Badge>
                  {m.quantization && <Badge variant="outline" size="sm">{m.quantization}</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SettingsCard>
  );
}

export function SubsystemPanel() {
  const { t } = useTranslation();
  const store = useSubsystemStore();
  const startPolling = store.startPolling;
  const refreshAll = store.refreshAll;

  useEffect(() => {
    const stop = startPolling();
    return stop;
  }, [startPolling]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('subsystem.title')}</h2>
        <button
          onClick={() => void refreshAll()}
          className="text-sm text-primary hover:underline"
        >
          {t('common.refreshAll')}
        </button>
      </div>
      <ThalamusPanel />
      <HippocampusPanel />
      <NeurePanel />
    </div>
  );
}
