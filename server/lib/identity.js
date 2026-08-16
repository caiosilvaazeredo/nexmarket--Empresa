/**
 * Identidade unificada da plataforma
 * ==================================
 *
 * Antes, cada app criava sua própria conta: o cliente e o entregador nasciam
 * no Firebase Auth, enquanto loja e empresa geravam `randomUUID()` em
 * `staffCredentials/{app}/accounts/{email}`. O mesmo e-mail virava até quatro
 * contas com uids diferentes — pedidos, entregas e permissões de uma pessoa
 * ficavam espalhados.
 *
 * Agora existe **uma identidade por e-mail**, guardada em
 * `identities/{emailLower}`:
 *
 *   { uid, email, roles: { cliente, loja, entregador, empresa },
 *     passwordHash, active, createdAt, updatedAt }
 *
 * O `uid` é sempre o do **Firebase Auth** — a mesma pessoa tem o mesmo uid em
 * todos os apps, e os papéis se acumulam (quem é cliente pode virar
 * entregador sem trocar de e-mail). A senha é única: gravada aqui em bcrypt
 * (usada pelo login de loja/empresa/entregador) e espelhada no Firebase Auth
 * (usada pelo app do cliente), então trocar a senha vale para tudo.
 */
import bcrypt from 'bcryptjs';
import * as firebase from './firebase.js';

/* Dependências resolvidas em tempo de chamada para que os testes possam
 * injetar um Firestore/Auth em memória (`__setTestDeps`). */
let deps = {
  get db() {
    return firebase.db;
  },
  get adminAuth() {
    return firebase.adminAuth;
  },
  get FieldValue() {
    return firebase.FieldValue;
  },
};

const db = () => deps.db;
const adminAuth = () => deps.adminAuth;
const FieldValue = () => deps.FieldValue;

/** Apenas para testes: substitui Firestore/Auth por fakes em memória. */
export function __setTestDeps(fakes) {
  deps = fakes;
}

export const ROLES = ['cliente', 'loja', 'entregador', 'empresa'];

export const ROLE_LABELS = {
  cliente: 'Cliente',
  loja: 'Loja',
  entregador: 'Entregador',
  empresa: 'Empresa',
};

export const normEmail = (email) => String(email || '').trim().toLowerCase();

