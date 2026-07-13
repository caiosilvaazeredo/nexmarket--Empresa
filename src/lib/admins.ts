import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from './firebase';
import type { AdminProfile, AdminInvite, AdminRole } from './types';

/**
 * The root super-admin email is also baked into firestore.rules and into the
 * shared auth backend (server/index.js — /api/auth/register). Kept here only
 * for display purposes; actual bootstrap (root → master, invite → role)
 * happens server-side at registration time, not in the client anymore.
 */
export const ROOT_ADMIN_EMAIL = (
  import.meta.env.VITE_ROOT_ADMIN_EMAIL || 'caiosazeredo@cos.ufrj.br'
).toLowerCase();

export function isRootEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase() === ROOT_ADMIN_EMAIL;
}

export function adminRef(uid: string) {
  return doc(db, 'admins', uid);
}

export async function getAdmin(uid: string): Promise<AdminProfile | null> {
  const snap = await getDoc(adminRef(uid));
  return snap.exists() ? ({ uid, ...(snap.data() as any) } as AdminProfile) : null;
}

/**
 * Resolve whether the signed-in user may use the panel. The admin profile
 * (admins/{uid}) is created by the shared auth backend during registration —
 * this only READS it and bumps lastLoginAt; it no longer bootstraps/writes
 * new admin docs client-side (that would require request.auth.token.email,
 * which Custom Token sessions don't carry).
 */
export async function resolveAdminAccess(user: User): Promise<AdminProfile | null> {
  const existing = await getAdmin(user.uid);
  if (existing && existing.active) {
    updateDoc(adminRef(user.uid), { lastLoginAt: serverTimestamp() }).catch(() => {});
    return existing;
  }
  return null; // no doc yet, or deactivated
}

export function subscribeAdmins(cb: (admins: AdminProfile[]) => void) {
  return onSnapshot(
    query(collection(db, 'admins')),
    (snap) => cb(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as any) } as AdminProfile))),
    (err) => {
      console.warn('subscribeAdmins error', err);
      cb([]);
    },
  );
}

export function subscribeInvites(cb: (invites: AdminInvite[]) => void) {
  return onSnapshot(
    query(collection(db, 'adminInvites')),
    (snap) => cb(snap.docs.map((d) => ({ email: d.id, ...(d.data() as any) } as AdminInvite))),
    () => cb([]),
  );
}

export async function inviteAdmin(email: string, role: AdminRole, invitedBy: string) {
  const key = email.trim().toLowerCase();
  await setDoc(doc(db, 'adminInvites', key), {
    email: key,
    role,
    invitedBy,
    createdAt: serverTimestamp(),
  });
}

export async function revokeInvite(email: string) {
  await deleteDoc(doc(db, 'adminInvites', email.trim().toLowerCase()));
}

export async function updateAdminRole(uid: string, role: AdminRole) {
  await updateDoc(adminRef(uid), { role, updatedAt: serverTimestamp() });
}

export async function setAdminActive(uid: string, active: boolean) {
  await updateDoc(adminRef(uid), { active, updatedAt: serverTimestamp() });
}
