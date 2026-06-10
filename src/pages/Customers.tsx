import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Users,
  Search as SearchIcon,
  Ban,
  CheckCircle2,
  Phone,
  Mail,
  CreditCard,
  ShoppingBag,
  Star,
  CircleSlash,
} from 'lucide-react';
import { Page, PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { SearchInput } from '../components/ui/Input';
import { DataTable, type Column } from '../components/ui/Table';
import { Drawer } from '../components/ui/Drawer';
import { confirm } from '../components/ui/Confirm';
import { useSub } from '../hooks/useSub';
import { usePermission } from '../hooks/usePermission';
import { useUIStore } from '../store/useUIStore';
import { subscribeCustomers, setCustomerBlocked } from '../lib/customers';
import { subscribeCustomerOrders } from '../lib/orders';
import { addToBlacklist } from '../lib/blacklist';
import { orderStatusBadge } from '../lib/status';
import { brl, maskCpf, maskPhone, timeAgo } from '../lib/format';
import type { CustomerProfile, Order } from '../lib/types';

export default function Customers() {
  const customers = useSub<CustomerProfile[]>(subscribeCustomers, []);
  const [search, setSearch] = useState('');
  const [selectedUid, setSelectedUid] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return customers
      .filter((c) => !q || c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || (c.cpf || '').includes(q) || (c.phone || '').includes(q))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [customers, search]);

  const selected = customers.find((c) => c.uid === selectedUid) || null;

  const columns: Column<CustomerProfile>[] = [
    {
      key: 'name',
      header: 'Cliente',
      render: (c) => (
        <div className="flex items-center gap-3">
          <Avatar name={c.name} src={c.photoUrl} size={40} />
          <div className="min-w-0">
            <p className="font-bold text-slate-700 dark:text-slate-100 truncate">{c.name || 'Sem nome'}</p>
            <p className="text-xs text-slate-400 truncate">{c.email || maskPhone(c.phone)}</p>
          </div>
        </div>
      ),
    },
    { key: 'cpf', header: 'CPF', hideOnMobile: true, render: (c) => <span className="text-slate-500">{maskCpf(c.cpf)}</span> },
    { key: 'since', header: 'Cliente desde', hideOnMobile: true, render: (c) => <span className="text-slate-400">{timeAgo(c.createdAt)}</span> },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      render: (c) => (c.blocked ? <Badge tone="red" dot>Bloqueado</Badge> : <Badge tone="green" dot>Ativo</Badge>),
    },
  ];

  return (
    <Page>
      <PageHeader
        title="Clientes"
        subtitle="Base de clientes e histórico (CRM)"
        icon={<Users className="w-6 h-6" />}
        actions={<SearchInput value={search} onChange={setSearch} placeholder="Buscar nome, e-mail, CPF…" className="w-full sm:w-72" />}
      />

      <Card className="overflow-hidden">
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(c) => c.uid}
          onRowClick={(c) => setSelectedUid(c.uid)}
          emptyIcon={<SearchIcon className="w-7 h-7" />}
          emptyTitle="Nenhum cliente"
          emptyDescription="Os clientes cadastrados no app aparecerão aqui."
        />
      </Card>

      <CustomerDrawer customer={selected} onClose={() => setSelectedUid(null)} />
    </Page>
  );
}

