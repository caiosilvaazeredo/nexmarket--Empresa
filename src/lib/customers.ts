import {
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { logAudit } from './audit';
import type { CustomerProfile } from './types';

export function subscribeCustomers(cb: (customers: CustomerProfile[]) => void) {
  return onSnapshot(
    query(collection(db, 'customers')),
    (snap) => cb(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as any) } as CustomerProfile))),
    (err) => {
      console.warn('subscribeCustomers error', err);
      cb([]);
    },
  );
}

export async function setCustomerBlocked(c: CustomerProfile, blocked: boolean, reason?: string) {
  await updateDoc(doc(db, 'customers', c.uid), {
    blocked,
    blockedReason: reason ?? null,
    updatedAt: serverTimestamp(),
  });
  await logAudit({
    action: blocked ? 'blacklist.add' : 'blacklist.remove',
    target: `Cliente ${c.name || c.uid}`,
    targetType: 'customer',
    targetId: c.uid,
    after: { blocked },
    note: reason,
  });
}
