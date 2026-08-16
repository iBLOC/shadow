import { useTranslation } from 'react-i18next';
import { Database, Globe, Monitor, Minimize2, Eye, EyeOff, Sun, Moon, RefreshCw, Server, CheckCircle, XCircle } from 'lucide-react';
import { safeInvoke } from '../lib/tauriSafe';
import { isTauri } from '../lib/platform';
import { useEffect } from 'react';
import { useThemeStore } from '../stores/themeStore';
import { useCortexStore } from '../stores/cortexStore';
import { SettingsCard } from '../components/business';
import { DatabaseSettings } from '../components/DatabaseSettings';
import { HfTokenSettings } from '../components/business/HfTokenSettings';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { cn } from '../lib/utils';

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { theme } = useThemeStore();
  const cortexStatus = useCortexStore((s) => s.status);
  const cortexLobes = useCortexStore((s) => s.lobes);
  const cortexConnection = useCortexStore((s) => s.connection);
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

        <DatabaseSettings />

        <HfTokenSettings onSaved={() => { void refreshStatus(); }} />

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