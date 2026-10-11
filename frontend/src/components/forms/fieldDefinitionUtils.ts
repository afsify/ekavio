import { fieldError, type Definition, type FieldEntity } from './formSchema';

export const entityNames: Record<FieldEntity, string> = { customer: 'Customers', service: 'Services', appointment: 'Appointments', inventory_item: 'Inventory items', membership: 'Staff memberships', lead: 'CRM leads' };
export const typeNames: Record<Definition['field_type'], string> = { text: 'Short text', textarea: 'Long text', number: 'Exact decimal', currency: 'Currency · INR minor units', date: 'Calendar date', datetime: 'Date & time · UTC', email: 'Email address', phone: 'International phone', checkbox: 'Yes / No', select: 'Dropdown', multiselect: 'Multiple choice', radio: 'Single choice', url: 'Web address' };
export const isChoice = (field: Definition) => ['select', 'radio', 'multiselect'].includes(field.field_type);
export const blankDefinition = (): Definition => ({ id: '', key: '', label: '', help: '', field_type: 'text', status: 'active', required: false, searchable: false, filterable: false, reportable: false, default_value: null, version: 1, options: [] });
export function moveOption<T>(list: T[], index: number, delta: number): T[] {
  const next = [...list];
  if (index + delta >= 0 && index + delta < next.length) [next[index], next[index + delta]] = [next[index + delta], next[index]];
  return next;
}
export interface CatalogueFilters { search: string; status: string; type: string; capability: string }
export function filterDefinitions(definitions: Definition[], filters: CatalogueFilters) {
  const query = filters.search.trim().toLowerCase();
  return definitions.filter(field => (!query || [field.label, field.key, field.help, typeNames[field.field_type]].some(value => value.toLowerCase().includes(query)))
    && (!filters.status || field.status === filters.status) && (!filters.type || field.field_type === filters.type)
    && (!filters.capability || field[filters.capability as 'required' | 'searchable' | 'filterable' | 'reportable']));
}
// Presentation validation only. The server remains authoritative, including reserved keys.
export function definitionErrors(field: Definition): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(field.key)) errors.key = 'Use a lowercase letter followed by lowercase letters, numbers or underscores (up to 64 characters).';
  if (!field.label.trim() || field.label.length > 100) errors.label = 'Enter a label of 1–100 characters.';
  if (field.help.length > 500) errors.help = 'Use at most 500 characters.';
  if (isChoice(field)) {
    if (field.status === 'active' && !field.options.some(option => option.status === 'active')) errors.options = 'An active choice field needs at least one active option.';
    if (field.options.length > 100) errors.options = 'Use at most 100 options.';
    if (new Set(field.options.map(option => option.key)).size !== field.options.length) errors.options = 'Option keys must be distinct.';
    field.options.forEach((option, index) => {
      if (!/^[a-z][a-z0-9_]{0,63}$/.test(option.key)) errors[`option-key-${index}`] = 'Use a lowercase stable key, up to 64 characters.';
      if (!option.label.trim() || option.label.length > 100) errors[`option-label-${index}`] = 'Enter an option label of 1–100 characters.';
    });
  }
  const defaultError = fieldError({ ...field, required: false }, field.default_value);
  if (defaultError) errors.default = defaultError;
  if (isChoice(field) && field.default_value !== null) {
    const selected = Array.isArray(field.default_value) ? field.default_value : [field.default_value];
    if (selected.some(id => !field.options.some(option => option.id === id && option.status === 'active'))) errors.default = 'Choose active saved options for the default, or clear it before archiving an option.';
  }
  return errors;
}
