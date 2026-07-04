import type { ReactNode } from 'react';
import { Button } from './button';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  size?: 'sm' | 'md' | 'lg';
  glass?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
};

export function EmptyState({ icon, title, description, action, size = 'md', glass, className }: EmptyStateProps) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center text-center p-8',
      glass && 'bg-background/50 backdrop-blur-sm rounded-lg',
      className
    )}>
      {icon && (
        <div className={cn('mb-4 text-muted-foreground', sizeClasses[size])}>
          {icon}
        </div>
      )}
      <h3 className={cn('font-semibold mb-1', size === 'sm' ? 'text-base' : size === 'lg' ? 'text-xl' : 'text-lg')}>
        {title}
      </h3>
      {description && (
        <p className="text-sm text-muted-foreground mb-4 max-w-sm">
          {description}
        </p>
      )}
      {action && (
        <Button onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}