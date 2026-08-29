import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Lightweight placeholder for icon-library swap-in (lucide / heroicons / ...).
 * Used by the shadcn/ui registry; we always render a lucide Check.
 */
interface IconPlaceholderProps extends React.SVGProps<SVGSVGElement> {
  /** Optional library hint from the registry — ignored here. */
  lucide?: string;
  tabler?: string;
  hugeicons?: string;
  phosphor?: string;
  remixicon?: string;
}

export function IconPlaceholder({
  className,
  lucide: _lucide,
  tabler: _tabler,
  hugeicons: _hugeicons,
  phosphor: _phosphor,
  remixicon: _remixicon,
  ...props
}: IconPlaceholderProps) {
  return (
    <Check
      className={cn('h-4 w-4', className)}
      aria-hidden="true"
      {...(props as unknown as React.ComponentProps<typeof Check>)}
    />
  );
}
