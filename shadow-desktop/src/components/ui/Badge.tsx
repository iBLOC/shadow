import React from 'react';
import styles from './Badge.module.css';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'accent';
type BadgeSize = 'sm' | 'md';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  pulse?: boolean;
}

export function Badge({
  children,
  variant = 'default',
  size = 'md',
  dot = false,
  pulse = false,
  className = '',
  ...props
}: BadgeProps) {
  const classNames = [
    styles.badge,
    styles[variant],
    styles[size],
    dot ? styles.dot : '',
    pulse ? styles.pulse : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <span className={classNames} {...props}>
      {dot && <span className={styles.dotIndicator} />}
      {children}
    </span>
  );
}

export function StatusBadge({
  status,
  size = 'md',
  className = '',
}: {
  status: 'online' | 'offline' | 'connecting' | 'error' | 'running' | 'stopped' | 'busy';
  size?: BadgeSize;
  className?: string;
}) {
  const statusConfig = {
    online: { variant: 'success' as BadgeVariant, label: 'Online', pulse: true },
    offline: { variant: 'default' as BadgeVariant, label: 'Offline', pulse: false },
    connecting: { variant: 'warning' as BadgeVariant, label: 'Connecting', pulse: true },
    error: { variant: 'danger' as BadgeVariant, label: 'Error', pulse: false },
    running: { variant: 'success' as BadgeVariant, label: 'Running', pulse: true },
    stopped: { variant: 'default' as BadgeVariant, label: 'Stopped', pulse: false },
    busy: { variant: 'warning' as BadgeVariant, label: 'Busy', pulse: true },
  };

  const config = statusConfig[status];

  return (
    <Badge variant={config.variant} size={size} dot pulse={config.pulse} className={className}>
      {config.label}
    </Badge>
  );
}

export function PriorityBadge({
  priority,
  className = '',
}: {
  priority: 'urgent' | 'high' | 'medium' | 'low';
  className?: string;
}) {
  const priorityConfig = {
    urgent: { variant: 'danger' as BadgeVariant, label: 'URGENT' },
    high: { variant: 'warning' as BadgeVariant, label: 'HIGH' },
    medium: { variant: 'default' as BadgeVariant, label: 'MEDIUM' },
    low: { variant: 'success' as BadgeVariant, label: 'LOW' },
  };

  const config = priorityConfig[priority];

  return (
    <Badge variant={config.variant} size="sm" className={className}>
      {config.label}
    </Badge>
  );
}
