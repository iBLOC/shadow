import { useTranslation } from 'react-i18next';
import { Database, Globe, Monitor, Minimize2, Eye, EyeOff, Sun, Moon, RefreshCw, Server, CheckCircle, XCircle, HelpCircle, Wifi, WifiOff, Plug, Unplug, Plus, Trash2, type LucideIcon } from 'lucide-react';
import { safeInvoke } from '../lib/tauriSafe';
import { isTauri } from '../lib/platform';
import { useEffect, useState } from 'react';
import { useThemeStore } from '../stores/themeStore';
import { useServiceStore, type ServiceStatus, type ServiceInfo, type ResonanceInstance } from '../stores/serviceStore';
import { useCortexStore } from '../stores/cortexStore';
import { useResonanceStore } from '../stores/resonanceStore';
import { SettingsCard } from '../components/business';
import { DatabaseSettings } from '../components/DatabaseSettings';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Separator } from '../components/ui/separator';
import { cn } from '../lib/utils';

const STATUS_CONFIG: Record<ServiceStatus, { icon: LucideIcon; colorClass: string; labelKey: string }> = {
  healthy: { icon: CheckCircle, colorClass: 'text-green-500', labelKey: 'settings.healthy' },
  unhealthy: { icon: XCircle, colorClass: 'text-red-500', labelKey: 'settings.unhealthy' },
  offline: { icon: XCircle, colorClass: 'text-red-500', labelKey: 'settings.offline' },
  checking: { icon: RefreshCw, colorClass: 'text-yellow-500', labelKey: 'settings.checking' },
  unknown: { icon: HelpCircle, colorClass: 'text-muted-foreground', labelKey: 'settings.unknown' },
};

