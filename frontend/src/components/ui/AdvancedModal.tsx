import React, { useEffect, useLayoutEffect, useId, useRef } from 'react';
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
  presentation?: 'modal' | 'drawer' | 'popover';
  anchorRef?: React.RefObject<HTMLElement | null>;
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
  presentation = 'modal',
  anchorRef,
}) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!isOpen || presentation !== 'popover') return;
    const place = () => {
      const anchor = anchorRef?.current?.getBoundingClientRect();
      const dialog = dialogRef.current;
      if (!anchor || !dialog) return;
      dialog.style.setProperty('--popover-top', `${Math.min(anchor.bottom + 8, window.innerHeight - 120)}px`);
      dialog.style.setProperty('--popover-right', `${Math.max(12, window.innerWidth - anchor.right)}px`);
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [isOpen, presentation, anchorRef]);
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') ?? []).filter((element) => element.getClientRects().length > 0);
    focusable()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      // A pending submit can disable the focused button and return focus to
      // body. Recover containment, but only for the topmost open dialog.
      if (Array.from(document.querySelectorAll('[role="dialog"]')).at(-1) !== dialog) return;
      const items = focusable();
      const first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); dialog?.focus(); return; }
      if (!dialog?.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', trap, true);
    return () => { document.removeEventListener('keydown', trap, true); previous?.focus(); };
  }, [isOpen]);
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
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
      document.body.style.overflow = previousOverflow;
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
    <div className={`dialog-layer ${presentation === 'drawer' ? 'drawer-layer' : presentation === 'popover' ? 'account-popover-layer' : ''}`}>
      {/* Backdrop */}
      <div
        className="dialog-overlay"
        onClick={closeOnBackdropClick ? onClose : undefined}
        aria-hidden="true"
      />

      {/* Modal Container */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'workspace-dialog',
          presentation === 'drawer' && 'details-drawer',
          sizeClasses[size],
          className
        )}
      >
        {/* Header */}
        <div className="dialog-heading">
          <h2 id={titleId}>
            {title}
          </h2>
          {showCloseButton && (
            <button
              onClick={onClose}
              className="icon-button"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="dialog-body">
          <div>
            {children}
          </div>
        </div>

        {/* Footer */}
        {actions && (
          <div className="dialog-actions">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdvancedModal;
