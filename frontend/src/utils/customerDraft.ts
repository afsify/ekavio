import { client } from '../api/client';
import { normalizePhone } from './phone';
import type { FieldValue } from '../components/forms/DynamicForm';

export interface CustomerDraft { name: string; phone: string; notes: string; status: 'active' | 'inactive' }
export const blankCustomer: CustomerDraft = { name: '', phone: '', notes: '', status: 'active' };
export const customerPhoneError = (phone: string, original?: string | null) => phone && phone !== original && !normalizePhone(phone) ? 'Enter a valid phone number or leave it blank.' : undefined;
/** Shared canonical Customer save: directory and reception quick-create use this same path. */
export async function saveCustomer(form: CustomerDraft, customFields: Record<string, FieldValue>, id?: string, originalPhone?: string | null) {
  if (!form.name.trim() || customerPhoneError(form.phone, originalPhone)) throw new Error('Enter a customer name and valid optional phone.');
  const body = { name: form.name.trim(), phone: form.phone.trim() || null, notes: form.notes.trim() || null, customFields, ...(id ? { status: form.status } : {}) };
  return (await (id ? client.patch(`/customers/${id}`, body) : client.post('/customers', body))).data;
}
