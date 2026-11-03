import { AdvancedSearchSelect } from './AdvancedSearchSelect';

type Option = { id: string; name: string; disabled?: boolean };
/** Small lists stay native; larger authorized option sets gain received-option search. */
export function OptionSelect({ options, value, onChange, label, disabled, required, placeholder = 'Select an option', context }: {
  options: Option[]; value: string; onChange: (value: string) => void; label: string;
  disabled?: boolean; required?: boolean; placeholder?: string; context?: string;
}) {
  return options.length > 5 ? <div data-layout-context={context}><AdvancedSearchSelect options={options} value={options.find(option => option.id === value) ?? null} displayKey="name" label={label} placeholder={placeholder} disabled={disabled} required={required} isOptionDisabled={option => Boolean(option.disabled)} onChange={option => onChange(option && !Array.isArray(option) ? option.id : '')} /></div>
    : <label className="option-select"><span className="form-label">{label}{required && <span aria-hidden="true"> (required)</span>}</span><select data-layout-context={context} aria-label={label} value={value} disabled={disabled} required={required} onChange={event => onChange(event.target.value)}><option value="">{placeholder}</option>{options.map(option => <option key={option.id} value={option.id} disabled={option.disabled}>{option.name}</option>)}</select></label>;
}
