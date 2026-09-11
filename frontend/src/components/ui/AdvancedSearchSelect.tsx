import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface AdvancedSearchSelectProps<T> {
  options: T[];
  value: T | T[] | null;
  onChange: (value: any) => void;
  displayKey: keyof T;
  valueKey?: keyof T;
  label?: string;
  placeholder?: string;
  required?: boolean;
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
  error?: string;
}

export const AdvancedSearchSelect = <T extends Record<string, any>>({
  options,
  value,
  onChange,
  displayKey,
  valueKey = 'id' as keyof T,
  label,
  placeholder = 'Select an option',
  required,
  multiple,
  disabled,
  className,
  error,
}: AdvancedSearchSelectProps<T>) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = useMemo(() => {
    return options.filter((opt) =>
      String(opt[displayKey]).toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [options, searchTerm, displayKey]);

  const isSelected = (opt: T) => {
    if (multiple && Array.isArray(value)) {
      return value.some((v) => v[valueKey] === opt[valueKey]);
    }
    return value && (value as T)[valueKey] === opt[valueKey];
  };

  const handleSelect = (opt: T) => {
    if (multiple) {
      const currentValues = Array.isArray(value) ? value : [];
      if (isSelected(opt)) {
        onChange(currentValues.filter((v) => v[valueKey] !== opt[valueKey]));
      } else {
        onChange([...currentValues, opt]);
      }
    } else {
      onChange(opt);
      setIsOpen(false);
      setSearchTerm('');
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(multiple ? [] : null);
  };

  return (
    <div ref={containerRef} className={cn("relative w-full space-y-1.5", className)}>
      {label && (
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={cn(
          "relative flex min-h-[44px] items-center justify-between w-full rounded-2xl border bg-slate-900/70 px-4 py-2 cursor-pointer transition-all duration-200",
          disabled ? "opacity-50 cursor-not-allowed border-slate-800" : "border-slate-700/80 hover:border-slate-600",
          isOpen && "border-indigo-500 ring-2 ring-indigo-500/20",
          error && "border-rose-500 ring-2 ring-rose-500/20"
        )}
      >
        <div className="flex-1 flex flex-wrap gap-1 pr-4 overflow-hidden">
          {multiple && Array.isArray(value) && value.length > 0 ? (
            value.map((v, i) => (
              <span key={i} className="inline-flex items-center gap-1 bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-md text-xs font-medium">
                {String(v[displayKey])}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(value.filter((val) => val[valueKey] !== v[valueKey]));
                  }}
                  className="hover:text-indigo-200"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))
          ) : !multiple && value ? (
            <span className="text-sm text-white truncate">{String((value as T)[displayKey])}</span>
          ) : (
            <span className="text-sm text-slate-500 truncate">{placeholder}</span>
          )}
        </div>
        
        <div className="flex items-center gap-2 shrink-0 text-slate-400">
          {(multiple ? Array.isArray(value) && value.length > 0 : value) && !disabled && (
            <button type="button" onClick={handleClear} className="hover:text-rose-400 transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
          <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", isOpen && "rotate-180")} />
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2">
          <div className="p-2 border-b border-slate-700">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                autoFocus
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
          
          <div className="max-h-60 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="p-4 text-center text-sm text-slate-500">No results found</div>
            ) : (
              filteredOptions.map((opt, i) => (
                <div
                  key={i}
                  onClick={() => handleSelect(opt)}
                  className={cn(
                    "flex items-center justify-between px-4 py-2.5 text-sm cursor-pointer transition-colors",
                    isSelected(opt) ? "bg-indigo-500/10 text-indigo-300 font-medium" : "text-slate-300 hover:bg-slate-700/50"
                  )}
                >
                  <span className="truncate">{String(opt[displayKey])}</span>
                  {isSelected(opt) && <Check className="w-4 h-4 shrink-0" />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
      
      {error && <p className="text-xs font-medium text-rose-400 mt-1">{error}</p>}
    </div>
  );
};

export default AdvancedSearchSelect;
