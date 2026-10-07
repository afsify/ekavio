import { describe,it,expect,vi,afterEach } from 'vitest';
import { render,screen,cleanup,fireEvent,waitFor } from '@testing-library/react';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import CrmPage from '../pages/CRM/CrmPage';
import { activityLabels,localDateTime } from '../pages/CRM/contracts';
import { visibleDestinations } from '../components/layout/navigation';
import { useAppStore } from '../store/useAppStore';
import { client } from '../api/client';
vi.mock('../api/client',()=>({client:{get:vi.fn(),post:vi.fn(),patch:vi.fn()}}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
const entitlements={modules:[{key:'crm',enabled:true}]} as never;
const setup=(permissions:string[])=>{
 useAppStore.setState({user:{id:'qa',permissions} as never,activeTenantId:'org',activeBranchId:'branch',entitlements});
 vi.mocked(client.get).mockImplementation(async(path)=>({data:{data:path==='/crm/overview'?{active:0,today:0,overdue:0,unassigned:0,timezone:'Asia/Kolkata',businessDate:'2026-10-07',stages:[]}:path==='/crm/leads'?{data:[],total:0,page:1,limit:20,timezone:'Asia/Kolkata'}:path.includes('/forms/')?{entity:'lead',version:0,definitions:[],sections:[],builtins:[]}:[]}}) as never);
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter><CrmPage/></MemoryRouter></QueryClientProvider>);
};
describe('CRM shared presentation',()=>{
 it('commercial and permission navigation checks are independent',()=>{expect(visibleDestinations(['crm.read'],null,false).some(d=>d.path==='/crm')).toBe(false);expect(visibleDestinations([],entitlements,false).some(d=>d.path==='/crm')).toBe(false);expect(visibleDestinations(['crm.read'],entitlements,false).find(d=>d.path==='/crm')?.name).toBe('CRM & Follow-ups');});
 it('uses branch-local time rather than browser-local wall clock',()=>{expect(localDateTime('2026-09-26T05:00:00.000Z','Asia/Kolkata')).toBe('2026-09-26T10:30');});
 it('closed activity labels do not present SQL IDs as primary text',()=>{expect(activityLabels['lead.converted']).toBe('Converted to Customer');expect(activityLabels['followup.completed']).toBe('Follow-up completed');});
 it('read-only CRM renders factual empty state without management controls',async()=>{setup(['crm.read']);await screen.findByRole('heading',{name:'No leads yet'});expect(screen.queryByRole('button',{name:'Create lead'})).toBeNull();expect(screen.queryByRole('button',{name:'Pipeline settings'})).toBeNull();expect(screen.getByRole('heading',{name:'Active leads'})).toBeTruthy();});
 it('manager explicitly configures empty pipeline, no auto seeding on read',async()=>{vi.mocked(client.post).mockResolvedValue({data:{data:{created:5}}});setup(['crm.read','crm.manage']);await screen.findByRole('heading',{name:'No leads yet'});expect(client.post).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Pipeline settings'}));fireEvent.click(screen.getByRole('button',{name:'Create recommended stages'}));await waitFor(()=>expect(client.post).toHaveBeenCalledWith('/crm/stages/recommended',{}));});
 it('search remains bounded and propagates to the shared server query',async()=>{setup(['crm.read']);const search=await screen.findByRole('searchbox',{name:'Search leads'});expect(search.getAttribute('maxlength')).toBe('200');fireEvent.change(search,{target:{value:'No match'}});await waitFor(()=>expect(client.get).toHaveBeenCalledWith('/crm/leads',expect.objectContaining({params:expect.objectContaining({search:'No match'})})));});
});
