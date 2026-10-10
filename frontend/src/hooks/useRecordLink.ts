import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
/** Consume an explicit deep link once; never reopen its record in a new scope. */
export function useRecordLink(key: string) {
  const [params, setParams] = useSearchParams();
  const [record, setRecord] = useState<string | null>(params.get(key));
  useEffect(() => {
    if (!params.has(key)) return;
    const next = new URLSearchParams(params); next.delete(key);
    setParams(next, { replace: true });
  }, [key, params, setParams]);
  return [record, setRecord] as const;
}
