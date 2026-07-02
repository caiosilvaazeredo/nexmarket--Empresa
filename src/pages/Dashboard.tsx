import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Wallet,
  ShoppingBag,
  Bike,
  LifeBuoy,
  TrendingUp,
  ArrowRight,
  Store as StoreIcon,
  AlertTriangle,
} from 'lucide-react';
import { Page, PageHeader } from '../components/layout/PageHeader';
import { Stat } from '../components/ui/Stat';
import { Card, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { AreaTrend, DonutChart } from '../components/charts/Charts';
import { LiveMap } from '../components/map/LiveMap';
import { useSub } from '../hooks/useSub';
import { subscribeDrivers, driverApprovalOf } from '../lib/drivers';
import { subscribeStores, storeApprovalOf } from '../lib/stores';
import { subscribeRecentOrders } from '../lib/orders';
import { subscribeTickets } from '../lib/tickets';
import { subscribePlatformConfig } from '../lib/platform';
import { computeFinance, DEFAULT_COMMISSION_PCT, DEFAULT_FIXED_FEE } from '../lib/finance';
import { computeDemandZones } from '../lib/geo';
import { brl, brlCompact, num, timeAgo } from '../lib/format';
import { orderStatusBadge } from '../lib/status';
import type { Order, DriverProfile, Supermarket, Ticket, PlatformConfig } from '../lib/types';

const PAYMENT_LABELS: Record<string, string> = {
  pix: 'PIX',
  card_online: 'Cartão online',
  picpay: 'PicPay',
  nupay: 'NuPay',
  card_delivery: 'Cartão na entrega',
  cash_delivery: 'Dinheiro',
};
const PAYMENT_COLORS = ['#58CC02', '#3B82F6', '#6366F1', '#F59E0B', '#94A3B8'];

export default function Dashboard() {
  const drivers = useSub<DriverProfile[]>(subscribeDrivers, []);
  const stores = useSub<Supermarket[]>(subscribeStores, []);
  const orders = useSub<Order[]>((cb) => subscribeRecentOrders(400, cb), []);
  const tickets = useSub<Ticket[]>(subscribeTickets, []);
  const config = useSub<PlatformConfig | null>(subscribePlatformConfig, null);

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

  const last14 = useMemo(() => {
    const days: { date: string; label: string; gmv: number; revenue: number }[] = [];
    const byDate = new Map(fin.byDay.map((d) => [d.date, d]));
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const hit = byDate.get(key);
      days.push({
        date: key,
        label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        gmv: hit?.gmv || 0,
        revenue: hit?.revenue || 0,
      });
    }
    return days;
  }, [fin]);

  const paymentData = useMemo(() => {
    return Object.entries(fin.byPayment)
      .filter(([k]) => k !== 'pending')
      .map(([k, v], i) => ({ name: PAYMENT_LABELS[k] || k, value: v, color: PAYMENT_COLORS[i % PAYMENT_COLORS.length] }))
      .sort((a, b) => b.value - a.value);
  }, [fin]);

  const onlineDrivers = drivers.filter((d) => d.status === 'online' || d.status === 'on_delivery');
  const driversPending = drivers.filter((d) => driverApprovalOf(d) === 'pending').length;
  const storesPending = stores.filter((s) => storeApprovalOf(s) === 'pending').length;
  const ticketsOpen = tickets.filter((t) => t.status === 'open' || t.status === 'pending').length;
  const urgentTickets = tickets.filter((t) => t.priority === 'urgent' && t.status !== 'resolved' && t.status !== 'closed');

  const liveOrders = orders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled');
  const zones = useMemo(() => computeDemandZones(liveOrders, drivers), [liveOrders, drivers]);
  const recent = orders.slice(0, 8);

  // Comparativo: últimos 7 dias × 7 dias anteriores (GMV e receita).
  const compare = useMemo(() => {
    const dayKey = (offset: number) => {
      const d = new Date();
      d.setDate(d.getDate() - offset);
      return d.toISOString().slice(0, 10);
    };
    const cur = new Set(Array.from({ length: 7 }, (_, i) => dayKey(i)));
    const prev = new Set(Array.from({ length: 7 }, (_, i) => dayKey(i + 7)));
    let curGmv = 0, prevGmv = 0, curRev = 0, prevRev = 0;
    for (const d of fin.byDay) {
      if (cur.has(d.date)) { curGmv += d.gmv; curRev += d.revenue; }
      else if (prev.has(d.date)) { prevGmv += d.gmv; prevRev += d.revenue; }
    }
    const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
    return { gmvDelta: pct(curGmv, prevGmv), revDelta: pct(curRev, prevRev) };
  }, [fin]);

  const deltaHint = (delta: number | null, base: string) =>
    delta === null ? base : `${base} · ${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}% vs sem. anterior`;

  // Alertas proativos de operação (estilo iFood Gestor).
  const opsAlerts = useMemo(() => {
    const out: { text: string; to: string }[] = [];
    const total = orders.length || 1;
    const cancelled = orders.filter((o) => o.status === 'cancelled').length;
    const cancelRate = Math.round((cancelled / total) * 100);
    if (cancelRate >= 10) out.push({ text: `Taxa de cancelamento em ${cancelRate}% — investigue as causas`, to: '/pedidos' });
    const stuckPayments = orders.filter(
      (o) => (o.paymentMethod === 'pix' || o.paymentMethod === 'card_online') && (o.paymentStatus || o.payment?.status) === 'pending' && o.status !== 'cancelled',
    ).length;
    if (stuckPayments >= 3) out.push({ text: `${stuckPayments} pedidos aguardando pagamento online — possível atrito no checkout`, to: '/pedidos' });
    if (driversPending > 0) out.push({ text: `${driversPending} entregador(es) aguardando aprovação de cadastro`, to: '/entregadores' });
    if (storesPending > 0) out.push({ text: `${storesPending} loja(s) aguardando aprovação`, to: '/lojas' });
    if (liveOrders.length > 0 && onlineDrivers.length === 0) out.push({ text: 'Pedidos ativos SEM entregadores online agora', to: '/mapa' });
    return out;
  }, [orders, driversPending, storesPending, liveOrders.length, onlineDrivers.length]);

  return (
    <Page>
      <PageHeader
        title="Dashboard"
        subtitle={new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        icon={<LayoutDashboard className="w-6 h-6" />}
      />

      {urgentTickets.length > 0 && (
        <Link to="/suporte" className="block mb-5">
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-danger-soft border-2 border-danger/20 text-danger-dark">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span className="font-bold flex-1">
              {urgentTickets.length} ticket(s) urgente(s) aguardando atendimento
            </span>
            <ArrowRight className="w-5 h-5" />
          </div>
        </Link>
      )}

      {/* Alertas proativos */}
      {opsAlerts.length > 0 && (
        <div className="space-y-2 mb-5">
          {opsAlerts.map((a, i) => (
            <Link key={i} to={a.to} className="block">
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-warn-soft border-2 border-warn/20 text-amber-700">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span className="font-bold text-sm flex-1">{a.text}</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* KPIs (com comparativo vs semana anterior) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label="GMV (período)" value={brlCompact(fin.gmv)} icon={<Wallet className="w-5 h-5" />} tone="brand" hint={deltaHint(compare.gmvDelta, `${num(fin.ordersCount)} pedidos`)} />
        <Stat label="Receita plataforma" value={brlCompact(fin.platformRevenue)} icon={<TrendingUp className="w-5 h-5" />} tone="indigo" hint={deltaHint(compare.revDelta, `ticket méd. ${brl(fin.avgTicket)}`)} />
        <Stat label="Entregadores online" value={num(onlineDrivers.length)} icon={<Bike className="w-5 h-5" />} tone="blue" hint={`${num(drivers.length)} no total`} />
        <Stat label="Tickets abertos" value={num(ticketsOpen)} icon={<LifeBuoy className="w-5 h-5" />} tone="amber" hint={`${num(urgentTickets.length)} urgentes`} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        <Card className="lg:col-span-2 p-5">
          <CardHeader title="Vendas (GMV) — últimos 14 dias" subtitle="Volume transacionado por dia" className="p-0 mb-4" />
          <AreaTrend
            data={last14}
            xKey="label"
            height={280}
            series={[{ key: 'gmv', color: '#58CC02', label: 'GMV' }, { key: 'revenue', color: '#6366F1', label: 'Receita' }]}
            formatY={(v) => brlCompact(v)}
          />
        </Card>
        <Card className="p-5">
          <CardHeader title="Formas de pagamento" subtitle="Distribuição de pedidos" className="p-0 mb-2" />
          {paymentData.length > 0 ? (
            <>
              <DonutChart data={paymentData} height={210} />
              <div className="space-y-1.5 mt-2">
                {paymentData.map((p) => (
                  <div key={p.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 font-medium text-slate-600 dark:text-slate-300">
                      <span className="w-3 h-3 rounded-full" style={{ background: p.color }} /> {p.name}
                    </span>
                    <span className="font-bold text-slate-700 dark:text-slate-200">{num(p.value)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-center text-slate-400 py-16 text-sm">Sem dados de pagamento ainda.</p>
          )}
        </Card>
      </div>

      {/* Map + queues */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        <Card className="lg:col-span-2 p-5">
          <CardHeader
            title="Operação ao vivo"
            subtitle={`${onlineDrivers.length} entregadores · ${liveOrders.length} pedidos ativos`}
            className="p-0 mb-4"
            action={
              <Link to="/mapa" className="text-sm font-bold text-brand-dark hover:underline flex items-center gap-1">
                God Mode <ArrowRight className="w-4 h-4" />
              </Link>
            }
          />
          <LiveMap drivers={onlineDrivers} orders={liveOrders} zones={zones} height={320} />
        </Card>

        <div className="space-y-4">
          <QueueCard to="/entregadores" icon={<Bike className="w-5 h-5" />} label="Entregadores p/ validar" count={driversPending} tone="amber" />
          <QueueCard to="/lojas" icon={<StoreIcon className="w-5 h-5" />} label="Lojas pendentes" count={storesPending} tone="blue" />
          <QueueCard to="/suporte" icon={<LifeBuoy className="w-5 h-5" />} label="Tickets abertos" count={ticketsOpen} tone="indigo" />
        </div>
      </div>

      {/* Recent orders */}
      <Card>
        <CardHeader title="Pedidos recentes" subtitle="Atualização em tempo real" action={<Link to="/pedidos" className="text-sm font-bold text-brand-dark hover:underline">Ver todos</Link>} />
        <div className="divide-y divide-slate-50 dark:divide-slate-800">
          {recent.length === 0 && <p className="text-center text-slate-400 py-10 text-sm">Sem pedidos ainda.</p>}
          {recent.map((o) => {
            const sb = orderStatusBadge(o.status);
            const store = stores.find((s) => s.id === o.supermarketId);
            return (
              <div key={o.id} className="flex items-center gap-3 px-5 py-3">
                <Avatar name={o.customerName || 'Cliente'} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm text-slate-700 dark:text-slate-200 truncate">
                    {o.customerName || 'Cliente'} · {store?.name || o.supermarketId}
                  </p>
                  <p className="text-xs text-slate-400">{timeAgo(o.createdAt)}</p>
                </div>
                <span className="font-bold text-slate-700 dark:text-slate-200 text-sm">{brl(o.total)}</span>
                <Badge tone={sb.tone}>{sb.label}</Badge>
              </div>
            );
          })}
        </div>
      </Card>
    </Page>
  );
}

function QueueCard({
  to,
  icon,
  label,
  count,
  tone,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  count: number;
  tone: 'amber' | 'blue' | 'indigo';
}) {
  const tones = {
    amber: 'bg-warn-soft text-amber-700',
    blue: 'bg-info-soft text-info',
    indigo: 'bg-accent-soft text-accent',
  };
  return (
    <Link to={to}>
      <Card className="p-4 flex items-center gap-4 hover:border-brand transition-colors">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${tones[tone]}`}>{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-3xl font-black text-slate-800 dark:text-slate-50 leading-none">{count}</p>
          <p className="text-sm font-medium text-slate-400 mt-1 truncate">{label}</p>
        </div>
        <ArrowRight className="w-5 h-5 text-slate-300" />
      </Card>
    </Link>
  );
}
