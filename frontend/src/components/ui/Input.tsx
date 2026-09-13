/**
 * Mobile-First Input UI Component
 * Strictly functional React form input component supporting labels, icons, and error states.
 */
import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, id, className, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-semibold uppercase tracking-wider text-slate-300 dark:text-slate-300"
          >
            {label}
          </label>
        )}

        <div className="relative">
          {icon && (
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "block w-full rounded-2xl border bg-slate-900/70 py-3 text-sm text-white placeholder-slate-500 shadow-inner focus:outline-none focus:ring-2 transition duration-200 disabled:opacity-50 min-h-[44px]",
              icon ? "pl-10 pr-4" : "px-4",
              error
                ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500/20"
                : "border-slate-700/80 focus:border-[var(--primary-color,#4F46E5)] focus:ring-[var(--primary-color,#4F46E5)]/20",
              className
            )}
            {...props}
          />
        </div>

        {error && (
          <p className="text-xs font-medium text-rose-400 animate-pulse">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
