/**
 * Mobile-First Button UI Component
 * Strictly functional React component supporting primary, outline, and ghost variants.
 * Touch-optimized sizing and loading indicator support.
 */
import React from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'outline' | 'ghost';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  isLoading?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  isLoading = false,
  disabled,
  className = '',
  children,
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 min-h-[44px]';

  const variantStyles: Record<ButtonVariant, string> = {
    primary:
      'bg-[var(--primary-color,#4F46E5)] text-white shadow-lg shadow-[var(--primary-color,#4F46E5)]/25 hover:brightness-110 focus:ring-[var(--primary-color,#4F46E5)]',
    outline:
      'border border-slate-700/80 bg-transparent text-slate-200 hover:bg-slate-800/60 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800/50',
    ghost:
      'bg-transparent text-slate-300 hover:bg-slate-800/40 dark:text-slate-200 dark:hover:bg-slate-800/60',
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={`${baseStyles} ${variantStyles[variant]} ${className}`}
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
