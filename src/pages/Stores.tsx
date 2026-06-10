import { useEffect, useMemo, useState } from 'react';
import {
  Store as StoreIcon,
  Search as SearchIcon,
  Star,
  CheckCircle2,
  PauseCircle,
  Percent,
  MapPin,
  Building2,
  Receipt,
} from 'lucide-react';
import { Page, PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Tabs } from '../components/ui/Tabs';
import { SearchInput, Field, Input } from '../components/ui/Input';
import { DataTable, type Column } from '../components/ui/Table';
import { Drawer } from '../components/ui/Drawer';
import { confirm } from '../components/ui/Confirm';
import { useSub } from '../hooks/useSub';
import { usePermission } from '../hooks/usePermission';
import { useUIStore } from '../store/useUIStore';
import { subscribeStores, storeApprovalOf, setStoreApproval, setStoreFees } from '../lib/stores';
import { subscribeStoreOrders } from '../lib/orders';
import { storeApprovalBadge, orderStatusBadge } from '../lib/status';
import { brl, maskCnpj, timeAgo } from '../lib/format';
import { DEFAULT_COMMISSION_PCT } from '../lib/finance';
import type { Supermarket, Order, StoreApprovalStatus } from '../lib/types';

const TABS = [
  { key: 'all', label: 'Todas' },
  { key: 'pending', label: 'Pendentes' },
  { key: 'approved', label: 'Ativas' },
  { key: 'suspended', label: 'Suspensas' },
];

