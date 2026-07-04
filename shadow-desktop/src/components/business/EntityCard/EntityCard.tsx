import type { ReactNode } from 'react';
import { Badge, Button } from '../../ui';
import { cn } from '../../../lib/utils';

export interface EntityCardProps {
  header?: {
    icon?: ReactNode;
    title: string;
    subtitle?: string;
    badge?: string;
    badgeVariant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  };
  children?: ReactNode;
  actions?: ReactNode;
  onClick?: () => void;
  expanded?: boolean;
  onExpand?: () => void;
}

export function EntityCard({
  header,
  children,
  actions,
  onClick,
  expanded,
  onExpand,
}: EntityCardProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {header && (
        <div
          className={cn('flex items-center justify-between gap-3 px-4 py-3', onClick && 'cursor-pointer hover:bg-muted')}
          onClick={onClick}
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {header.icon && <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">{header.icon}</div>}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-[15px] font-semibold text-foreground">{header.title}</h3>
                {header.badge && (
                  <Badge variant={header.badgeVariant || 'default'} size="sm">
                    {header.badge}
                  </Badge>
                )}
              </div>
              {header.subtitle && (
                <span className="text-xs text-muted-foreground">{header.subtitle}</span>
              )}
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1">
            {actions}
            {onExpand && (
              <Button
                size="icon"
                variant="ghost"
                className="text-xs"
                onClick={(e) => { e.stopPropagation(); onExpand(); }}
                aria-label={expanded ? 'Collapse' : 'Expand'}
              >
                <span aria-hidden="true">{expanded ? '▼' : '▶'}</span>
              </Button>
            )}
          </div>
        </div>
      )}
      {expanded && children && (
        <div className="border-t border-border bg-muted px-4 py-3">{children}</div>
      )}
    </div>
  );
}
