import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

const subscribe = (listener: () => void) => {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
};
const snapshot = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

/** Compact disclosure over the same native radio choices and preference store. */
export function ThemeMenu() {
  const mode = useAppStore(state => state.theme.mode);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const Icon = mode === 'light' ? Sun : mode === 'dark' ? Moon : Monitor;
  const label = mode[0].toUpperCase() + mode.slice(1);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLInputElement>('input:checked')?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <div ref={root} className="theme-menu" onBlur={event => {
    if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <button ref={trigger} type="button" className="quiet-button theme-menu-trigger" aria-label={`Appearance: ${label}`}
      aria-expanded={open} aria-controls={open ? id : undefined} aria-haspopup="dialog" onClick={() => setOpen(value => !value)}>
      <Icon size={18} aria-hidden="true"/><span>{label}</span>
    </button>
    {open && <div id={id} role="dialog" aria-label="Appearance" className="theme-menu-panel">
      <ThemeModeChoice legend="Appearance"/>
      <p>System follows your device’s light or dark appearance.</p>
      <button type="button" className="quiet-button" onClick={() => { setOpen(false); trigger.current?.focus(); }}>Done</button>
    </div>}
  </div>;
}

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
