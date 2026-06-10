import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { LoadingState } from '../ui/Feedback';
import { useUIStore } from '../../store/useUIStore';

export function AppShell() {
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden sticky top-0 z-20 bg-white dark:bg-slate-900 border-b-2 border-slate-100 dark:border-slate-800 h-14 px-4 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
          >
            <Menu className="w-6 h-6" />
          </button>
          <span className="font-black text-slate-800 dark:text-slate-100">Nexmarket Admin</span>
        </header>
        <main className="flex-1 min-w-0">
          <Suspense fallback={<LoadingState />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
