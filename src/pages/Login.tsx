import { useState } from 'react';
import { Store, Mail, Lock, ShieldCheck, User as UserIcon, ArrowLeft } from 'lucide-react';
import { loginWithEmail, registerWithEmail } from '../lib/firebase';
import { Button } from '../components/ui/Button';

export default function Login() {
  const [view, setView] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await loginWithEmail(email, password);
    } catch (err: any) {
      setError(err?.message || 'Credenciais inválidas. Verifique seu e-mail e senha.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await registerWithEmail(email, password, name);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível criar o acesso.');
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
              <Button className="w-full" size="lg" disabled={loading}>
                {loading ? 'Entrando…' : 'Entrar no painel'}
              </Button>
            </form>

            <p className="text-center text-slate-400 text-xs font-medium">
              Esqueceu a senha? Peça a um administrador master para redefini-la em
              Operadores. Tem um convite? <button type="button" onClick={() => setView('register')} className="text-brand-dark font-bold hover:underline">Criar acesso</button>.
            </p>
          </div>
        ) : (
          <div className="space-y-5 animate-nex-in">
            <button onClick={() => setView('login')} className="flex items-center gap-1 text-slate-400 hover:text-slate-600 font-bold text-sm">
              <ArrowLeft className="w-4 h-4" /> Voltar
            </button>
            <p className="text-slate-600 font-medium">
              Só funciona para o e-mail root ou para um e-mail com convite pendente
              enviado por um administrador master.
            </p>
            <form onSubmit={handleRegister} className="space-y-3">
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" className={inputCls} />
              </div>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Seu e-mail" className={inputCls} />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Crie uma senha (mín. 6 caracteres)" className={inputCls} />
              </div>
              <Button className="w-full" size="lg" disabled={loading}>
                {loading ? 'Criando…' : 'Criar acesso'}
              </Button>
            </form>
          </div>
        )}
      </div>
      <p className="mt-6 text-slate-400 text-sm font-medium">Nexmarket · Plataforma integrada de delivery</p>
    </div>
  );
}
