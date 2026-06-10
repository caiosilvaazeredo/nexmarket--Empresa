import { useMemo, useState, type ReactNode } from 'react';
import { Map as MapIcon, Bike, Flame, Package, Circle } from 'lucide-react';
import { Page, PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { LiveMap } from '../components/map/LiveMap';
import { useSub } from '../hooks/useSub';
import { subscribeDrivers } from '../lib/drivers';
import { subscribeRecentOrders } from '../lib/orders';
import { computeDemandZones } from '../lib/geo';
import { num } from '../lib/format';
import { cn } from '../lib/utils';
import type { DriverProfile, Order } from '../lib/types';

export default function LiveOps() {
  const drivers = useSub<DriverProfile[]>(subscribeDrivers, []);
  const orders = useSub<Order[]>((cb) => subscribeRecentOrders(400, cb), []);
  const [filter, setFilter] = useState<'all' | 'online' | 'on_delivery'>('all');

  const liveOrders = useMemo(() => orders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled'), [orders]);
  const onlineDrivers = useMemo(() => drivers.filter((d) => d.status === 'online' || d.status === 'on_delivery'), [drivers]);
  const zones = useMemo(() => computeDemandZones(liveOrders, drivers), [liveOrders, drivers]);
  const hotZones = zones.filter((z) => z.pressure > 0).sort((a, b) => b.pressure - a.pressure);

  const shown = onlineDrivers.filter((d) => filter === 'all' || d.status === filter);
  const onDelivery = drivers.filter((d) => d.status === 'on_delivery').length;

  return (
    <Page className="h-[calc(100vh-2rem)] flex flex-col">
      <PageHeader title="Mapa ao vivo · God Mode" subtitle="Operação em tempo real e zonas de demanda" icon={<MapIcon className="w-6 h-6" />} />

      <div className="grid lg:grid-cols-[1fr_340px] gap-5 flex-1 min-h-0">
        <Card className="p-2 overflow-hidden">
          <LiveMap drivers={onlineDrivers} orders={liveOrders} zones={zones} height="100%" className="h-full" />
        </Card>

        <div className="flex flex-col gap-4 min-h-0">
          <div className="grid grid-cols-2 gap-3">
            <MiniStat icon={<Bike className="w-4 h-4" />} label="Online" value={num(onlineDrivers.length)} tone="green" />
            <MiniStat icon={<Package className="w-4 h-4" />} label="Pedidos ativos" value={num(liveOrders.length)} tone="indigo" />
            <MiniStat icon={<Circle className="w-4 h-4" />} label="Em entrega" value={num(onDelivery)} tone="blue" />
            <MiniStat icon={<Flame className="w-4 h-4" />} label="Zonas quentes" value={num(hotZones.length)} tone="red" />
          </div>

          {hotZones.length > 0 && (
            <Card className="p-4">
              <p className="font-bold text-sm text-slate-700 dark:text-slate-200 flex items-center gap-2 mb-2">
                <Flame className="w-4 h-4 text-danger" /> Alta demanda
              </p>
              <div className="space-y-1.5">
                {hotZones.slice(0, 3).map((z, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 font-mono text-xs">{z.lat.toFixed(3)}, {z.lng.toFixed(3)}</span>
                    <Badge tone="red">{z.orders} pedidos · {z.drivers} entreg.</Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center gap-1 p-3 border-b-2 border-slate-100 dark:border-slate-800">
              {(['all', 'online', 'on_delivery'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-bold',
                    filter === f ? 'bg-brand text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800',
                  )}
                >
                  {f === 'all' ? 'Todos' : f === 'online' ? 'Livres' : 'Em entrega'}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50 dark:divide-slate-800">
              {shown.length === 0 && <p className="text-center text-slate-400 py-8 text-sm">Nenhum entregador online.</p>}
              {shown.map((d) => (
                <div key={d.uid} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="relative">
                    <Avatar name={d.name} src={d.documents?.profilePhotoUrl} size={34} />
                    <span
                      className={cn(
                        'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900',
                        d.status === 'online' ? 'bg-brand' : 'bg-info',
                      )}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm text-slate-700 dark:text-slate-100 truncate">{d.name}</p>
                    <p className="text-xs text-slate-400">{d.vehicle?.plate || d.vehicle?.type || 'Entregador'}</p>
                  </div>
                  <Badge tone={d.status === 'online' ? 'green' : 'blue'}>{d.status === 'online' ? 'Livre' : 'Em entrega'}</Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}

function MiniStat({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: 'green' | 'indigo' | 'blue' | 'red' }) {
  const tones = {
    green: 'bg-brand-soft text-brand-dark',
    indigo: 'bg-accent-soft text-accent',
    blue: 'bg-info-soft text-info',
    red: 'bg-danger-soft text-danger',
  };
  return (
    <Card className="p-3">
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-2', tones[tone])}>{icon}</div>
      <p className="text-xl font-black text-slate-800 dark:text-slate-50 leading-none">{value}</p>
      <p className="text-[11px] font-bold text-slate-400 uppercase mt-1">{label}</p>
    </Card>
  );
}
