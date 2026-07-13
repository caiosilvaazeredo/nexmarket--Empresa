import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

// SAME shared project + named Firestore database as loja / entregador / cliente.
export const app = initializeApp(firebaseConfig as any);
export const auth = getAuth(app);
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);
export const storage = getStorage(app, `gs://${(firebaseConfig as any).storageBucket}`);

/* -------------------------- Auth helpers -------------------------- *
 * Login/senha NÃO usam os provedores nativos do Firebase (nem e-mail/senha
 * nativo, nem Google) — vivem no Firestore, validados pelo backend
 * compartilhado (pasta server/ deste repositório), que emite um Firebase
 * Custom Token. O Firebase Auth aqui só mantém a sessão (request.auth
 * continua populado para as Security Rules). */

const AUTH_API_URL = (import.meta.env.VITE_AUTH_API_URL || 'http://localhost:8787').replace(/\/$/, '');

async function requestCustomToken(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${AUTH_API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Falha na autenticação.');
  return data as { customToken: string; uid: string };
}

export const loginWithEmail = async (email: string, pass: string) => {
  const { customToken } = await requestCustomToken('/api/auth/login', {
    app: 'empresa',
    email,
    password: pass,
  });
  return (await signInWithCustomToken(auth, customToken)).user;
};

/** Só funciona para o e-mail root ou para um e-mail com convite pendente
 * (validado no servidor) — mantém o painel "acesso restrito". */
export const registerWithEmail = async (email: string, pass: string, name?: string) => {
  const { customToken } = await requestCustomToken('/api/auth/register', {
    app: 'empresa',
    email,
    password: pass,
    profile: { name },
  });
  return (await signInWithCustomToken(auth, customToken)).user;
};

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
