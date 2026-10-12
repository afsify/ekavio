import { formSections, type FormSchema, type Section } from './formSchema';

export interface LayoutDraft { authority: string; schema: FormSchema; original: Section[]; sections: Section[] }
export const cloneSections = (sections: Section[]): Section[] => sections.map(section => ({ id: section.id, title: section.title, status: section.status ?? 'active', fields: section.fields.map(field => ({ key: field.key, visible: field.visible })) }));
// Display-only fallback for unplaced fields, not authority for a default reset.
export const layoutSections = (schema: FormSchema) => formSections(schema).map(section => section.id === 'unplaced' && !section.title ? { ...section, title: 'General' } : section);
export function startLayoutDraft(schema: FormSchema, authority: string): LayoutDraft {
  const snapshot = structuredClone(schema);
  const original = cloneSections(layoutSections(snapshot)).map(section => ({ ...section, id: section.id === 'unplaced' ? crypto.randomUUID() : section.id }));
  return { authority, schema: snapshot, original, sections: cloneSections(original) };
}
// Only ordered, persisted semantics count; property order/extra DTO metadata do not.
export function sameLayout(a: Section[], b: Section[]): boolean {
  return a.length === b.length && a.every((section, index) => {
    const other = b[index];
    return section.id === other.id && section.title === other.title && (section.status ?? 'active') === (other.status ?? 'active') && section.fields.length === other.fields.length && section.fields.every((field, position) => field.key === other.fields[position].key && field.visible === other.fields[position].visible);
  });
}
export function layoutErrors(schema: FormSchema, sections: Section[]): string[] {
  const errors: string[] = [];
  if (!sections.length || sections.length > 20) errors.push('Use 1–20 sections, including retained archived sections.');
  if (sections.some(section => !section.title.trim() || section.title.length > 100)) errors.push('Every section needs a title of 1–100 characters.');
  if (sections.some(section => section.fields.length > 100)) errors.push('Use at most 100 placements per section.');
  if (sections.some(section => section.status === 'archived' && section.fields.length)) errors.push('Move all fields before archiving a section.');
  const fields = sections.flatMap(section => section.fields), known = [...schema.builtins, ...schema.definitions];
  if (new Set(fields.map(field => field.key)).size !== fields.length || fields.some(field => !known.some(item => item.key === field.key))) errors.push('Each known field may be placed only once.');
  for (const field of [...schema.builtins.filter(field => field.required), ...schema.definitions.filter(field => field.required && field.status === 'active')]) {
    if (!sections.some(section => section.status !== 'archived' && section.fields.some(placement => placement.key === field.key && placement.visible))) errors.push(`${field.label} is required and must stay placed and visible.`);
  }
  return errors;
}
export function layoutChanges(original: Section[], sections: Section[], schema: FormSchema): string[] {
  const changes: string[] = [], names = new Map([...schema.builtins, ...schema.definitions].map(field => [field.key, field.label]));
  for (const section of sections) for (const field of section.fields) if (!schema.sections.some(saved => saved.fields.some(placement => placement.key === field.key))) changes.push(`Place previously unplaced ${names.get(field.key) ?? field.key} in ${section.title}`);
  sections.forEach((section, index) => {
    const oldIndex = original.findIndex(item => item.id === section.id), old = original[oldIndex];
    if (!old) changes.push(`Add section: ${section.title}`);
    else {
      if (old.title !== section.title) changes.push(`Rename section: ${old.title} → ${section.title}`);
      if (oldIndex !== index) changes.push(`Reorder section: ${section.title} to position ${index + 1}`);
      if ((old.status ?? 'active') !== (section.status ?? 'active')) changes.push(`${section.status === 'archived' ? 'Archive empty' : 'Reactivate'} section: ${section.title}`);
    }
    section.fields.forEach((field, position) => {
      const previous = original.find(item => item.fields.some(placement => placement.key === field.key));
      const priorPosition = previous?.fields.findIndex(item => item.key === field.key), prior = previous?.fields.find(item => item.key === field.key);
      if (!previous) changes.push(`Place ${names.get(field.key) ?? field.key} in ${section.title}`);
      else if (previous.id !== section.id) changes.push(`Move ${names.get(field.key) ?? field.key}: ${previous.title} → ${section.title}`);
      else if (priorPosition !== position) changes.push(`Reorder ${names.get(field.key) ?? field.key} to position ${position + 1} in ${section.title}`);
      if (prior && prior.visible !== field.visible) changes.push(`${field.visible ? 'Show' : 'Hide'} ${names.get(field.key) ?? field.key}; stored values are preserved`);
    });
  });
  return changes;
}