function CustomerDrawer({ customer, onClose }: { customer: CustomerProfile | null; onClose: () => void }) {
  const { can } = usePermission();
  const toast = useUIStore((s) => s.toast);
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    if (!customer) return;
    const unsub = subscribeCustomerOrders(customer.uid, 30, setOrders);
    return () => unsub();
  }, [customer?.uid]);

  if (!customer) return null;
  const valid = orders.filter((o) => o.status !== 'cancelled');
  const spent = valid.reduce((s, o) => s + (o.total || 0), 0);
  const ratings = orders.filter((o) => typeof o.rating === 'number');
  const avgRating = ratings.length ? ratings.reduce((s, o) => s + (o.rating || 0), 0) / ratings.length : null;

  const toggleBlock = async () => {
    if (!customer.blocked) {
      const ok = await confirm({ title: 'Bloquear cliente', message: 'O cliente não poderá fazer novos pedidos.', danger: true, confirmLabel: 'Bloquear' });
      if (!ok) return;
    }
    await setCustomerBlocked(customer, !customer.blocked);
    toast(customer.blocked ? 'Cliente desbloqueado.' : 'Cliente bloqueado.', 'info');
  };

  const blacklist = async () => {
    if (!customer.cpf) {
      toast('Cliente sem CPF cadastrado.', 'error');
      return;
    }
    const ok = await confirm({ title: 'Adicionar à blacklist', message: `O CPF ${maskCpf(customer.cpf)} será bloqueado na plataforma.`, danger: true, confirmLabel: 'Bloquear CPF' });
    if (!ok) return;
    await addToBlacklist(customer.cpf, { name: customer.name, reason: 'Bloqueio via análise de cliente', scope: 'customer' });
    await setCustomerBlocked(customer, true, 'Adicionado à blacklist');
    toast('CPF adicionado à blacklist.', 'info');
  };

  return (
    <Drawer open={!!customer} onClose={onClose} title={customer.name} subtitle={customer.email}>
      <div className="space-y-5">
        <Card className="p-5">
          <div className="flex items-center gap-4">
            <Avatar name={customer.name} src={customer.photoUrl} size={60} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-black text-lg text-slate-800 dark:text-slate-50 truncate">{customer.name}</h3>
                {customer.blocked ? <Badge tone="red" dot>Bloqueado</Badge> : <Badge tone="green" dot>Ativo</Badge>}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
            <Info icon={<Phone className="w-4 h-4" />} label="Telefone" value={maskPhone(customer.phone)} />
            <Info icon={<Mail className="w-4 h-4" />} label="E-mail" value={customer.email || '—'} />
            <Info icon={<CreditCard className="w-4 h-4" />} label="CPF" value={maskCpf(customer.cpf)} />
            <Info icon={<Star className="w-4 h-4" />} label="Avaliação média dada" value={avgRating ? avgRating.toFixed(1) : '—'} />
          </div>
        </Card>

        <div className="grid grid-cols-3 gap-3">
          <KStat label="Pedidos" value={String(valid.length)} />
          <KStat label="Total gasto" value={brl(spent)} />
          <KStat label="Ticket médio" value={brl(valid.length ? spent / valid.length : 0)} />
        </div>

        <Card>
          <div className="flex items-center gap-2 p-4 font-bold text-slate-700 dark:text-slate-200">
            <ShoppingBag className="w-4 h-4" /> Histórico de pedidos
          </div>
          <div className="divide-y divide-slate-50 dark:divide-slate-800">
            {orders.length === 0 && <p className="text-center text-slate-400 py-8 text-sm">Sem pedidos.</p>}
            {orders.slice(0, 12).map((o) => {
              const b = orderStatusBadge(o.status);
              return (
                <div key={o.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="font-mono text-xs text-slate-400">#{o.id.slice(0, 6)}</span>
                  <span className="flex-1 text-slate-400">{timeAgo(o.createdAt)}</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">{brl(o.total)}</span>
                  <Badge tone={b.tone}>{b.label}</Badge>
                </div>
              );
            })}
          </div>
        </Card>

        {can('orders.refund') && (
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 text-danger" onClick={toggleBlock}>
              {customer.blocked ? <CheckCircle2 className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
              {customer.blocked ? 'Desbloquear' : 'Bloquear'}
            </Button>
            <Button variant="danger" className="flex-1" onClick={blacklist}>
              <CircleSlash className="w-4 h-4" /> Blacklist (CPF)
            </Button>
          </div>
        )}
      </div>
    </Drawer>
  );
}

function Info({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-slate-400 mt-0.5">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-slate-400 uppercase">{label}</p>
        <p className="font-medium text-slate-700 dark:text-slate-200 truncate">{value}</p>
      </div>
    </div>
  );
}

function KStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center">
      <p className="text-lg font-black text-slate-800 dark:text-slate-50">{value}</p>
      <p className="text-[11px] font-bold text-slate-400 uppercase mt-0.5">{label}</p>
    </div>
  );
}
