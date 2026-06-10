import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { logAudit } from './audit';
import { useAuthStore } from '../store/useAuthStore';
import type { Campaign } from './types';

export function subscribeCampaigns(cb: (c: Campaign[]) => void) {
  return onSnapshot(
    query(collection(db, 'campaigns'), orderBy('createdAt', 'desc')),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Campaign))),
    () => cb([]),
  );
}

export async function createCampaign(c: Omit<Campaign, 'id'>) {
  const ref = await addDoc(collection(db, 'campaigns'), {
    ...c,
    code: c.code.toUpperCase(),
    usedCount: 0,
    createdBy: useAuthStore.getState().admin?.uid ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await logAudit({
    action: 'campaign.create',
    target: `Campanha ${c.code}`,
    targetType: 'campaign',
    targetId: ref.id,
    after: { code: c.code, payer: c.payer, value: c.value },
  });
  return ref.id;
}

export async function updateCampaign(id: string, patch: Partial<Campaign>) {
  await updateDoc(doc(db, 'campaigns', id), { ...patch, updatedAt: serverTimestamp() });
  await logAudit({ action: 'campaign.update', target: `Campanha ${id.slice(0, 6)}`, targetType: 'campaign', targetId: id, after: patch });
}

export async function deleteCampaign(id: string) {
  await deleteDoc(doc(db, 'campaigns', id));
  await logAudit({ action: 'campaign.update', target: `Campanha removida ${id.slice(0, 6)}`, targetType: 'campaign', targetId: id });
}
