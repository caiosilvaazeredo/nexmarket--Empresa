/**
 * Firebase Admin bootstrap para o servidor de pagamentos.
 *
 * Dois níveis de funcionalidade, dependendo do que está configurado:
 *
 * 1. SEMPRE (só precisa do projectId): verificação dos ID tokens emitidos
 *    pelo Firebase Auth — é assim que sabemos QUEM chama a API (cliente,
 *    lojista, entregador ou operador do painel).
 *
 * 2. COM SERVICE ACCOUNT (FIREBASE_SERVICE_ACCOUNT): leitura/escrita no
 *    Firestore com privilégio de admin — valida o valor real do pedido antes
 *    de cobrar, marca pedidos como pagos via webhook e registra estornos.
 *    Sem ela o servidor continua funcionando; os apps assumem a escrita de
 *    status (as security rules permitem) e o valor vem do cliente.
 */
import fs from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0615772467';
const DATABASE_ID =
  process.env.FIRESTORE_DATABASE_ID || 'ai-studio-2ab80fc8-bdc4-40c4-9282-35669db98074';
const ROOT_ADMIN_EMAIL = (process.env.ROOT_ADMIN_EMAIL || 'caiosazeredo@cos.ufrj.br').toLowerCase();

function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    // Aceita tanto o JSON inline quanto um caminho para o arquivo .json.
    const text = raw.trim().startsWith('{') ? raw : fs.readFileSync(raw, 'utf8');
    return JSON.parse(text);
  } catch (e) {
    console.warn('[firebase] FIREBASE_SERVICE_ACCOUNT inválida — Firestore admin desativado:', e.message);
    return null;
  }
}

const serviceAccount = loadServiceAccount();

const app = serviceAccount
  ? initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id || PROJECT_ID })
  : initializeApp({ projectId: PROJECT_ID });

export const adminAuth = getAuth(app);

/** Firestore só é utilizável com service account; sem ela fica `null`. */
export const db = serviceAccount ? getFirestore(app, DATABASE_ID) : null;
export const firestoreEnabled = !!db;
export { FieldValue };

/* ------------------------------ Auth helpers ------------------------------ */

/**
 * Middleware: exige `Authorization: Bearer <Firebase ID token>` e anexa o
 * usuário decodificado em `req.user`.
 */
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token de autenticação ausente.' });
  try {
    req.user = await adminAuth.verifyIdToken(token);
    next();
  } catch (e) {
    res.status(401).json({ error: 'Token de autenticação inválido ou expirado.' });
  }
}

export function isRootAdmin(user) {
  return (user?.email || '').toLowerCase() === ROOT_ADMIN_EMAIL;
}

/** Operador do painel Empresa: root admin ou doc ativo em /admins/{uid}. */
export async function isAdminUser(user) {
  if (isRootAdmin(user)) return true;
  if (!db) return false; // sem Firestore admin só o root email é reconhecido
  try {
    const snap = await db.doc(`admins/${user.uid}`).get();
    return snap.exists && snap.data().active === true;
  } catch {
    return false;
  }
}

/** Dono da loja: supermarkets/{smId}.ownerId === uid. */
export async function isStoreOwner(user, smId) {
  if (!db || !smId) return false;
  try {
    const snap = await db.doc(`supermarkets/${smId}`).get();
    return snap.exists && snap.data().ownerId === user.uid;
  } catch {
    return false;
  }
}

/* ----------------------------- Order helpers ------------------------------ */

export function orderRef(smId, orderId) {
  if (!db) return null;
  return db.doc(`supermarkets/${smId}/orders/${orderId}`);
}

export async function getOrder(smId, orderId) {
  const ref = orderRef(smId, orderId);
  if (!ref) return null;
  const snap = await ref.get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

/** Marca o pedido como pago (idempotente) — chamado pelo webhook e pelo /status. */
export async function markOrderPaid({ smId, orderId, paymentIntentId, sessionId, method, provider, authorizationId }) {
  const ref = orderRef(smId, orderId);
  if (!ref) return false;
  await ref.set(
    {
      paymentStatus: 'paid',
      payment: {
        provider: provider || 'stripe',
        status: 'paid',
        ...(paymentIntentId ? { paymentIntentId } : {}),
        ...(sessionId ? { checkoutSessionId: sessionId } : {}),
        ...(authorizationId ? { authorizationId } : {}),
        ...(method ? { method } : {}),
        paidAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return true;
}

export async function markOrderPaymentFailed({ smId, orderId, paymentIntentId, reason }) {
  const ref = orderRef(smId, orderId);
  if (!ref) return false;
  await ref.set(
    {
      paymentStatus: 'failed',
      payment: {
        provider: 'stripe',
        status: 'failed',
        ...(paymentIntentId ? { paymentIntentId } : {}),
        ...(reason ? { failureReason: reason } : {}),
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return true;
}

export async function markOrderRefunded({ smId, orderId, amount, refundId, actorUid, reason }) {
  const ref = orderRef(smId, orderId);
  if (!ref) return false;
  await ref.set(
    {
      paymentStatus: 'refunded',
      payment: {
        provider: 'stripe',
        status: 'refunded',
        refundedAmount: amount,
        ...(refundId ? { refundId } : {}),
        ...(actorUid ? { refundedBy: actorUid } : {}),
        ...(reason ? { refundReason: reason } : {}),
        refundedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return true;
}
