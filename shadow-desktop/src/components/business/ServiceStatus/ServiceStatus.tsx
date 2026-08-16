import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button, Badge } from '../../ui';
import type { ServiceStatusProps } from './types';

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
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <span className="text-[15px] font-semibold text-foreground">{name}</span>
          <Badge variant={config.variant} dot pulse={config.pulse}>
            {config.label}
          </Badge>
        </div>
        {message && <p className="mt-1 text-xs text-muted-foreground">{message}</p>}
      </div>
      <div className="flex-shrink-0">
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
            icon={status === 'connecting' ? <Loader2 size={14} className="animate-spin" /> : undefined}
          >
            {status === 'connecting' ? t('common.connecting') : t('common.connect')}
          </Button>
        )}
      </div>
    </div>
  );
}

export type { ServiceStatusProps } from './types';
