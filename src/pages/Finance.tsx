import { useMemo, useState } from 'react';
import {
  Wallet,
  TrendingUp,
  Store as StoreIcon,
  Bike,
  Banknote,
  CheckCircle2,
  PauseCircle,
  XCircle,
  Sparkles,
} from 'lucide-react';
import { Page, PageHeader } from '../components/layout/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { Stat } from '../components/ui/Stat';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Tabs } from '../components/ui/Tabs';
import { Avatar } from '../components/ui/Avatar';
import { DataTable, type Column } from '../components/ui/Table';
import { confirm } from '../components/ui/Confirm';
import { AreaTrend } from '../components/charts/Charts';
import { useSub } from '../hooks/useSub';
import { usePermission } from '../hooks/usePermission';
import { useUIStore } from '../store/useUIStore';
import { subscribeRecentOrders } from '../lib/orders';
import { subscribeStores } from '../lib/stores';
import { subscribeDrivers } from '../lib/drivers';
import { subscribePlatformConfig } from '../lib/platform';
import {
  computeFinance,
  subscribeSettlements,
  subscribeAllPayouts,
  setPayoutStatus,
  createSettlement,
  setSettlementStatus,
  DEFAULT_COMMISSION_PCT,
  DEFAULT_FIXED_FEE,
} from '../lib/finance';
import { settlementStatusBadge, payoutStatusBadge } from '../lib/status';
import { gatewayPayout, paymentsGatewayConfigured } from '../lib/payments';
import { brl, brlCompact, num, timeAgo, formatDate } from '../lib/format';
import type { Order, Supermarket, DriverProfile, PlatformConfig, Settlement, Payout, PayoutStatus } from '../lib/types';

const SUBTABS = [
  { key: 'overview', label: 'Conciliação' },
  { key: 'settlements', label: 'Repasses' },
  { key: 'payouts', label: 'Saques' },
];

export default function Finance() {
  const { can } = usePermission();
  const orders = useSub<Order[]>((cb) => subscribeRecentOrders(500, cb), []);
  const stores = useSub<Supermarket[]>(subscribeStores, []);
  const drivers = useSub<DriverProfile[]>(subscribeDrivers, []);
  const config = useSub<PlatformConfig | null>(subscribePlatformConfig, null);
  const settlements = useSub<Settlement[]>(subscribeSettlements, []);
  const payouts = useSub<Payout[]>(subscribeAllPayouts, []);
  const [tab, setTab] = useState('overview');

  const feeFor = useMemo(() => {
    const map = new Map(stores.map((s) => [s.id, s]));
    return (smId: string) => {
      const s = map.get(smId);
      return {
        commissionPct: s?.fees?.commissionPct ?? config?.defaultCommissionPct ?? DEFAULT_COMMISSION_PCT,
        fixedFee: s?.fees?.fixedFee ?? config?.defaultFixedFee ?? DEFAULT_FIXED_FEE,
      };
    };
  }, [stores, config]);

  const fin = useMemo(() => computeFinance(orders, feeFor), [orders, feeFor]);
  const pendingPayouts = payouts.filter((p) => p.status === 'requested').length;

  const byDay = useMemo(
    () => fin.byDay.slice(-21).map((d) => ({ ...d, label: d.date.slice(5) })),
    [fin],
  );

  return (
    <Page>
      <PageHeader title="Financeiro" subtitle="Conciliação, repasses e saques" icon={<Wallet className="w-6 h-6" />}>
        <Tabs
          tabs={SUBTABS.map((t) => ({ ...t, count: t.key === 'payouts' ? pendingPayouts : undefined }))}
          active={tab}
          onChange={setTab}
        />
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label="GMV" value={brlCompact(fin.gmv)} icon={<Wallet className="w-5 h-5" />} tone="brand" hint={`${num(fin.ordersCount)} pedidos`} />
        <Stat label="Receita plataforma" value={brlCompact(fin.platformRevenue)} icon={<TrendingUp className="w-5 h-5" />} tone="indigo" />
        <Stat label="A repassar — Lojas" value={brlCompact(fin.storePayable)} icon={<StoreIcon className="w-5 h-5" />} tone="blue" />
        <Stat label="A repassar — Entregadores" value={brlCompact(fin.driverPayable)} icon={<Bike className="w-5 h-5" />} tone="amber" />
      </div>

      {tab === 'overview' && (
        <FinanceOverview orders={orders} stores={stores} feeFor={feeFor} byDay={byDay} refunds={fin.refunds} />
      )}
      {tab === 'settlements' && (
        <Settlements
          settlements={settlements}
          orders={orders}
          stores={stores}
          drivers={drivers}
          feeFor={feeFor}
          canSettle={can('finance.settle')}
        />
      )}
      {tab === 'payouts' && <Payouts payouts={payouts} canSettle={can('finance.settle')} />}
    </Page>
  );
}

