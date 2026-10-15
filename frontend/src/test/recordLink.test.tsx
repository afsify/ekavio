import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createPath, Router, type To } from 'react-router-dom';
import { useRecordLink } from '../hooks/useRecordLink';

afterEach(cleanup);
function Probe() {
  const [record, setRecord] = useRecordLink('lead');
  return <><p data-testid="record">{record ?? 'none'}</p><button onClick={() => setRecord(null)}>Dismiss record</button></>;
}
function router() {
  const location = { pathname: '/crm', search: '?lead=qa-link&preserved=yes', hash: '', state: null, key: 'qa-entry' };
  const navigator = { createHref: (to: To) => typeof to === 'string' ? to : createPath(to), go: vi.fn(), push: vi.fn(), replace: vi.fn() };
  return { location, navigator };
}
it('consumes an explicit link without losing its record or unrelated query criteria', async () => {
  const { location, navigator } = router();
  render(<Router location={location} navigator={navigator}><Probe/></Router>);
  await waitFor(() => expect(navigator.replace).toHaveBeenCalled());
  expect(navigator.replace.mock.calls[0]![0]).toMatchObject({ search: '?preserved=yes' });
  expect(screen.getByTestId('record').textContent).toBe('qa-link');
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss record' })); expect(screen.getByTestId('record').textContent).toBe('none');
});
it('a forced scope remount cannot reopen a consumed link while router cleanup is still deferred', async () => {
  // Frozen Router location models the observed pending navigation commit. Its
  // replace operation is real to the hook, but has not reached the new scope.
  const { location, navigator } = router();
  const view = render(<Router location={location} navigator={navigator}><Probe key="first-scope"/></Router>);
  await waitFor(() => expect(navigator.replace).toHaveBeenCalled());
  expect(screen.getByTestId('record').textContent).toBe('qa-link');
  view.rerender(<Router location={location} navigator={navigator}><Probe key="second-scope"/></Router>);
  expect(screen.getByTestId('record').textContent).toBe('none');
});
it('a fresh explicit history entry can still open the canonical record', async () => {
  const { location, navigator } = router();
  const view = render(<Router location={location} navigator={navigator}><Probe key="first-entry"/></Router>);
  await waitFor(() => expect(navigator.replace).toHaveBeenCalled()); fireEvent.click(screen.getByRole('button', { name: 'Dismiss record' }));
  view.rerender(<Router location={{ ...location, key: 'qa-explicit-entry' }} navigator={navigator}><Probe key="explicit-entry"/></Router>);
  expect(screen.getByTestId('record').textContent).toBe('qa-link');
});
