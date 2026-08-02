/**
 * Identidade unificada e recuperação de senha.
 *
 * Roda sem Firebase real: um Firestore/Auth falsos em memória exercitam as
 * regras que impedem o mesmo e-mail de virar contas paralelas.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/* ----------------------------- Fakes mínimos ------------------------------ */

class FakeDoc {
  constructor(store, path) {
    this.store = store;
    this.path = path;
  }
  async get() {
    const data = this.store.get(this.path);
    return { exists: !!data, id: this.path.split('/').pop(), data: () => data };
  }
  async set(value, options) {
    const prev = options?.merge ? this.store.get(this.path) || {} : {};
    const merged = { ...prev };
    for (const [k, v] of Object.entries(value)) {
      merged[k] = v?.__arrayUnion
        ? [...new Set([...(prev[k] || []), ...v.__arrayUnion])]
        : v;
    }
    this.store.set(this.path, merged);
  }
}

class FakeCollection {
  constructor(store, name) {
    this.store = store;
    this.name = name;
    this.filters = [];
  }
  where(field, _op, value) {
    this.filters.push([field, value]);
    return this;
  }
  limit() {
    return this;
  }
  async get() {
    const docs = [...this.store.entries()]
      .filter(([path]) => path.startsWith(`${this.name}/`))
      .map(([path, data]) => ({ id: path.split('/').pop(), data: () => data }))
      .filter((d) => this.filters.every(([f, v]) => d.data()[f] === v));
    return { empty: docs.length === 0, docs };
  }
}

const store = new Map();
const authUsers = new Map(); // email -> { uid, password }

const fakeDb = {
  doc: (path) => new FakeDoc(store, path),
  collection: (name) => new FakeCollection(store, name),
};

const fakeAuth = {
  async getUserByEmail(email) {
    const user = authUsers.get(email);
    if (!user) throw Object.assign(new Error('not found'), { code: 'auth/user-not-found' });
    return user;
  },
  async createUser({ email, password, displayName }) {
    const uid = `uid_${authUsers.size + 1}`;
    const user = { uid, email, password, displayName };
    authUsers.set(email, user);
    return user;
  },
  async updateUser(uid, patch) {
    for (const [email, u] of authUsers) {
      if (u.uid === uid) authUsers.set(email, { ...u, ...patch });
    }
  },
};

// Injeta os fakes antes de importar o módulo sob teste.
const firebaseModule = await import('../lib/firebase.js').catch(() => null);
const identity = await import('../lib/identity.js');

// `lib/firebase.js` exporta null sem service account; sobrescrevemos aqui.
const FieldValue = { serverTimestamp: () => 'ts', arrayUnion: (...v) => ({ __arrayUnion: v }) };
identity.__setTestDeps?.({ db: fakeDb, adminAuth: fakeAuth, FieldValue });

const usable = typeof identity.__setTestDeps === 'function';
const skip = usable ? false : 'lib/identity.js sem hook de teste';

