/** In-memory ordering only. Never persist authority or request identifiers. */
let revision = 0;
let controller = new AbortController();

export const sessionRevision = () => revision;
export const sessionSignal = () => controller.signal;
export function advanceSessionRevision() {
  controller.abort();
  controller = new AbortController();
  return ++revision;
}

export type StartupError = 'unavailable' | 'recoverable';
export function sessionErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('response' in error)) return undefined;
  const response = error.response;
  if (!response || typeof response !== 'object' || !('status' in response)) return undefined;
  return typeof response.status === 'number' ? response.status : undefined;
}
export function classifyStartupError(error: unknown): StartupError {
  const status = sessionErrorStatus(error);
  return status === undefined || status >= 500 ? 'unavailable' : 'recoverable';
}

export const SESSION_REQUEST_TIMEOUT_MS = 20_000;

export type LogoutStatus = 'idle' | 'pending' | 'unconfirmed' | 'cleanup-required';
export const LOGOUT_BLOCKED_MESSAGE = 'Finish signing out before signing in again.';
export const LOGOUT_INTENT_KEY = 'ekavio-logout-intent';

// A tab-local intent flag survives a reload. Server confirmation stays in
// memory, and the flag carries no authority or cross-tab coordination.
export function readLogoutIntent(): 'none' | 'unconfirmed' | 'unavailable' {
  try {
    return window.sessionStorage.getItem(LOGOUT_INTENT_KEY) === null ? 'none' : 'unconfirmed';
  } catch {
    return 'unavailable';
  }
}

export function persistLogoutIntent(): boolean {
  try {
    window.sessionStorage.setItem(LOGOUT_INTENT_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

export function clearLogoutIntent(): boolean {
  try {
    window.sessionStorage.removeItem(LOGOUT_INTENT_KEY);
  } catch {
    return false;
  }
  return readLogoutIntent() === 'none';
}
