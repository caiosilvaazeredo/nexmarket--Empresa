import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ShoppingBag,
  Search as SearchIcon,
  RotateCcw,
  Flag,
  MapPin,
  Receipt,
} from 'lucide-react';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { Page, PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Tabs } from '../components/ui/Tabs';
import { SearchInput, Field, Input, Textarea } from '../components/ui/Input';
import { DataTable, type Column } from '../components/ui/Table';
import { Drawer } from '../components/ui/Drawer';
import { Modal } from '../components/ui/Modal';
import { ChatPanel, type ChatBubble } from '../components/ChatPanel';
import { useSub } from '../hooks/useSub';
import { usePermission } from '../hooks/usePermission';
import { useUIStore } from '../store/useUIStore';
import { fetchOrdersPage, refundOrder, flagOrder } from '../lib/orders';
import { subscribeOrderMessages, sendOrderMessage } from '../lib/tickets';
import { subscribeStores } from '../lib/stores';
import { orderStatusBadge, deliveryStatusBadge, paymentStatusBadge } from '../lib/status';
import { brl, formatDateTime, timeAgo } from '../lib/format';
import type { Order, Supermarket, ChatMessage } from '../lib/types';

const PAGE = 25;
const TABS = [
  { key: 'all', label: 'Todos' },
  { key: 'active', label: 'Em andamento' },
  { key: 'delivered', label: 'Entregues' },
  { key: 'cancelled', label: 'Cancelados' },
  { key: 'flagged', label: 'Sinalizados' },
];

export default function Orders() {
  const stores = useSub<Supermarket[]>(subscribeStores, []);
  const storeName = useMemo(() => new Map(stores.map((s) => [s.id, s.name])), [stores]);
  const [rows, setRows] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const cursor = useRef<QueryDocumentSnapshot | null>(null);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Order | null>(null);

  const load = async (reset = false) => {
    setLoading(true);
    try {
      const res = await fetchOrdersPage({ pageSize: PAGE, after: reset ? null : cursor.current });
      cursor.current = res.last;
      setDone(res.done);
      setRows((prev) => (reset ? res.rows : [...prev, ...res.rows]));
    } catch (e) {
      console.warn(e);
      setDone(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return rows
      .map((o) => ({ ...o, storeName: storeName.get(o.supermarketId) || o.supermarketId }))
      .filter((o) => {
        if (tab === 'active') return o.status !== 'delivered' && o.status !== 'cancelled';
        if (tab === 'delivered') return o.status === 'delivered';
        if (tab === 'cancelled') return o.status === 'cancelled';
        if (tab === 'flagged') return o.flagged;
        return true;
      })
      .filter(
        (o) =>
          !q ||
          o.id.toLowerCase().includes(q) ||
          o.customerName?.toLowerCase().includes(q) ||
          o.storeName?.toLowerCase().includes(q) ||
          o.driverName?.toLowerCase().includes(q),
      );
  }, [rows, tab, search, storeName]);

  const columns: Column<Order>[] = [
    {
      key: 'id',
      header: 'Pedido',
      render: (o) => (
        <div className="flex items-center gap-3">
          <Avatar name={o.customerName || 'Cliente'} size={36} />
          <div className="min-w-0">
            <p className="font-bold text-slate-700 dark:text-slate-100 truncate">#{o.id.slice(0, 7)}</p>
            <p className="text-xs text-slate-400 truncate">{o.customerName || 'Cliente'}</p>
          </div>
        </div>
      ),
    },
    { key: 'store', header: 'Loja', hideOnMobile: true, render: (o) => <span className="text-slate-600 dark:text-slate-300">{o.storeName}</span> },
    { key: 'total', header: 'Total', render: (o) => <span className="font-bold text-slate-700 dark:text-slate-200">{brl(o.total)}</span> },
    {
      key: 'payment',
      header: 'Pagamento',
      hideOnMobile: true,
      render: (o) => {
        const b = paymentStatusBadge(o.paymentStatus || o.payment?.status);
        return <Badge tone={b.tone}>{b.label}</Badge>;
      },
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      render: (o) => {
        const b = orderStatusBadge(o.status);
        return (
          <div className="flex items-center gap-1.5 justify-end">
            {o.flagged && <Flag className="w-4 h-4 text-danger" />}
            <Badge tone={b.tone}>{b.label}</Badge>
          </div>
        );
      },
    },
    { key: 'date', header: 'Quando', align: 'right', hideOnMobile: true, render: (o) => <span className="text-slate-400">{timeAgo(o.createdAt)}</span> },
  ];

  return (
    <Page>
      <PageHeader
        title="Pedidos"
        subtitle="Todas as transações da plataforma"
        icon={<ShoppingBag className="w-6 h-6" />}
        actions={<SearchInput value={search} onChange={setSearch} placeholder="Buscar #id, cliente, loja…" className="w-full sm:w-72" />}
      >
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
      </PageHeader>

      <Card className="overflow-hidden">
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(o) => o.supermarketId + o.id}
          onRowClick={(o) => setSelected(o)}
          loading={loading}
          emptyIcon={<SearchIcon className="w-7 h-7" />}
          emptyTitle="Nenhum pedido"
          emptyDescription="Ajuste os filtros ou carregue mais registros."
        />
        <div className="p-4 flex justify-center border-t-2 border-slate-100 dark:border-slate-800">
          {!done ? (
            <Button variant="secondary" onClick={() => load(false)} disabled={loading}>
              {loading ? 'Carregando…' : 'Carregar mais'}
            </Button>
          ) : (
            <span className="text-sm text-slate-400">Fim dos resultados ({rows.length})</span>
          )}
        </div>
      </Card>

      <OrderDrawer order={selected} storeName={selected ? storeName.get(selected.supermarketId) : undefined} onClose={() => setSelected(null)} />
    </Page>
  );
}

