import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

// SAME shared project + named Firestore database as loja / entregador / cliente.
export const app = initializeApp(firebaseConfig as any);
export const auth = getAuth(app);
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);
export const storage = getStorage(app, `gs://${(firebaseConfig as any).storageBucket}`);

export const googleProvider = new GoogleAuthProvider();

export const loginWithGoogle = async () => {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
};

export const loginWithEmail = async (email: string, pass: string) =>
  (await signInWithEmailAndPassword(auth, email, pass)).user;

export const registerWithEmail = async (email: string, pass: string) =>
  (await createUserWithEmailAndPassword(auth, email, pass)).user;

export const resetPassword = async (email: string) =>
  sendPasswordResetEmail(auth, email);

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Logout failed', error);
  }
};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
) {
  const info = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    auth: { uid: auth.currentUser?.uid, email: auth.currentUser?.email },
  };
  console.error('Firestore Error:', JSON.stringify(info));
}
