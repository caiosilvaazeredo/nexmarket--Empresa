import type { BadgeTone } from '../components/ui/Badge';
import type {
  OrderStatus,
  DeliveryStatus,
  PaymentStatus,
  DriverApprovalStatus,
  StoreApprovalStatus,
  TicketStatus,
  TicketPriority,
  TicketChannel,
  PayoutStatus,
  SettlementStatus,
} from './types';

type S = { label: string; tone: BadgeTone };

export const orderStatusBadge = (s?: OrderStatus): S =>
  ({
    pending: { label: 'Pendente', tone: 'amber' as BadgeTone },
    picking: { label: 'Separando', tone: 'blue' as BadgeTone },
    waiting_substitution: { label: 'Aguard. substituição', tone: 'amber' as BadgeTone },
    ready: { label: 'Pronto', tone: 'indigo' as BadgeTone },
    delivered: { label: 'Entregue', tone: 'green' as BadgeTone },
    cancelled: { label: 'Cancelado', tone: 'red' as BadgeTone },
  }[s || 'pending'] || { label: s || '—', tone: 'slate' });

export const deliveryStatusBadge = (s?: DeliveryStatus): S =>
  ({
    awaiting_driver: { label: 'Buscando entregador', tone: 'amber' as BadgeTone },
    assigned: { label: 'Atribuído', tone: 'blue' as BadgeTone },
    going_to_store: { label: 'Indo à loja', tone: 'blue' as BadgeTone },
    arrived_store: { label: 'Na loja', tone: 'indigo' as BadgeTone },
    picked_up: { label: 'Coletado', tone: 'indigo' as BadgeTone },
    going_to_customer: { label: 'A caminho', tone: 'blue' as BadgeTone },
    delivered: { label: 'Entregue', tone: 'green' as BadgeTone },
    problem: { label: 'Problema', tone: 'red' as BadgeTone },
  }[s || 'awaiting_driver'] || { label: s || '—', tone: 'slate' });

export const paymentStatusBadge = (s?: PaymentStatus): S =>
  ({
    pending: { label: 'Pagamento pendente', tone: 'amber' as BadgeTone },
    paid: { label: 'Pago', tone: 'green' as BadgeTone },
    failed: { label: 'Falhou', tone: 'red' as BadgeTone },
    refunded: { label: 'Estornado', tone: 'slate' as BadgeTone },
    chargeback: { label: 'Chargeback', tone: 'red' as BadgeTone },
  }[s || 'pending'] || { label: s || '—', tone: 'slate' });

export const driverApprovalBadge = (s?: DriverApprovalStatus): S =>
  ({
    pending: { label: 'Pendente', tone: 'amber' as BadgeTone },
    approved: { label: 'Aprovado', tone: 'green' as BadgeTone },
    rejected: { label: 'Recusado', tone: 'red' as BadgeTone },
    blocked: { label: 'Bloqueado', tone: 'red' as BadgeTone },
  }[s || 'pending'] || { label: s || '—', tone: 'slate' });

export const storeApprovalBadge = (s?: StoreApprovalStatus): S =>
  ({
    pending: { label: 'Pendente', tone: 'amber' as BadgeTone },
    approved: { label: 'Ativa', tone: 'green' as BadgeTone },
    rejected: { label: 'Recusada', tone: 'red' as BadgeTone },
    suspended: { label: 'Suspensa', tone: 'red' as BadgeTone },
  }[s || 'pending'] || { label: s || '—', tone: 'slate' });

export const ticketStatusBadge = (s?: TicketStatus): S =>
  ({
    open: { label: 'Aberto', tone: 'blue' as BadgeTone },
    pending: { label: 'Em andamento', tone: 'amber' as BadgeTone },
    resolved: { label: 'Resolvido', tone: 'green' as BadgeTone },
    closed: { label: 'Fechado', tone: 'slate' as BadgeTone },
  }[s || 'open'] || { label: s || '—', tone: 'slate' });

export const ticketPriorityBadge = (s?: TicketPriority): S =>
  ({
    low: { label: 'Baixa', tone: 'slate' as BadgeTone },
    normal: { label: 'Normal', tone: 'blue' as BadgeTone },
    high: { label: 'Alta', tone: 'amber' as BadgeTone },
    urgent: { label: 'Urgente', tone: 'red' as BadgeTone },
  }[s || 'normal'] || { label: s || '—', tone: 'slate' });

export const ticketChannelLabel: Record<TicketChannel, string> = {
  customer: 'Cliente',
  store: 'Loja',
  driver: 'Entregador',
};

export const payoutStatusBadge = (s?: PayoutStatus): S =>
  ({
    requested: { label: 'Solicitado', tone: 'amber' as BadgeTone },
    processing: { label: 'Processando', tone: 'blue' as BadgeTone },
    paid: { label: 'Pago', tone: 'green' as BadgeTone },
    rejected: { label: 'Recusado', tone: 'red' as BadgeTone },
    on_hold: { label: 'Em custódia', tone: 'amber' as BadgeTone },
  }[s || 'requested'] || { label: s || '—', tone: 'slate' });

export const settlementStatusBadge = (s?: SettlementStatus): S =>
  ({
    pending: { label: 'Pendente', tone: 'amber' as BadgeTone },
    scheduled: { label: 'Agendado', tone: 'blue' as BadgeTone },
    paid: { label: 'Pago', tone: 'green' as BadgeTone },
    failed: { label: 'Falhou', tone: 'red' as BadgeTone },
    on_hold: { label: 'Em custódia', tone: 'amber' as BadgeTone },
  }[s || 'pending'] || { label: s || '—', tone: 'slate' });
