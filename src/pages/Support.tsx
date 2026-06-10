import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  LifeBuoy,
  User,
  Store as StoreIcon,
  Bike,
  Plus,
  CheckCircle2,
  UserPlus,
  Link2,
  ArrowLeft,
  AlertTriangle,
} from 'lucide-react';
import { Page, PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Tabs } from '../components/ui/Tabs';
import { Select, Field, Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/Feedback';
import { ChatPanel, type ChatBubble } from '../components/ChatPanel';
import { cn } from '../lib/utils';
import { useSub } from '../hooks/useSub';
import { usePermission } from '../hooks/usePermission';
import { useUIStore } from '../store/useUIStore';
import { useAuthStore } from '../store/useAuthStore';
import {
  subscribeTickets,
  subscribeTicketMessages,
  sendTicketMessage,
  setTicketStatus,
  setTicketPriority,
  assignTicket,
  createTicket,
  subscribeOrderMessages,
  sendOrderMessage,
} from '../lib/tickets';
import { ticketStatusBadge, ticketPriorityBadge, ticketChannelLabel } from '../lib/status';
import { timeAgo } from '../lib/format';
import type { Ticket, TicketMessage, TicketChannel, TicketPriority, ChatMessage } from '../lib/types';

const CHANNEL_ICON: Record<TicketChannel, typeof User> = { customer: User, store: StoreIcon, driver: Bike };
const MACROS = [
  { title: 'Saudação', body: 'Olá! Aqui é o suporte da Nexmarket. Como posso ajudar?' },
  { title: 'Cupom desculpas', body: 'Pelo transtorno, aplicamos um cupom de frete grátis no seu próximo pedido. 💚' },
  { title: 'Aguardar', body: 'Estou verificando com a loja/entregador e já retorno, tudo bem?' },
  { title: 'Encerrar', body: 'Posso ajudar em algo mais? Se não, vou encerrar este atendimento. Obrigado!' },
];

const TABS = [
  { key: 'all', label: 'Todos' },
  { key: 'customer', label: 'Clientes' },
  { key: 'store', label: 'Lojas' },
  { key: 'driver', label: 'Entregadores' },
];

export default function Support() {
  const tickets = useSub<Ticket[]>(subscribeTickets, []);
  const [tab, setTab] = useState('all');
  const [showResolved, setShowResolved] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const counts = useMemo(() => {
    const open = tickets.filter((t) => t.status !== 'resolved' && t.status !== 'closed');
    return {
      all: open.length,
      customer: open.filter((t) => t.channel === 'customer').length,
      store: open.filter((t) => t.channel === 'store').length,
      driver: open.filter((t) => t.channel === 'driver').length,
    };
  }, [tickets]);

  const list = useMemo(() => {
    return tickets
      .filter((t) => (showResolved ? true : t.status !== 'resolved' && t.status !== 'closed'))
      .filter((t) => tab === 'all' || t.channel === tab)
      .sort((a, b) => {
        const prio = { urgent: 0, high: 1, normal: 2, low: 3 } as const;
        const pa = prio[a.priority] ?? 2;
        const pb = prio[b.priority] ?? 2;
        if (pa !== pb) return pa - pb;
        return 0;
      });
  }, [tickets, tab, showResolved]);

  const selected = tickets.find((t) => t.id === selectedId) || null;

  return (
    <Page className="h-[calc(100vh-2rem)] flex flex-col">
      <PageHeader
        title="Suporte"
        subtitle="Central de tickets — clientes, lojas e entregadores"
        icon={<LifeBuoy className="w-6 h-6" />}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" /> Novo ticket
          </Button>
        }
      />

      <div className="grid lg:grid-cols-[360px_1fr] gap-5 flex-1 min-h-0">
        {/* List */}
        <div className={cn('flex-col min-h-0', selected ? 'hidden lg:flex' : 'flex')}>
          <div className="flex items-center justify-between mb-3 gap-2">
            <Tabs tabs={TABS.map((t) => ({ ...t, count: (counts as any)[t.key] }))} active={tab} onChange={setTab} />
          </div>
          <label className="flex items-center gap-2 mb-2 text-xs font-bold text-slate-400 cursor-pointer">
            <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} className="accent-brand" />
            Mostrar resolvidos
          </label>
          <Card className="flex-1 overflow-y-auto divide-y divide-slate-50 dark:divide-slate-800">
            {list.length === 0 && <p className="text-center text-slate-400 py-12 text-sm">Nenhum ticket por aqui. 🎉</p>}
            {list.map((t) => {
              const Icon = CHANNEL_ICON[t.channel];
              const pb = ticketPriorityBadge(t.priority);
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={cn(
                    'w-full text-left p-4 flex gap-3 transition-colors',
                    selectedId === t.id ? 'bg-brand-soft dark:bg-brand/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40',
                  )}
                >
                  <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', t.priority === 'urgent' ? 'bg-danger-soft text-danger' : 'bg-slate-100 dark:bg-slate-800 text-slate-500')}>
                    {t.priority === 'urgent' ? <AlertTriangle className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-sm text-slate-700 dark:text-slate-100 truncate flex-1">{t.subject}</p>
                      {t.unread && <span className="w-2 h-2 rounded-full bg-brand shrink-0" />}
                    </div>
                    <p className="text-xs text-slate-400 truncate">{t.requesterName || ticketChannelLabel[t.channel]} · {t.preview || '—'}</p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <Badge tone={pb.tone}>{pb.label}</Badge>
                      <span className="text-[11px] text-slate-400">{timeAgo(t.updatedAt || t.createdAt)}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </Card>
        </div>

        {/* Detail */}
        <div className={cn('min-h-0', selected ? 'flex flex-col' : 'hidden lg:flex')}>
          {selected ? (
            <TicketDetail ticket={selected} onBack={() => setSelectedId(null)} />
          ) : (
            <Card className="flex-1 flex items-center justify-center">
              <EmptyState icon={<LifeBuoy className="w-7 h-7" />} title="Selecione um ticket" description="Escolha um atendimento na lista para responder." />
            </Card>
          )}
        </div>
      </div>

      <CreateTicketModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={setSelectedId} />
    </Page>
  );
}

function TicketDetail({ ticket, onBack }: { ticket: Ticket; onBack: () => void }) {
  const { can } = usePermission();
  const admin = useAuthStore((s) => s.admin);
  const toast = useUIStore((s) => s.toast);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [orderMsgs, setOrderMsgs] = useState<ChatMessage[]>([]);
  const [view, setView] = useState<'ticket' | 'order'>('ticket');
  const canRespond = can('support.respond');

  useEffect(() => {
    const unsub = subscribeTicketMessages(ticket.id, setMessages);
    return () => unsub();
  }, [ticket.id]);

  useEffect(() => {
    if (ticket.orderId && ticket.supermarketId) {
      const unsub = subscribeOrderMessages(ticket.supermarketId, ticket.orderId, setOrderMsgs);
      return () => unsub();
    }
    setOrderMsgs([]);
  }, [ticket.orderId, ticket.supermarketId]);

  const sb = ticketStatusBadge(ticket.status);
  const roleName = { agent: 'Você', driver: 'Entregador', customer: 'Cliente', store: 'Loja', system: 'Sistema', support: 'Suporte' } as any;

  const ticketBubbles: ChatBubble[] = messages.map((m) => ({
    id: m.id,
    text: m.text,
    mine: m.authorRole === 'agent',
    author: m.authorRole === 'agent' ? undefined : (m.authorName || roleName[m.authorRole]),
    time: m.createdAt,
    internal: m.internal,
    system: m.authorRole === 'system',
  }));

  const orderBubbles: ChatBubble[] = orderMsgs.map((m) => ({
    id: m.id,
    text: m.text,
    mine: m.senderRole === 'support',
    author: m.senderRole === 'support' ? undefined : roleName[m.senderRole],
    time: m.createdAt,
  }));

  return (
    <Card className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="p-4 border-b-2 border-slate-100 dark:border-slate-800">
        <div className="flex items-start gap-3">
          <button onClick={onBack} className="lg:hidden p-2 -ml-2 text-slate-400">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="font-black text-slate-800 dark:text-slate-50 truncate">{ticket.subject}</h2>
            <p className="text-sm text-slate-400">{ticket.requesterName || ticketChannelLabel[ticket.channel]} · {ticketChannelLabel[ticket.channel]}</p>
          </div>
          <Badge tone={sb.tone}>{sb.label}</Badge>
        </div>

        {/* Linked records (Mesa de Resolução) */}
        {(ticket.orderId || ticket.driverId || ticket.supermarketId) && (
          <div className="flex flex-wrap gap-2 mt-3">
            {ticket.orderId && <Chip icon={<Link2 className="w-3.5 h-3.5" />} text={`Pedido #${ticket.orderId.slice(0, 6)}`} />}
            {ticket.supermarketId && <Chip icon={<StoreIcon className="w-3.5 h-3.5" />} text="Loja vinculada" />}
            {ticket.driverId && <Chip icon={<Bike className="w-3.5 h-3.5" />} text="Entregador vinculado" />}
          </div>
        )}

        {/* Controls */}
        {canRespond && (
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Button size="sm" variant="outline" onClick={() => admin && assignTicket(ticket.id, admin.uid, admin.name)}>
              <UserPlus className="w-4 h-4" /> {ticket.assignedToName ? `Resp.: ${ticket.assignedToName}` : 'Atribuir a mim'}
            </Button>
            <Select className="w-auto h-9 text-xs py-0" value={ticket.priority} onChange={(e) => setTicketPriority(ticket.id, e.target.value as TicketPriority)}>
              <option value="low">Baixa</option>
              <option value="normal">Normal</option>
              <option value="high">Alta</option>
              <option value="urgent">Urgente</option>
            </Select>
            {ticket.status !== 'resolved' ? (
              <Button size="sm" onClick={() => { setTicketStatus(ticket.id, 'resolved'); toast('Ticket resolvido!', 'success'); }}>
                <CheckCircle2 className="w-4 h-4" /> Resolver
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setTicketStatus(ticket.id, 'open')}>Reabrir</Button>
            )}
          </div>
        )}

        {ticket.orderId && ticket.supermarketId && (
          <Tabs
            className="mt-3"
            active={view}
            onChange={(k) => setView(k as any)}
            tabs={[
              { key: 'ticket', label: 'Atendimento', count: messages.length },
              { key: 'order', label: 'Chat do pedido', count: orderMsgs.length },
            ]}
          />
        )}
      </div>

      {/* Chat */}
      <div className="flex-1 min-h-0 p-3">
        {view === 'ticket' ? (
          <ChatPanel
            className="h-full"
            messages={ticketBubbles}
            allowInternal
            macros={MACROS}
            emptyHint="Inicie a conversa com o solicitante."
            onSend={async (text, internal) => {
              if (!canRespond) return;
              await sendTicketMessage(ticket.id, text, { internal });
            }}
          />
        ) : (
          <ChatPanel
            className="h-full"
            messages={orderBubbles}
            emptyHint="Converse diretamente com cliente, loja e entregador deste pedido."
            onSend={async (text) => {
              if (ticket.supermarketId && ticket.orderId) await sendOrderMessage(ticket.supermarketId, ticket.orderId, text);
            }}
          />
        )}
      </div>
    </Card>
  );
}

function Chip({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold">
      {icon}
      {text}
    </span>
  );
}

function CreateTicketModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [channel, setChannel] = useState<TicketChannel>('customer');
  const [subject, setSubject] = useState('');
  const [requesterName, setRequesterName] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('normal');

  const submit = async () => {
    if (!subject.trim()) return;
    const id = await createTicket({ channel, subject: subject.trim(), requesterName: requesterName.trim() || undefined, priority, status: 'open' });
    onClose();
    setSubject('');
    setRequesterName('');
    onCreated(id);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo ticket"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={!subject.trim()}>Criar ticket</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Canal">
          <Select value={channel} onChange={(e) => setChannel(e.target.value as TicketChannel)}>
            <option value="customer">Cliente</option>
            <option value="store">Loja</option>
            <option value="driver">Entregador</option>
          </Select>
        </Field>
        <Field label="Solicitante">
          <Input value={requesterName} onChange={(e) => setRequesterName(e.target.value)} placeholder="Nome do solicitante" />
        </Field>
        <Field label="Assunto">
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Descreva o problema" />
        </Field>
        <Field label="Prioridade">
          <Select value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)}>
            <option value="low">Baixa</option>
            <option value="normal">Normal</option>
            <option value="high">Alta</option>
            <option value="urgent">Urgente</option>
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
