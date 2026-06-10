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
import type { DriverProfile, DriverApprovalStatus, DocStatus } from './types';

function actor() {
  return useAuthStore.getState().admin;
}

export function subscribeDrivers(cb: (drivers: DriverProfile[]) => void) {
  return onSnapshot(
    query(collection(db, 'drivers')),
    (snap) => cb(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as any) } as DriverProfile))),
    (err) => {
      console.warn('subscribeDrivers error', err);
      cb([]);
    },
  );
}

/** Effective onboarding status: explicit approvalStatus, else derive from docs. */
export function driverApprovalOf(d: DriverProfile): DriverApprovalStatus {
  if (d.approvalStatus) return d.approvalStatus;
  const s = d.documents?.status;
  if (s === 'approved') return 'approved';
  if (s === 'rejected') return 'rejected';
  return 'pending';
}

export async function setDriverApproval(
  d: DriverProfile,
  status: DriverApprovalStatus,
  reason?: string,
) {
  const ref = doc(db, 'drivers', d.uid);
  const docStatus: DocStatus =
    status === 'approved' ? 'approved' : status === 'pending' ? 'pending' : 'rejected';
  await updateDoc(ref, {
    approvalStatus: status,
    blockedReason: reason ?? null,
    'documents.status': docStatus,
    ...(status === 'blocked' ? { status: 'offline' } : {}),
    reviewedBy: actor()?.uid ?? null,
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const action =
    status === 'approved'
      ? 'driver.approve'
      : status === 'blocked'
      ? 'driver.block'
      : 'driver.reject';
  await logAudit({
    action,
    target: `Entregador ${d.name || d.uid}`,
    targetType: 'driver',
    targetId: d.uid,
    before: { approvalStatus: driverApprovalOf(d) },
    after: { approvalStatus: status },
    note: reason,
  });
}

export type DriverDocKey = 'cnh' | 'vehicleDoc' | 'profilePhoto' | 'proofOfResidence';

export async function reviewDriverDoc(
  d: DriverProfile,
  key: DriverDocKey,
  status: DocStatus,
  rejectionReason?: string,
) {
  const ref = doc(db, 'drivers', d.uid);
  await updateDoc(ref, {
    [`documents.review.${key}`]: {
      status,
      rejectionReason: rejectionReason ?? null,
      reviewedBy: actor()?.uid ?? null,
      reviewedAt: serverTimestamp(),
    },
    updatedAt: serverTimestamp(),
  });
  await logAudit({
    action: status === 'approved' ? 'driver.doc.approve' : 'driver.doc.reject',
    target: `Doc ${key} · ${d.name || d.uid}`,
    targetType: 'driver',
    targetId: d.uid,
    after: { doc: key, status },
    note: rejectionReason,
  });
}

/** Simulate / trigger a background check (RNF05 integration seam). */
export async function runBackgroundCheck(d: DriverProfile) {
  const ref = doc(db, 'drivers', d.uid);
  // In production this would POST to VITE_BACKGROUND_CHECK_API_URL and the
  // provider's webhook would write the result. Here we stamp it as requested.
  await updateDoc(ref, {
    'documents.backgroundCheck': {
      status: 'pending',
      provider: 'manual',
      checkedAt: serverTimestamp(),
    },
    updatedAt: serverTimestamp(),
  });
}
