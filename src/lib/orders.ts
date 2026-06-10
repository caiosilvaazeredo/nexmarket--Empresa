import {
  collectionGroup,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
  limit,
  startAfter,
  updateDoc,
  serverTimestamp,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from './firebase';
import { logAudit } from './audit';
import { useAuthStore } from '../store/useAuthStore';
import type { Order } from './types';

function actor() {
  return useAuthStore.getState().admin;
}

function mapOrder(d: QueryDocumentSnapshot): Order {
  const supermarketId = d.ref.parent.parent?.id;
  return { id: d.id, supermarketId: supermarketId || '', ...(d.data() as any) } as Order;
}

/** Realtime feed of the most recent orders across ALL stores (dashboard). */
export function subscribeRecentOrders(n: number, cb: (orders: Order[]) => void) {
  const q = query(collectionGroup(db, 'orders'), orderBy('createdAt', 'desc'), limit(n));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map(mapOrder)),
    (err) => {
      console.warn('subscribeRecentOrders error', err);
      cb([]);
    },
  );
}

/** Server-side paginated fetch (RNF04) for the big orders table. */
export async function fetchOrdersPage(opts: {
  pageSize: number;
  after?: QueryDocumentSnapshot | null;
}): Promise<{ rows: Order[]; last: QueryDocumentSnapshot | null; done: boolean }> {
  const base = collectionGroup(db, 'orders');
  const q = opts.after
    ? query(base, orderBy('createdAt', 'desc'), startAfter(opts.after), limit(opts.pageSize))
    : query(base, orderBy('createdAt', 'desc'), limit(opts.pageSize));
  const snap = await getDocs(q);
  return {
    rows: snap.docs.map(mapOrder),
    last: snap.docs[snap.docs.length - 1] ?? null,
    done: snap.size < opts.pageSize,
  };
}

/** Orders of a single store (used in store 360 view). */
export function subscribeStoreOrders(smId: string, n: number, cb: (orders: Order[]) => void) {
  const q = query(
    collection(db, `supermarkets/${smId}/orders`),
    orderBy('createdAt', 'desc'),
    limit(n),
  );
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, supermarketId: smId, ...(d.data() as any) } as Order))),
    () => cb([]),
  );
}

/** A customer's orders across every store (360° view). Needs a collection-group index. */
export function subscribeCustomerOrders(customerId: string, n: number, cb: (orders: Order[]) => void) {
  const q = query(
    collectionGroup(db, 'orders'),
    where('customerId', '==', customerId),
    orderBy('createdAt', 'desc'),
    limit(n),
  );
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map(mapOrder)),
    (err) => {
      console.warn('subscribeCustomerOrders error', err);
      cb([]);
    },
  );
}

function orderRef(o: Order) {
  return doc(db, `supermarkets/${o.supermarketId}/orders/${o.id}`);
}

/**
 * Issue a (partial or total) refund. The actual money movement happens at the
 * PSP via a server endpoint (VITE_PAYMENTS_API_URL); here we record the
 * bookkeeping + audit so the panel reflects it immediately (RF07).
 */
export async function refundOrder(o: Order, amount: number, reason: string) {
  await updateDoc(orderRef(o), {
    'payment.status': 'refunded',
    'payment.refundedAmount': amount,
    'payment.refundedBy': actor()?.uid ?? null,
    'payment.refundedAt': serverTimestamp(),
    'payment.refundReason': reason,
    paymentStatus: 'refunded',
    updatedAt: serverTimestamp(),
  });
  await logAudit({
    action: 'order.refund',
    target: `Pedido #${o.id.slice(0, 6)} · ${o.storeName || o.supermarketId}`,
    targetType: 'order',
    targetId: o.id,
    before: { total: o.total, paymentStatus: o.paymentStatus || o.payment?.status },
    after: { refundedAmount: amount },
    note: reason,
  });
}

export async function flagOrder(o: Order, flagged: boolean) {
  await updateDoc(orderRef(o), { flagged, updatedAt: serverTimestamp() });
  await logAudit({
    action: 'order.flag',
    target: `Pedido #${o.id.slice(0, 6)}`,
    targetType: 'order',
    targetId: o.id,
    after: { flagged },
  });
}
