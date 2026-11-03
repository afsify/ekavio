import { useState } from 'react';
import { Input } from '../ui/Input';
import { StatusBadge } from '../ui/WorkspacePrimitives';
import { typeNames } from './fieldDefinitionUtils';
import type { FormSchema, Section } from './formSchema';

/** Loaded schema metadata only; filtering never changes placements or record data. */
export function FieldPlacementCatalogue({ schema, sections, onLocate }: { schema: FormSchema; sections: Section[]; onLocate: (key: string) => void }) {
  const [search, setSearch] = useState(''), [source, setSource] = useState('');
  const fields = [...schema.builtins.map(field => ({ ...field, source: 'Built-in', type: 'Canonical record control' })), ...schema.definitions.filter(field => field.status === 'active').map(field => ({ ...field, source: 'Custom', type: typeNames[field.field_type] }))];
  const query = search.trim().toLowerCase();
  const matches = fields.filter(field => (!source || source === field.source) && [field.label, field.key, field.source, field.type, field.required ? 'required' : 'optional'].some(value => value.toLowerCase().includes(query)));
  return <aside className="panel page-stack layout-placement-catalogue" aria-label="Layout field placements">
    <h3>Find a field</h3><p className="muted">Search built-in and active custom fields. Finding a placement does not change the layout.</p>
    <Input label="Search field placements" type="search" maxLength={200} value={search} onChange={event => setSearch(event.target.value)} />
    <label className="field">Placement source<select value={source} onChange={event => setSource(event.target.value)}><option value="">All fields</option><option>Built-in</option><option>Custom</option></select></label>
    <p role="status" className="muted">{matches.length} of {fields.length} available fields</p>
    {(search || source) && <button className="quiet-button" onClick={() => { setSearch(''); setSource(''); }}>Clear placement filters</button>}
    {!matches.length && <p>No matching placements. Clear filters to see available fields; your layout is unchanged.</p>}
    {['Built-in', 'Custom'].map(kind => { const group = matches.filter(field => field.source === kind); return group.length > 0 && <section className="page-stack" key={kind} aria-label={`${kind} fields`}><h4 className="font-semibold">{kind} fields</h4>{group.map(field => {
      const section = sections.find(item => item.fields.some(placement => placement.key === field.key));
      return <div className="layout-placement-fact" key={field.key}><strong>{field.label}</strong><code>{field.key}</code><span className="muted">{field.type}</span><StatusBadge tone={field.required ? 'info' : 'neutral'}>{field.required ? 'Required' : 'Optional'}</StatusBadge><p className="muted">{section?.title || 'Additional information'}</p><button className="quiet-button" aria-label={`Find placement for ${field.label}`} disabled={!section} onClick={() => onLocate(field.key)}>Find in layout</button></div>;
    })}</section>; })}
    <p className="muted">Required fields must remain visible. Optional visibility changes presentation only, never saved values or access.</p>
  </aside>;
}
