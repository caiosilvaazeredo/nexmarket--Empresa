/**
 * Autenticação compartilhada (Loja · Empresa · Entregador)
 * ==========================================================
 * Login/senha vivem 100% no Firestore — nunca nos provedores nativos do
 * Firebase (nem e-mail/senha nativo, nem Google). O Firebase Auth aqui é
 * usado SÓ como mecanismo de sessão: depois de validar a senha aqui, este
 * servidor emite um Firebase Custom Token, que os apps trocam por uma sessão
 * via signInWithCustomToken — assim `request.auth` continua populado nas
 * Firestore Security Rules, mas quem valida a senha somos nós, não o
 * Firebase.
 *
 * O app cliente final (nexmarket--cliente) NÃO usa este módulo — continua no
 * Firebase Authentication nativo.
 *
 * Coleção: staffCredentials/{app}/accounts/{emailLower}
 *   { uid, passwordHash, active, createdAt, updatedAt, lastLoginAt }
 * Protegida por padrão: não há nenhuma Firestore Security Rule que dê acesso
 * a esta coleção ao cliente — o `allow read, write: if false;` padrão do
 * firestore.rules cobre. Só este servidor (Admin SDK) enxerga as senhas.
 */
import { db, adminAuth, FieldValue } from './firebase.js';
import {
  assertRole,
  findIdentity,
  identityRef,
  migrateLegacyCredential,
  registerRole,
  setIdentityPassword,
  verifyPassword,
} from './identity.js';

export const VALID_APPS = ['empresa', 'loja', 'entregador'];

const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const attempts = new Map();

function checkRateLimit(key) {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || rec.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
    return true;
  }
  if (rec.count >= MAX_ATTEMPTS) return false;
  rec.count += 1;
  return true;
}
function resetRateLimit(key) {
  attempts.delete(key);
}

function fail(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function assertApp(appName) {
  if (!VALID_APPS.includes(appName)) throw fail('App inválido.', 400);
}

function normEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function requireDb() {
  if (!db) {
    throw fail(
      'Servidor sem acesso ao Firestore — defina FIREBASE_SERVICE_ACCOUNT em server/.env.',
      500,
    );
  }
  return db;
}

export function credentialRef(appName, email) {
  return requireDb().doc(`staffCredentials/${appName}/accounts/${normEmail(email)}`);
}

export async function findCredential(appName, email) {
  const snap = await credentialRef(appName, email).get();
  return snap.exists ? snap.data() : null;
}

/**
 * Login de loja/empresa/entregador contra a **identidade unificada**.
 *
 * Contas antigas em `staffCredentials/{app}/accounts/{email}` são migradas na
 * primeira entrada, sem o usuário perceber. O papel é verificado: um e-mail
 * de entregador não entra no painel da loja, mesmo com a senha certa.
 */
export async function login({ app: appName, email, password, ip }) {
  assertApp(appName);
  email = normEmail(email);
  if (!email || !password) throw fail('E-mail e senha são obrigatórios.', 400);

  const rlKey = `${ip || 'noip'}:${appName}:${email}`;
  if (!checkRateLimit(rlKey)) {
    throw fail('Muitas tentativas. Tente novamente em alguns minutos.', 429);
  }

  let identity = await findIdentity(email);
  if (!identity) identity = await migrateLegacyCredential({ app: appName, email });
  if (!identity) throw fail('Credenciais inválidas.', 401);

  const ok = await verifyPassword(identity, password);
  if (!ok) throw fail('Credenciais inválidas.', 401);

  // Senha correta, mas conta sem este papel: mensagem clara em vez de 401.
  assertRole(identity, appName);

  resetRateLimit(rlKey);
  await identityRef(email)
    .set({ lastLoginAt: FieldValue.serverTimestamp() }, { merge: true })
    .catch(() => {});

  const customToken = await adminAuth.createCustomToken(identity.uid, {
    app: appName,
    roles: identity.roles || {},
  });
  return { customToken, uid: identity.uid, roles: identity.roles || {} };
}

/**
 * Cadastro: cria (ou acumula) o papel na identidade unificada e devolve o uid
 * canônico — o mesmo que a pessoa já usa nos outros apps.
 */
export async function createCredential({ app: appName, email, password, displayName }) {
  assertApp(appName);
  return registerRole({ email, password, role: appName, displayName });
}

/** Redefine a senha — vale para todos os apps (identidade única). */
export async function setPassword({ app: appName, email, newPassword }) {
  if (appName) assertApp(appName);
  await setIdentityPassword({ email, newPassword });
}
