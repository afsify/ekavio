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

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme.mode === 'dark' || (theme.mode === 'system' && media.matches);
      root.classList.toggle('dark', dark);
      root.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    media.addEventListener('change', apply);

    // Inject dynamic primary color CSS variables (--color-primary for Tailwind v4 standards)
    const primaryColor = theme.primaryColor || '#4F46E5';
    root.style.setProperty('--color-primary', primaryColor);
    root.style.setProperty('--primary-color', primaryColor);
    return () => media.removeEventListener('change', apply);
  }, [theme.mode, theme.primaryColor]);

  return <>{children}</>;
};

export default ThemeProvider;
