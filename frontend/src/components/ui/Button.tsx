/**
 * Mobile-First Button UI Component
 * Strictly functional React component supporting primary, outline, and ghost variants,
 * touch-optimized sizes (sm, md, lg), and loading state indicators.
 */
import React from 'react';
import { Loader2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  className,
  children,
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60';

  const sizeStyles: Record<ButtonSize, string> = {
    sm: 'px-3.5 py-2 text-xs rounded-xl min-h-[44px]',
    md: 'px-5 py-3 text-sm rounded-2xl min-h-[44px]',
    lg: 'px-6 py-4 text-base rounded-2xl min-h-[52px]',
  };

  const variantStyles: Record<ButtonVariant, string> = {
    primary:
      'action-link text-white',
    secondary:
      'quiet-button',
    danger:
      'danger-button',
    ghost:
      'bg-transparent text-slate-300 hover:bg-slate-800/40 dark:text-slate-200 dark:hover:bg-slate-800/60',
  };

  return (
    <button
      data-variant={variant}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={cn(baseStyles, sizeStyles[size], variantStyles[variant], className)}
      {...props}
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Processing...</span>
        </>
      ) : (
        children
      )}
    </button>
  );
};

export default Button;
