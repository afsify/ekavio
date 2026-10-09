import { Activity, Bell, BookOpen, BriefcaseBusiness, Building2, CalendarDays, ChartNoAxesCombined, ClipboardList, CreditCard, Home, Layers, Package, Settings, ShieldCheck, Truck, Users, UserRound } from 'lucide-react';
const icons = {
  '/dashboard': Home, '/customers': Users, '/services': Layers, '/queue': ClipboardList,
  '/appointments': CalendarDays, '/attendance': Activity, '/hr': BriefcaseBusiness,
  '/ledger': CreditCard, '/crm': Users, '/inventory': Package, '/suppliers': Truck,
  '/purchasing': ClipboardList, '/staff': UserRound, '/reports': ChartNoAxesCombined,
  '/settings': Settings, '/notifications': Bell, '/help': BookOpen, '/roles': ShieldCheck,
  '/audit': ShieldCheck, '/billing': CreditCard,
};
export function NavigationIcon({ path }: { path: string }) {
  const Icon = icons[path as keyof typeof icons] ?? Building2;
  return <Icon size={19} aria-hidden="true" />;
}
