import {it,expect,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import OrganizationPage from '../pages/Settings/OrganizationPage';
import {client} from '../api/client';
import {useAppStore} from '../store/useAppStore';
import {visibleDestinations} from '../components/layout/navigation';
const setup=(section:'roles'|'branches'|'overview'|'audit')=>render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter><OrganizationPage section={section}/></MemoryRouter></QueryClientProvider>);
it('CORE navigation is independent of Queue and platform authority',()=>{const paths=visibleDestinations(['customers.read','services.read'],null,false).map(p=>p.path);expect(paths).toContain('/customers');expect(paths).toContain('/services');expect(paths).not.toContain('/queue');expect(paths).not.toContain('/platform');});
it('custom role catalogue is loaded from server, unknown frontend authority is not invented',async()=>{
  useAppStore.setState({user:{id:'fixture',tenantId:'fixture',role:'admin',permissions:['roles.read','roles.manage','customers.read']}});
  vi.spyOn(client,'get').mockResolvedValue({data:{data:{catalogue:[{key:'customers.read',label:'Server customer label',description:'Server description',category:'Customers'}],system:[],custom:[]}}});
  setup('roles');await screen.findByText('No custom roles yet.');fireEvent.click(screen.getByRole('button',{name:'Create role'}));expect(screen.getByRole('checkbox',{name:/Server customer label/})).toBeTruthy();expect(screen.queryByText('platform.operator')).toBeNull();
});
it('readonly branch viewer has no create control and gets explicit empty state',async()=>{useAppStore.setState({user:{id:'fixture',tenantId:'fixture',role:'staff',permissions:['branches.read']}});vi.spyOn(client,'get').mockResolvedValue({data:{data:[]}});setup('branches');await screen.findByText('No matching branches.');expect(screen.queryByRole('button',{name:'Create branch'})).toBeNull();});
it('organization failures show retry, without a fabricated success state',async()=>{useAppStore.setState({user:{id:'fixture',tenantId:'fixture',role:'admin',permissions:['organization.read']}});vi.spyOn(client,'get').mockRejectedValue(new Error('Unavailable'));setup('overview');await screen.findByRole('alert');expect(screen.getByRole('button',{name:'Retry'})).toBeTruthy();expect(screen.queryByText('Business profile')).toBeNull();});
it('audit projection displays human actor and does not expose payload details',async()=>{useAppStore.setState({user:{id:'fixture',tenantId:'fixture',role:'admin',permissions:['audit.read']}});vi.spyOn(client,'get').mockResolvedValue({data:{data:[{id:'fixture-event',actor:'Fixture actor',action:'role.created',occurred_at:'2026-10-06T00:00:00Z'}]}});setup('audit');await screen.findByText('role · created');expect(screen.getByText(/Fixture actor/)).toBeTruthy();expect(screen.queryByText('fixture-event')).toBeNull();});
it('module summary uses server role permissions without enabling unsubscribed modules',async()=>{
  useAppStore.setState({entitlements:null,user:{id:'fixture',tenantId:'fixture',role:'admin',permissions:['organization.read','roles.read']}});
  vi.spyOn(client,'get').mockImplementation(async path=>({data:{data:path==='/roles'?{catalogue:[],system:[],custom:[{id:'fixture-role',name:'Queue reader',status:'active',permissions:['queue.read']}]}:{name:'Fixture workspace',type:'shop',active_staff:1,active_branches:1,custom_roles:1,pending_invitations:0}}}));
  setup('overview');await screen.findByText('Queue reader · View: Allowed · Manage: Denied');expect(screen.getAllByText(/Subscription: Not enabled/)).toHaveLength(6);
});
