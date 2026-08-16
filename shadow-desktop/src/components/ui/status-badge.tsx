import { Badge } from './badge';
import { cn } from '@/lib/utils';

type StatusType = 'online' | 'offline' | 'connecting' | 'error' | 'running' | 'stopped' | 'busy';

interface StatusBadgeProps {
  status: StatusType;
  size?: 'sm' | 'md';
  className?: string;
}

const statusConfig: Record<StatusType, { variant: 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'info' | 'accent'; label: string }> = {
  online: { variant: 'success', label: 'Online' },
  offline: { variant: 'default', label: 'Offline' },
  connecting: { variant: 'warning', label: 'Connecting' },
  error: { variant: 'destructive', label: 'Error' },
  running: { variant: 'info', label: 'Running' },
  stopped: { variant: 'secondary', label: 'Stopped' },
  busy: { variant: 'accent', label: 'Busy' },
};

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const config = statusConfig[status];
  const showDot = status === 'online' || status === 'connecting' || status === 'running' || status === 'busy';
  const pulse = status === 'connecting' || status === 'running' || status === 'busy';

  return (
    <Badge 
      variant={config.variant} 
      className={cn(size === 'sm' && 'text-xs px-2 py-0.5')}
    >
      {showDot && (
        <span className={cn('mr-1.5 h-2 w-2 rounded-full bg-current', pulse && 'animate-pulse')} />
      )}
      {config.label}
    </Badge>
  );
}