function ResonanceInstanceEditor() {
  const { t } = useTranslation();
  const instances = useServiceStore((s) => s.resonanceInstances);
  const add = useServiceStore((s) => s.addResonanceInstance);
  const update = useServiceStore((s) => s.updateResonanceInstance);
  const remove = useServiceStore((s) => s.removeResonanceInstance);
  const setPrimary = useServiceStore((s) => s.setPrimaryResonance);

  const [draftName, setDraftName] = useState('');
  const [draftHost, setDraftHost] = useState('');
  const [draftPort, setDraftPort] = useState('8080');

  const handleAdd = () => {
    if (!draftName.trim() || !draftHost.trim()) return;
    add({
      name: draftName.trim(),
      host: draftHost.trim(),
      port: parseInt(draftPort, 10) || 8080,
      enabled: true,
      isPrimary: false,
    });
    setDraftName('');
    setDraftHost('');
    setDraftPort('8080');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-4 w-4" /> {t('settings.resonanceInstances')}
        </CardTitle>
        <CardDescription>{t('settings.resonanceInstancesDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {instances.length === 0 ? (
          <p className="rounded-md border border-dashed border-muted-foreground/30 p-4 text-center text-sm text-muted-foreground">
            {t('settings.noResonanceInstances')}
          </p>
        ) : (
          <div className="space-y-2">
            {instances.map((inst) => (
              <ResonanceInstanceRow
                key={inst.id}
                instance={inst}
                onUpdate={update}
                onRemove={remove}
                onSetPrimary={setPrimary}
              />
            ))}
          </div>
        )}

        <Separator />

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            {t('settings.addResonanceInstance')}
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_120px_auto]">
            <Input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder={t('settings.instanceNamePlaceholder')}
            />
            <Input
              value={draftHost}
              onChange={(e) => setDraftHost(e.target.value)}
              placeholder="192.168.1.10"
            />
            <Input
              type="number"
              value={draftPort}
              onChange={(e) => setDraftPort(e.target.value)}
              placeholder="8080"
            />
            <Button onClick={handleAdd} icon={<Plus className="h-4 w-4" />}>
              {t('common.add')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ResonanceInstanceRow({
  instance,
  onUpdate,
  onRemove,
  onSetPrimary,
}: {
  instance: ResonanceInstance;
  onUpdate: (id: string, patch: Partial<ResonanceInstance>) => void;
  onRemove: (id: string) => void;
  onSetPrimary: (id: string | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-3',
        instance.isPrimary && 'border-primary/50 bg-primary/5',
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">{instance.name}</span>
          {instance.isPrimary && <Badge variant="success">{t('settings.primary')}</Badge>}
          {!instance.enabled && <Badge variant="outline">{t('settings.disabled')}</Badge>}
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          {instance.host}:{instance.port}
        </span>
      </div>
      <div className="flex items-center gap-1">
        {!instance.isPrimary && (
          <Button size="sm" variant="outline" onClick={() => onSetPrimary(instance.id)}>
            {t('settings.setPrimary')}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onUpdate(instance.id, { enabled: !instance.enabled })}
        >
          {instance.enabled ? t('common.disable') : t('common.enable')}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          icon={<Trash2 className="h-4 w-4" />}
          onClick={() => onRemove(instance.id)}
          aria-label={t('common.delete')}
        />
      </div>
    </div>
  );
}

function ResonanceConnectionCard() {
  const { t } = useTranslation();
  const { discoveredServices, connectionStatus, discoverServices, connect, disconnect, error, clearError } =
    useResonanceStore();
  const primary = useServiceStore((s) => s.getPrimaryResonance());
  const hasConfigured = useServiceStore((s) => s.hasConfiguredResonance());
  const [isDiscovering, setIsDiscovering] = useState(false);

  const handleDiscover = async () => {
    setIsDiscovering(true);
    await discoverServices();
    setIsDiscovering(false);
  };

  const handleConnect = async () => {
    await connect();
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-3">
        {connectionStatus === 'connected' ? <Wifi size={24} /> : <WifiOff size={24} />}
        <h3 className="flex-1 text-base font-semibold text-foreground">{t('settings.resonanceConnection')}</h3>
        <Button
          size="icon"
          variant="ghost"
          onClick={handleDiscover}
          disabled={isDiscovering || !hasConfigured}
          title={hasConfigured ? t('settings.discoverServices') : t('settings.noResonanceInstances')}
          aria-label={t('settings.discoverServices')}
        >
          <RefreshCw size={16} className={cn(isDiscovering && 'animate-spin')} />
        </Button>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        {hasConfigured
          ? t('settings.discoverDesc')
          : t('settings.resonanceNotConfigured')}
      </p>

      {primary && (
        <div className="mb-3 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <Server className="h-4 w-4" /> {t('settings.primaryInstance')}: {primary.name}
          </div>
          <div className="font-mono text-xs text-muted-foreground">
            {primary.host}:{primary.port}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={clearError} className="text-xs underline">
            {t('common.dismiss')}
          </button>
        </div>
      )}

      {discoveredServices.length > 0 ? (
        <div className="flex flex-col gap-2">
          {discoveredServices.map((service) => (
            <div
              key={service.name}
              className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">{service.name}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {service.host}:{service.port}
                </span>
              </div>
              {connectionStatus === 'connected' && (
                <span className="font-medium text-green-500">{t('settings.connected')}</span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 p-6 text-center text-muted-foreground">
          <p className="text-sm">
            {hasConfigured ? t('settings.noServersFound') : t('settings.resonanceNotConfigured')}
          </p>
          {hasConfigured && (
            <Button variant="secondary" onClick={handleDiscover}>
              {t('settings.scanNetwork')}
            </Button>
          )}
        </div>
      )}

      {hasConfigured && (
        <div className="mt-4 flex gap-3 border-t border-border pt-4">
          {connectionStatus === 'connected' ? (
            <Button variant="destructive" onClick={disconnect} icon={<Unplug size={16} />}>
              {t('settings.disconnect')}
            </Button>
          ) : (
            <Button
              onClick={handleConnect}
              disabled={connectionStatus === 'connecting'}
              icon={<Plug size={16} />}
            >
              {connectionStatus === 'connecting' ? t('settings.connecting') : t('settings.connect')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function ServiceStatusItem({ service }: { service: ServiceInfo }) {
  const { t } = useTranslation();
  const config = STATUS_CONFIG[service.status];
  const Icon = config.icon;

  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{service.displayName}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {service.host || '—'}:{service.port}
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <Icon size={16} className={config.colorClass} />
        <span className={config.colorClass}>{t(config.labelKey)}</span>
        {service.latency !== undefined && service.status === 'healthy' && (
          <span className="ml-1 text-muted-foreground">{t('settings.latencyMs', { ms: service.latency })}</span>
        )}
      </div>
    </div>
  );
}

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { theme } = useThemeStore();
  const cortexStatus = useCortexStore((s) => s.status);
  const cortexLobes = useCortexStore((s) => s.lobes);
  const cortexConnection = useCortexStore((s) => s.connection);
  const cortexCortexId = useCortexStore((s) => s.cortexId);
  const cortexError = useCortexStore((s) => s.error);
  const refreshStatus = useCortexStore((s) => s.refreshStatus);
  const refreshLobes = useCortexStore((s) => s.refreshLobes);
  const startCortex = useCortexStore((s) => s.startCortex);
  const isRefreshing = cortexStatus === 'starting';

  useEffect(() => {
    void refreshStatus();
    void refreshLobes();
  }, [refreshStatus, refreshLobes]);

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{t('settings.title')}</h1>
          <p className="subtitle">{t('settings.subtitle')}</p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="mb-3 flex items-center gap-3">
            <Server size={24} />
            <h3 className="flex-1 text-base font-semibold text-foreground">{t('settings.cortexStatus') || 'Cortex Status'}</h3>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => { void refreshStatus(); void refreshLobes(); }}
              disabled={isRefreshing}
              title={t('settings.refreshStatus')}
              aria-label={t('settings.refreshStatus')}
            >
              <RefreshCw size={16} className={cn(isRefreshing && 'animate-spin')} />
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">{t('settings.cortex')}</span>
                <span className="font-mono text-xs text-muted-foreground">{cortexConnection.baseUrl}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {cortexStatus === 'running' ? (
                  <CheckCircle size={16} className="text-green-500" />
                ) : (
                  <XCircle size={16} className="text-red-500" />
                )}
                <span className={cortexStatus === 'running' ? 'text-green-500' : 'text-red-500'}>
                  {cortexStatus}
                </span>
              </div>
            </div>
            {cortexLobes.map((lobe) => (
              <div
                key={lobe.name}
                className="flex items-center justify-between rounded-md border border-border bg-muted/20 p-3"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">
                    {lobe.agent_card.name} <span className="text-xs text-muted-foreground">({lobe.kind})</span>
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {lobe.skills.slice(0, 3).join(', ')}
                    {lobe.skills.length > 3 ? '…' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {lobe.health_status === 'healthy' ? (
                    <CheckCircle size={14} className="text-green-500" />
                  ) : (
                    <XCircle size={14} className="text-muted-foreground" />
                  )}
                  <span className="text-muted-foreground">{lobe.health_status}</span>
                </div>
              </div>
            ))}
            {cortexLobes.length === 0 && cortexStatus === 'running' && (
              <p className="text-xs text-muted-foreground">{t('settings.noLobes')}</p>
            )}
            {cortexStatus !== 'running' && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void startCortex()}
                className="mt-2"
              >
                {t('settings.startCortex') || 'Start Cortex'}
              </Button>
            )}
          </div>
        </div>

        <ResonanceInstanceEditor />
        <ResonanceConnectionCard />

        <DatabaseSettings />

        <SettingsCard
          variant="glass"
          title={t('settings.language')}
          description={t('settings.languageDesc')}
          icon={<Globe size={24} />}
        >
          <div className="flex items-center justify-between py-3">
            <label className="text-sm text-muted-foreground">{t('settings.language')}</label>
            <Select value={i18n.language} onValueChange={changeLanguage}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zh-CN">{t('settings.zh-CN')}</SelectItem>
                <SelectItem value="en-US">{t('settings.en-US')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </SettingsCard>

        <SettingsCard
          variant="glass"
          title={t('settings.theme')}
          description={t('settings.themeDesc')}
          icon={theme === 'dark' ? <Moon size={24} /> : <Sun size={24} />}
        >
          <div className="flex items-center justify-between py-3">
            <label className="text-sm text-muted-foreground">{t('settings.themeLabel')}</label>
            <div className="flex gap-2">
              <Button
                variant={theme === 'light' ? 'default' : 'outline'}
                onClick={() => useThemeStore.getState().setTheme('light')}
                icon={<Sun size={16} />}
              >
                {t('settings.light')}
              </Button>
              <Button
                variant={theme === 'dark' ? 'default' : 'outline'}
                onClick={() => useThemeStore.getState().setTheme('dark')}
                icon={<Moon size={16} />}
              >
                {t('settings.dark')}
              </Button>
            </div>
          </div>
        </SettingsCard>

        <SettingsCard
          variant="glass"
          title={t('settings.memoryIntegration')}
          description={t('settings.memoryIntegrationDesc')}
          icon={<Database size={24} />}
        >
          <div className="flex items-center justify-between py-3">
            <label className="text-sm text-muted-foreground">{t('settings.statusLabel')}</label>
            <span className="rounded-full bg-green-500/15 px-3 py-0.5 text-xs font-medium text-green-500">
              {t('settings.connected')}
            </span>
          </div>
          <div className="flex items-center justify-between py-3">
            <label className="text-sm text-muted-foreground">{t('settings.storagePath')}</label>
            <code className="text-xs text-muted-foreground">{t('settings.storagePathDefault')}</code>
          </div>
        </SettingsCard>

        {isTauri() && (
          <SettingsCard
            variant="glass"
            title={t('settings.systemTray')}
            description={t('settings.systemTrayDesc')}
            icon={<Monitor size={24} />}
          >
            <div className="mt-4 flex flex-wrap gap-3">
              <Button variant="secondary" onClick={() => safeInvoke('show_window')} icon={<Eye size={16} />}>
                {t('settings.showWindow')}
              </Button>
              <Button variant="secondary" onClick={() => safeInvoke('hide_window')} icon={<EyeOff size={16} />}>
                {t('settings.hideWindow')}
              </Button>
              <Button variant="secondary" onClick={() => safeInvoke('minimize_window')} icon={<Minimize2 size={16} />}>
                {t('settings.minimize')}
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{t('settings.trayHint')}</p>
          </SettingsCard>
        )}
      </div>
    </div>
  );
}
