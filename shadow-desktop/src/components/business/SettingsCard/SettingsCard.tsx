import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../ui';
import type { SettingsCardProps } from './types';
import { cn } from '../../../lib/utils';

export function SettingsCard({ title, description, icon, children, actions, variant = 'default' }: SettingsCardProps) {
  return (
    <Card variant="elevated" padding="none" className={cn('overflow-hidden', variant === 'glass' && 'bg-card/80')}>
      <CardHeader className="flex items-center gap-3 p-4">
        {icon && <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">{icon}</div>}
        <div className="flex-1">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">{children}</CardContent>
      {actions && <CardFooter className="flex justify-end gap-2 border-t border-border px-4 py-3">{actions}</CardFooter>}
    </Card>
  );
}

export type { SettingsCardProps } from './types';
