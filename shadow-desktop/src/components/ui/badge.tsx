import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        danger: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        success: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20",
        warning: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20",
        info: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20",
        accent: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/20",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  size?: 'sm' | 'md'
  dot?: boolean
  pulse?: boolean
}

function Badge({ className, variant, size, dot, pulse, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), size === 'sm' && 'text-xs px-2 py-0.5', className)} {...props}>
      {dot && (
        <span className={cn("mr-1.5 h-2 w-2 rounded-full bg-current", pulse && 'animate-pulse')} />
      )}
      {props.children}
    </div>
  )
}

export { Badge, badgeVariants }
