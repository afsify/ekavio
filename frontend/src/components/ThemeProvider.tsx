/**
 * ThemeProvider Functional Component
 * Dynamically synchronizes theme state (dark class & CSS variables) with document.documentElement.
 */
import React, { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';

export interface ThemeProviderProps {
  children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const theme = useAppStore((state) => state.theme);

  useEffect(() => {
    const root = document.documentElement;

    // Apply or remove dark mode class
    if (theme.mode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // Inject dynamic primary color CSS variables (--color-primary for Tailwind v4 standards)
    const primaryColor = theme.primaryColor || '#4F46E5';
    root.style.setProperty('--color-primary', primaryColor);
    root.style.setProperty('--primary-color', primaryColor);
  }, [theme.mode, theme.primaryColor]);

  return <>{children}</>;
};

export default ThemeProvider;
