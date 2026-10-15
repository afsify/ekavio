import { useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
// A replace navigation can still be pending when an authority change remounts
// the workspace. Remember consumption for that exact Router location, weakly;
// never retain record IDs or let the stale location reopen a different scope.
const consumedLinks = new WeakMap<object, Set<string>>();
/** Consume an explicit deep link once; never reopen its record in a new scope. */
export function useRecordLink(key: string) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const [record, setRecord] = useState<string | null>(() => consumedLinks.get(location)?.has(key) ? null : params.get(key));
  useEffect(() => {
    if (!params.has(key)) return;
    const consumed = consumedLinks.get(location) ?? new Set<string>();
    consumed.add(key); consumedLinks.set(location, consumed);
    const next = new URLSearchParams(params); next.delete(key);
    setParams(next, { replace: true });
  }, [key, params, setParams, location]);
  return [record, setRecord] as const;
}
