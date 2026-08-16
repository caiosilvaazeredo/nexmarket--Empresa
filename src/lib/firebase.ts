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

/*
 * Endereço do servidor de autenticação.
 *
 * `VITE_AUTH_API_URL` é lida em tempo de BUILD e embutida no bundle — o que a
 * torna uma armadilha: se faltar no momento da compilação, ajustá-la depois
 * no painel não conserta nada, porque o valor errado já está dentro do
 * JavaScript publicado. Foi exatamente o que aconteceu, e o sintoma
 * (ERR_CONNECTION_REFUSED em localhost:8787) parece problema de rede,
 * mandando quem investiga para o lado errado.
 *
 * Por isso o padrão deixou de ser localhost em toda parte e passou a depender
 * de onde a página está rodando. Publicado sem a variável, o app ainda
 * funciona; em desenvolvimento, continua apontando para o servidor local. A
 * variável segue valendo como override — é ela quem manda quando o servidor
 * mudar de endereço.
 *
 * Não é segredo: é o endereço público que os quatro apps chamam.
 */
const FALLBACK_API_URL = 'https://nexmarket-payments-60k3.onrender.com';

function defaultApiUrl(): string {
  const host = typeof location !== 'undefined' ? location.hostname : '';
  const isLocal = ['localhost', '127.0.0.1', ''].includes(host);
  return isLocal ? 'http://localhost:8787' : FALLBACK_API_URL;
}

const AUTH_API_URL = (import.meta.env.VITE_AUTH_API_URL || defaultApiUrl()).replace(/\/$/, '');

if (!import.meta.env.VITE_AUTH_API_URL && !AUTH_API_URL.includes('localhost')) {
  console.warn(
    `[Nexmarket] VITE_AUTH_API_URL não foi definida no build; usando ${AUTH_API_URL}. ` +
      'Defina a variável no serviço nexmarket-empresa do Render se o servidor mudar de endereço.',
  );
}

/*
 * O servidor roda em hospedagem que hiberna após um período sem uso: a
 * primeira chamada do dia pode levar quase um minuto só para acordá-lo. Sem
 * teto, a tela fica em "Entrando..." indefinidamente e parece travada — a
 * pessoa recarrega, o que reinicia a espera do zero.
 *
 * 60s dá folga para o servidor acordar; passando disso, é falha de verdade e
 * a mensagem precisa dizer isso em vez de deixar o botão girando.
 */
const TIMEOUT_MS = 60_000;

async function requestCustomToken(path: string, body: Record<string, unknown>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${AUTH_API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err: any) {
    throw new Error(
      err?.name === 'AbortError'
        ? 'O servidor demorou para responder. Ele pode estar iniciando — tente de novo em um minuto.'
        : 'Não foi possível falar com o servidor. Verifique sua conexão.',
    );
  } finally {
    clearTimeout(timer);
  }

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
