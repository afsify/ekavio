import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, Search } from 'lucide-react';
import { Input, type InputProps } from './Input';
import { AdvancedModal } from './AdvancedModal';

/** Small semantic building blocks; domain pages retain their own contracts. */
export function AppPage({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`page-stack app-page ${className}`}>{children}</div>;
}
export function PageHeader({ title, description, eyebrow, actions }: { title: string; description?: string; eyebrow?: string; actions?: ReactNode }) {
  return <header className="page-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</header>;
}
export function SectionHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <div className="section-heading"><div><h2>{title}</h2>{description && <p className="muted">{description}</p>}</div>{actions}</div>;
}
export function StatCard({ label, value, description, to }: { label: string; value: string; description: string; to: string }) {
  return <Link className="panel stat-card" to={to}><h2>{label}</h2><p className="stat-value">{value}</p><p className="muted">{description}</p><span className="stat-link">View workspace <ArrowRight size={16} aria-hidden="true" /></span></Link>;
}
export function ActionCard({ title, description, to, icon }: { title: string; description: string; to: string; icon?: ReactNode }) {
  return <Link className="panel action-card" to={to}>{icon}<div><h3>{title}</h3><p className="muted">{description}</p></div><ArrowRight size={18} aria-hidden="true" /></Link>;
}
export function StatusBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }) {
  return <span className={`status-badge status-${tone}`}>{children}</span>;
}
export function SearchField(props: InputProps) {
  return <Input {...props} type="search" icon={<Search size={18} aria-hidden="true" />} />;
}
export function FilterPanel({ children, open, onToggle, count = 0 }: { children: ReactNode; open: boolean; onToggle: () => void; count?: number }) {
  return <div className="filter-panel"><button className="quiet-button" aria-expanded={open} onClick={onToggle}>Filters{count ? ` (${count})` : ''}</button>{open && <section className="panel filter-controls" aria-label="Customer filters">{children}</section>}</div>;
}
export function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return <button className="filter-chip" onClick={onRemove} aria-label={`Remove ${label} filter`}>{label} <span aria-hidden="true">×</span></button>;
}
export function Skeleton({ label = 'Loading…', rows = 3 }: { label?: string; rows?: number }) {
  return <div className="skeleton-stack" role="status"><span className="sr-only">{label}</span>{Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton-row" aria-hidden="true" />)}</div>;
}
export function ErrorState({ title, message, retry, retryLabel = 'Retry' }: { title: string; message: string; retry?: () => void; retryLabel?: string }) {
  return <section className="panel error-state" role="alert"><AlertCircle size={24} aria-hidden="true" /><div><h2>{title}</h2><p>{message}</p>{retry && <button className="quiet-button" onClick={retry}>{retryLabel}</button>}</div></section>;
}
export function Pagination({ page, totalPages, total, pageSize, onPage, onPageSize, busy = false }: { page: number; totalPages: number; total?: number; pageSize?: number; onPage: (page: number) => void; onPageSize?: (size: number) => void; busy?: boolean }) {
  return <nav className="table-pagination" aria-label="Record pagination"><div>{total !== undefined && <span className="muted">{total} {total === 1 ? 'record' : 'records'}</span>}{onPageSize && <label>Rows per page<select value={pageSize} disabled={busy} onChange={e => onPageSize(Number(e.target.value))}>{[10,20,50,100].map(size => <option key={size}>{size}</option>)}</select></label>}</div><div className="pagination"><button className="quiet-button" disabled={busy || page <= 1} onClick={() => onPage(page - 1)}>Previous</button><span aria-live="polite">Page {page} of {Math.max(1, totalPages)}</span><button className="quiet-button" disabled={busy || page >= totalPages} onClick={() => onPage(page + 1)}>Next</button></div></nav>;
}
export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="detail-section"><h3>{title}</h3>{children}</section>;
}
export function ConfirmationDialog({ open, title, description, confirmLabel, onConfirm, onCancel }: { open: boolean; title: string; description: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  return <AdvancedModal isOpen={open} onClose={onCancel} title={title} actions={<><button className="quiet-button" onClick={onCancel}>Keep editing</button><button className="action-link" onClick={onConfirm}>{confirmLabel}</button></>}><p>{description}</p></AdvancedModal>;
}
