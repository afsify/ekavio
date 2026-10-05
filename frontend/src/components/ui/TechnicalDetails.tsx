import toast from 'react-hot-toast';
export function TechnicalDetails({ values }: { values: Record<string, string | undefined | null> }) {
  return <details className="technical-details"><summary>Technical details</summary><dl>{Object.entries(values).filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd><code>{value}</code><button type="button" onClick={() => { if (!navigator.clipboard) { toast.error('Copy unavailable'); return; } void navigator.clipboard.writeText(value!).then(() => toast.success('Copied')).catch(() => toast.error('Copy unavailable')); }}>Copy {label}</button></dd></div>)}</dl></details>;
}
