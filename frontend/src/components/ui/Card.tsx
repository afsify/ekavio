/**
 * Mobile-First Card UI Component
 * Strictly functional React card component with modern glassmorphism and touch-friendly padding.
 */
import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  interactive?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  interactive = false,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`rounded-3xl border border-slate-800/80 bg-slate-900/60 backdrop-blur-xl p-6 shadow-xl transition-all duration-200 ${
        interactive
          ? 'hover:border-slate-700 hover:bg-slate-900/80 active:scale-[0.99] cursor-pointer'
          : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export default Card;
