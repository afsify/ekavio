/**
 * Mobile-First Input UI Component
 * Strictly functional React form input component supporting labels, icons, and error states.
 */
import React, { useId } from 'react';
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
  helper?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, helper, id, className, 'aria-describedby': describedBy, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || generatedId;

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <div className="form-label"><label
            htmlFor={inputId}
            className="form-label"
          >
            {label}
          </label>{props.required && <span className="muted" aria-hidden="true"> (required)</span>}</div>
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
            aria-invalid={Boolean(error)}
            aria-describedby={[describedBy, error ? `${inputId}-error` : null, helper ? `${inputId}-help` : null].filter(Boolean).join(' ') || undefined}
            className={cn(
              "workspace-input block w-full py-3 text-sm disabled:opacity-50 min-h-[44px]",
              icon ? "pl-10 pr-4" : "px-4",
              error
                ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500/20"
                : "border-slate-700/80 focus:border-[var(--primary-color,#4F46E5)] focus:ring-[var(--primary-color,#4F46E5)]/20",
              className
            )}
            {...props}
          />
        </div>

        {helper && <p id={`${inputId}-help`} className="form-helper muted">{helper}</p>}
        {error && (
          <p id={`${inputId}-error`} role="alert" className="text-xs font-medium text-rose-400">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
