import { ShieldAlert, LogOut } from 'lucide-react';
import { logout } from '../lib/firebase';
import { useAuthStore } from '../store/useAuthStore';
import { Button } from '../components/ui/Button';

export default function NoAccess() {
  const fbUser = useAuthStore((s) => s.fbUser);
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl p-8 border-2 border-slate-100 text-center space-y-4">
        <div className="w-16 h-16 mx-auto bg-warn-soft text-amber-600 rounded-2xl flex items-center justify-center">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-black text-slate-800">Acesso não autorizado</h1>
        <p className="text-slate-500 font-medium">
          A conta <span className="font-bold text-slate-700">{fbUser?.email}</span> não tem permissão para
          acessar o painel administrativo. Peça a um administrador master para enviar um convite ao seu e-mail.
        </p>
        <Button variant="secondary" className="w-full" onClick={() => logout()}>
          <LogOut className="w-4 h-4" /> Sair e usar outra conta
        </Button>
      </div>
    </div>
  );
}
