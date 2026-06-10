import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Moon, Sun, LogOut, X, Store } from 'lucide-react';
import { NAV } from '../../lib/nav';
import { can } from '../../lib/rbac';
import { ROLE_LABEL, ROLE_BADGE } from '../../lib/rbac';
import { cn } from '../../lib/utils';
import { logout } from '../../lib/firebase';
import { useAuthStore } from '../../store/useAuthStore';
import { useUIStore } from '../../store/useUIStore';
import { subscribeTickets } from '../../lib/tickets';
import { subscribeDrivers, driverApprovalOf } from '../../lib/drivers';
import { Avatar } from '../ui/Avatar';

export function Sidebar() {
  const admin = useAuthStore((s) => s.admin);
  const { sidebarOpen, setSidebarOpen, dark, toggleDark } = useUIStore();
  const location = useLocation();
  const [ticketsOpen, setTicketsOpen] = useState(0);
  const [driversPending, setDriversPending] = useState(0);

  // Live badge counters.
  useEffect(() => {
    if (!admin) return;
    const unsubs: Array<() => void> = [];
    if (can(admin.role, 'support.view'))
      unsubs.push(
        subscribeTickets((t) => setTicketsOpen(t.filter((x) => x.status === 'open' || x.status === 'pending').length)),
      );
    if (can(admin.role, 'drivers.view'))
      unsubs.push(
        subscribeDrivers((d) => setDriversPending(d.filter((x) => driverApprovalOf(x) === 'pending').length)),
      );
    return () => unsubs.forEach((u) => u());
  }, [admin]);

  // Close mobile drawer on route change.
  useEffect(() => {
    setSidebarOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const items = NAV.filter((n) => can(admin?.role, n.permission));
  const groups = ['Operação', 'Financeiro', 'Plataforma'] as const;
  const badgeFor = (b?: string) =>
    b === 'ticketsOpen' ? ticketsOpen : b === 'driversPending' ? driversPending : 0;

  return (
    <>
      {sidebarOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-72 bg-white dark:bg-slate-900 border-r-2 border-slate-100 dark:border-slate-800 flex flex-col transform transition-transform duration-300 lg:relative lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Brand */}
        <div className="p-4 flex items-center justify-between border-b-2 border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand rounded-2xl rotate-12 flex items-center justify-center shadow-lg shadow-brand/30">
              <Store className="w-5 h-5 text-white -rotate-12" strokeWidth={3} />
            </div>
            <div>
              <h1 className="font-black text-slate-800 dark:text-slate-50 leading-tight">Nexmarket</h1>
              <p className="text-[11px] font-bold text-brand-dark uppercase tracking-wider">Admin</p>
            </div>
          </div>
          <button className="lg:hidden p-2 text-slate-400" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-5">
          {groups.map((g) => {
            const groupItems = items.filter((i) => i.group === g);
            if (groupItems.length === 0) return null;
            return (
              <div key={g} className="space-y-1">
                <p className="px-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">{g}</p>
                {groupItems.map((item) => {
                  const Icon = item.icon;
                  const count = badgeFor(item.badge);
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm transition-colors',
                          isActive
                            ? 'bg-brand-soft text-brand-dark dark:bg-brand/15 dark:text-brand'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
                        )
                      }
                    >
                      <Icon className="w-5 h-5 shrink-0" />
                      <span className="flex-1 truncate">{item.label}</span>
                      {count > 0 && (
                        <span className="min-w-5 h-5 px-1.5 rounded-full bg-danger text-white text-[11px] font-bold flex items-center justify-center">
                          {count}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t-2 border-slate-100 dark:border-slate-800 space-y-2">
          <div className="flex items-center gap-3 p-2 rounded-xl">
            <Avatar name={admin?.name} src={admin?.photoUrl} size={38} />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">{admin?.name}</p>
              {admin && (
                <span className={cn('inline-block px-2 py-0.5 rounded-full text-[10px] font-bold', ROLE_BADGE[admin.role])}>
                  {ROLE_LABEL[admin.role]}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={toggleDark}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {dark ? 'Claro' : 'Escuro'}
            </button>
            <button
              onClick={() => logout()}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-bold text-danger hover:bg-danger-soft"
            >
              <LogOut className="w-4 h-4" /> Sair
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
