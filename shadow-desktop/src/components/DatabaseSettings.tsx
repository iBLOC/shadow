import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Database,
  Server,
  Cloud,
  Lock,
  Play,
  Square,
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useDatabaseStore, type DatabaseType } from '../stores/databaseStore';
import { Button } from './ui';

const DB_TYPE_OPTIONS: { value: DatabaseType; icon: typeof Server; labelKey: string; disabled?: boolean }[] = [
  { value: 'embedded', icon: Server, labelKey: 'settings.dbEmbedded' },
  { value: 'external', icon: Database, labelKey: 'settings.dbExternal' },
  { value: 'neon', icon: Cloud, labelKey: 'settings.dbNeon', disabled: true },
];

export function DatabaseSettings() {
  const { t } = useTranslation();
  const {
    dbType,
    status,
    embeddedPort,
    externalConfig,
    masterPassword,
    setDbType,
    setExternalConfig,
    setMasterPassword,
    startEmbedded,
    stopEmbedded,
    testExternalConnection,
  } = useDatabaseStore();

  const [showPassword, setShowPassword] = useState(false);
  const [showMasterPassword, setShowMasterPassword] = useState(false);
  const [masterPasswordInput, setMasterPasswordInput] = useState('');

  const handleSetMasterPassword = () => {
    if (masterPasswordInput.length >= 8) {
      setMasterPassword(masterPasswordInput);
      setMasterPasswordInput('');
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'connected':
        return <CheckCircle size={16} className="status-success" />;
      case 'error':
        return <AlertCircle size={16} className="status-error" />;
      default:
        return null;
    }
  };

  return (
    <div className="settings-card">
      <div className="settings-header">
        <Database size={24} />
        <h3>{t('settings.database')}</h3>
        {getStatusIcon()}
      </div>
      <p>{t('settings.databaseDesc')}</p>

      <div className="settings-item">
        <label>{t('settings.dbType')}</label>
        <div className="db-type-selector">
          {DB_TYPE_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <Button
                key={option.value}
                data-testid={`db-type-${option.value}`}
                variant={dbType === option.value ? 'default' : 'outline'}
                onClick={() => !option.disabled && setDbType(option.value)}
                disabled={option.disabled}
                icon={<Icon size={16} />}
              >
                {t(option.labelKey)}
              </Button>
            );
          })}
        </div>
      </div>

      {dbType === 'embedded' && (
        <div className="db-embedded-config">
          <div className="settings-item">
            <label>{t('settings.statusLabel')}</label>
            <span className={`status-badge ${status}`}>
              {status === 'connected'
                ? `${t('settings.dbConnected')} (Port: ${embeddedPort})`
                : status === 'connecting'
                ? t('settings.dbConnecting')
                : status === 'error'
                ? t('settings.dbDisconnected')
                : t('settings.dbDisconnected')}
            </span>
          </div>
          <div className="db-actions">
            {status === 'connected' ? (
              <Button data-testid="db-embedded-stop" variant="destructive" onClick={stopEmbedded} icon={<Square size={16} />}>
                {t('settings.dbStop')}
              </Button>
            ) : (
              <Button
                data-testid="db-embedded-start"
                variant="success"
                onClick={startEmbedded}
                disabled={status === 'connecting'}
                icon={<Play size={16} />}
              >
                {status === 'connecting' ? t('settings.dbConnecting') : t('settings.dbStart')}
              </Button>
            )}
          </div>
        </div>
      )}

      {dbType === 'external' && (
        <div className="db-external-config">
          <div className="form-row">
            <div className="form-group">
              <label>{t('settings.dbHost')}</label>
              <input
                type="text"
                value={externalConfig.host}
                onChange={(e) => setExternalConfig({ host: e.target.value })}
                placeholder="localhost"
              />
            </div>
            <div className="form-group form-group-small">
              <label>{t('settings.dbPort')}</label>
              <input
                type="number"
                value={externalConfig.port}
                onChange={(e) => setExternalConfig({ port: parseInt(e.target.value) || 5432 })}
                placeholder="5432"
              />
            </div>
          </div>
          <div className="form-group">
            <label>{t('settings.dbUser')}</label>
            <input
              type="text"
              value={externalConfig.username}
              onChange={(e) => setExternalConfig({ username: e.target.value })}
              placeholder="postgres"
            />
          </div>
          <div className="form-group">
            <label>{t('settings.dbPassword')}</label>
            <div className="password-input">
              <input
                type={showPassword ? 'text' : 'password'}
                value={externalConfig.password}
                onChange={(e) => setExternalConfig({ password: e.target.value })}
                placeholder="********"
              />
              <Button
                type="button"
                data-testid="db-external-password-toggle"
                size="icon"
                variant="ghost"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? t('common.hidePassword') : t('common.showPassword')}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </Button>
            </div>
          </div>
          <div className="form-group">
            <label>{t('settings.dbName')}</label>
            <input
              type="text"
              value={externalConfig.database}
              onChange={(e) => setExternalConfig({ database: e.target.value })}
              placeholder="shadow"
            />
          </div>
          <div className="db-actions">
            <Button
              data-testid="db-external-test-connection"
              variant="secondary"
              onClick={testExternalConnection}
              disabled={status === 'connecting'}
            >
              {status === 'connecting' ? t('settings.dbConnecting') : t('settings.dbTestConnection')}
            </Button>
          </div>
        </div>
      )}

      {dbType === 'neon' && (
        <div className="db-neon-placeholder">
          <Cloud size={48} />
          <p>{t('settings.dbNeon')}</p>
        </div>
      )}

      <div className="settings-item encryption-section">
        <div className="encryption-header">
          <Lock size={16} />
          <label>{t('settings.dbEncryption')}</label>
        </div>
        {masterPassword ? (
          <div className="master-password-set">
            <CheckCircle size={14} className="status-success" />
            <span>{t('settings.dbSetMasterPassword')}</span>
          </div>
        ) : (
          <div className="master-password-form">
            <p className="form-hint">{t('settings.dbMasterPasswordHint')}</p>
            <div className="password-input">
              <input
                type={showMasterPassword ? 'text' : 'password'}
                value={masterPasswordInput}
                onChange={(e) => setMasterPasswordInput(e.target.value)}
                placeholder="********"
              />
              <Button
                type="button"
                data-testid="db-master-password-toggle"
                size="icon"
                variant="ghost"
                onClick={() => setShowMasterPassword(!showMasterPassword)}
                aria-label={showMasterPassword ? t('common.hidePassword') : t('common.showPassword')}
              >
                {showMasterPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </Button>
            </div>
            <Button
              data-testid="db-master-password-set"
              onClick={handleSetMasterPassword}
              disabled={masterPasswordInput.length < 8}
            >
              {t('settings.dbSetMasterPassword')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
