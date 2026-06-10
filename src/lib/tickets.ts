import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { logAudit } from './audit';
import { useAuthStore } from '../store/useAuthStore';
import type {
  Ticket,
  TicketMessage,
  TicketStatus,
  TicketPriority,
  ChatMessage,
} from './types';

function actor() {
  return useAuthStore.getState().admin;
}

/* ------------------------------- Tickets ------------------------------- */
export function subscribeTickets(cb: (tickets: Ticket[]) => void) {
  return onSnapshot(
    query(collection(db, 'tickets'), orderBy('updatedAt', 'desc')),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Ticket))),
    (err) => {
      console.warn('subscribeTickets error', err);
      cb([]);
    },
  );
}

export function subscribeTicket(id: string, cb: (t: Ticket | null) => void) {
  return onSnapshot(doc(db, 'tickets', id), (snap) =>
    cb(snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as Ticket) : null),
  );
}

export function subscribeTicketMessages(id: string, cb: (msgs: TicketMessage[]) => void) {
  return onSnapshot(
    query(collection(db, `tickets/${id}/messages`), orderBy('createdAt', 'asc')),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as TicketMessage))),
    () => cb([]),
  );
}

export async function createTicket(data: Partial<Ticket>): Promise<string> {
  const ref = await addDoc(collection(db, 'tickets'), {
    channel: data.channel || 'customer',
    status: data.status || 'open',
    priority: data.priority || 'normal',
    category: data.category ?? null,
    subject: data.subject || 'Novo ticket',
    preview: data.preview ?? null,
    requesterId: data.requesterId ?? null,
    requesterName: data.requesterName ?? null,
    requesterEmail: data.requesterEmail ?? null,
    orderId: data.orderId ?? null,
    supermarketId: data.supermarketId ?? null,
    driverId: data.driverId ?? null,
    customerId: data.customerId ?? null,
    assignedTo: data.assignedTo ?? null,
    assignedToName: data.assignedToName ?? null,
    unread: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function sendTicketMessage(
  ticketId: string,
  text: string,
  opts: { internal?: boolean } = {},
) {
  const a = actor();
  await addDoc(collection(db, `tickets/${ticketId}/messages`), {
    text,
    authorRole: 'agent',
    authorId: a?.uid ?? 'agent',
    authorName: a?.name ?? a?.email ?? 'Operador',
    internal: !!opts.internal,
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'tickets', ticketId), {
    preview: text.slice(0, 120),
    status: 'pending',
    unread: false,
    updatedAt: serverTimestamp(),
  });
}

export async function assignTicket(ticketId: string, toUid: string, toName: string) {
  await updateDoc(doc(db, 'tickets', ticketId), {
    assignedTo: toUid,
    assignedToName: toName,
    updatedAt: serverTimestamp(),
  });
  await logAudit({ action: 'ticket.assign', target: `Ticket ${ticketId.slice(0, 6)}`, targetType: 'ticket', targetId: ticketId, after: { assignedTo: toName } });
}

export async function setTicketStatus(ticketId: string, status: TicketStatus) {
  await updateDoc(doc(db, 'tickets', ticketId), {
    status,
    ...(status === 'resolved' || status === 'closed'
      ? { resolvedAt: serverTimestamp(), resolvedBy: actor()?.uid ?? null }
      : {}),
    updatedAt: serverTimestamp(),
  });
  if (status === 'resolved' || status === 'closed') {
    await logAudit({ action: 'ticket.resolve', target: `Ticket ${ticketId.slice(0, 6)}`, targetType: 'ticket', targetId: ticketId, after: { status } });
  }
}

export async function setTicketPriority(ticketId: string, priority: TicketPriority) {
  await updateDoc(doc(db, 'tickets', ticketId), { priority, updatedAt: serverTimestamp() });
}

/* --------------------- Order-scoped chat (RF06) --------------------- *
 * The Mesa de Resolução links a ticket to an Order and lets the operator chat
 * with whichever party is on that order, reusing the SAME message thread the
 * loja/entregador/cliente apps already read (senderRole: 'support').
 */
export function subscribeOrderMessages(
  smId: string,
  orderId: string,
  cb: (msgs: ChatMessage[]) => void,
) {
  return onSnapshot(
    query(
      collection(db, `supermarkets/${smId}/orders/${orderId}/messages`),
      orderBy('createdAt', 'asc'),
    ),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as ChatMessage))),
    () => cb([]),
  );
}

export async function sendOrderMessage(smId: string, orderId: string, text: string) {
  const a = actor();
  await addDoc(collection(db, `supermarkets/${smId}/orders/${orderId}/messages`), {
    text,
    senderId: a?.uid ?? 'support',
    senderRole: 'support',
    createdAt: serverTimestamp(),
  });
}
