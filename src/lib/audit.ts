import { addDoc, collection, onSnapshot, orderBy, query, limit, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { useAuthStore } from '../store/useAuthStore';
import type { AuditAction, AuditLog } from './types';

/**
 * Append an immutable audit-trail entry (RNF02). Every destructive/resolutive
 * action (refund, ban, fee change, payout…) must be logged with who/when/what
 * and the before/after values. Logs are append-only in firestore.rules.
 */
export async function logAudit(entry: {
  action: AuditAction;
  target?: string;
  targetType?: string;
  targetId?: string;
  before?: any;
  after?: any;
  note?: string;
}): Promise<void> {
  const admin = useAuthStore.getState().admin;
  try {
    await addDoc(collection(db, 'auditLogs'), {
      action: entry.action,
      actorId: admin?.uid || 'unknown',
      actorName: admin?.name || admin?.email || 'unknown',
      actorRole: admin?.role || null,
      target: entry.target ?? null,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      note: entry.note ?? null,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    // Never let an audit write failure break the primary action.
    console.warn('audit log failed', e);
  }
}

export function subscribeAuditLogs(n: number, cb: (logs: AuditLog[]) => void) {
  return onSnapshot(
    query(collection(db, 'auditLogs'), orderBy('createdAt', 'desc'), limit(n)),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as AuditLog))),
    (err) => {
      console.warn('subscribeAuditLogs error', err);
      cb([]);
    },
  );
}