describe('Identidade unificada', { skip }, () => {
  beforeEach(() => {
    store.clear();
    authUsers.clear();
  });

  test('mesmo e-mail em dois apps reaproveita o MESMO uid', async () => {
    const a = await identity.registerRole({
      email: 'Joao@Exemplo.com',
      password: 'senha123',
      role: 'entregador',
    });
    const b = await identity.registerRole({ email: 'joao@exemplo.com', role: 'loja' });

    assert.equal(a.uid, b.uid, 'uid precisa ser o mesmo nos dois apps');
    assert.equal(b.accumulated, true);
    assert.deepEqual(b.roles, { entregador: true, loja: true });
  });

  test('e-mail é normalizado (maiúsculas e espaços)', async () => {
    await identity.registerRole({
      email: '  MARIA@Exemplo.com ',
      password: 'senha123',
      role: 'cliente',
    });
    const found = await identity.findIdentity('maria@exemplo.com');
    assert.ok(found, 'deveria achar pelo e-mail normalizado');
    assert.equal(found.email, 'maria@exemplo.com');
  });

  test('cadastrar duas vezes no MESMO app é recusado', async () => {
    await identity.registerRole({ email: 'a@x.com', password: 'senha123', role: 'loja' });
    await assert.rejects(
      () => identity.registerRole({ email: 'a@x.com', password: 'outra123', role: 'loja' }),
      (e) => {
        assert.equal(e.statusCode, 409);
        assert.match(e.message, /já tem conta/i);
        return true;
      },
    );
  });

  test('acumular papel não troca a senha de quem já tinha conta', async () => {
    await identity.registerRole({ email: 'b@x.com', password: 'senhaOriginal', role: 'cliente' });
    const before = (await identity.findIdentity('b@x.com')).passwordHash;
    await identity.registerRole({ email: 'b@x.com', password: 'tentativa', role: 'entregador' });
    const after = (await identity.findIdentity('b@x.com')).passwordHash;
    assert.equal(before, after);
  });

  test('login em app sem o papel é bloqueado com mensagem clara', async () => {
    await identity.registerRole({ email: 'c@x.com', password: 'senha123', role: 'entregador' });
    const found = await identity.findIdentity('c@x.com');

    assert.doesNotThrow(() => identity.assertRole(found, 'entregador'));
    assert.throws(
      () => identity.assertRole(found, 'empresa'),
      (e) => {
        assert.equal(e.statusCode, 403);
        assert.match(e.message, /não tem acesso ao app de Empresa/i);
        return true;
      },
    );
  });

  test('conta desativada não entra em app nenhum', async () => {
    await identity.registerRole({ email: 'd@x.com', password: 'senha123', role: 'loja' });
    await identity.identityRef('d@x.com').set({ active: false }, { merge: true });
    const found = await identity.findIdentity('d@x.com');
    assert.throws(() => identity.assertRole(found, 'loja'), (e) => e.statusCode === 403);
  });

  test('senha nova vale para todos os apps (bcrypt + Firebase Auth)', async () => {
    await identity.registerRole({ email: 'e@x.com', password: 'antiga123', role: 'cliente' });
    const before = await identity.findIdentity('e@x.com');
    assert.equal(await identity.verifyPassword(before, 'antiga123'), true);

    await identity.setIdentityPassword({ email: 'e@x.com', newPassword: 'nova12345' });

    const after = await identity.findIdentity('e@x.com');
    assert.equal(await identity.verifyPassword(after, 'nova12345'), true);
    assert.equal(await identity.verifyPassword(after, 'antiga123'), false);
    // Espelhada no Firebase Auth, que é o login do app do cliente.
    assert.equal(authUsers.get('e@x.com').password, 'nova12345');
  });

  test('senha curta é recusada', async () => {
    await assert.rejects(
      () => identity.registerRole({ email: 'f@x.com', password: '123', role: 'loja' }),
      (e) => e.statusCode === 400,
    );
  });

  test('claim de quem nasceu no Firebase Auth cria a identidade', async () => {
    const result = await identity.claimIdentity({
      uid: 'uid_firebase_1',
      email: 'g@x.com',
      role: 'cliente',
    });
    assert.deepEqual(result.roles, { cliente: true });

    // Depois vira entregador: mesmo uid, papéis somados.
    const second = await identity.claimIdentity({
      uid: 'uid_firebase_1',
      email: 'g@x.com',
      role: 'entregador',
    });
    assert.deepEqual(second.roles, { cliente: true, entregador: true });
  });

  test('claim com uid diferente para o mesmo e-mail é bloqueado', async () => {
    await identity.claimIdentity({ uid: 'uid_1', email: 'h@x.com', role: 'cliente' });
    await assert.rejects(
      () => identity.claimIdentity({ uid: 'uid_OUTRO', email: 'h@x.com', role: 'entregador' }),
      (e) => {
        assert.equal(e.statusCode, 409);
        return true;
      },
    );
  });

  test('conta antiga em staffCredentials é migrada no login', async () => {
    store.set('staffCredentials/loja/accounts/legado@x.com', {
      uid: 'uid_legado',
      passwordHash: '$2a$12$hashfake',
      active: true,
    });

    const migrated = await identity.migrateLegacyCredential({
      app: 'loja',
      email: 'legado@x.com',
    });

    assert.ok(migrated);
    assert.equal(migrated.roles.loja, true);
    assert.equal(migrated.passwordHash, '$2a$12$hashfake');
    assert.ok(migrated.legacyUids.includes('uid_legado'));
  });

  test('papel inválido é recusado', async () => {
    await assert.rejects(
      () => identity.registerRole({ email: 'i@x.com', password: 'senha123', role: 'hacker' }),
      (e) => e.statusCode === 400,
    );
  });
});

/* ------------------------------- Mailer ---------------------------------- */

const mailer = await import('../lib/mailer.js');

describe('Templates de e-mail', () => {
  test('boas-vindas muda conforme o app', () => {
    const driver = mailer.welcomeEmail({ name: 'João Silva', app: 'entregador' });
    assert.match(driver.subject, /Entregador/);
    assert.match(driver.html, /João/);
    assert.match(driver.html, /documentos/i);

    const customer = mailer.welcomeEmail({ name: 'Maria', app: 'cliente' });
    assert.match(customer.html, /mercado/i);
  });

  test('e-mail de reset traz o link e o prazo', () => {
    const mail = mailer.passwordResetEmail({
      name: 'João',
      resetUrl: 'https://x.com/redefinir-senha?token=abc',
      minutes: 60,
    });
    assert.match(mail.html, /https:\/\/x\.com\/redefinir-senha\?token=abc/);
    assert.match(mail.html, /60 minutos/);
    assert.match(mail.text, /token=abc/);
  });

  test('URL de redefinição carrega token e app', () => {
    const url = mailer.buildResetUrl('tok123', 'loja');
    assert.match(url, /token=tok123/);
    assert.match(url, /app=loja/);
  });
});
