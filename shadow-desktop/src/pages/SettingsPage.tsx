import { useTranslation } from 'react-i18next';
import { Database, Globe, Monitor, Minimize2, Eye, EyeOff, Sun, Moon, RefreshCw, Server, CheckCircle, XCircle, HelpCircle, Wifi, WifiOff, Plug, Unplug } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import { useThemeStore } from '../stores/themeStore';
import { useServiceStore, type ServiceStatus, type ServiceInfo } from '../stores/serviceStore';
import { useResonanceStore } from '../stores/resonanceStore';
import { SettingsCard } from '../components/business';
import { DatabaseSettings } from '../components/DatabaseSettings';
import './SettingsPage.css';

function ResonanceConnectionCard() {
  const { t } = useTranslation();
  const { 
    discoveredServices, 
    selectedService, 
    connectionStatus, 
    discoverServices, 
    selectService, 
    connect, 
    disconnect 
  } = useResonanceStore();
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
    <div className="settings-card">
      <div className="settings-header">
        {connectionStatus === 'connected' ? <Wifi size={24} /> : <WifiOff size={24} />}
        <h3>{t('settings.resonanceConnection')}</h3>
        <button
          className="btn-icon refresh-btn"
          onClick={handleDiscover}
          disabled={isDiscovering}
          title={t('settings.discoverServices')}
        >
          <RefreshCw size={16} className={isDiscovering ? 'spinning' : ''} />
        </button>
      </div>
      <p>{t('settings.discoverDesc')}</p>
      
      {discoveredServices.length > 0 ? (
        <div className="service-list">
          {discoveredServices.map((service) => (
            <div 
              key={service.name}
              className={`service-item clickable ${selectedService?.name === service.name ? 'selected' : ''}`}
              onClick={() => selectService(service)}
            >
              <div className="service-info">
                <span className="service-name">{service.name}</span>
                <span className="service-address">{service.host}:{service.port}</span>
              </div>
              <div className="service-status">
                {selectedService?.name === service.name && (
                  connectionStatus === 'connected' ? (
                    <span className="status-connected">{t('settings.connected')}</span>
                  ) : (
                    <span className="status-selected">{t('settings.selected')}</span>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <p>{t('settings.noServersFound')}</p>
          <button className="btn btn-secondary" onClick={handleDiscover}>
            {t('settings.scanNetwork')}
          </button>
        </div>
      )}

      {selectedService && (
        <div className="connection-actions">
          {connectionStatus === 'connected' ? (
            <button className="btn btn-danger" onClick={disconnect}>
              <Unplug size={16} />
              {t('settings.disconnect')}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={handleConnect} disabled={connectionStatus === 'connecting'}>
              <Plug size={16} />
              {connectionStatus === 'connecting' ? t('settings.connecting') : t('settings.connect')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ServiceStatusItem({ service }: { service: ServiceInfo }) {
  const { t } = useTranslation();
  const statusConfig: Record<ServiceStatus, { icon: typeof CheckCircle; color: string; labelKey: string }> = {
    healthy: { icon: CheckCircle, color: 'var(--color-success)', labelKey: 'settings.healthy' },
    unhealthy: { icon: XCircle, color: 'var(--color-error)', labelKey: 'settings.unhealthy' },
    offline: { icon: XCircle, color: 'var(--color-error)', labelKey: 'settings.offline' },
    checking: { icon: RefreshCw, color: 'var(--color-warning)', labelKey: 'settings.checking' },
    unknown: { icon: HelpCircle, color: 'var(--color-muted)', labelKey: 'settings.unknown' },
  };

  const config = statusConfig[service.status];
  const Icon = config.icon;

  return (
    <div className="service-item">
      <div className="service-info">
        <span className="service-name">{service.displayName}</span>
        <span className="service-address">{service.host}:{service.port}</span>
      </div>
      <div className="service-status">
        <Icon size={16} style={{ color: config.color }} />
        <span style={{ color: config.color }}>{t(config.labelKey)}</span>
        {service.latency !== undefined && service.status === 'healthy' && (
          <span className="service-latency">{t('settings.latencyMs', { ms: service.latency })}</span>
        )}
      </div>
    </div>
  );
}

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { theme } = useThemeStore();
  const { services, isChecking, checkAllServices } = useServiceStore();

  useEffect(() => {
    checkAllServices();
  }, [checkAllServices]);

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

      <div className="settings-section">
        <div className="settings-card">
          <div className="settings-header">
            <Server size={24} />
            <h3>{t('settings.serviceStatus') || 'Service Status'}</h3>
            <button 
              className="btn-icon refresh-btn"
              onClick={() => checkAllServices()}
              disabled={isChecking}
              title={t('settings.refreshStatus')}
            >
              <RefreshCw size={16} className={isChecking ? 'spinning' : ''} />
            </button>
          </div>
          <div className="service-list">
            {(Object.values(services) as ServiceInfo[]).map((service) => (
              <ServiceStatusItem key={service.name} service={service} />
            ))}
          </div>
        </div>

        <ResonanceConnectionCard />

        <DatabaseSettings />

        <SettingsCard
          variant="glass"
          title={t('settings.language')}
          description={t('settings.languageDesc')}
          icon={<Globe size={24} />}
        >
          <div className="settings-item">
            <label>{t('settings.language')}</label>
            <select 
              value={i18n.language} 
              onChange={(e) => changeLanguage(e.target.value)}
            >
              <option value="zh-CN">{t('settings.zh-CN')}</option>
              <option value="en-US">{t('settings.en-US')}</option>
            </select>
          </div>
        </SettingsCard>

        <SettingsCard
          variant="glass"
          title={t('settings.theme')}
          description={t('settings.themeDesc')}
          icon={theme === 'dark' ? <Moon size={24} /> : <Sun size={24} />}
        >
          <div className="settings-item">
            <label>{t('settings.themeLabel')}</label>
            <div className="theme-toggle">
              <button 
                className={`theme-btn ${theme === 'light' ? 'active' : ''}`}
                onClick={() => useThemeStore.getState().setTheme('light')}
              >
                <Sun size={16} />
                {t('settings.light')}
              </button>
              <button 
                className={`theme-btn ${theme === 'dark' ? 'active' : ''}`}
                onClick={() => useThemeStore.getState().setTheme('dark')}
              >
                <Moon size={16} />
                {t('settings.dark')}
              </button>
            </div>
          </div>
        </SettingsCard>

        <SettingsCard
          variant="glass"
          title={t('settings.memoryIntegration')}
          description={t('settings.memoryIntegrationDesc')}
          icon={<Database size={24} />}
        >
          <div className="settings-item">
            <label>{t('settings.statusLabel')}</label>
            <span className="status-badge connected">{t('settings.connected')}</span>
          </div>
          <div className="settings-item">
            <label>{t('settings.storagePath')}</label>
            <code>{t('settings.storagePathDefault')}</code>
          </div>
        </SettingsCard>

        <SettingsCard
          variant="glass"
          title={t('settings.systemTray')}
          description={t('settings.systemTrayDesc')}
          icon={<Monitor size={24} />}
        >
          <div className="tray-controls">
            <button className="btn btn-secondary" onClick={() => invoke('show_window')}>
              <Eye size={16} />
              {t('settings.showWindow')}
            </button>
            <button className="btn btn-secondary" onClick={() => invoke('hide_window')}>
              <EyeOff size={16} />
              {t('settings.hideWindow')}
            </button>
            <button className="btn btn-secondary" onClick={() => invoke('minimize_window')}>
              <Minimize2 size={16} />
              {t('settings.minimize')}
            </button>
          </div>
          <p className="tray-hint">{t('settings.trayHint')}</p>
        </SettingsCard>
      </div>
    </div>
  );
}
