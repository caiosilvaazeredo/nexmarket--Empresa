import { useState } from 'react';
import { ShieldCheck, UserPlus, Mail, Clock, Trash2 } from 'lucide-react';
import { Page, PageHeader } from '../components/layout/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Field, Input, Select } from '../components/ui/Input';
import { confirm } from '../components/ui/Confirm';
import { useSub } from '../hooks/useSub';
import { useUIStore } from '../store/useUIStore';
import { useAuthStore } from '../store/useAuthStore';
import {
  subscribeAdmins,
  subscribeInvites,
  inviteAdmin,
  revokeInvite,
  updateAdminRole,
  setAdminActive,
} from '../lib/admins';
import { ROLE_LABEL, ROLE_BADGE, ROLE_PERMISSIONS } from '../lib/rbac';
import { timeAgo } from '../lib/format';
import { cn } from '../lib/utils';
import type { AdminProfile, AdminInvite, AdminRole } from '../lib/types';

const ROLES: AdminRole[] = ['master', 'support', 'finance', 'compliance', 'viewer'];

export default function Admins() {
  const admins = useSub<AdminProfile[]>(subscribeAdmins, []);
  const invites = useSub<AdminInvite[]>(subscribeInvites, []);
  const me = useAuthStore((s) => s.admin);
  const toast = useUIStore((s) => s.toast);
  const [inviteOpen, setInviteOpen] = useState(false);

  const toggleActive = async (a: AdminProfile) => {
    if (a.uid === me?.uid) {
      toast('Você não pode desativar a si mesmo.', 'error');
      return;
    }
    if (a.active) {
      const ok = await confirm({ title: 'Desativar operador', message: `${a.name} perderá o acesso ao painel.`, danger: true, confirmLabel: 'Desativar' });
      if (!ok) return;
    }
    await setAdminActive(a.uid, !a.active);
    toast(a.active ? 'Operador desativado.' : 'Operador reativado.', 'info');
  };

  const changeRole = async (a: AdminProfile, role: AdminRole) => {
    await updateAdminRole(a.uid, role);
    toast('Perfil de acesso atualizado.', 'success');
  };

  return (
    <Page>
      <PageHeader
        title="Operadores"
        subtitle="Equipe e perfis de acesso (RBAC)"
        icon={<ShieldCheck className="w-6 h-6" />}
        actions={<Button onClick={() => setInviteOpen(true)}><UserPlus className="w-4 h-4" /> Convidar operador</Button>}
      />

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          <Card className="overflow-hidden">
            <CardHeader title="Operadores ativos" subtitle={`${admins.length} no total`} />
            <div className="divide-y divide-slate-50 dark:divide-slate-800">
              {admins.map((a) => (
                <div key={a.uid} className="flex items-center gap-3 px-5 py-3 flex-wrap">
                  <Avatar name={a.name} src={a.photoUrl} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-700 dark:text-slate-100 truncate">
                      {a.name} {a.uid === me?.uid && <span className="text-xs text-slate-400">(você)</span>}
                    </p>
                    <p className="text-xs text-slate-400 truncate">{a.email} · ativo {timeAgo(a.lastLoginAt)}</p>
                  </div>
                  <Select
                    value={a.role}
                    onChange={(e) => changeRole(a, e.target.value as AdminRole)}
                    disabled={a.uid === me?.uid}
                    className="w-auto h-9 py-0 text-xs"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                    ))}
                  </Select>
                  <button
                    onClick={() => toggleActive(a)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-bold',
                      a.active ? 'bg-brand-soft text-brand-dark' : 'bg-danger-soft text-danger',
                    )}
                  >
                    {a.active ? 'Ativo' : 'Inativo'}
                  </button>
                </div>
              ))}
            </div>
          </Card>

          {invites.length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader title="Convites pendentes" subtitle="Acesso liberado no primeiro login" />
              <div className="divide-y divide-slate-50 dark:divide-slate-800">
                {invites.map((inv) => (
                  <div key={inv.email} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                      <Mail className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-700 dark:text-slate-100 truncate">{inv.email}</p>
                      <p className="text-xs text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" /> convidado {timeAgo(inv.createdAt)}</p>
                    </div>
                    <Badge tone="slate">{ROLE_LABEL[inv.role]}</Badge>
                    <Button size="sm" variant="ghost" className="text-danger" onClick={() => revokeInvite(inv.email)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Roles legend */}
        <Card className="p-5 h-fit">
          <CardHeader title="Perfis de acesso" subtitle="O que cada perfil enxerga" className="p-0 mb-3" />
          <div className="space-y-3">
            {ROLES.map((r) => (
              <div key={r} className="rounded-xl border-2 border-slate-100 dark:border-slate-800 p-3">
                <span className={cn('inline-block px-2 py-0.5 rounded-full text-xs font-bold mb-1', ROLE_BADGE[r])}>{ROLE_LABEL[r]}</span>
                <p className="text-xs text-slate-400">{ROLE_PERMISSIONS[r].length} permissões</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} invitedBy={me?.uid || ''} />}
    </Page>
  );
}

function InviteModal({ onClose, invitedBy }: { onClose: () => void; invitedBy: string }) {
  const toast = useUIStore((s) => s.toast);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>('support');

  const submit = async () => {
    if (!email.trim()) return;
    await inviteAdmin(email.trim(), role, invitedBy);
    toast('Convite enviado! O acesso é liberado no primeiro login.', 'success');
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Convidar operador"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={!email.trim()}>Enviar convite</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="E-mail do operador" hint="Ele ganha acesso ao logar com este e-mail (Google ou senha).">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="operador@empresa.com" />
        </Field>
        <Field label="Perfil de acesso">
          <Select value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
