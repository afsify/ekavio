import { Link } from 'react-router-dom';
export function EmptyState({ title, description, action, to, onAction }: { title: string; description: string; action?: string; to?: string; onAction?: () => void }) {
  return <div className="empty-state"><h2>{title}</h2><p>{description}</p>{action && (to ? <Link className="action-link" to={to}>{action}</Link> : <button className="action-link" type="button" onClick={onAction}>{action}</button>)}</div>;
}
