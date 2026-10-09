import { useId } from 'react';
import { Input } from '../ui/Input';
import { PhoneInput } from '../ui/PhoneInput';
import { DynamicForm } from './DynamicForm';
import type { useDynamicForm } from '../../hooks/useDynamicForm';

import { type CustomerDraft, customerPhoneError } from '../../utils/customerDraft';
export function CustomerFormFields({ form, setForm, fields, editing = false, originalPhone }: { form: CustomerDraft; setForm: (form: CustomerDraft) => void; fields: ReturnType<typeof useDynamicForm>; editing?: boolean; originalPhone?: string | null }) {
  const id = useId();
  return fields.schema && <DynamicForm schema={fields.schema} values={fields.values} onChange={fields.change} builtins={{
    name: <Input label="Customer name" required maxLength={200} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />,
    phone: <PhoneInput label="Customer phone (optional)" value={form.phone} error={customerPhoneError(form.phone, originalPhone)} onChange={phone => setForm({ ...form, phone })} />,
    notes: <div className="field"><label htmlFor={id}>Notes (optional)</label><textarea id={id} rows={4} maxLength={2000} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>,
    status: editing && <label className="field">Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as CustomerDraft['status'] })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>,
  }} />;
}
