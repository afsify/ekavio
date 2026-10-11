import { useState } from 'react';
import { Input } from '../ui/Input';
import { EmptyState } from '../ui/EmptyState';
import { StatusBadge } from '../ui/WorkspacePrimitives';
import { types, type Definition } from './formSchema';
import { filterDefinitions, typeNames } from './fieldDefinitionUtils';

export function FieldCatalogue({ definitions, manage, onEdit, onInspect, onAdd }: { definitions: Definition[]; manage: boolean; onEdit: (field: Definition) => void; onInspect: (field: Definition) => void; onAdd: () => void }) {
  const [filters, setFilters] = useState({ search: '', status: '', type: '', capability: '' });
  const rows = filterDefinitions(definitions, filters);
  const active = definitions.filter(field => field.status === 'active').length;
  const limited = definitions.length >= 50 || active >= 40;
  return <section className="page-stack field-catalogue" aria-label="Field catalogue">
    <div className="section-heading"><div><h2>Field catalogue</h2><p className="muted">{active} active / 40 · {definitions.length} total / 50. Archived fields retain saved history.</p></div>{manage && <button className="action-link" disabled={limited} onClick={onAdd}>Add field</button>}</div>
    {!manage && <p className="panel muted">Read-only configuration. A fields manager can create or change definitions. Record access is separate.</p>}
    {manage && limited && <p role="status">Field limit reached. Archive an active field to free an active slot; the 50-definition lifetime limit still applies.</p>}
    <div className="field-catalogue-filters">
      <Input label="Search loaded field catalogue" type="search" value={filters.search} maxLength={500} onChange={event => setFilters({ ...filters, search: event.target.value })} helper="Search these received definitions only, not business records." />
      <label className="field">Catalogue status<select value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })}><option value="">All statuses</option><option value="active">Active</option><option value="archived">Archived</option></select></label>
      <label className="field">Catalogue field type<select value={filters.type} onChange={event => setFilters({ ...filters, type: event.target.value })}><option value="">All types</option>{types.map(type => <option key={type} value={type}>{typeNames[type]}</option>)}</select></label>
      <label className="field">Catalogue capability<select value={filters.capability} onChange={event => setFilters({ ...filters, capability: event.target.value })}><option value="">All capabilities</option>{['required', 'searchable', 'filterable', 'reportable'].map(flag => <option key={flag} value={flag}>{flag[0].toUpperCase() + flag.slice(1)}</option>)}</select></label>
    </div>
    <div className="record-actions"><p className="muted" role="status">Showing {rows.length} of {definitions.length} loaded definitions</p>{Object.values(filters).some(Boolean) && <button className="quiet-button" onClick={() => setFilters({ search: '', status: '', type: '', capability: '' })}>Clear catalogue filters</button>}</div>
    {!rows.length ? <EmptyState title={definitions.length ? 'No matching fields' : 'No custom fields yet'} description={definitions.length ? 'Adjust the loaded-catalogue filters. This does not search record values.' : 'Built-in record fields already work. Add only the extra information your organization needs.'} /> : <div className="catalogue-grid">{rows.map(field => <article className="panel record-card field-catalogue-card" key={field.id}>
      <div className="section-heading"><h3>{field.label}</h3><StatusBadge tone={field.status === 'active' ? 'success' : 'neutral'}>{field.status === 'active' ? 'Active' : 'Archived'}</StatusBadge></div>
      <p className="muted break-words">{typeNames[field.field_type]} · <code>{field.key}</code></p>
      <div className="field-indicators"><StatusBadge tone={field.required ? 'info' : 'neutral'}>{field.required ? 'Required' : 'Optional'}</StatusBadge>{(['searchable', 'filterable', 'reportable'] as const).filter(flag => field[flag]).map(flag => <StatusBadge key={flag}>{flag[0].toUpperCase() + flag.slice(1)}</StatusBadge>)}</div>
      {field.help && <p className="muted break-words">{field.help}</p>}
      {!!field.options.length && <p className="muted">{field.options.filter(option => option.status === 'active').length} active options · {field.options.length} retained options</p>}
      <div className="record-actions"><button className="quiet-button" aria-label={`Inspect ${field.label}`} onClick={() => onInspect(field)}>Inspect field</button>{manage && <button className="quiet-button" aria-label={`Edit ${field.label}`} onClick={() => onEdit(field)}>Edit field</button>}</div>
    </article>)}</div>}
  </section>;
}
