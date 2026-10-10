import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AxiosError } from 'axios';
import { SupplierEditor } from '../pages/Purchasing/SuppliersPage';
import { OperationForm } from '../components/ui/OperationForm';
import { optionalEmailValid, uncertainWrite } from '../utils/mutationOutcome';
import { client } from '../api/client';
vi.mock('../api/client', () => ({ client: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function supplier() { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}><MemoryRouter><SupplierEditor supplier={null} close={() => {}} done={async () => {}} /></MemoryRouter></QueryClientProvider>); }
it('optional email and write outcomes keep validation and uncertainty distinct', () => {
  expect(optionalEmailValid('')).toBe(true); expect(optionalEmailValid('qa@example.test')).toBe(true); expect(optionalEmailValid('not-an-email')).toBe(false);
  expect(uncertainWrite(null)).toBe(false); expect(uncertainWrite(new Error('Lost response'))).toBe(true);
  expect(uncertainWrite(new AxiosError('Rejected', '', undefined, undefined, { status: 400 } as never))).toBe(false);
  expect(uncertainWrite(new AxiosError('Unknown', '', undefined, undefined, { status: 503 } as never))).toBe(true);
});
it('review blocks invalid optional contact but name alone is sufficient', () => {
  supplier(); fireEvent.change(screen.getByLabelText('Supplier name'), { target: { value: 'QA name only' } });
  const review = screen.getByRole('button', { name: /^Review$/ }) as HTMLButtonElement; expect(review.disabled).toBe(false);
  fireEvent.change(screen.getByLabelText('Email (optional)'), { target: { value: 'malformed' } }); expect(review.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Email (optional)'), { target: { value: '' } }); expect(review.disabled).toBe(false);
});
it('unknown non-idempotent Supplier creation cannot be replayed or falsely reported saved', async () => {
  vi.mocked(client.post).mockRejectedValue(new Error('Lost response')); supplier(); fireEvent.change(screen.getByLabelText('Supplier name'), { target: { value: 'QA one attempt' } });
  fireEvent.click(screen.getByRole('button', { name: /^Review$/ })); fireEvent.click(screen.getByRole('button', { name: /^Save Supplier$/ }));
  await screen.findByRole('alert'); await waitFor(() => expect(client.post).toHaveBeenCalledOnce());
  expect((screen.getByRole('button', { name: 'Save Supplier' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: /^Back$/ }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Save Supplier' })); expect(client.post).toHaveBeenCalledOnce();
});
it('reviewed commands prevent repeated confirmation before pending props arrive', () => {
  const confirm = vi.fn(); render(<OperationForm open title="Reviewed fact" dirty valid busy={false} onClose={() => {}} onConfirm={confirm} confirmLabel="Confirm fact" review={<p>Exact values</p>}><p>Draft</p></OperationForm>);
  fireEvent.click(screen.getByRole('button', { name: /^Review$/ })); fireEvent.click(screen.getByRole('button', { name: 'Confirm fact' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm fact' })); expect(confirm).toHaveBeenCalledOnce();
});