function FinanceOverview({
  orders,
  stores,
  feeFor,
  byDay,
  refunds,
}: {
  orders: Order[];
  stores: Supermarket[];
  feeFor: (id: string) => { commissionPct: number; fixedFee: number };
  byDay: any[];
  refunds: number;
}) {
  const perStore = useMemo(() => {
    const map = new Map<string, { gross: number; commission: number; orders: number }>();
    for (const o of orders) {
      if (o.status === 'cancelled') continue;
      const subtotal = o.subtotal ?? Math.max(0, (o.total || 0) - (o.deliveryFee || 0));
      const { commissionPct, fixedFee } = feeFor(o.supermarketId);
      const commission = (subtotal * commissionPct) / 100 + fixedFee;
      const cur = map.get(o.supermarketId) || { gross: 0, commission: 0, orders: 0 };
      cur.gross += subtotal;
      cur.commission += commission;
      cur.orders += 1;
      map.set(o.supermarketId, cur);
    }
    const nameOf = new Map(stores.map((s) => [s.id, s]));
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, store: nameOf.get(id), ...v, net: v.gross - v.commission }))
      .sort((a, b) => b.gross - a.gross);
  }, [orders, stores, feeFor]);

  const columns: Column<(typeof perStore)[number]>[] = [
    {
      key: 'store',
      header: 'Loja',
      render: (r) => (
        <div className="flex items-center gap-3">
          <Avatar name={r.store?.name || r.id} src={r.store?.logoUrl} size={34} />
          <span className="font-bold text-slate-700 dark:text-slate-100 truncate">{r.store?.name || r.id}</span>
        </div>
      ),
    },
    { key: 'orders', header: 'Pedidos', align: 'right', hideOnMobile: true, render: (r) => num(r.orders) },
    { key: 'gross', header: 'GMV', align: 'right', render: (r) => <span className="font-bold">{brl(r.gross)}</span> },
    { key: 'commission', header: 'Comissão', align: 'right', hideOnMobile: true, render: (r) => <span className="text-brand-dark font-bold">{brl(r.commission)}</span> },
    { key: 'net', header: 'A repassar', align: 'right', render: (r) => <span className="font-bold text-slate-700 dark:text-slate-200">{brl(r.net)}</span> },
  ];

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <CardHeader title="Receita da plataforma por dia" subtitle="Comissões + taxas (últimos 21 dias)" className="p-0 mb-4" />
        <AreaTrend data={byDay} xKey="label" height={260} series={[{ key: 'revenue', color: '#6366F1', label: 'Receita' }, { key: 'gmv', color: '#58CC02', label: 'GMV' }]} formatY={(v) => brlCompact(v)} />
        {refunds > 0 && <p className="text-sm text-slate-400 mt-2">Estornos no período: <span className="font-bold text-danger">{brl(refunds)}</span></p>}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="Split por loja" subtitle="Volume, comissão retida e valor a repassar" />
        <DataTable columns={columns} rows={perStore} rowKey={(r) => r.id} emptyTitle="Sem dados financeiros" emptyDescription="Os pedidos pagos alimentarão esta conciliação." />
      </Card>
    </div>
  );
}

