/**
 * Testes do servidor de pagamentos.
 *
 * Rodam **sem chave da Stripe**: verificam que o servidor sobe, que as rotas
 * de pagamento falham de forma segura (501 em vez de cobrar errado) e que as
 * validações de entrada funcionam. Os testes que exigem a API real da Stripe
 * ficam em `stripe.test.js` e são pulados quando não há chave.
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
let server;

before(async () => {
  server = spawn('node', ['index.js'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, PORT: String(PORT), STRIPE_SECRET_KEY: '', FIREBASE_SERVICE_ACCOUNT: '' },
    stdio: 'ignore',
  });
  // Espera o servidor responder.
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`${BASE}/health`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('servidor não subiu');
});

after(() => server?.kill());

describe('Saúde e configuração', () => {
  test('/health responde o estado real das integrações', async () => {
    const res = await fetch(`${BASE}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.service, 'nexmarket-payments');
    assert.equal(body.currency, 'brl');
    // Sem chave configurada neste teste.
    assert.equal(body.stripe, false);
  });

  test('/config expõe a chave publicável e nunca a secreta', async () => {
    const res = await fetch(`${BASE}/config`);
    const body = await res.json();
    assert.equal(body.provider, 'stripe');
    assert.equal(body.paymentsEnabled, false);
    assert.ok(!('secretKey' in body));
    assert.ok(!JSON.stringify(body).includes('sk_'));
  });
});

describe('Falha segura sem Stripe configurada', () => {
  const paymentRoutes = [
    ['POST', '/api/payments/checkout-session'],
    ['POST', '/api/payments/payment-intent'],
    ['POST', '/api/payments/pix-intent'],
    ['POST', '/api/payments/refund'],
    ['GET', '/api/payments/saved-methods'],
    ['POST', '/api/connect/account-link'],
    ['GET', '/api/connect/status'],
    ['POST', '/api/connect/payout'],
  ];

  for (const [method, path] of paymentRoutes) {
    test(`${method} ${path} responde 501 em vez de tentar cobrar`, async () => {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: method === 'POST' ? JSON.stringify({}) : undefined,
      });
      assert.equal(res.status, 501);
      const body = await res.json();
      assert.equal(body.paymentsUnavailable, true);
    });
  }

  test('webhook sem Stripe responde 501 e não quebra', async () => {
    const res = await fetch(`${BASE}/api/webhooks/stripe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'payment_intent.succeeded' }),
    });
    assert.equal(res.status, 501);
  });
});

describe('Páginas de retorno do Checkout', () => {
  test('sucesso e cancelamento renderizam HTML', async () => {
    for (const path of ['/return/success', '/return/cancel']) {
      const res = await fetch(`${BASE}${path}`);
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type') || '', /html/);
    }
  });

  test('deep link malicioso não vira redirect (open redirect)', async () => {
    const res = await fetch(
      `${BASE}/return/success?next=${encodeURIComponent('javascript:alert(1)')}`,
    );
    const html = await res.text();
    assert.ok(!html.includes('javascript:alert'));
  });

  test('deep link válido do app é aceito', async () => {
    const res = await fetch(`${BASE}/return/success?next=${encodeURIComponent('nexmarket://order/1')}`);
    const html = await res.text();
    assert.ok(html.includes('nexmarket://order/1'));
  });
});

describe('Identidade e recuperação de senha', () => {
  test('claim exige autenticação', async () => {
    const res = await fetch(`${BASE}/api/identity/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'cliente' }),
    });
    assert.equal(res.status, 401);
  });

  test('forgot-password responde igual para e-mail com ou sem conta', async () => {
    const call = (email) =>
      fetch(`${BASE}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, app: 'cliente' }),
      }).then((r) => r.json());

    const a = await call('existe@x.com');
    const b = await call('nao-existe@x.com');
    // Mesma mensagem: nao revela quais e-mails estao cadastrados.
    assert.equal(a.message, b.message);
    assert.equal(a.ok, true);
  });

  test('forgot-password sem e-mail e recusado', async () => {
    const res = await fetch(`${BASE}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  });

  test('token invalido nao abre o formulario', async () => {
    const res = await fetch(`${BASE}/api/auth/reset-password?token=invalido`);
    assert.notEqual(res.status, 200);
  });

  test('pagina de redefinicao abre no navegador', async () => {
    const res = await fetch(`${BASE}/redefinir-senha?token=abc123`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /Criar nova senha/);
    assert.match(html, /abc123/);
  });

  test('token com script e sanitizado na pagina (sem XSS)', async () => {
    const res = await fetch(
      `${BASE}/redefinir-senha?token=${encodeURIComponent('"><script>alert(1)</script>')}`,
    );
    const html = await res.text();
    assert.ok(!html.includes('<script>alert(1)'));
  });
});

describe('Autenticação exigida', () => {
  test('rota protegida sem token não vaza dados', async () => {
    const res = await fetch(`${BASE}/api/auth/admin-reset-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'x@y.com' }),
    });
    // 401 (sem token) ou 500 (sem service account) — nunca 200.
    assert.notEqual(res.status, 200);
  });
});
