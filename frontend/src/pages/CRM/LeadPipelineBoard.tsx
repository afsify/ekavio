import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserRound } from 'lucide-react';
import { client } from '../../api/client';
import { getErrorMessage } from '../../api/errors';
import { useOperationalScope } from '../../hooks/useOperationalContext';
import { ErrorState, Skeleton, StatusBadge } from '../../components/ui/WorkspacePrimitives';
import type { Lead, Page, Stage } from './contracts';
import './workbench.css';

const PAGE_SIZE = 5;
const STAGE_WINDOW = 3;
// The API bounds page to 200. Never turn a bounded page into a complete pipeline.
const MAX_PAGE = 200;

export function LeadPipelineBoard({ stages, filters, open }: {
  stages: Stage[];
  filters: Record<string, string>;
  open: (lead: Lead) => void;
}) {
  const [window, setWindow] = useState(0);
  const [pages, setPages] = useState<Record<string, number>>({});
  const selected = filters.stageId ? stages.filter(stage => stage.id === filters.stageId) : stages;
  const start = Math.min(window, Math.max(0, Math.ceil(selected.length / STAGE_WINDOW) - 1)) * STAGE_WINDOW;
  return <section className="crm-board-workspace" aria-label="Lead pipeline board">
    <div className="crm-board-toolbar">
      <div><h2>Pipeline workbench</h2><p className="muted">Each stage has its own server page and filtered total. Open a Lead to move stages; cards are not draggable.</p></div>
      {selected.length > STAGE_WINDOW && <nav aria-label="Board stage windows" className="record-actions">
        <button className="quiet-button" disabled={start === 0} onClick={() => setWindow(start / STAGE_WINDOW - 1)}>Previous stages</button>
        <span role="status">Stages {start + 1}–{Math.min(start + STAGE_WINDOW, selected.length)} of {selected.length}</span>
        <button className="quiet-button" disabled={start + STAGE_WINDOW >= selected.length} onClick={() => setWindow(start / STAGE_WINDOW + 1)}>Next stages</button>
      </nav>}
    </div>
    {!selected.length && <div className="panel"><h3>No pipeline stages available</h3><p>Choose another stage filter or ask an authorized manager to configure the pipeline.</p></div>}
    <div className="crm-board-columns">
      {selected.slice(start, start + STAGE_WINDOW).map(stage => <StageColumn key={stage.id} stage={stage} filters={filters}
        page={pages[stage.id] ?? 1} onPage={page => setPages(previous => ({ ...previous, [stage.id]: page }))} open={open} />)}
    </div>
  </section>;
}

function StageColumn({ stage, filters, page, onPage, open }: {
  stage: Stage; filters: Record<string, string>; page: number; onPage: (page: number) => void; open: (lead: Lead) => void;
}) {
  const scope = useOperationalScope();
  const query = useQuery({
    queryKey: ['crm', ...scope, 'board', filters, stage.id, page],
    queryFn: async ({ signal }) => (await client.get<{ data: Page<Lead> }>('/crm/leads', {
      params: { ...filters, stageId: stage.id, page, limit: PAGE_SIZE }, signal,
    })).data.data,
  });
  const result = query.data;
  return <section className="crm-board-column" aria-label={`${stage.name} stage`} aria-busy={query.isFetching}>
    <header className="crm-board-column-heading"><h3>{stage.name}</h3>{stage.status === 'archived' && <StatusBadge tone="neutral">Archived stage</StatusBadge>}
      {!query.isError && result && <span className="muted">{result.total} matching leads</span>}
    </header>
    {query.isPending ? <Skeleton label={`Loading ${stage.name} leads…`} /> : query.isError ? <ErrorState title="Stage could not be loaded"
      message={getErrorMessage(query.error, 'No complete stage result is available.')} retry={() => void query.refetch()} /> : result && <>
      {query.isFetching && <p role="status">Updating stage…</p>}
      {!result.data.length && <div className="crm-board-empty"><p>{page === 1 ? 'No leads match this stage and filters.' : 'No leads remain on this page.'}</p>
        {page > 1 && <button className="quiet-button" onClick={() => onPage(1)}>Back to first page</button>}</div>}
      <div className="crm-board-records">{result.data.map(lead => <article className="crm-board-card" key={lead.id}>
        <StatusBadge tone={lead.status === 'active' ? 'info' : lead.status === 'converted' ? 'success' : 'neutral'}>{lead.status}</StatusBadge>
        <h4><button className="crm-board-record-link" onClick={() => open(lead)} aria-label={`Open Lead ${lead.name}`}>{lead.name}</button></h4>
        <p className="muted">{lead.company || 'No company provided'}</p>
        <p className="crm-assignee"><UserRound size={16} aria-hidden="true" />{lead.assignee_name || 'Unassigned'}{lead.assignee_status && lead.assignee_status !== 'active' ? ' (inactive assignment)' : ''}</p>
        {lead.source && <p className="muted">Source: {lead.source}</p>}
      </article>)}</div>
      <nav className="crm-board-pagination" aria-label={`${stage.name} lead pages`}>
        <button className="quiet-button" disabled={page <= 1 || query.isFetching} onClick={() => onPage(page - 1)}>Previous</button>
        <span role="status">Page {page} of {Math.max(1, Math.ceil(result.total / PAGE_SIZE))}</span>
        <button className="quiet-button" disabled={page >= MAX_PAGE || page * PAGE_SIZE >= result.total || query.isFetching} onClick={() => onPage(page + 1)}>Next</button>
      </nav>
      {result.total > MAX_PAGE * PAGE_SIZE && <p className="muted">Only the first {MAX_PAGE * PAGE_SIZE} matches can be paged here. Narrow your filters to reach other Leads.</p>}
    </>}
  </section>;
}