export default function Stores() {
  const stores = useSub<Supermarket[]>(subscribeStores, []);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: stores.length, pending: 0, approved: 0, suspended: 0, rejected: 0 };
    stores.forEach((s) => (c[storeApprovalOf(s)] = (c[storeApprovalOf(s)] || 0) + 1));
    return c;
  }, [stores]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return stores
      .filter((s) => tab === 'all' || storeApprovalOf(s) === tab)
      .filter((s) => !q || s.name?.toLowerCase().includes(q) || (s.cnpj || '').includes(q))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [stores, tab, search]);

  const selected = stores.find((s) => s.id === selectedId) || null;

  const columns: Column<Supermarket>[] = [
    {
      key: 'name',
      header: 'Loja',
      render: (s) => (
        <div className="flex items-center gap-3">
          <Avatar name={s.name} src={s.logoUrl} size={40} />
          <div className="min-w-0">
            <p className="font-bold text-slate-700 dark:text-slate-100 truncate">{s.name}</p>
            <p className="text-xs text-slate-400 truncate">{s.cnpj ? maskCnpj(s.cnpj) : s.address || '—'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'fees',
      header: 'Comissão',
      hideOnMobile: true,
      render: (s) => <span className="text-slate-600 dark:text-slate-300 font-bold">{(s.fees?.commissionPct ?? DEFAULT_COMMISSION_PCT)}%</span>,
    },
    {
      key: 'rating',
      header: 'Avaliação',
      hideOnMobile: true,
      render: (s) => (
        <span className="inline-flex items-center gap-1 font-bold text-slate-600 dark:text-slate-300">
          <Star className="w-4 h-4 text-amber-400 fill-amber-400" /> {(s.rating ?? 0).toFixed(1)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      render: (s) => {
        const b = storeApprovalBadge(storeApprovalOf(s));
        return <Badge tone={b.tone}>{b.label}</Badge>;
      },
    },
  ];

  return (
    <Page>
      <PageHeader
        title="Lojas parceiras"
        subtitle="Aprovação, taxas e visão 360º"
        icon={<StoreIcon className="w-6 h-6" />}
        actions={<SearchInput value={search} onChange={setSearch} placeholder="Buscar nome ou CNPJ…" className="w-full sm:w-72" />}
      >
        <Tabs tabs={TABS.map((t) => ({ ...t, count: counts[t.key] }))} active={tab} onChange={setTab} />
      </PageHeader>

      <Card className="overflow-hidden">
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(s) => s.id}
          onRowClick={(s) => setSelectedId(s.id)}
          emptyIcon={<SearchIcon className="w-7 h-7" />}
          emptyTitle="Nenhuma loja"
          emptyDescription="Não há lojas nesta categoria."
        />
      </Card>

      <StoreDrawer store={selected} onClose={() => setSelectedId(null)} />
    </Page>
  );
}

function StoreDrawer({ store, onClose }: { store: Supermarket | null; onClose: () => void }) {
  const { can } = usePermission();
  const toast = useUIStore((s) => s.toast);
  const canReview = can('stores.review');
  const [orders, setOrders] = useState<Order[]>([]);
  const [commission, setCommission] = useState('');
  const [fixedFee, setFixedFee] = useState('');
  const [monthlyFee, setMonthlyFee] = useState('');

  useEffect(() => {
    if (!store) return;
    setCommission(String(store.fees?.commissionPct ?? DEFAULT_COMMISSION_PCT));
    setFixedFee(String(store.fees?.fixedFee ?? 0));
    setMonthlyFee(String(store.fees?.monthlyFee ?? 0));
    const unsub = subscribeStoreOrders(store.id, 20, setOrders);
    return () => unsub();
  }, [store?.id]);

  if (!store) return null;
  const approval = storeApprovalOf(store);
  const gmv = orders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + (o.total || 0), 0);

  const saveFees = async () => {
    await setStoreFees(store, {
      commissionPct: Number(commission) || 0,
      fixedFee: Number(fixedFee) || 0,
      monthlyFee: Number(monthlyFee) || 0,
    });
    toast('Taxas atualizadas.', 'success');
  };

  const act = async (status: StoreApprovalStatus) => {
    if (status !== 'approved') {
      const ok = await confirm({
        title: status === 'suspended' ? 'Suspender loja' : 'Recusar loja',
        message: 'A loja deixará de receber pedidos. Ação registrada na auditoria.',
        danger: true,
        confirmLabel: status === 'suspended' ? 'Suspender' : 'Recusar',
      });
      if (!ok) return;
    }
    await setStoreApproval(store, status);
    toast(status === 'approved' ? 'Loja aprovada!' : 'Status atualizado.', status === 'approved' ? 'success' : 'info');
  };

  return (
    <Drawer open={!!store} onClose={onClose} title={store.name} subtitle={store.cnpj ? maskCnpj(store.cnpj) : undefined}>
      <div className="space-y-5">
        <Card className="p-5">
          <div className="flex items-center gap-4">
            <Avatar name={store.name} src={store.logoUrl} size={60} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-black text-lg text-slate-800 dark:text-slate-50 truncate">{store.name}</h3>
                <Badge tone={storeApprovalBadge(approval).tone}>{storeApprovalBadge(approval).label}</Badge>
              </div>
              <div className="flex items-center gap-1 text-amber-500 font-bold text-sm mt-0.5">
                <Star className="w-4 h-4 fill-amber-400" /> {(store.rating ?? 0).toFixed(1)}
              </div>
            </div>
          </div>
          {store.address && (
            <p className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300 mt-3">
              <MapPin className="w-4 h-4 mt-0.5 text-slate-400" /> {store.address}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <MiniStat label="GMV (recente)" value={brl(gmv)} />
            <MiniStat label="Pedidos (recente)" value={String(orders.length)} />
          </div>
        </Card>

        {/* Fees */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4 font-bold text-slate-700 dark:text-slate-200">
            <Percent className="w-4 h-4" /> Taxas e comissões
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Comissão %"><Input type="number" value={commission} onChange={(e) => setCommission(e.target.value)} disabled={!canReview} /></Field>
            <Field label="Taxa fixa R$"><Input type="number" value={fixedFee} onChange={(e) => setFixedFee(e.target.value)} disabled={!canReview} /></Field>
            <Field label="Mensal R$"><Input type="number" value={monthlyFee} onChange={(e) => setMonthlyFee(e.target.value)} disabled={!canReview} /></Field>
          </div>
          {canReview && <Button className="w-full mt-4" onClick={saveFees}>Salvar taxas</Button>}
        </Card>

        {/* Recent orders */}
        <Card>
          <div className="flex items-center gap-2 p-4 font-bold text-slate-700 dark:text-slate-200">
            <Receipt className="w-4 h-4" /> Pedidos recentes
          </div>
          <div className="divide-y divide-slate-50 dark:divide-slate-800">
            {orders.length === 0 && <p className="text-center text-slate-400 py-8 text-sm">Sem pedidos recentes.</p>}
            {orders.slice(0, 8).map((o) => {
              const b = orderStatusBadge(o.status);
              return (
                <div key={o.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="font-mono text-xs text-slate-400">#{o.id.slice(0, 6)}</span>
                  <span className="flex-1 truncate text-slate-600 dark:text-slate-300">{o.customerName || 'Cliente'}</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">{brl(o.total)}</span>
                  <Badge tone={b.tone}>{b.label}</Badge>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Actions */}
        {canReview && (
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => act('approved')} disabled={approval === 'approved'}>
              <CheckCircle2 className="w-4 h-4" /> Aprovar
            </Button>
            <Button variant="outline" className="flex-1 text-danger" onClick={() => act('suspended')} disabled={approval === 'suspended'}>
              <PauseCircle className="w-4 h-4" /> Suspender
            </Button>
          </div>
        )}
      </div>
    </Drawer>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
      <p className="text-[11px] font-bold text-slate-400 uppercase flex items-center gap-1"><Building2 className="w-3 h-3" /> {label}</p>
      <p className="text-lg font-black text-slate-800 dark:text-slate-50 mt-0.5">{value}</p>
    </div>
  );
}
