import { Badge } from './badge';

type PriorityType = 'urgent' | 'high' | 'medium' | 'low';

interface PriorityBadgeProps {
  priority: PriorityType;
  className?: string;
}

const priorityConfig: Record<PriorityType, { variant: 'destructive' | 'warning' | 'info' | 'secondary'; label: string }> = {
  urgent: { variant: 'destructive', label: 'URGENT' },
  high: { variant: 'warning', label: 'HIGH' },
  medium: { variant: 'info', label: 'MEDIUM' },
  low: { variant: 'secondary', label: 'LOW' },
};

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const config = priorityConfig[priority];

  return (
    <Badge variant={config.variant} className={className}>
      {config.label}
    </Badge>
  );
}