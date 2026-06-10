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
import { useAuthStore } from '../store/useAuthStore';
import type { Supermarket, StoreUser, StoreApprovalStatus, StoreFees } from './types';

function actor() {
  return useAuthStore.getState().admin;
}

export function subscribeStores(cb: (stores: Supermarket[]) => void) {
  return onSnapshot(
    query(collection(db, 'supermarkets')),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Supermarket))),
    (err) => {
      console.warn('subscribeStores error', err);
      cb([]);
    },
  );
}

export function subscribeStoreUsers(cb: (users: StoreUser[]) => void) {
  return onSnapshot(
    query(collection(db, 'users')),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as StoreUser))),
    () => cb([]),
  );
}

export function storeApprovalOf(s: Supermarket): StoreApprovalStatus {
  if (s.approvalStatus) return s.approvalStatus;
  // Stores created by the loja app are implicitly live; treat as approved.
  return s.active === false ? 'suspended' : 'approved';
}

export async function setStoreApproval(s: Supermarket, status: StoreApprovalStatus, reason?: string) {
  await updateDoc(doc(db, 'supermarkets', s.id), {
    approvalStatus: status,
    active: status === 'approved',
    reviewedBy: actor()?.uid ?? null,
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const action =
    status === 'approved' ? 'store.approve' : status === 'suspended' ? 'store.suspend' : 'store.reject';
  await logAudit({
    action,
    target: `Loja ${s.name}`,
    targetType: 'store',
    targetId: s.id,
    before: { approvalStatus: storeApprovalOf(s) },
    after: { approvalStatus: status },
    note: reason,
  });
}

export async function setStoreFees(s: Supermarket, fees: StoreFees) {
  await updateDoc(doc(db, 'supermarkets', s.id), {
    fees,
    updatedAt: serverTimestamp(),
  });
  await logAudit({
    action: 'store.fees.update',
    target: `Loja ${s.name}`,
    targetType: 'store',
    targetId: s.id,
    before: s.fees || null,
    after: fees,
  });
}
