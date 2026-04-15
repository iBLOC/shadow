import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button, Badge } from '../../ui';
import type { ServiceStatusProps } from './types';
import styles from './ServiceStatus.module.css';

const STATUS_CONFIG = {
  connected: { variant: 'success' as const, label: 'Connected', pulse: true },
  disconnected: { variant: 'default' as const, label: 'Disconnected', pulse: false },
  connecting: { variant: 'warning' as const, label: 'Connecting', pulse: true },
  error: { variant: 'danger' as const, label: 'Error', pulse: false },
};

export function ServiceStatus({ name, status, message, onConnect, onDisconnect }: ServiceStatusProps) {
  const { t } = useTranslation();
  const config = STATUS_CONFIG[status];

  return (
    <div className={styles.container}>
      <div className={styles.info}>
        <div className={styles.header}>
          <span className={styles.name}>{name}</span>
          <Badge variant={config.variant} dot pulse={config.pulse}>
            {config.label}
          </Badge>
        </div>
        {message && <p className={styles.message}>{message}</p>}
      </div>
      <div className={styles.actions}>
        {status === 'connected' || status === 'error' ? (
          <Button variant="secondary" size="sm" onClick={onDisconnect}>
            {t('common.disconnect')}
          </Button>
        ) : (
          <Button 
            variant="primary" 
            size="sm" 
            onClick={onConnect}
            disabled={status === 'connecting'}
            icon={status === 'connecting' ? <Loader2 size={14} className={styles.spin} /> : undefined}
          >
            {status === 'connecting' ? t('common.connecting') : t('common.connect')}
          </Button>
        )}
      </div>
    </div>
  );
}

export type { ServiceStatusProps } from './types';
