import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LoadingProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  fullScreen?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
};

export function Loading({ size = 'md', text, fullScreen, className }: LoadingProps) {
  const content = (
    <>
      <Loader2 className={cn(sizeClasses[size], 'animate-spin')} />
      {text && <span className="text-sm text-muted-foreground">{text}</span>}
    </>
  );

  if (fullScreen) {
    return (
      <div className={cn('fixed inset-0 flex items-center justify-center bg-background/80 z-50', className)}>
        {content}
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {content}
    </div>
  );
}