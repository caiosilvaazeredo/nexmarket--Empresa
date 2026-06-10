import {
  LayoutDashboard,
  Bike,
  Store,
  Users,
  ShoppingBag,
  LifeBuoy,
  Wallet,
  FileText,
  Megaphone,
  Map,
  ScrollText,
  ShieldCheck,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import type { Permission } from './rbac';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission: Permission;
  group: 'Operação' | 'Financeiro' | 'Plataforma';
  /** which live badge counter to show, if any. */
  badge?: 'driversPending' | 'ticketsOpen';
}

export const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard.view', group: 'Operação' },
  { to: '/entregadores', label: 'Entregadores', icon: Bike, permission: 'drivers.view', group: 'Operação', badge: 'driversPending' },
  { to: '/lojas', label: 'Lojas', icon: Store, permission: 'stores.view', group: 'Operação' },
  { to: '/clientes', label: 'Clientes', icon: Users, permission: 'customers.view', group: 'Operação' },
  { to: '/pedidos', label: 'Pedidos', icon: ShoppingBag, permission: 'orders.view', group: 'Operação' },
  { to: '/suporte', label: 'Suporte', icon: LifeBuoy, permission: 'support.view', group: 'Operação', badge: 'ticketsOpen' },
  { to: '/mapa', label: 'Mapa ao vivo', icon: Map, permission: 'liveops.view', group: 'Operação' },

  { to: '/financeiro', label: 'Financeiro', icon: Wallet, permission: 'finance.view', group: 'Financeiro' },
  { to: '/fiscal', label: 'Fiscal · IR', icon: FileText, permission: 'fiscal.view', group: 'Financeiro' },
  { to: '/campanhas', label: 'Campanhas', icon: Megaphone, permission: 'campaigns.view', group: 'Financeiro' },

  { to: '/auditoria', label: 'Auditoria', icon: ScrollText, permission: 'audit.view', group: 'Plataforma' },
  { to: '/operadores', label: 'Operadores', icon: ShieldCheck, permission: 'admins.manage', group: 'Plataforma' },
  { to: '/config', label: 'Configurações', icon: Settings, permission: 'settings.manage', group: 'Plataforma' },
];
