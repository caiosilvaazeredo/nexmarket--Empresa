/**
 * Recuperação de senha por e-mail (todos os apps).
 *
 * O token é aleatório e só o **hash** dele é guardado em
 * `passwordResets/{tokenHash}` — vazar o banco não permite redefinir senha de
 * ninguém. O token expira em 60 minutos, vale uma única vez, e a resposta da
 * rota é sempre a mesma exista ou não a conta (para não revelar quais e-mails
 * estão cadastrados).
 */
import { createHash, randomBytes } from 'node:crypto';
import { db, FieldValue } from './firebase.js';
import { findIdentity, normEmail, setIdentityPassword } from './identity.js';
import {
  buildResetUrl,
  passwordChangedEmail,
  passwordResetEmail,
  sendMail,
} from './mailer.js';

export const RESET_TTL_MINUTES = 60;

const hashToken = (token) => createHash('sha256').update(token).digest('hex');

function fail(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

const resetRef = (token) => {
  if (!db) throw fail('Servidor sem acesso ao Firestore.', 500);
  return db.doc(`passwordResets/${hashToken(token)}`);
};

/**
 * Cria o token e dispara o e-mail. Devolve sempre `{ ok: true }` — o chamador
 * responde igual para e-mail existente ou não.
 */
export async function requestPasswordReset({ email, app }) {
  const mail = normEmail(email);
  const identity = await findIdentity(mail).catch(() => null);

  if (!identity) {
    // Conta inexistente: nada a fazer, mas a resposta é idêntica.
    console.info(`[reset] pedido para e-mail sem conta: ${mail}`);
    return { ok: true, sent: false };
  }

  const token = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + RESET_TTL_MINUTES * 60 * 1000;

  await resetRef(token).set({
    email: mail,
    uid: identity.uid,
    app: app || null,
    expiresAt,
    usedAt: null,
    createdAt: FieldValue.serverTimestamp(),
  });

  const { subject, html, text } = passwordResetEmail({
    name: identity.displayName || identity.name,
    resetUrl: buildResetUrl(token, app),
    minutes: RESET_TTL_MINUTES,
  });
  const result = await sendMail({ to: mail, subject, html, text });

  return { ok: true, sent: result.sent, skipped: result.skipped };
}

/** Valida o token sem consumir — usado pela página ao abrir o link. */
export async function checkResetToken(token) {
  if (!token) throw fail('Token ausente.', 400);
  const snap = await resetRef(token).get();
  if (!snap.exists) throw fail('Link inválido ou já utilizado.', 400);
  const data = snap.data();
  if (data.usedAt) throw fail('Este link já foi utilizado.', 400);
  if (Date.now() > data.expiresAt) throw fail('Link expirado. Peça um novo.', 400);
  return { email: data.email, app: data.app || null };
}

/** Troca a senha e invalida o token. */
export async function confirmPasswordReset({ token, newPassword }) {
  const { email, app } = await checkResetToken(token);
  if (!newPassword || newPassword.length < 6) {
    throw fail('A nova senha deve ter ao menos 6 caracteres.', 400);
  }

  const identity = await setIdentityPassword({ email, newPassword });
  await resetRef(token).set({ usedAt: FieldValue.serverTimestamp() }, { merge: true });

  const { subject, html, text } = passwordChangedEmail({
    name: identity.displayName || identity.name,
  });
  await sendMail({ to: email, subject, html, text });

  return { ok: true, email, app };
}
