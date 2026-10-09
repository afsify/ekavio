import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { OperationForm } from '../components/ui/OperationForm';
import { branchTime, decimalUnits, nominalEnd, quantityText, shiftBusinessDate } from '../utils/operations';
import { exportToCSV } from '../utils/exportUtils';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it('money and stock previews are exact beyond Number precision and reject coercion', () => {
  expect(decimalUnits('92233720368547758.07', 2)).toBe(9223372036854775807n);
  expect(decimalUnits('999999999999999.999', 3)).toBe(999999999999999999n);
  expect(quantityText(-1125n)).toBe('-1.125');
  expect(quantityText(10n)).toBe('0.010');
  for (const input of ['', '-1', '+1', '1e3', 'NaN', ' 1', '1.001']) expect(decimalUnits(input, 2)).toBeNull();
});
it('branch time and business-date navigation never use the device timezone', () => {
  expect(branchTime('2026-10-12T05:00:00Z', 'Asia/Kolkata')).toBe('10:30');
  expect(branchTime('2026-10-12T05:00:00Z', 'America/New_York')).toBe('01:00');
  expect(branchTime('2026-10-12T05:00:00Z')).toBe('—');
  expect(shiftBusinessDate('2024-02-28', 1)).toBe('2024-02-29');
  expect(shiftBusinessDate('2026-12-31', 1)).toBe('2027-01-01');
  expect(nominalEnd('2026-10-12', '23:45', 30)).toBe('2026-10-13 00:15');
});
it('review is required, invalid/busy confirmation is disabled, and failed commands keep review immutable', () => {
  const confirm = vi.fn(), close = vi.fn();
  const props = { open: true, title: 'Stock command', valid: true, busy: false, dirty: true, onConfirm: confirm, onClose: close, confirmLabel: 'Save', review: <p>Exact change 1.125</p>, children: <input aria-label="Draft" /> };
  const view = render(<OperationForm {...props} />);
  expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Review' }));
  expect(confirm).not.toHaveBeenCalled(); expect(screen.queryByLabelText('Draft')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Save' })); expect(confirm).toHaveBeenCalledOnce();
  view.rerender(<OperationForm {...props} busy />);
  expect((screen.getByRole('button', { name: 'Saving…' }) as HTMLButtonElement).disabled).toBe(true);
  view.rerender(<OperationForm {...props} error={new Error('Network failure')} />);
  expect((screen.getByRole('button', { name: 'Back' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole('alert').textContent).toContain('original command key');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(close).not.toHaveBeenCalled(); expect(screen.getAllByRole('dialog')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Discard changes' })); expect(close).toHaveBeenCalledOnce();
});
it('current-page CSV neutralizes formulas, quotes CR/newlines and releases its object URL', async () => {
  vi.useFakeTimers(); let content = '';
  const OriginalBlob = Blob;
  vi.stubGlobal('Blob', class extends OriginalBlob { constructor(parts: BlobPart[], options?: BlobPropertyBag) { content = parts.join(''); super(parts, options); } });
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:qa'), revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  exportToCSV([{ name: ' =SUM(A1)', note: 'line\rnext', amount: '123.45' }], 'current-page');
  expect(content).toContain("' =SUM(A1)"); expect(content).toContain('"line\rnext"'); expect(content).toContain('123.45');
  await vi.advanceTimersByTimeAsync(1000); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:qa');
});
