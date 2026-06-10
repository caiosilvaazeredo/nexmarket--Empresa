import { useEffect, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { Loader2 } from 'lucide-react';
import { auth } from './lib/firebase';
import { resolveAdminAccess } from './lib/admins';
import { useAuthStore } from './store/useAuthStore';

import { AppShell } from './components/layout/AppShell';
import { RoleGate } from './components/layout/RoleGate';
import { Toaster } from './components/ui/Feedback';
import { ConfirmHost } from './components/ui/Confirm';

import Login from './pages/Login';
import NoAccess from './pages/NoAccess';

// Feature pages are code-split so the initial shell stays light (heavy deps
// like leaflet, recharts and jspdf only load with the page that uses them).
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Drivers = lazy(() => import('./pages/Drivers'));
const Stores = lazy(() => import('./pages/Stores'));
const Customers = lazy(() => import('./pages/Customers'));
const Orders = lazy(() => import('./pages/Orders'));
const Support = lazy(() => import('./pages/Support'));
const LiveOps = lazy(() => import('./pages/LiveOps'));
const Finance = lazy(() => import('./pages/Finance'));
const Fiscal = lazy(() => import('./pages/Fiscal'));
const Campaigns = lazy(() => import('./pages/Campaigns'));
const AuditLogPage = lazy(() => import('./pages/AuditLog'));
const Admins = lazy(() => import('./pages/Admins'));
const Settings = lazy(() => import('./pages/Settings'));

function FullscreenLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <Loader2 className="w-10 h-10 animate-spin text-brand" />
    </div>
  );
}

export default function App() {
  const { status, setFbUser, setAdmin, setStatus } = useAuthStore();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFbUser(user);
      if (!user) {
        setAdmin(null);
        setStatus('signed_out');
        return;
      }
      setStatus('loading');
      try {
        const admin = await resolveAdminAccess(user);
        if (admin) {
          setAdmin(admin);
          setStatus('ready');
        } else {
          setAdmin(null);
          setStatus('no_access');
        }
      } catch (e) {
        console.error('resolveAdminAccess failed', e);
        setAdmin(null);
        setStatus('no_access');
      }
    });
    return () => unsub();
  }, [setFbUser, setAdmin, setStatus]);

  return (
    <>
      {status === 'loading' && <FullscreenLoader />}
      {status === 'signed_out' && <Login />}
      {status === 'no_access' && <NoAccess />}
      {status === 'ready' && (
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<RoleGate perm="dashboard.view"><Dashboard /></RoleGate>} />
              <Route path="entregadores" element={<RoleGate perm="drivers.view"><Drivers /></RoleGate>} />
              <Route path="lojas" element={<RoleGate perm="stores.view"><Stores /></RoleGate>} />
              <Route path="clientes" element={<RoleGate perm="customers.view"><Customers /></RoleGate>} />
              <Route path="pedidos" element={<RoleGate perm="orders.view"><Orders /></RoleGate>} />
              <Route path="suporte" element={<RoleGate perm="support.view"><Support /></RoleGate>} />
              <Route path="mapa" element={<RoleGate perm="liveops.view"><LiveOps /></RoleGate>} />
              <Route path="financeiro" element={<RoleGate perm="finance.view"><Finance /></RoleGate>} />
              <Route path="fiscal" element={<RoleGate perm="fiscal.view"><Fiscal /></RoleGate>} />
              <Route path="campanhas" element={<RoleGate perm="campaigns.view"><Campaigns /></RoleGate>} />
              <Route path="auditoria" element={<RoleGate perm="audit.view"><AuditLogPage /></RoleGate>} />
              <Route path="operadores" element={<RoleGate perm="admins.manage"><Admins /></RoleGate>} />
              <Route path="config" element={<RoleGate perm="settings.manage"><Settings /></RoleGate>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      )}
      <Toaster />
      <ConfirmHost />
    </>
  );
}
