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
 * The root super-admin email bootstraps the very first operator. It is also
 * baked into firestore.rules so the panel works on a brand-new project without
 * any manual console step. Keep both in sync.
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
 * Resolve whether the signed-in Firebase user may use the panel, creating the
 * admin profile when bootstrapping (root email) or accepting an invite.
 * Returns the AdminProfile when access is granted, or null otherwise.
 */
export async function resolveAdminAccess(user: User): Promise<AdminProfile | null> {
  const email = (user.email || '').toLowerCase();

  // 1) Existing, active admin.
  const existing = await getAdmin(user.uid);
  if (existing && existing.active) {
    updateDoc(adminRef(user.uid), { lastLoginAt: serverTimestamp() }).catch(() => {});
    return existing;
  }
  if (existing && !existing.active) return null; // deactivated

  // 2) Root bootstrap → master.
  if (isRootEmail(email)) {
    const profile: AdminProfile = {
      uid: user.uid,
      name: user.displayName || 'Administrador',
      email,
      role: 'master',
      active: true,
      photoUrl: user.photoURL || '',
    };
    await setDoc(
      adminRef(user.uid),
      {
        name: profile.name,
        email: profile.email,
        role: 'master',
        active: true,
        photoUrl: profile.photoUrl || '',
        createdBy: 'root',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      },
      { merge: true },
    );
    return profile;
  }

  // 3) Pending invite for this email → create profile from invite.
  if (email) {
    const inviteSnap = await getDoc(doc(db, 'adminInvites', email));
    if (inviteSnap.exists()) {
      const invite = inviteSnap.data() as AdminInvite;
      const role: AdminRole = invite.role || 'viewer';
      await setDoc(adminRef(user.uid), {
        name: user.displayName || email.split('@')[0],
        email,
        role,
        active: true,
        photoUrl: user.photoURL || '',
        createdBy: invite.invitedBy || 'invite',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      });
      // Consume the invite (best-effort).
      deleteDoc(doc(db, 'adminInvites', email)).catch(() => {});
      return { uid: user.uid, name: user.displayName || email, email, role, active: true };
    }
  }

  return null;
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
