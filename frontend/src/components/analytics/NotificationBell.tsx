import { useState } from 'react';
import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useNotifications } from '../../hooks/useNotifications';
export function NotificationBell(){
 const [open,setOpen]=useState(false),query=useNotifications();
 return <div className="notification-bell"><button className="quiet-button" aria-label={`Notifications${query.data?`, ${query.data.unread} unread`:''}`} aria-expanded={open} onClick={()=>setOpen(!open)}><Bell size={18} aria-hidden="true"/> <span className="notification-label">Notifications</span>{Boolean(query.data?.unread)&&<span aria-hidden="true">{query.data!.unread}</span>}</button>
 {open&&<section className="panel notification-popover" aria-label="Recent notifications"><h2 className="font-semibold">Notifications</h2>{query.isPending&&<p role="status">Loading…</p>}{query.isError&&<p role="alert">Notifications unavailable. <button onClick={()=>void query.refetch()}>Retry</button></p>}{query.data?.rows.slice(0,3).map(n=><p key={n.id}>{n.readAt?'':'Unread · '}<span>{n.title}</span></p>)}{query.data?.rows.length===0&&<p>You're all caught up.</p>}<Link className="action-link" to="/notifications" onClick={()=>setOpen(false)}>View all</Link><button className="quiet-button" onClick={()=>setOpen(false)}>Close notifications</button></section>}</div>;
}
