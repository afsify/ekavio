import { useId, useState } from 'react';
import { Input } from '../ui/Input';
import { PhoneInput } from '../ui/PhoneInput';
import { DynamicForm } from './DynamicForm';
import type { useDynamicForm } from '../../hooks/useDynamicForm';

import { type CustomerDraft, customerPhoneError } from '../../utils/customerDraft';
export function CustomerFormFields({ form, setForm, fields, editing = false, originalPhone }: { form: CustomerDraft; setForm: (form: CustomerDraft) => void; fields: ReturnType<typeof useDynamicForm>; editing?: boolean; originalPhone?: string | null }) {
  const id = useId();
  const [nameTouched, setNameTouched] = useState(false);
  return fields.schema && <DynamicForm schema={fields.schema} values={fields.values} onChange={fields.change} builtins={{
    name: <Input label="Customer name" required maxLength={200} helper="Use the name your team will recognize. Up to 200 characters." error={nameTouched && !form.name.trim() ? 'Enter a customer name.' : undefined} value={form.name} onBlur={() => setNameTouched(true)} onChange={e => setForm({ ...form, name: e.target.value })} />,
    phone: <div><PhoneInput label="Customer phone (optional)" descriptionId={`${id}-phone-help`} value={form.phone} error={customerPhoneError(form.phone, originalPhone)} onChange={phone => setForm({ ...form, phone })} /><p id={`${id}-phone-help`} className="form-helper muted">Choose the country and enter a valid number, or leave this blank.</p></div>,
    notes: <div className="field"><label htmlFor={id}>Notes (optional)</label><textarea id={id} rows={4} maxLength={2000} aria-describedby={`${id}-notes-help`} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /><p id={`${id}-notes-help`} className="form-helper muted">Useful context for your team. Up to 2,000 characters.</p></div>,
    status: editing && <label className="field">Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as CustomerDraft['status'] })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>,
  }} />;
}
