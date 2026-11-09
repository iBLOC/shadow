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
  // ⚠️ **形状闸（最后一道防线）** —— 端脑答歪了 ⇒ ⇒ 客户端会交出 `undefined`
  //   ⇒ ⇒ `sensors.length` ⇒ ⇒ **整页崩**（React 树被卸载）⇒ ⇒ 而
  //   TypeScript 对此**一声不吭** ⇒ ⇒ 这一格不许直接信。
  const sensors = Array.isArray(store.thalamusSensors) ? store.thalamusSensors : [];
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
  const stats = store.hippocampusStats;
  // ⚠️ **同上** —— 「最近记忆」那一格也不许直接信。
  const recent = Array.isArray(store.hippocampusRecent) ? store.hippocampusRecent : [];
  const consolidator = store.consolidatorState;

  return (
    <SettingsCard title={t('subsystem.hippocampus.title')} icon={<RefreshCw size={20} />}>
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center">
          <div className="text-2xl font-bold">{stats?.memory_count ?? '-'}</div>
          <div className="text-xs text-muted-foreground">{t('subsystem.hippocampus.memories')}</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold">{stats?.graph_node_count ?? '-'}</div>
          <div className="text-xs text-muted-foreground">{t('subsystem.hippocampus.graphNodes')}</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold">{stats?.pending_consolidations ?? '-'}</div>
          <div className="text-xs text-muted-foreground">{t('subsystem.hippocampus.pendingConsolidations')}</div>
        </div>
      </div>
      <div className="mb-4">
        <div className="text-sm font-medium mb-2">{t('subsystem.hippocampus.recent')}</div>
        {recent.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('subsystem.hippocampus.noRecent')}</p>
        ) : (
          <div className="max-h-32 overflow-y-auto space-y-1">
            {recent.slice(0, 5).map((mem) => (
              <div key={mem.id} className="text-xs border-b border-border pb-1 last:border-0">
                <div className="font-mono text-muted-foreground truncate">{mem.uri}</div>
                <div className="truncate text-muted-foreground/70">{mem.content.slice(0, 60)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      {consolidator && (
        <div className="border-t border-border pt-4">
          <div className="text-sm font-medium mb-2">{t('subsystem.hippocampus.consolidator')}</div>
          <div className="flex items-center justify-between">
            <div className="text-center">
              <div className="text-xl font-bold">{consolidator.pending}</div>
              <div className="text-xs text-muted-foreground">{t('subsystem.hippocampus.pending')}</div>
            </div>
            <div className="text-right text-xs">
              <div className="text-muted-foreground">{t('subsystem.hippocampus.lastRunAt')}</div>
              <div>{consolidator.last_run_at ? new Date(consolidator.last_run_at).toLocaleString() : '-'}</div>
            </div>
            {consolidator.last_status && (
              <Badge variant={consolidator.last_status === 'success' ? 'default' : 'destructive'}>
                {consolidator.last_status}
              </Badge>
            )}
          </div>
        </div>
      )}
    </SettingsCard>
  );
}

function NeuronPanel() {
  const { t } = useTranslation();
  const store = useSubsystemStore();
  // ⚠️ **不许在这里手写 `as Array<{...}>`** —— 那份手写类型与端脑**没有任何
  //   约束关系** ⇒ ⇒ 端脑发 `engine`、这里写 `quantization` ⇒ ⇒ **谁都不
  //   报错** ⇒ ⇒ 那枚 Badge **永远不显示**。⇒ ⇒ store 那一格已经是端脑
  //   那一侧的真类型 ⇒ ⇒ 这里**直接用** ⇒ ⇒ 漂移 ⇒ ⇒ **类型闸就响**。
  // ⚠️ **同上** —— 「已加载模型」那一格也不许直接信。
  //   （这一格以前**永远渲染不出来**，现在它渲染出来了 ⇒ ⇒ 也就到了
  //    **它自己把整页打崩**的风险面前 ⇒ ⇒ 闸得在这一格也在。）
  const models = Array.isArray(store.neuronModels) ? store.neuronModels : [];

  return (
    <SettingsCard title={t('subsystem.neuron.title')} icon={<RefreshCw size={20} />}>
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">{t('subsystem.neuron.models')}</span>
          <Badge variant="outline">{models.length}</Badge>
        </div>
        {models.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('subsystem.neuron.noModels')}</p>
        ) : (
          <div className="space-y-2">
            {models.map((m) => (
              <div key={m.model_id} className="flex items-center justify-between text-xs">
                <span className="font-mono">{m.model_id}</span>
                <div className="flex gap-1">
                  <Badge variant="secondary" size="sm">{m.capability}</Badge>
                  {m.engine && <Badge variant="outline" size="sm">{m.engine}</Badge>}
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
      <NeuronPanel />
    </div>
  );
}
