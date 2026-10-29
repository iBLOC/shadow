import * as React from "react"

import { cn } from "@/lib/utils"

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'outlined' | 'interactive' | 'solid'
  padding?: 'none' | 'sm' | 'md' | 'lg'
  hover?: boolean
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', padding = 'md', hover, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      // `glass` = 半影层：模糊 + 半透明白。与移动端 GlassCard 同一套语义。
      // `solid` 保留原来的实心卡（bg-card），供需要高对比承托的区域使用。
      "rounded-lg border text-card-foreground shadow-sm",
      variant === 'solid' ? 'bg-card' : 'glass',
      variant === 'elevated' && 'shadow-lg',
      variant === 'outlined' && 'border-2',
      variant === 'interactive' && 'cursor-pointer hover:shadow-md transition-shadow',
      hover && 'hover:shadow-md',
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"

interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, padding = 'md', ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex flex-col space-y-1.5 p-6",
      padding === 'none' && 'p-0',
      padding === 'sm' && 'p-3',
      padding === 'lg' && 'p-8',
      className
    )}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "text-2xl font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, padding = 'md', ...props }, ref) => (
  <div 
    ref={ref} 
    className={cn(
      "p-6 pt-0",
      padding === 'none' && 'p-0',
      className
    )} 
    {...props} 
  />
))
CardContent.displayName = "CardContent"

interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, padding = 'md', ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex items-center p-6 pt-0",
      padding === 'none' && 'p-0',
      className
    )}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
