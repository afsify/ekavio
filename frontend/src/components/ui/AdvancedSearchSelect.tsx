import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { SearchField } from './WorkspacePrimitives';

export interface AdvancedSearchSelectProps<T> {
  options: T[]; value: T | T[] | null; onChange: (value: T | T[] | null) => void;
  displayKey: keyof T; valueKey?: keyof T; label?: string; placeholder?: string;
  required?: boolean; multiple?: boolean; disabled?: boolean; className?: string; error?: string;
}
/** A bounded received-options selector, not a server-wide search contract. */
export function AdvancedSearchSelect<T extends Record<string, unknown>>({ options, value, onChange, displayKey, valueKey = 'id' as keyof T, label, placeholder = 'Select an option', required, multiple, disabled, className = '', error }: AdvancedSearchSelectProps<T>) {
  const id = useId(), trigger = useRef<HTMLButtonElement>(null), container = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [search, setSearch] = useState('');
  const filtered = useMemo(() => options.filter(option => String(option[displayKey]).toLowerCase().includes(search.toLowerCase())), [options, displayKey, search]);
  const selected = (option: T) => (Array.isArray(value) ? value : value ? [value] : []).some(v => v[valueKey] === option[valueKey]);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);
  const choose = (option: T) => {
    if (multiple) { const current = Array.isArray(value) ? value : []; onChange(selected(option) ? current.filter(v => v[valueKey] !== option[valueKey]) : [...current, option]); }
    else { onChange(option); close(); setSearch(''); }
  };
  const display = (Array.isArray(value) ? value : value ? [value] : []).map(option => String(option[displayKey])).join(', ');
  return <div ref={container} className={`search-select ${className}`} onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.stopPropagation(); close(); }
    if (open && ['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
      const choices = Array.from(container.current?.querySelectorAll<HTMLButtonElement>('[role=option]') ?? []);
      if (!choices.length) return;
      event.preventDefault();
      const index = choices.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length;
      choices[next]?.focus();
    }
  }}>
    {label && <div className="form-label"><label htmlFor={id}>{label}</label>{required && <span aria-hidden="true"> (required)</span>}</div>}
    <button ref={trigger} id={id} className="quiet-button search-select-trigger" type="button" aria-label={label ?? placeholder} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? `${id}-options` : undefined} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} disabled={disabled} onClick={() => setOpen(value => !value)}><span>{display || placeholder}</span><ChevronDown size={18} aria-hidden="true" /></button>
    {open && <div className="search-select-popover panel"><SearchField aria-label="Search received options" autoFocus value={search} onChange={e => setSearch(e.target.value)} /><div id={`${id}-options`} role="listbox" aria-label={label ?? 'Options'} aria-multiselectable={multiple || undefined}>{filtered.map(option => <button type="button" role="option" aria-selected={selected(option)} key={String(option[valueKey])} onClick={() => choose(option)}>{String(option[displayKey])}{selected(option) && <Check size={18} aria-hidden="true" />}</button>)}</div>{filtered.length === 0 && <p role="status">No matching options</p>}<button type="button" className="quiet-button" onClick={() => { onChange(multiple ? [] : null); close(); }}>Clear selection</button><p className="muted form-helper">Search applies to the supplied options only.</p></div>}
    {error && <p className="error-text" id={`${id}-error`} role="alert">{error}</p>}
  </div>;
}
export default AdvancedSearchSelect;
