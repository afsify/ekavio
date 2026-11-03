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
