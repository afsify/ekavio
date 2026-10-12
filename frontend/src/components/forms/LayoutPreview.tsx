import { useState } from 'react';
import { AdvancedModal } from '../ui/AdvancedModal';
import { Input } from '../ui/Input';
import { DynamicForm } from './DynamicForm';
import type { FieldValue, FormSchema, Section } from './formSchema';

/** Component-local disposable values. No record hook, defaults, cache or write API. */
export function LayoutPreview({ schema, sections, mode, dirty, onClose }: { schema: FormSchema; sections: Section[]; mode: 'desktop' | 'mobile'; dirty: boolean; onClose: () => void }) {
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  return <AdvancedModal isOpen onClose={onClose} title={`${mode === 'mobile' ? 'Mobile' : 'Desktop'} form preview`} size="xl" actions={<><button className="quiet-button" onClick={() => setValues({})}>Clear preview samples</button><button className="action-link" onClick={onClose}>Close preview</button></>}>
    <div className={`page-stack layout-preview ${mode === 'mobile' ? 'layout-preview-phone' : ''}`}>
      <p role="status">{dirty ? 'Unsaved layout preview' : 'Current layout preview'} · Preview only; nothing is saved.</p>
      <p className="muted">Use disposable samples only. Built-in controls are illustrative and disabled. Custom controls use the shared renderer. Unsaved definition edits are not included.</p>
      <DynamicForm schema={{ ...schema, sections }} values={values} onChange={(key, value) => setValues(previous => ({ ...previous, [key]: value }))} builtins={Object.fromEntries(schema.builtins.map(field => [field.key, <Input key={field.key} label={field.label} required={field.required} disabled placeholder="Built-in field (preview)" helper="Canonical record control — illustrative preview only" />]))} />
    </div>
  </AdvancedModal>;
}