function fail(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function requireDb() {
  if (!db()) throw fail('Servidor sem acesso ao Firestore (FIREBASE_SERVICE_ACCOUNT ausente).', 500);
  return db();
}

export const identityRef = (email) => requireDb().doc(`identities/${normEmail(email)}`);

export async function findIdentity(email) {
  const snap = await identityRef(email).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

/** Identidade a partir do uid (para o app perguntar "quem sou eu"). */
export async function findIdentityByUid(uid) {
  const q = await requireDb().collection('identities').where('uid', '==', uid).limit(1).get();
  return q.empty ? null : { id: q.docs[0].id, ...q.docs[0].data() };
}

/**
 * Resolve o uid canônico do e-mail: reusa o usuário do Firebase Auth quando
 * já existe (cliente ou entregador que se cadastraram pelo app) e cria um
 * novo caso contrário. É esta função que impede uids paralelos.
 */
export async function resolveUid(email, { password, displayName } = {}) {
  const mail = normEmail(email);
  try {
    const user = await adminAuth().getUserByEmail(mail);
    return { uid: user.uid, created: false };
  } catch (e) {
    if (e?.code !== 'auth/user-not-found') throw e;
  }
  const user = await adminAuth().createUser({
    email: mail,
    ...(password ? { password } : {}),
    ...(displayName ? { displayName } : {}),
  });
  return { uid: user.uid, created: true };
}

/**
 * Registra (ou acumula) um papel para o e-mail.
 *
 * - E-mail novo: cria a identidade, o usuário no Firebase Auth e grava a senha.
 * - E-mail conhecido **sem** o papel: acumula o papel reaproveitando o uid; a
 *   senha existente continua valendo (não sobrescrevemos a senha de quem já
 *   tem conta só porque abriu outro app).
 * - E-mail conhecido **com** o papel: erro 409 — é caso de login, não cadastro.
 */
export async function registerRole({ email, password, role, displayName }) {
  const mail = normEmail(email);
  if (!ROLES.includes(role)) throw fail('Papel inválido.', 400);
  if (!mail.includes('@')) throw fail('E-mail inválido.', 400);

  const existing = await findIdentity(mail);

  if (existing?.roles?.[role]) {
    throw fail(
      `Este e-mail já tem conta de ${ROLE_LABELS[role]}. Faça login em vez de criar outra.`,
      409,
    );
  }

  // Papel novo em identidade existente: senha não é exigida nem trocada.
  if (existing) {
    const { uid } = await resolveUid(mail, { displayName });
    await identityRef(mail).set(
      {
        uid,
        email: mail,
        roles: { ...(existing.roles || {}), [role]: true },
        updatedAt: FieldValue().serverTimestamp(),
      },
      { merge: true },
    );
    return { uid, created: false, accumulated: true, roles: { ...(existing.roles || {}), [role]: true } };
  }

  if (!password || password.length < 6) {
    throw fail('A senha deve ter ao menos 6 caracteres.', 400);
  }

  const { uid } = await resolveUid(mail, { password, displayName });
  // Usuário que já existia no Firebase Auth (ex.: cadastro pelo app cliente)
  // mantém a senha dele; só definimos quando acabamos de criar.
  const passwordHash = await bcrypt.hash(password, 12);

  await identityRef(mail).set({
    uid,
    email: mail,
    roles: { [role]: true },
    passwordHash,
    active: true,
    createdAt: FieldValue().serverTimestamp(),
    updatedAt: FieldValue().serverTimestamp(),
  });

  return { uid, created: true, accumulated: false, roles: { [role]: true } };
}

/**
 * Garante que um usuário criado direto no Firebase Auth (app do cliente)
 * tenha identidade e papel — chamado pelo app logo após o cadastro.
 */
export async function claimIdentity({ uid, email, role, displayName }) {
  const mail = normEmail(email);
  if (!ROLES.includes(role)) throw fail('Papel inválido.', 400);
  const existing = await findIdentity(mail);

  // Um e-mail não pode apontar para dois uids diferentes.
  if (existing && existing.uid !== uid) {
    throw fail('Este e-mail já pertence a outra conta na plataforma.', 409);
  }

  await identityRef(mail).set(
    {
      uid,
      email: mail,
      roles: { ...(existing?.roles || {}), [role]: true },
      active: existing?.active !== false,
      ...(existing ? {} : { createdAt: FieldValue().serverTimestamp() }),
      ...(displayName && !existing ? { displayName } : {}),
      updatedAt: FieldValue().serverTimestamp(),
    },
    { merge: true },
  );

  return { uid, roles: { ...(existing?.roles || {}), [role]: true } };
}

/** Confere se a identidade pode entrar no app pedido. */
export function assertRole(identity, role) {
  if (!identity) throw fail('E-mail ou senha incorretos.', 401);
  if (identity.active === false) throw fail('Conta desativada. Fale com o suporte.', 403);
  if (!identity.roles?.[role]) {
    throw fail(`Esta conta não tem acesso ao app de ${ROLE_LABELS[role]}.`, 403);
  }
}

/**
 * Define a senha da identidade em bcrypt **e** no Firebase Auth, para que
 * ela seja a mesma em todos os apps.
 */
export async function setIdentityPassword({ email, newPassword }) {
  const mail = normEmail(email);
  if (!newPassword || newPassword.length < 6) {
    throw fail('A nova senha deve ter ao menos 6 caracteres.', 400);
  }
  const identity = await findIdentity(mail);
  if (!identity) throw fail('Conta não encontrada.', 404);

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await identityRef(mail).set(
    { passwordHash, updatedAt: FieldValue().serverTimestamp() },
    { merge: true },
  );
  // Espelha no Firebase Auth (login do app do cliente).
  await adminAuth().updateUser(identity.uid, { password: newPassword }).catch((e) => {
    console.warn('[identity] não foi possível espelhar a senha no Firebase Auth:', e.message);
  });
  return identity;
}

export async function verifyPassword(identity, password) {
  if (!identity?.passwordHash) return false;
  return bcrypt.compare(String(password || ''), identity.passwordHash);
}

/**
 * Migração transparente: traz para a identidade unificada quem ainda está em
 * `staffCredentials/{app}/accounts/{email}`. Chamada no login, uma vez por
 * conta — quem já usava o sistema entra normalmente e sai migrado.
 */
export async function migrateLegacyCredential({ app: appName, email }) {
  const mail = normEmail(email);
  const legacyRef = requireDb().doc(`staffCredentials/${appName}/accounts/${mail}`);
  const legacy = await legacyRef.get();
  if (!legacy.exists) return null;

  const data = legacy.data();
  const existing = await findIdentity(mail);

  // Reaproveita o uid do Firebase Auth quando houver; senão mantém o legado
  // para não perder os dados já gravados em users/{uid} ou drivers/{uid}.
  let uid = existing?.uid || data.uid;
  try {
    const user = await adminAuth().getUserByEmail(mail);
    uid = existing?.uid || user.uid;
  } catch {
    /* sem usuário no Firebase Auth: segue com o uid legado */
  }

  await identityRef(mail).set(
    {
      uid,
      email: mail,
      roles: { ...(existing?.roles || {}), [appName]: true },
      passwordHash: existing?.passwordHash || data.passwordHash,
      active: data.active !== false,
      legacyUids: FieldValue().arrayUnion(data.uid),
      migratedAt: FieldValue().serverTimestamp(),
      updatedAt: FieldValue().serverTimestamp(),
      ...(existing ? {} : { createdAt: data.createdAt || FieldValue().serverTimestamp() }),
    },
    { merge: true },
  );

  return findIdentity(mail);
}
