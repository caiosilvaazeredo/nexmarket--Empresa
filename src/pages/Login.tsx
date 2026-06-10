import { useState } from 'react';
import { Store, Mail, Lock, ShieldCheck, ArrowLeft } from 'lucide-react';
import { loginWithEmail, loginWithGoogle, resetPassword } from '../lib/firebase';
import { Button } from '../components/ui/Button';

export default function Login() {
  const [view, setView] = useState<'login' | 'recovery'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await loginWithEmail(email, password);
    } catch {
      setError('Credenciais inválidas. Verifique seu e-mail e senha.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    setError(null);
    try {
      await loginWithGoogle();
    } catch {
      setError('Não foi possível entrar com o Google.');
    } finally {
      setLoading(false);
    }
  };

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await resetPassword(email);
      setSuccess('Link de recuperação enviado para o seu e-mail.');
    } catch {
      setError('Erro ao enviar o link. Verifique o e-mail.');
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    'w-full pl-10 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-brand focus:bg-white outline-none font-medium text-slate-700 transition-colors';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-[440px] bg-white rounded-3xl p-8 sm:p-10 shadow-sm border-2 border-slate-100">
        <div className="flex flex-col items-center text-center gap-5 mb-8">
          <div className="w-20 h-20 bg-brand rounded-3xl rotate-12 flex items-center justify-center shadow-lg shadow-brand/30 relative">
            <Store className="w-10 h-10 text-white -rotate-12" strokeWidth={3} />
            <div className="absolute -bottom-2 -right-2 w-9 h-9 bg-slate-900 rounded-2xl flex items-center justify-center border-4 border-white">
              <ShieldCheck className="w-4 h-4 text-brand" strokeWidth={3} />
            </div>
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-black text-slate-800 tracking-tight">Nexmarket Admin</h1>
            <p className="text-slate-500 font-medium">Painel administrativo da plataforma</p>
          </div>
        </div>

        {error && (
          <div className="p-4 mb-6 bg-red-50 text-red-600 rounded-xl font-medium text-sm text-center border-2 border-red-100">
            {error}
          </div>
        )}
        {success && (
          <div className="p-4 mb-6 bg-green-50 text-green-600 rounded-xl font-medium text-sm text-center border-2 border-green-100">
            {success}
          </div>
        )}

        {view === 'login' ? (
          <div className="space-y-6 animate-nex-in">
            <form onSubmit={handleLogin} className="space-y-3">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail corporativo" className={inputCls} />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Sua senha" className={inputCls} />
              </div>
              <div className="flex justify-end">
                <button type="button" onClick={() => setView('recovery')} className="text-sm font-bold text-brand-dark hover:underline">
                  Esqueceu a senha?
                </button>
              </div>
              <Button className="w-full" size="lg" disabled={loading}>
                {loading ? 'Entrando…' : 'Entrar no painel'}
              </Button>
            </form>

            <div className="relative flex items-center">
              <div className="flex-grow border-t border-slate-200" />
              <span className="mx-4 text-slate-400 text-sm font-medium">ou</span>
              <div className="flex-grow border-t border-slate-200" />
            </div>

            <Button variant="secondary" className="w-full" size="lg" onClick={handleGoogle} disabled={loading}>
              <svg className="w-5 h-5 mr-1" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Entrar com Google
            </Button>

            <p className="text-center text-slate-400 text-xs font-medium">
              Acesso restrito a operadores autorizados. Novos acessos são liberados por um administrador master.
            </p>
          </div>
        ) : (
          <div className="space-y-5 animate-nex-in">
            <button onClick={() => setView('login')} className="flex items-center gap-1 text-slate-400 hover:text-slate-600 font-bold text-sm">
              <ArrowLeft className="w-4 h-4" /> Voltar
            </button>
            <p className="text-slate-600 font-medium">Informe seu e-mail para receber um link de redefinição de senha.</p>
            <form onSubmit={handleRecovery} className="space-y-3">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Seu e-mail" className={inputCls} />
              </div>
              <Button className="w-full" size="lg" disabled={loading}>
                {loading ? 'Enviando…' : 'Enviar link'}
              </Button>
            </form>
          </div>
        )}
      </div>
      <p className="mt-6 text-slate-400 text-sm font-medium">Nexmarket · Plataforma integrada de delivery</p>
    </div>
  );
}
