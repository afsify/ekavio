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
      className={`panel transition-colors ${
        interactive
          ? 'interactive-card'
          : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export default Card;
