import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface AdvancedModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  showCloseButton?: boolean;
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
  className?: string;
}

export const AdvancedModal: React.FC<AdvancedModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  actions,
  size = 'md',
  showCloseButton = true,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  className,
}) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, closeOnEscape, onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-md',
    lg: 'sm:max-w-lg',
    xl: 'sm:max-w-xl',
    full: 'sm:max-w-[95vw]',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pointer-events-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in"
        onClick={closeOnBackdropClick ? onClose : undefined}
        aria-hidden="true"
      />

      {/* Modal Container */}
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative w-full max-h-[90vh] flex flex-col bg-slate-900 shadow-2xl border-t sm:border border-slate-800",
          "rounded-t-3xl sm:rounded-2xl transition-all duration-300",
          "animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-0 sm:fade-in sm:zoom-in-95",
          sizeClasses[size],
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 shrink-0">
          <div className="text-lg font-semibold text-white truncate pr-4">
            {title}
          </div>
          {showCloseButton && (
            <button
              onClick={onClose}
              className="p-2 -mr-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto overscroll-contain">
          <div className="text-slate-300">
            {children}
          </div>
        </div>

        {/* Footer */}
        {actions && (
          <div className="flex flex-wrap items-center justify-end gap-3 px-6 py-4 border-t border-slate-800/80 bg-slate-900/50 rounded-b-2xl shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdvancedModal;
