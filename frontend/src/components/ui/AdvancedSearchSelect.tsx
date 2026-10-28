import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';

export interface AdvancedSearchSelectProps<T> {
  options: T[]; value: T | T[] | null; onChange: (value: T | T[] | null) => void;
  displayKey: keyof T; valueKey?: keyof T; label?: string; placeholder?: string;
  required?: boolean; multiple?: boolean; disabled?: boolean; className?: string; error?: string;
  clearable?: boolean;
  isOptionDisabled?: (option: T) => boolean;
}
/** A bounded received-options selector, not a server-wide search contract. */
export function AdvancedSearchSelect<T extends Record<string, unknown>>({ options, value, onChange, displayKey, valueKey = 'id' as keyof T, label, placeholder = 'Select an option', required, multiple, disabled, className = '', error, clearable = !required, isOptionDisabled }: AdvancedSearchSelectProps<T>) {
  const id = useId(), input = useRef<HTMLInputElement>(null), container = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false), [search, setSearch] = useState(''), [active, setActive] = useState(-1);
  const [position, setPosition] = useState<CSSProperties>({});
  const open = expanded && !disabled;
  const filtered = useMemo(() => options.filter(option => String(option[displayKey]).toLowerCase().includes(search.toLowerCase())), [options, displayKey, search]);
  const selected = (option: T) => (Array.isArray(value) ? value : value ? [value] : []).some(v => v[valueKey] === option[valueKey]);
  const close = () => { setExpanded(false); setSearch(''); setActive(-1); };
  const reveal = () => { setExpanded(true); setSearch(''); setActive(-1); };
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) { setExpanded(false); setSearch(''); setActive(-1); } };
    const place = () => {
      const rect = input.current?.getBoundingClientRect();
      if (!rect) return;
      const viewport = window.visualViewport;
      const bottom = (viewport?.height ?? window.innerHeight) + (viewport?.offsetTop ?? 0);
      const above = rect.top - (viewport?.offsetTop ?? 0) - 8, below = bottom - rect.bottom - 8;
      const upward = below < 220 && above > below;
      setPosition({ position: 'fixed', left: Math.max(8, Math.min(rect.left, window.innerWidth - Math.min(rect.width, window.innerWidth - 16) - 8)), width: Math.min(rect.width, window.innerWidth - 16), top: upward ? undefined : rect.bottom + 4, bottom: upward ? window.innerHeight - rect.top + 4 : undefined, maxHeight: Math.max(0, Math.min(320, upward ? above : below)) });
    };
    place();
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    window.visualViewport?.addEventListener('resize', place);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); window.visualViewport?.removeEventListener('resize', place); };
  }, [open]);
  useEffect(() => { if (open && active >= 0) document.getElementById(`${id}-option-${active}`)?.scrollIntoView?.({ block: 'nearest' }); }, [active, id, open]);
  const choose = (option: T) => {
    if (disabled || isOptionDisabled?.(option)) return;
    if (multiple) { const current = Array.isArray(value) ? value : []; onChange(selected(option) ? current.filter(v => v[valueKey] !== option[valueKey]) : [...current, option]); }
    else { onChange(option); close(); setSearch(''); }
  };
  const display = (Array.isArray(value) ? value : value ? [value] : []).map(option => String(option[displayKey])).join(', ');
  return <div ref={container} className={`search-select ${className}`} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }}>
    {label && <div className="form-label"><label htmlFor={id}>{label}</label>{required && <span aria-hidden="true"> (required)</span>}</div>}
    <div className="search-select-control">
      <input ref={input} id={id} role="combobox" autoComplete="off" aria-autocomplete="list" aria-label={label ?? placeholder} aria-expanded={open} aria-controls={open ? `${id}-options` : undefined} aria-activedescendant={open && active >= 0 && filtered[active] ? `${id}-option-${active}` : undefined} aria-required={required || undefined} aria-invalid={Boolean(error)} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`} disabled={disabled} value={open ? search : display} placeholder={open ? display || 'Type to search…' : placeholder} title={display || undefined}
        onFocus={reveal} onClick={() => { if (!open) reveal(); }} onChange={event => { setSearch(event.target.value); setExpanded(true); setActive(-1); }}
        onKeyDown={event => {
          if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); }
          else if (event.key === 'Tab') close();
          else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); if (!open) reveal();
            setActive(index => {
              const direction = event.key === 'ArrowDown' ? 1 : -1;
              let next = index < 0 && direction < 0 ? 0 : index;
              for (let tried = 0; tried < filtered.length; tried++) { next = (next + direction + filtered.length) % filtered.length; if (!isOptionDisabled?.(filtered[next])) return next; }
              return -1;
            });
          }
          else if (event.key === 'Enter' && open) { event.preventDefault(); if (filtered[active]) choose(filtered[active]); }
          // Home/End retain native text-editing semantics.
        }} />
      <ChevronDown size={16} aria-hidden="true" />
      {clearable && !required && display && <button className="icon-button select-clear" type="button" aria-label={`Clear ${label ?? 'selection'}`} disabled={disabled} onClick={() => { onChange(multiple ? [] : null); input.current?.focus(); close(); }}><X size={16} aria-hidden="true" /></button>}
    </div>
    {open && <div className="search-select-popover panel" style={position}>
      <div id={`${id}-options`} role="listbox" aria-label={label ?? 'Options'} aria-multiselectable={multiple || undefined}>{filtered.map((option, index) => <div id={`${id}-option-${index}`} role="option" aria-selected={selected(option)} aria-disabled={isOptionDisabled?.(option) || undefined} data-active={index === active || undefined} key={String(option[valueKey])} onMouseDown={event => event.preventDefault()} onClick={() => choose(option)}>{String(option[displayKey])}{selected(option) && <Check size={18} aria-hidden="true" />}</div>)}</div>
      {filtered.length === 0 && <p role="status">No matching options</p>}
      <p className="muted form-helper">{filtered.length} matching received {filtered.length === 1 ? 'option' : 'options'}</p>
    </div>}
    <p id={`${id}-hint`} className="sr-only">Search applies to the supplied options only.{multiple ? ` Selected: ${display || 'none'}.` : ''}</p>
    {error && <p className="error-text" id={`${id}-error`} role="alert">{error}</p>}
  </div>;
}
export default AdvancedSearchSelect;
