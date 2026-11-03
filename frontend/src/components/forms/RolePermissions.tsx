import { useState } from 'react';

export interface PermissionMetadata { key: string; label: string; description: string; category: string }
interface Selection { catalogue: PermissionMetadata[]; selected: string[]; original: string[] }
const permissionLabel = (catalogue: PermissionMetadata[], key: string) => catalogue.find(item => item.key === key)?.label ?? key;

/** Presentation only: no inferred permissions, bulk grants or dependent authority. */
export function RolePermissions({ catalogue, selected, original, grants, onChange }: Selection & { grants: string[]; onChange: (keys: string[]) => void }) {
  const [search, setSearch] = useState(''), [selectedOnly, setSelectedOnly] = useState(false);
  const query = search.trim().toLowerCase();
  const visible = catalogue.filter(item => (!selectedOnly || selected.includes(item.key)) && [item.label, item.category, item.description, item.key].some(text => text.toLowerCase().includes(query)));
  const ungrantable = selected.filter(key => !grants.includes(key));
  return <section className="page-stack" aria-label="Role permissions">
    <p>Custom roles replace system permissions. Read, Manage, Own and Team are independent capabilities when present in the server catalogue. No related permission is selected automatically.</p>
    <p role="status">Current: {original.length} permissions · Proposed: {selected.length} permissions · Showing {visible.length} of {catalogue.length}</p>
    <label className="field">Search permissions<input type="search" maxLength={200} value={search} onChange={event => setSearch(event.target.value)} placeholder="Permission label or module" /></label>
    <label className="flex items-start gap-2"><input type="checkbox" checked={selectedOnly} onChange={event => setSelectedOnly(event.target.checked)} />Show selected permissions only</label>
    {ungrantable.length > 0 && <section className="panel" aria-label="Permissions outside your authority"><p>These selected permissions are outside your current authority. Remove them explicitly before saving; they cannot be granted again here.</p><ul>{ungrantable.map(key => <li key={key}>{permissionLabel(catalogue, key)} <button type="button" className="quiet-button" onClick={() => onChange(selected.filter(item => item !== key))}>Remove {permissionLabel(catalogue, key)}</button></li>)}</ul></section>}
    {!visible.length && <p>No permissions match these filters. Hidden selections are preserved.</p>}
    {Array.from(new Set(visible.map(item => item.category))).map(category => <fieldset key={category} className="page-stack"><legend className="font-semibold">{category}</legend>{visible.filter(item => item.category === category).map(item => <label key={item.key} className="flex items-start gap-2"><input type="checkbox" disabled={!grants.includes(item.key) && !selected.includes(item.key)} checked={selected.includes(item.key)} onChange={event => onChange(event.target.checked ? [...selected, item.key] : selected.filter(key => key !== item.key))} /><span>{item.label}<small className="block muted">{item.description}</small></span></label>)}</fieldset>)}
  </section>;
}

export function RolePermissionReview({ catalogue, original, selected }: Selection) {
  const groups = [
    ['Current permissions', original],
    ['Proposed permissions', selected],
    ['Added permissions', selected.filter(key => !original.includes(key))],
    ['Removed permissions', original.filter(key => !selected.includes(key))],
  ] as const;
  return <div className="page-stack">{groups.map(([title, keys]) => <section className="panel" aria-label={title} key={title}><h4 className="font-semibold">{title} · {keys.length}</h4>{keys.length ? <ul>{keys.map(key => <li className="break-words" key={key}>{permissionLabel(catalogue, key)}</li>)}</ul> : <p>None</p>}</section>)}</div>;
}
