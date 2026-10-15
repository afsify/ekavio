import { describe,it,expect,vi,afterEach } from 'vitest';
import { act,render,screen,cleanup,fireEvent,waitFor } from '@testing-library/react';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import CrmPage from '../pages/CRM/CrmPage';
import { activityLabels,localDateTime } from '../pages/CRM/contracts';
import { visibleDestinations } from '../components/layout/navigation';
import { useAppStore } from '../store/useAppStore';
import { client } from '../api/client';
import { currentLayoutAuthority } from '../hooks/useLayoutStudio';
vi.mock('../api/client',()=>({client:{get:vi.fn(),post:vi.fn(),patch:vi.fn()}}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
const entitlements={modules:[{key:'crm',enabled:true}]} as never;
const setup=(permissions:string[])=>{
 useAppStore.setState({user:{id:'qa',permissions} as never,activeTenantId:'org',activeBranchId:'branch',entitlements});
 vi.mocked(client.get).mockImplementation(async(path)=>({data:{data:path==='/crm/overview'?{active:0,today:0,overdue:0,unassigned:0,timezone:'Asia/Kolkata',businessDate:'2026-10-07',stages:[]}:path==='/crm/leads'||path==='/crm/followups'?{data:[],total:0,page:1,limit:20,timezone:'Asia/Kolkata'}:path.includes('/forms/')?{entity:'lead',version:0,definitions:[],sections:[],builtins:[]}:[]}}) as never);
 const cache=new QueryClient({defaultOptions:{queries:{retry:false}}});
 render(<QueryClientProvider client={cache}><MemoryRouter><CrmPage/></MemoryRouter></QueryClientProvider>);
 return cache;
};
describe('CRM shared presentation',()=>{
 it('commercial and permission navigation checks are independent',()=>{expect(visibleDestinations(['crm.read'],null,false).some(d=>d.path==='/crm')).toBe(false);expect(visibleDestinations([],entitlements,false).some(d=>d.path==='/crm')).toBe(false);expect(visibleDestinations(['crm.read'],entitlements,false).find(d=>d.path==='/crm')?.name).toBe('CRM & Follow-ups');});
 it('uses branch-local time rather than browser-local wall clock',()=>{expect(localDateTime('2026-09-26T05:00:00.000Z','Asia/Kolkata')).toBe('2026-09-26T10:30');});
 it('closed activity labels do not present SQL IDs as primary text',()=>{expect(activityLabels['lead.converted']).toBe('Converted to Customer');expect(activityLabels['followup.completed']).toBe('Follow-up completed');});
 it('read-only CRM renders factual empty state without management controls',async()=>{setup(['crm.read']);await screen.findByRole('heading',{name:'No leads yet'});expect(screen.queryByRole('button',{name:'Create lead'})).toBeNull();expect(screen.queryByRole('button',{name:'Pipeline settings'})).toBeNull();expect(screen.getByRole('heading',{name:'Active leads'})).toBeTruthy();});
 it('manager explicitly configures empty pipeline, no auto seeding on read',async()=>{vi.mocked(client.post).mockResolvedValue({data:{data:{created:5}}});setup(['crm.read','crm.manage']);await screen.findByRole('heading',{name:'No leads yet'});expect(client.post).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Pipeline settings'}));fireEvent.click(screen.getByRole('button',{name:'Create recommended stages'}));await waitFor(()=>expect(client.post).toHaveBeenCalledWith('/crm/stages/recommended',{}));});
 it('search remains bounded and propagates to the shared server query',async()=>{setup(['crm.read']);const search=await screen.findByRole('searchbox',{name:'Search leads'});expect(search.getAttribute('maxlength')).toBe('200');fireEvent.change(search,{target:{value:'No match'}});await waitFor(()=>expect(client.get).toHaveBeenCalledWith('/crm/leads',expect.objectContaining({params:expect.objectContaining({search:'No match'})})));});
});
it('Today and Overdue summary actions query Follow-ups rather than misrepresenting action counts as Lead counts', async () => {
 setup(['crm.read']); await screen.findByRole('heading', { name: 'No leads yet' });
 fireEvent.click(screen.getByRole('button', { name: 'View due today' }));
 await waitFor(() => expect(client.get).toHaveBeenCalledWith('/crm/followups', expect.objectContaining({ params: { view: 'today', page: 1, limit: 20 } })));
 fireEvent.click(screen.getByRole('button', { name: 'View overdue follow-ups' }));
 await waitFor(() => expect(client.get).toHaveBeenCalledWith('/crm/followups', expect.objectContaining({ params: { view: 'overdue', page: 1, limit: 20 } })));
 expect(screen.getByRole('button', { name: 'Overdue' }).getAttribute('aria-pressed')).toBe('true');
});
it('all five manual Follow-up shortcuts preserve canonical server views and selected state', async () => {
 setup(['crm.read']); await screen.findByRole('heading', { name: 'No leads yet' });
 fireEvent.click(screen.getByRole('button', { name: 'Follow-ups' }));
 for(const [view,label] of [['today','Today'],['overdue','Overdue'],['upcoming','Upcoming'],['completed','Completed'],['all','All / history']]) {
  const button=screen.getByRole('button', { name: label }); fireEvent.click(button);
  await waitFor(()=>expect(client.get).toHaveBeenCalledWith('/crm/followups', expect.objectContaining({params:{view,page:1,limit:20}})));
  expect(button.getAttribute('aria-pressed')).toBe('true'); expect((screen.getByRole('combobox', { name: 'Follow-up view' }) as HTMLSelectElement).value).toBe(view);
 }
});
it('collapsed Lead filters are independently removable and preserve bounded server query semantics', async () => {
 setup(['crm.read']); const search = await screen.findByRole('searchbox', { name: 'Search leads' });
 const details = screen.getByText('Lead filters').closest('details')!; expect(details.open).toBe(false);
 fireEvent.change(search, { target: { value: 'QA private search' } });
 fireEvent.click(screen.getByRole('button', { name: 'View unassigned leads' }));
 await waitFor(() => expect(client.get).toHaveBeenCalledWith('/crm/leads', expect.objectContaining({ params: { assignee: 'unassigned', status: 'active', page: 1, limit: 20 } })));
 fireEvent.click(screen.getByRole('button', { name: 'Remove Assigned staff filter' }));
 await waitFor(() => expect(client.get).toHaveBeenCalledWith('/crm/leads', expect.objectContaining({ params: { status: 'active', page: 1, limit: 20 } })));
 fireEvent.click(screen.getByRole('button', { name: 'Clear lead filters' }));
 await waitFor(() => expect(client.get).toHaveBeenCalledWith('/crm/leads', expect.objectContaining({ params: { page: 1, limit: 20 } })));
});
it('late Follow-up edit reads cannot open a form after management authority changes', async () => {
 setup(['crm.read','crm.manage']); await screen.findByRole('heading', { name: 'No leads yet' });
 const original=vi.mocked(client.get).getMockImplementation()!;
 let release!:(value:unknown)=>void; const pending=new Promise(resolve=>{release=resolve;});
 vi.mocked(client.get).mockImplementation(async(path,config)=>{
  if(path==='/crm/followups')return {data:{data:{data:[{id:'qa-followup',lead_id:'qa-lead',lead_name:'QA lead',subject:'QA follow-up',type:'task',status:'pending',due_at:'2026-10-07T05:00:00Z',version:1}],total:1,page:1,limit:20,timezone:'Asia/Kolkata'}}} as never;
  if(path==='/crm/leads/qa-lead')return {data:{data:await pending}} as never;
  return original(path,config);
 });
 fireEvent.click(screen.getByRole('button', { name: 'Follow-ups' })); await screen.findByRole('heading', { name: 'QA follow-up' });
 fireEvent.click(screen.getByRole('button', { name: 'Edit follow-up' })); await screen.findByText('Loading current Lead for follow-up…');
 act(()=>useAppStore.setState({user:{...useAppStore.getState().user!,permissions:['crm.read']}}));
 await act(async()=>release({id:'qa-lead',name:'QA lead',status:'active',version:1}));
 await screen.findByRole('heading', { name: 'Follow-up could not be opened' }); expect(screen.queryByRole('dialog')).toBeNull(); expect(screen.queryByRole('button', { name: 'Retry Lead' })).toBeNull(); expect(client.post).not.toHaveBeenCalled(); expect(client.patch).not.toHaveBeenCalled();
});
it('CRM writes invalidate actual dashboard and notification cache keys', async () => {
 vi.mocked(client.post).mockResolvedValue({data:{data:{created:5}}});
 const cache=setup(['crm.read','crm.manage']);
 cache.setQueryData(['dashboardStats','qa','org','branch'],{widgets:[]});
 cache.setQueryData(['notifications','qa','org','branch'],{rows:[]});
 const scope=JSON.parse(currentLayoutAuthority()) as unknown[];
 cache.setQueryData(['notifications',...scope],{rows:[]});
 cache.setQueryData(['dashboardStats','qa','foreign-org','branch'],{widgets:[]});
 cache.setQueryData(['notifications','qa','foreign-org','branch'],{rows:[]});
 await screen.findByRole('heading',{name:'No leads yet'});
 fireEvent.click(screen.getByRole('button',{name:'Pipeline settings'}));
 fireEvent.click(screen.getByRole('button',{name:'Create recommended stages'}));
 await waitFor(()=>expect(cache.getQueryState(['dashboardStats','qa','org','branch'])?.isInvalidated).toBe(true));
 expect(cache.getQueryState(['notifications',...scope])?.isInvalidated).toBe(true);
 expect(cache.getQueryState(['dashboardStats','qa','foreign-org','branch'])?.isInvalidated).toBe(false);
 expect(cache.getQueryState(['notifications','qa','foreign-org','branch'])?.isInvalidated).toBe(false);
});
it('does not start a versioned action from cached Lead details while authoritative refresh is pending', async () => {
 useAppStore.setState({user:{id:'qa',permissions:['crm.read','crm.manage','customers.manage']} as never,activeTenantId:'org',activeBranchId:'branch',entitlements,isPlatformOperator:false});
 const lead={id:'qa-lead',name:'QA cached Lead',status:'active',version:1,pipeline_stage_id:'stage',stage_name:'New',branch_name:'Main'};
 const cache=new QueryClient({defaultOptions:{queries:{retry:false}}});cache.setQueryData(['crm',...JSON.parse(currentLayoutAuthority()),'detail',lead.id],lead);
 let release!:(value:unknown)=>void;const pending=new Promise(resolve=>{release=resolve;});
 vi.mocked(client.get).mockImplementation(async path=>({data:{data:path==='/crm/leads/qa-lead'?await pending:path==='/crm/overview'?{timezone:'Asia/Kolkata',stages:[]}:path==='/crm/leads'?{data:[lead],total:1,page:1,limit:20,timezone:'Asia/Kolkata'}:path.includes('/forms/')?(path.endsWith('/schema')?{entity:'lead',version:0,definitions:[],sections:[],builtins:[]}:{ }):path.endsWith('/followups')?{data:[],total:0,page:1,limit:20}:[]}}) as never);
 render(<QueryClientProvider client={cache}><MemoryRouter initialEntries={['/crm?lead=qa-lead']}><CrmPage/></MemoryRouter></QueryClientProvider>);
 await screen.findByText('Refreshing current Lead version…');expect(screen.queryByRole('button',{name:'Convert to Customer'})).toBeNull();expect(screen.queryByRole('button',{name:'Edit lead'})).toBeNull();
 release({...lead,version:2});await screen.findByRole('button',{name:'Convert to Customer'});expect(client.post).not.toHaveBeenCalled();
});
