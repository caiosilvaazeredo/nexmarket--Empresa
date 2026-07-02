import {
  collection,
  collectionGroup,
  doc,
  addDoc,
  onSnapshot,
  query,
  updateDoc,
  orderBy,
  serverTimestamp,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from './firebase';
import { logAudit } from './audit';
import { useAuthStore } from './../store/useAuthStore';
import { toDate } from './format';
import type { Order, Settlement, SettlementStatus, Payout, PayoutStatus } from './types';

function actor() {
  return useAuthStore.getState().admin;
}

export const DEFAULT_COMMISSION_PCT = 12;
export const DEFAULT_FIXED_FEE = 0;

export type FeeResolver = (supermarketId: string) => { commissionPct: number; fixedFee: number };

export interface FinanceSummary {
  gmv: number;
  ordersCount: number;
  platformRevenue: number;
  storePayable: number;
  driverPayable: number;
  deliveryFees: number;
  refunds: number;
  avgTicket: number;
  byDay: { date: string; gmv: number; orders: number; revenue: number }[];
  byStatus: Record<string, number>;
  byPayment: Record<string, number>;
}

function isValidForGmv(o: Order): boolean {
  return o.status !== 'cancelled';
}

/** Aggregate platform finance from a set of orders (RF08). */
export function computeFinance(orders: Order[], feeFor: FeeResolver): FinanceSummary {
  let gmv = 0;
  let ordersCount = 0;
  let platformRevenue = 0;
  let storePayable = 0;
  let driverPayable = 0;
  let deliveryFees = 0;
  let refunds = 0;
  const byDayMap = new Map<string, { gmv: number; orders: number; revenue: number }>();
  const byStatus: Record<string, number> = {};
  const byPayment: Record<string, number> = {};

  for (const o of orders) {
    const status = o.status || 'pending';
    byStatus[status] = (byStatus[status] || 0) + 1;
    const pay = o.paymentStatus || o.payment?.status || 'pending';
    byPayment[pay] = (byPayment[pay] || 0) + 1;

    const refunded = o.payment?.refundedAmount || 0;
    if (refunded) refunds += refunded;

    if (!isValidForGmv(o)) continue;

    const total = o.total || 0;
    const subtotal = o.subtotal ?? Math.max(0, total - (o.deliveryFee || 0) - (o.tip || 0));
    const { commissionPct, fixedFee } = feeFor(o.supermarketId);
    const commission = (subtotal * commissionPct) / 100 + fixedFee;
    // Gorjeta é 100% do entregador — nunca entra na comissão da plataforma.
    const driverEarn = (o.driverEarnings || 0) + (o.tip || 0);

    gmv += total;
    ordersCount += 1;
    platformRevenue += commission;
    storePayable += Math.max(0, subtotal - commission);
    driverPayable += driverEarn;
    deliveryFees += o.deliveryFee || 0;

    const d = toDate(o.createdAt);
    const key = d ? d.toISOString().slice(0, 10) : 'sem-data';
    const cur = byDayMap.get(key) || { gmv: 0, orders: 0, revenue: 0 };
    cur.gmv += total;
    cur.orders += 1;
    cur.revenue += commission;
    byDayMap.set(key, cur);
  }

  const byDay = Array.from(byDayMap.entries())
    .filter(([k]) => k !== 'sem-data')
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, v]) => ({ date, ...v }));

  return {
    gmv,
    ordersCount,
    platformRevenue,
    storePayable,
    driverPayable,
    deliveryFees,
    refunds,
    avgTicket: ordersCount ? gmv / ordersCount : 0,
    byDay,
    byStatus,
    byPayment,
  };
}

/* ----------------------------- Settlements ----------------------------- */
export function subscribeSettlements(cb: (s: Settlement[]) => void) {
  return onSnapshot(
    query(collection(db, 'settlements'), orderBy('createdAt', 'desc')),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Settlement))),
    () => cb([]),
  );
}

export async function createSettlement(s: Omit<Settlement, 'id'>) {
  const ref = await addDoc(collection(db, 'settlements'), {
    ...s,
    processedBy: actor()?.uid ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await logAudit({
    action: 'settlement.create',
    target: `Repasse ${s.type} · ${s.partyName || s.partyId}`,
    targetType: 'payout',
    targetId: ref.id,
    after: { net: s.net, period: `${s.periodStart}–${s.periodEnd}` },
  });
  return ref.id;
}

export async function setSettlementStatus(s: Settlement, status: SettlementStatus) {
  await updateDoc(doc(db, 'settlements', s.id), {
    status,
    ...(status === 'paid' ? { paidAt: serverTimestamp() } : {}),
    processedBy: actor()?.uid ?? null,
    updatedAt: serverTimestamp(),
  });
  await logAudit({
    action: status === 'paid' ? 'settlement.pay' : 'settlement.create',
    target: `Repasse ${s.partyName || s.partyId}`,
    targetType: 'payout',
    targetId: s.id,
    before: { status: s.status },
    after: { status },
  });
}

/* ----------------------- Driver payout requests ----------------------- */
function mapPayout(d: QueryDocumentSnapshot): Payout {
  const driverId = d.ref.parent.parent?.id;
  return { id: d.id, driverId: driverId || '', ...(d.data() as any) } as Payout;
}

export function subscribeAllPayouts(cb: (p: Payout[]) => void) {
  return onSnapshot(
    query(collectionGroup(db, 'payouts'), orderBy('createdAt', 'desc')),
    (snap) => cb(snap.docs.map(mapPayout)),
    (err) => {
      console.warn('subscribeAllPayouts error', err);
      cb([]);
    },
  );
}

export async function setPayoutStatus(p: Payout, status: PayoutStatus, note?: string) {
  await updateDoc(doc(db, `drivers/${p.driverId}/payouts/${p.id}`), {
    status,
    note: note ?? null,
    processedBy: actor()?.uid ?? null,
    updatedAt: serverTimestamp(),
  });
  const action =
    status === 'paid'
      ? 'payout.approve'
      : status === 'on_hold'
      ? 'payout.hold'
      : status === 'rejected'
      ? 'payout.reject'
      : 'payout.approve';
  await logAudit({
    action,
    target: `Saque ${p.driverName || p.driverId} · R$ ${p.amount}`,
    targetType: 'payout',
    targetId: p.id,
    before: { status: p.status },
    after: { status },
    note,
  });
}
