/**
 * Role-Based Access Control (RNF01).
 *
 * Strict profiles: a Support analyst must NOT see Financial settlements; a
 * compliance reviewer must NOT see promotional campaigns; only the "master"
 * (administrative) role sees everything.
 *
 * Enforced in the UI (nav + route guards) here, and partially in
 * firestore.rules for the most sensitive writes (admins, fees). Production
 * should additionally back this with custom claims + Cloud Functions.
 */
import type { AdminRole } from './types';

export type Permission =
  | 'dashboard.view'
  | 'drivers.view'
  | 'drivers.review' // approve/reject/block + document validation
  | 'stores.view'
  | 'stores.review' // approve/reject/suspend + set fees
  | 'customers.view'
  | 'orders.view'
  | 'orders.refund'
  | 'support.view'
  | 'support.respond'
  | 'finance.view'
  | 'finance.settle' // approve payouts / create settlements
  | 'fiscal.view'
  | 'fiscal.generate'
  | 'campaigns.view'
  | 'campaigns.manage'
  | 'liveops.view'
  | 'audit.view'
  | 'admins.manage'
  | 'settings.manage';

const ALL: Permission[] = [
  'dashboard.view',
  'drivers.view', 'drivers.review',
  'stores.view', 'stores.review',
  'customers.view',
  'orders.view', 'orders.refund',
  'support.view', 'support.respond',
  'finance.view', 'finance.settle',
  'fiscal.view', 'fiscal.generate',
  'campaigns.view', 'campaigns.manage',
  'liveops.view',
  'audit.view',
  'admins.manage',
  'settings.manage',
];

export const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  master: ALL,
  support: [
    'dashboard.view',
    'drivers.view',
    'stores.view',
    'customers.view',
    'orders.view', 'orders.refund',
    'support.view', 'support.respond',
    'liveops.view',
  ],
  finance: [
    'dashboard.view',
    'stores.view',
    'customers.view',
    'orders.view',
    'finance.view', 'finance.settle',
    'fiscal.view', 'fiscal.generate',
    'campaigns.view', 'campaigns.manage',
  ],
  compliance: [
    'dashboard.view',
    'drivers.view', 'drivers.review',
    'stores.view', 'stores.review',
    'customers.view',
    'orders.view',
    'audit.view',
  ],
  viewer: [
    'dashboard.view',
    'drivers.view',
    'stores.view',
    'customers.view',
    'orders.view',
    'support.view',
    'finance.view',
    'liveops.view',
  ],
};

export function can(role: AdminRole | undefined | null, perm: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(perm) ?? false;
}

export const ROLE_LABEL: Record<AdminRole, string> = {
  master: 'Administrador Master',
  support: 'Atendimento / Suporte',
  finance: 'Financeiro',
  compliance: 'Compliance / Documentos',
  viewer: 'Somente leitura',
};

export const ROLE_BADGE: Record<AdminRole, string> = {
  master: 'bg-accent-soft text-accent',
  support: 'bg-info-soft text-info',
  finance: 'bg-brand-soft text-brand-dark',
  compliance: 'bg-warn-soft text-amber-700',
  viewer: 'bg-slate-100 text-slate-500',
};
