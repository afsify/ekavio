import { useId, useSyncExternalStore } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

const subscribe = (listener: () => void) => {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
};
const snapshot = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

/** Presentation over the existing store; OS resolution is not another theme state. */
export function ThemeSwitch() {
  const { theme, setTheme } = useAppStore();
  const osDark = useSyncExternalStore(subscribe, snapshot, () => false);
  const dark = theme.mode === 'dark' || (theme.mode === 'system' && osDark);
  const id = useId();
  return <div className="theme-switch-wrap">
    <button type="button" role="switch" aria-label="Dark appearance" aria-checked={dark} aria-describedby={id}
      className="theme-switch" data-dark={dark} data-mode={theme.mode}
      title={`${theme.mode === 'system' ? 'System appearance. ' : ''}Switch to ${dark ? 'Light' : 'Dark'}`}
      onClick={() => setTheme(dark ? 'light' : 'dark')}>
      <span className="theme-switch-track" aria-hidden="true"><Sun size={16}/><Moon size={16}/><span className="theme-switch-thumb"><Sun className="theme-sun" size={17}/><Moon className="theme-moon" size={17}/></span></span>
      {theme.mode === 'system' && <span className="theme-auto" aria-hidden="true">System</span>}
    </button>
    <span id={id} className="sr-only">{theme.mode === 'system' ? `System is active and currently ${dark ? 'Dark' : 'Light'}. ` : ''}Activate to select {dark ? 'Light' : 'Dark'} explicitly. Choose System in Appearance settings to follow your device.</span>
  </div>;
}

export function ThemeModeChoice({ legend = 'Theme' }: { legend?: string }) {
  const { theme, setTheme } = useAppStore();
  const name = useId();
  return <fieldset className="theme-mode-choice"><legend>{legend}</legend><div className="theme-mode-options">
    {(['light', 'dark', 'system'] as const).map(mode => {
      const Icon = mode === 'light' ? Sun : mode === 'dark' ? Moon : Monitor;
      return <label key={mode} className="theme-mode-option" data-selected={theme.mode === mode}>
        <input type="radio" name={name} value={mode} checked={theme.mode === mode} onChange={() => setTheme(mode)}
          onClick={() => { if (theme.mode === mode) setTheme(mode); }}/>
        <Icon size={18} aria-hidden="true"/><span>{mode[0].toUpperCase() + mode.slice(1)}</span>
      </label>;
    })}
  </div></fieldset>;
}