function OrderDrawer({ order, storeName, onClose }: { order: Order | null; storeName?: string; onClose: () => void }) {
  const { can } = usePermission();
  const toast = useUIStore((s) => s.toast);
  const [refundOpen, setRefundOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [tab, setTab] = useState<'details' | 'chat'>('details');
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    if (!order) return;
    setAmount(String(order.total ?? ''));
    setReason('');
    setTab('details');
    const unsub = subscribeOrderMessages(order.supermarketId, order.id, setMessages);
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);

  if (!order) return null;
  const sb = orderStatusBadge(order.status);
  const db = deliveryStatusBadge(order.deliveryStatus);
  const pb = paymentStatusBadge(order.paymentStatus || order.payment?.status);

  const doRefund = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0 || !reason.trim()) return;
    await refundOrder(order, amt, reason.trim());
    setRefundOpen(false);
    toast('Estorno registrado e enviado ao gateway.', 'success');
  };

  const roleName = { driver: 'Entregador', customer: 'Cliente', store: 'Loja', support: 'Suporte' } as const;
  const bubbles: ChatBubble[] = messages.map((m) => ({
    id: m.id,
    text: m.text,
    mine: m.senderRole === 'support',
    author: m.senderRole === 'support' ? undefined : roleName[m.senderRole],
    time: m.createdAt,
  }));

  return (
    <Drawer open={!!order} onClose={onClose} title={`Pedido #${order.id.slice(0, 7)}`} subtitle={storeName || order.supermarketId}>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Badge tone={sb.tone}>{sb.label}</Badge>
        <Badge tone={db.tone}>{db.label}</Badge>
        <Badge tone={pb.tone}>{pb.label}</Badge>
        {order.flagged && <Badge tone="red" dot>Sinalizado</Badge>}
      </div>

      <Tabs
        className="mb-4"
        active={tab}
        onChange={(k) => setTab(k as any)}
        tabs={[{ key: 'details', label: 'Detalhes' }, { key: 'chat', label: 'Conversa', count: messages.length }]}
      />

      {tab === 'details' ? (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3 text-slate-700 dark:text-slate-200 font-bold">
              <Receipt className="w-4 h-4" /> Itens
            </div>
            <div className="space-y-2">
              {(order.items || []).map((it, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-300">{it.quantity}× {it.name}</span>
                  <span className="font-medium text-slate-700 dark:text-slate-200">{brl((it.price || 0) * (it.quantity || 1))}</span>
                </div>
              ))}
              {(!order.items || order.items.length === 0) && <p className="text-sm text-slate-400">Itens não detalhados.</p>}
            </div>
            <div className="border-t-2 border-slate-100 dark:border-slate-800 mt-3 pt-3 space-y-1 text-sm">
              <Row label="Subtotal" value={brl(order.subtotal)} />
              <Row label="Entrega" value={brl(order.deliveryFee)} />
              {order.discount ? <Row label={`Desconto ${order.couponCode ? `(${order.couponCode})` : ''}`} value={`- ${brl(order.discount)}`} /> : null}
              <Row label="Total" value={brl(order.total)} bold />
              {order.payment?.refundedAmount ? <Row label="Estornado" value={`- ${brl(order.payment.refundedAmount)}`} /> : null}
            </div>
          </Card>

          <Card className="p-4 space-y-3 text-sm">
            <Party label="Cliente" name={order.customerName} sub={order.customerPhone} />
            <Party label="Entregador" name={order.driverName} sub={order.driverEarnings ? `Ganho ${brl(order.driverEarnings)}` : undefined} />
            {order.deliveryAddress && (
              <div className="flex items-start gap-2 text-slate-600 dark:text-slate-300">
                <MapPin className="w-4 h-4 mt-0.5 text-slate-400" />
                <span>
                  {order.deliveryAddress.street}, {order.deliveryAddress.number} · {order.deliveryAddress.neighborhood} {order.deliveryAddress.city ? `· ${order.deliveryAddress.city}` : ''}
                </span>
              </div>
            )}
            <p className="text-xs text-slate-400">Criado em {formatDateTime(order.createdAt)}</p>
          </Card>

          <div className="flex gap-2">
            {can('orders.refund') && (
              <Button variant="outline" className="flex-1 text-danger" onClick={() => setRefundOpen(true)} disabled={order.payment?.status === 'refunded'}>
                <RotateCcw className="w-4 h-4" /> Estornar
              </Button>
            )}
            <Button variant="outline" className="flex-1" onClick={() => flagOrder(order, !order.flagged)}>
              <Flag className="w-4 h-4" /> {order.flagged ? 'Remover sinal' : 'Sinalizar'}
            </Button>
          </div>
        </div>
      ) : (
        <ChatPanel
          className="h-[60vh]"
          messages={bubbles}
          emptyHint="Sem mensagens neste pedido. Envie uma mensagem para o cliente, loja ou entregador."
          onSend={async (text) => {
            await sendOrderMessage(order.supermarketId, order.id, text);
          }}
        />
      )}

      <Modal
        open={refundOpen}
        onClose={() => setRefundOpen(false)}
        title="Estornar pedido"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRefundOpen(false)}>Cancelar</Button>
            <Button variant="danger" onClick={doRefund} disabled={!Number(amount) || !reason.trim()}>Confirmar estorno</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Valor do estorno (R$)">
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Motivo" hint="Registrado na trilha de auditoria e enviado ao gateway de pagamento.">
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: Pedido cancelado, cobrança indevida…" />
          </Field>
        </div>
      </Modal>
    </Drawer>
  );
}

function Row({ label, value, bold }: { label: string; value: ReactNode; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={bold ? 'font-bold text-slate-700 dark:text-slate-200' : 'text-slate-500'}>{label}</span>
      <span className={bold ? 'font-black text-slate-800 dark:text-slate-50' : 'font-medium text-slate-600 dark:text-slate-300'}>{value}</span>
    </div>
  );
}

function Party({ label, name, sub }: { label: string; name?: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar name={name || label} size={34} />
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-slate-400 uppercase">{label}</p>
        <p className="font-bold text-slate-700 dark:text-slate-200 truncate">{name || '—'}</p>
      </div>
      {sub && <span className="ml-auto text-xs text-slate-400">{sub}</span>}
    </div>
  );
}
