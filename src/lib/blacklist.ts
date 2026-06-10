import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { logAudit } from './audit';
import { useAuthStore } from '../store/useAuthStore';
import { onlyDigits } from './format';
import type { BlacklistEntry } from './types';

export function subscribeBlacklist(cb: (entries: BlacklistEntry[]) => void) {
  return onSnapshot(
    query(collection(db, 'blacklist')),
    (snap) => cb(snap.docs.map((d) => ({ cpf: d.id, ...(d.data() as any) } as BlacklistEntry))),
    () => cb([]),
  );
}

export async function addToBlacklist(
  cpf: string,
  data: { name?: string; reason?: string; scope?: BlacklistEntry['scope'] },
) {
  const key = onlyDigits(cpf);
  if (!key) throw new Error('CPF inválido');
  await setDoc(doc(db, 'blacklist', key), {
    cpf: key,
    name: data.name ?? null,
    reason: data.reason ?? null,
    scope: data.scope ?? 'all',
    addedBy: useAuthStore.getState().admin?.uid ?? null,
    createdAt: serverTimestamp(),
  });
  await logAudit({
    action: 'blacklist.add',
    target: data.name ? `${data.name} · ${key}` : key,
    targetType: 'customer',
    targetId: key,
    note: data.reason,
  });
}

export async function removeFromBlacklist(cpf: string) {
  const key = onlyDigits(cpf);
  await deleteDoc(doc(db, 'blacklist', key));
  await logAudit({ action: 'blacklist.remove', target: key, targetType: 'customer', targetId: key });
}
