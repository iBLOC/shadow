import * as React from "react"
import { Label } from "./label"

import { cn } from "@/lib/utils"

interface InputProps extends React.ComponentProps<"input"> {
  label?: string
  error?: string
  hint?: string
  icon?: React.ReactNode
  iconPosition?: 'left' | 'right'
  fullWidth?: boolean
  id?: string
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, icon, iconPosition = 'left', fullWidth, id, ...props }, ref) => {
    const generatedId = React.useId()
    const inputId = id ?? generatedId
    
    const rootClassName = cn(
      "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
      error && "border-destructive focus-visible:ring-destructive",
      icon && iconPosition === 'left' && "pl-9",
      icon && iconPosition === 'right' && "pr-9",
      className
    )

    const wrapperClassName = cn("space-y-2 w-full", fullWidth && "w-full")

    return (
      <div className={wrapperClassName}>
        {label && <Label htmlFor={inputId}>{label}</Label>}
        <div className="relative">
          {icon && iconPosition === 'left' && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
              {icon}
            </span>
          )}
          <input
            type={props.type}
            id={inputId}
            className={rootClassName}
            ref={ref}
            {...props}
          />
          {icon && iconPosition === 'right' && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
              {icon}
            </span>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {hint && !error && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
    )
  }
)
Input.displayName = "Input"

export { Input }