function Settlements({
  settlements,
  orders,
  stores,
  drivers,
  feeFor,
  canSettle,
}: {
  settlements: Settlement[];
  orders: Order[];
  stores: Supermarket[];
  drivers: DriverProfile[];
  feeFor: (id: string) => { commissionPct: number; fixedFee: number };
  canSettle: boolean;
}) {
  const toast = useUIStore((s) => s.toast);
  const [generating, setGenerating] = useState(false);

  const generate = async () => {
    const ok = await confirm({
      title: 'Gerar repasses do período',
      message: 'Serão criados repasses pendentes para lojas e entregadores com base nos pedidos carregados. Você poderá revisá-los antes de pagar.',
      confirmLabel: 'Gerar repasses',
    });
    if (!ok) return;
    setGenerating(true);
    try {
      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
      const end = today.toISOString().slice(0, 10);

      const storeMap = new Map<string, { gross: number; fees: number; count: number }>();
      const driverMap = new Map<string, { net: number; count: number }>();
      for (const o of orders) {
        if (o.status === 'cancelled') continue;
        const subtotal = o.subtotal ?? Math.max(0, (o.total || 0) - (o.deliveryFee || 0));
        const { commissionPct, fixedFee } = feeFor(o.supermarketId);
        const commission = (subtotal * commissionPct) / 100 + fixedFee;
        const s = storeMap.get(o.supermarketId) || { gross: 0, fees: 0, count: 0 };
        s.gross += subtotal;
        s.fees += commission;
        s.count += 1;
        storeMap.set(o.supermarketId, s);
        if (o.driverId) {
          const d = driverMap.get(o.driverId) || { net: 0, count: 0 };
          d.net += o.driverEarnings || 0;
          d.count += 1;
          driverMap.set(o.driverId, d);
        }
      }

      const storeName = new Map(stores.map((s) => [s.id, s.name]));
      const driverName = new Map(drivers.map((d) => [d.uid, d.name]));
      let created = 0;
      for (const [id, v] of storeMap) {
        if (v.gross <= 0) continue;
        await createSettlement({
          type: 'store',
          partyId: id,
          partyName: storeName.get(id) || id,
          periodStart: start,
          periodEnd: end,
          gross: v.gross,
          fees: v.fees,
          net: v.gross - v.fees,
          status: 'pending',
          ordersCount: v.count,
        });
        created++;
      }
      for (const [id, v] of driverMap) {
        if (v.net <= 0) continue;
        await createSettlement({
          type: 'driver',
          partyId: id,
          partyName: driverName.get(id) || id,
          periodStart: start,
          periodEnd: end,
          gross: v.net,
          fees: 0,
          net: v.net,
          status: 'pending',
          ordersCount: v.count,
        });
        created++;
      }
      toast(`${created} repasses gerados para o período.`, 'success');
    } finally {
      setGenerating(false);
    }
  };

  const act = async (s: Settlement, status: Settlement['status']) => {
    await setSettlementStatus(s, status);
    toast('Repasse atualizado.', 'success');
  };

  const columns: Column<Settlement>[] = [
    {
      key: 'party',
      header: 'Beneficiário',
      render: (s) => (
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${s.type === 'store' ? 'bg-info-soft text-info' : 'bg-warn-soft text-amber-600'}`}>
            {s.type === 'store' ? <StoreIcon className="w-4 h-4" /> : <Bike className="w-4 h-4" />}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-slate-700 dark:text-slate-100 truncate">{s.partyName || s.partyId}</p>
            <p className="text-xs text-slate-400">{s.periodStart} → {s.periodEnd}</p>
          </div>
        </div>
      ),
    },
    { key: 'gross', header: 'Bruto', align: 'right', hideOnMobile: true, render: (s) => brl(s.gross) },
    { key: 'fees', header: 'Taxas', align: 'right', hideOnMobile: true, render: (s) => brl(s.fees) },
    { key: 'net', header: 'Líquido', align: 'right', render: (s) => <span className="font-bold">{brl(s.net)}</span> },
    { key: 'status', header: 'Status', align: 'right', render: (s) => { const b = settlementStatusBadge(s.status); return <Badge tone={b.tone}>{b.label}</Badge>; } },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (s) =>
        canSettle && s.status !== 'paid' ? (
          <div className="flex gap-1 justify-end">
            <Button size="sm" onClick={() => act(s, 'paid')}><CheckCircle2 className="w-4 h-4" /></Button>
            <Button size="sm" variant="outline" onClick={() => act(s, 'on_hold')}><PauseCircle className="w-4 h-4" /></Button>
          </div>
        ) : null,
    },
  ];

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Repasses (split de pagamento)"
        subtitle="Valores a transferir para lojas e entregadores"
        action={canSettle ? <Button onClick={generate} disabled={generating}><Sparkles className="w-4 h-4" /> {generating ? 'Gerando…' : 'Gerar período'}</Button> : undefined}
      />
      <DataTable columns={columns} rows={settlements} rowKey={(s) => s.id} emptyIcon={<Banknote className="w-7 h-7" />} emptyTitle="Nenhum repasse" emptyDescription="Gere os repasses do período para começar." />
    </Card>
  );
}

function Payouts({ payouts, canSettle }: { payouts: Payout[]; canSettle: boolean }) {
  const toast = useUIStore((s) => s.toast);
  const act = async (p: Payout, status: PayoutStatus) => {
    if (status === 'rejected' || status === 'on_hold') {
      const ok = await confirm({
        title: status === 'rejected' ? 'Recusar saque' : 'Reter saque (custódia)',
        message: status === 'rejected' ? 'O valor retornará ao saldo do entregador.' : 'O valor ficará retido até a investigação.',
        danger: status === 'rejected',
        confirmLabel: status === 'rejected' ? 'Recusar' : 'Reter',
      });
      if (!ok) return;
    }

    // Aprovação: com o servidor de pagamentos configurado o dinheiro sai de
    // verdade via Stripe Connect; sem Connect (ou entregador sem onboarding)
    // cai no fluxo manual (PIX fora da plataforma) após confirmação.
    if (status === 'paid' && p.driverId) {
      try {
        if (await paymentsGatewayConfigured()) {
          await gatewayPayout({ driverId: p.driverId, amount: p.amount, payoutId: p.id });
          await setPayoutStatus(p, 'paid', 'Pago via Stripe Connect');
          toast('Repasse enviado via Stripe Connect.', 'success');
          return;
        }
      } catch (e: any) {
        if (e?.connectUnavailable) {
          const ok = await confirm({
            title: 'Entregador sem Stripe Connect',
            message:
              'Este entregador ainda não concluiu o cadastro de recebimento no Stripe. Marcar o saque como pago manualmente (ex.: PIX feito fora da plataforma)?',
            confirmLabel: 'Marcar como pago',
          });
          if (!ok) return;
        } else {
          toast(`Falha no repasse via Stripe: ${e?.message || e}`, 'error');
          return;
        }
      }
    }

    await setPayoutStatus(p, status);
    toast('Saque atualizado.', 'success');
  };

  const columns: Column<Payout>[] = [
    {
      key: 'driver',
      header: 'Entregador',
      render: (p) => (
        <div className="flex items-center gap-3">
          <Avatar name={p.driverName || p.driverId} size={34} />
          <div className="min-w-0">
            <p className="font-bold text-slate-700 dark:text-slate-100 truncate">{p.driverName || p.driverId}</p>
            <p className="text-xs text-slate-400">{p.method || 'PIX'} · {p.destination || '—'}</p>
          </div>
        </div>
      ),
    },
    { key: 'amount', header: 'Valor', align: 'right', render: (p) => <span className="font-bold">{brl(p.amount)}</span> },
    { key: 'when', header: 'Solicitado', align: 'right', hideOnMobile: true, render: (p) => <span className="text-slate-400">{timeAgo(p.createdAt)}</span> },
    { key: 'status', header: 'Status', align: 'right', render: (p) => { const b = payoutStatusBadge(p.status); return <Badge tone={b.tone}>{b.label}</Badge>; } },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (p) =>
        canSettle && (p.status === 'requested' || p.status === 'on_hold') ? (
          <div className="flex gap-1 justify-end">
            <Button size="sm" onClick={() => act(p, 'paid')}><CheckCircle2 className="w-4 h-4" /></Button>
            <Button size="sm" variant="outline" onClick={() => act(p, 'on_hold')}><PauseCircle className="w-4 h-4" /></Button>
            <Button size="sm" variant="outline" className="text-danger" onClick={() => act(p, 'rejected')}><XCircle className="w-4 h-4" /></Button>
          </div>
        ) : null,
    },
  ];

  return (
    <Card className="overflow-hidden">
      <CardHeader title="Solicitações de saque" subtitle="Aprovação dos saques dos entregadores" />
      <DataTable columns={columns} rows={payouts} rowKey={(p) => (p.driverId || '') + p.id} emptyIcon={<Banknote className="w-7 h-7" />} emptyTitle="Nenhum saque" emptyDescription="As solicitações de saque aparecerão aqui." />
    </Card>
  );
}
