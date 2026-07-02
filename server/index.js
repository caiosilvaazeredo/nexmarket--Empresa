/**
 * Nexmarket — Servidor de Pagamentos (Stripe)
 * ============================================
 * Único componente da plataforma que usa a CHAVE SECRETA da Stripe.
 * Atende os quatro apps (cliente, loja, entregador e painel Empresa):
 *
 *   • POST /api/payments/checkout-session  → Stripe Checkout (cartão) p/ um pedido
 *   • POST /api/payments/pix-intent        → PaymentIntent PIX (QR + copia-e-cola)
 *   • GET  /api/payments/status            → consulta/concilia o status de um pagamento
 *   • POST /api/payments/refund            → estorno (admin ou dono da loja)
 *   • POST /api/webhooks/stripe            → webhook (marca pedidos pagos/estornados)
 *   • POST /api/connect/account-link       → onboarding Stripe Connect do entregador
 *   • GET  /api/connect/status             → status da conta Connect do entregador
 *   • POST /api/connect/payout             → repasse p/ entregador (admin)
 *   • GET  /health · GET /config           → diagnóstico e config pública
 *
 * Variáveis de ambiente: ver .env.example. NUNCA exponha STRIPE_SECRET_KEY
 * em um app cliente ou em repositório.
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Stripe from 'stripe';
import {
  requireAuth,
  isAdminUser,
  isStoreOwner,
  firestoreEnabled,
  db,
  FieldValue,
  getOrder,
  orderRef,
  markOrderPaid,
  markOrderPaymentFailed,
  markOrderRefunded,
} from './lib/firebase.js';

const PORT = Number(process.env.PORT || 8787);
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const CURRENCY = (process.env.CURRENCY || 'brl').toLowerCase();
/** URL pública deste servidor (usada nas páginas de retorno do Checkout). */
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

if (!STRIPE_SECRET_KEY) {
  console.error('[stripe] STRIPE_SECRET_KEY não definida. Configure server/.env antes de iniciar.');
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY);
const app = express();

app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : true,
  }),
);

/* O webhook precisa do corpo BRUTO para validar a assinatura — registrado
 * ANTES do express.json(). */
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), handleWebhook);

app.use(express.json());

const asyncRoute = (fn) => (req, res) => fn(req, res).catch((e) => sendStripeError(res, e));

function sendStripeError(res, e) {
  console.error('[api]', e?.message || e);
  const status = e?.statusCode && e.statusCode >= 400 && e.statusCode < 600 ? e.statusCode : 500;
  res.status(status).json({
    error: e?.message || 'Erro interno no servidor de pagamentos.',
    code: e?.code || undefined,
  });
}

const toCents = (v) => Math.round(Number(v) * 100);

/**
 * Resolve o valor a cobrar. Com Firestore admin, o valor SEMPRE vem do
 * pedido salvo (imune a adulteração no cliente); sem ele, confia no valor
 * enviado e marca a origem nos metadados.
 */
async function resolveAmount({ smId, orderId, amount }) {
  if (firestoreEnabled) {
    const order = await getOrder(smId, orderId);
    if (!order) throw Object.assign(new Error('Pedido não encontrado.'), { statusCode: 404 });
    const cents = toCents(order.total);
    if (!(cents > 0)) throw Object.assign(new Error('Pedido com valor inválido.'), { statusCode: 400 });
    return { cents, source: 'firestore', order };
  }
  const cents = toCents(amount);
  if (!(cents > 0)) throw Object.assign(new Error('Valor do pagamento inválido.'), { statusCode: 400 });
  return { cents, source: 'client', order: null };
}

/** Deep links de volta ao app: aceita apenas esquemas simples (evita open redirect). */
function safeNext(next) {
  if (typeof next !== 'string') return '';
  return /^[a-z][a-z0-9+.-]*:\/\/[^\s]*$/i.test(next) && !/^javascript:/i.test(next) ? next : '';
}

/* ---------------------- Stripe Customer por usuário ------------------------ */
/** Cartões salvos e assinaturas ficam presos a um Customer da Stripe amarrado
 * ao uid do Firebase (metadata.firebaseUid). Cache em memória evita duplicatas
 * enquanto o índice de busca da Stripe atualiza. */
const customerIdCache = new Map();

async function getOrCreateCustomerId(user) {
  if (customerIdCache.has(user.uid)) return customerIdCache.get(user.uid);
  const found = await stripe.customers.search({
    query: `metadata['firebaseUid']:'${user.uid}'`,
    limit: 1,
  });
  let customer = found.data[0];
  if (!customer) {
    customer = await stripe.customers.create({
      email: user.email || undefined,
      metadata: { firebaseUid: user.uid },
    });
  }
  customerIdCache.set(user.uid, customer.id);
  return customer.id;
}

/** Garante que o payment method pertence ao Customer do usuário logado. */
async function assertOwnPaymentMethod(user, paymentMethodId) {
  const customerId = await getOrCreateCustomerId(user);
  const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
  if (pm.customer !== customerId) {
    throw Object.assign(new Error('Cartão não pertence a este usuário.'), { statusCode: 403 });
  }
  return { customerId, pm };
}

/* ------------------------------- Diagnóstico ------------------------------- */

app.get('/health', asyncRoute(async (req, res) => {
  const out = {
    ok: true,
    service: 'nexmarket-payments',
    stripe: true,
    firestoreAdmin: firestoreEnabled,
    webhookConfigured: !!STRIPE_WEBHOOK_SECRET,
    currency: CURRENCY,
  };
  if (req.query.deep === '1') {
    const balance = await stripe.balance.retrieve();
    out.stripeAccountLive = !!balance.livemode;
  }
  res.json(out);
}));

app.get('/config', (req, res) => {
  res.json({ publishableKey: STRIPE_PUBLISHABLE_KEY, currency: CURRENCY, provider: 'stripe' });
});

/* ------------------------- Checkout (cartão online) ------------------------ */

app.post('/api/payments/checkout-session', requireAuth, asyncRoute(async (req, res) => {
  const { smId, orderId, amount, storeName, next, saveCard } = req.body || {};
  if (!smId || !orderId) {
    return res.status(400).json({ error: 'smId e orderId são obrigatórios.' });
  }
  const { cents, source, order } = await resolveAmount({ smId, orderId, amount });

  const metadata = {
    smId,
    orderId,
    customerId: req.user.uid,
    amountSource: source,
  };
  const deepLink = safeNext(next);
  const successUrl =
    `${PUBLIC_URL}/return/success?session_id={CHECKOUT_SESSION_ID}` +
    (deepLink ? `&next=${encodeURIComponent(deepLink)}` : '');
  const cancelUrl = `${PUBLIC_URL}/return/cancel` + (deepLink ? `?next=${encodeURIComponent(deepLink)}` : '');

  // Customer amarrado ao uid: habilita salvar cartão (1 toque nas próximas
  // compras) e Apple Pay/Google Pay/Link direto na página do Checkout.
  const customerId = await getOrCreateCustomerId(req.user);

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: CURRENCY,
          unit_amount: cents,
          product_data: {
            name: `Pedido #${String(orderId).slice(0, 8)}${storeName || order?.storeName ? ` — ${storeName || order?.storeName}` : ''}`,
            description: 'Compra na plataforma Nexmarket',
          },
        },
      },
    ],
    customer: customerId,
    metadata,
    payment_intent_data: {
      metadata,
      ...(saveCard ? { setup_future_usage: 'off_session' } : {}),
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  res.json({ url: session.url, sessionId: session.id, amount: cents / 100 });
}));

/* ------------------------- Cartões salvos (1 toque) ------------------------ */

app.get('/api/payments/saved-methods', requireAuth, asyncRoute(async (req, res) => {
  const customerId = await getOrCreateCustomerId(req.user);
  const pms = await stripe.paymentMethods.list({ customer: customerId, type: 'card' });
  res.json({
    methods: pms.data.map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand || 'card',
      last4: pm.card?.last4 || '',
      expMonth: pm.card?.exp_month,
      expYear: pm.card?.exp_year,
    })),
  });
}));

app.delete('/api/payments/saved-methods/:id', requireAuth, asyncRoute(async (req, res) => {
  await assertOwnPaymentMethod(req.user, req.params.id);
  await stripe.paymentMethods.detach(req.params.id);
  res.json({ ok: true });
}));

/**
 * Pagamento em 1 toque com cartão salvo (off_session).
 * kind='order' cobra o pedido (valor validado no Firestore quando disponível);
 * kind='tip' cobra uma gorjeta avulsa pós-entrega (valor livre, com teto).
 */
app.post('/api/payments/charge-saved', requireAuth, asyncRoute(async (req, res) => {
  const { smId, orderId, paymentMethodId, amount, kind = 'order' } = req.body || {};
  if (!smId || !orderId || !paymentMethodId) {
    return res.status(400).json({ error: 'smId, orderId e paymentMethodId são obrigatórios.' });
  }
  const { customerId } = await assertOwnPaymentMethod(req.user, paymentMethodId);

  let cents;
  if (kind === 'tip') {
    cents = toCents(amount);
    const MAX_TIP = toCents(process.env.MAX_TIP_BRL || 200);
    if (!(cents > 0) || cents > MAX_TIP) {
      return res.status(400).json({ error: 'Valor de gorjeta inválido.' });
    }
  } else {
    ({ cents } = await resolveAmount({ smId, orderId, amount }));
  }

  try {
    const intent = await stripe.paymentIntents.create({
      amount: cents,
      currency: CURRENCY,
      customer: customerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      metadata: { smId, orderId, customerId: req.user.uid, type: kind },
    });
    // Pedido (não gorjeta) pago → concilia no Firestore quando possível.
    if (kind === 'order' && intent.status === 'succeeded' && firestoreEnabled) {
      await markOrderPaid({ smId, orderId, paymentIntentId: intent.id, method: 'card_online' });
    }
    res.json({
      ok: intent.status === 'succeeded',
      status: intent.status,
      paymentIntentId: intent.id,
      amount: cents / 100,
    });
  } catch (e) {
    // Cartão exigiu autenticação (3DS) fora de sessão → app cai para o Checkout.
    if (e?.code === 'authentication_required') {
      return res.status(402).json({
        error: 'Este cartão exige autenticação. Use o pagamento pelo navegador.',
        requiresAction: true,
      });
    }
    throw e;
  }
}));

/** Gorjeta pós-entrega via Stripe Checkout (quando não há cartão salvo). */
app.post('/api/payments/tip-checkout', requireAuth, asyncRoute(async (req, res) => {
  const { smId, orderId, amount, driverName, next } = req.body || {};
  const cents = toCents(amount);
  const MAX_TIP = toCents(process.env.MAX_TIP_BRL || 200);
  if (!smId || !orderId || !(cents > 0) || cents > MAX_TIP) {
    return res.status(400).json({ error: 'Dados de gorjeta inválidos.' });
  }
  const customerId = await getOrCreateCustomerId(req.user);
  const deepLink = safeNext(next);
  const metadata = { smId, orderId, customerId: req.user.uid, type: 'tip' };
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: CURRENCY,
          unit_amount: cents,
          product_data: {
            name: `Gorjeta${driverName ? ` para ${driverName}` : ''} — pedido #${String(orderId).slice(0, 8)}`,
            description: '100% do valor vai para o entregador',
          },
        },
      },
    ],
    customer: customerId,
    metadata,
    payment_intent_data: { metadata },
    success_url:
      `${PUBLIC_URL}/return/success?session_id={CHECKOUT_SESSION_ID}` +
      (deepLink ? `&next=${encodeURIComponent(deepLink)}` : ''),
    cancel_url: `${PUBLIC_URL}/return/cancel` + (deepLink ? `?next=${encodeURIComponent(deepLink)}` : ''),
  });
  res.json({ url: session.url, sessionId: session.id, amount: cents / 100 });
}));

/* --------------------- Reembolso self-service por item --------------------- */

/**
 * Cliente reporta itens com problema e recebe estorno parcial AUTOMÁTICO até o
 * teto (SELF_REFUND_LIMIT_BRL, padrão R$ 50 e no máx. 50% do pedido). Acima do
 * teto devolve needsReview=true e o app abre um chamado para a Empresa.
 */
app.post('/api/payments/item-refund', requireAuth, asyncRoute(async (req, res) => {
  const { smId, orderId, amount, reason } = req.body || {};
  const cents = toCents(amount);
  if (!smId || !orderId || !(cents > 0)) {
    return res.status(400).json({ error: 'smId, orderId e amount são obrigatórios.' });
  }

  const LIMIT = toCents(process.env.SELF_REFUND_LIMIT_BRL || 50);
  let paymentIntentId = req.body?.paymentIntentId;
  let maxCents = LIMIT;

  if (firestoreEnabled) {
    const order = await getOrder(smId, orderId);
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });
    if (order.customerId !== req.user.uid) {
      return res.status(403).json({ error: 'Este pedido não é seu.' });
    }
    if (order.payment?.selfRefunded) {
      return res.status(409).json({ error: 'Este pedido já recebeu um reembolso automático.' });
    }
    paymentIntentId = paymentIntentId || order.payment?.paymentIntentId;
    maxCents = Math.min(LIMIT, Math.floor(toCents(order.total || 0) * 0.5));
  }

  if (!paymentIntentId) {
    return res.status(400).json({
      error: 'Pedido sem pagamento online associado — o reembolso será tratado pelo suporte.',
      notOnline: true,
    });
  }
  if (cents > maxCents) {
    return res.status(422).json({
      error: 'Valor acima do limite de reembolso automático — enviado para análise do suporte.',
      needsReview: true,
      limit: maxCents / 100,
    });
  }

  const refund = await stripe.refunds.create({
    payment_intent: paymentIntentId,
    amount: cents,
    reason: 'requested_by_customer',
    metadata: { smId, orderId, requestedBy: req.user.uid, selfService: 'true', note: reason || '' },
  });

  if (firestoreEnabled) {
    const ref = orderRef(smId, orderId);
    await ref.set(
      {
        payment: {
          refundedAmount: cents / 100,
          refundId: refund.id,
          refundReason: reason || 'Itens com problema (self-service)',
          refundedAt: FieldValue.serverTimestamp(),
          selfRefunded: true,
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  res.json({ ok: true, refundId: refund.id, amount: cents / 100 });
}));

/* --------------------------------- PIX ------------------------------------ */

app.post('/api/payments/pix-intent', requireAuth, asyncRoute(async (req, res) => {
  const { smId, orderId, amount } = req.body || {};
  if (!smId || !orderId) {
    return res.status(400).json({ error: 'smId e orderId são obrigatórios.' });
  }
  const { cents, source } = await resolveAmount({ smId, orderId, amount });

  let intent;
  try {
    intent = await stripe.paymentIntents.create({
      amount: cents,
      currency: 'brl', // PIX só existe em BRL
      payment_method_types: ['pix'],
      payment_method_data: { type: 'pix' },
      confirm: true,
      metadata: { smId, orderId, customerId: req.user.uid, amountSource: source },
    });
  } catch (e) {
    // Conta sem o método PIX ativado (precisa habilitar no dashboard Stripe).
    if (e?.code === 'payment_method_unactivated' || /pix/i.test(e?.message || '')) {
      return res.status(409).json({
        error: 'PIX não está habilitado nesta conta Stripe. Ative em Settings → Payment methods.',
        pixUnavailable: true,
      });
    }
    throw e;
  }

  const qr = intent.next_action?.pix_display_qr_code || {};
  res.json({
    paymentIntentId: intent.id,
    status: intent.status,
    amount: cents / 100,
    qrData: qr.data || null, // “copia e cola”
    qrImageUrl: qr.image_url_png || null, // QR code renderizado
    hostedUrl: qr.hosted_instructions_url || null,
    expiresAt: qr.expires_at || null,
  });
}));

/* ------------------------------ Status/conciliação ------------------------ */

app.get('/api/payments/status', requireAuth, asyncRoute(async (req, res) => {
  const { sessionId, paymentIntentId, smId, orderId } = req.query;

  let intent = null;
  let sessionPaid = false;
  if (sessionId) {
    const session = await stripe.checkout.sessions.retrieve(String(sessionId), {
      expand: ['payment_intent'],
    });
    sessionPaid = session.payment_status === 'paid';
    intent = typeof session.payment_intent === 'object' ? session.payment_intent : null;
  } else if (paymentIntentId) {
    intent = await stripe.paymentIntents.retrieve(String(paymentIntentId));
  } else {
    return res.status(400).json({ error: 'Informe sessionId ou paymentIntentId.' });
  }

  const paid = sessionPaid || intent?.status === 'succeeded';
  const status = paid
    ? 'paid'
    : intent?.status === 'canceled'
      ? 'failed'
      : intent?.status || 'pending';

  // Conciliação: se o app informou o pedido e temos Firestore admin, persiste.
  if (paid && firestoreEnabled && smId && orderId) {
    await markOrderPaid({
      smId: String(smId),
      orderId: String(orderId),
      paymentIntentId: intent?.id,
      sessionId: sessionId ? String(sessionId) : undefined,
    });
  }

  res.json({ status, paid, paymentIntentId: intent?.id || null });
}));

/* --------------------------------- Estorno -------------------------------- */

app.post('/api/payments/refund', requireAuth, asyncRoute(async (req, res) => {
  const { smId, orderId, paymentIntentId, amount, reason } = req.body || {};
  if (!smId || !orderId) {
    return res.status(400).json({ error: 'smId e orderId são obrigatórios.' });
  }

  const admin = await isAdminUser(req.user);
  const owner = !admin && (await isStoreOwner(req.user, smId));
  if (!admin && !owner) {
    return res.status(403).json({ error: 'Apenas operadores da plataforma ou o dono da loja podem estornar.' });
  }

  // Descobre o PaymentIntent: corpo da requisição ou o registrado no pedido.
  let pi = paymentIntentId;
  if (!pi && firestoreEnabled) {
    const order = await getOrder(smId, orderId);
    pi = order?.payment?.paymentIntentId;
  }
  if (!pi) {
    return res.status(400).json({
      error: 'Pedido sem PaymentIntent da Stripe associado (pagamento não-online ou anterior à integração).',
      notOnline: true,
    });
  }

  const refund = await stripe.refunds.create({
    payment_intent: pi,
    ...(amount ? { amount: toCents(amount) } : {}),
    reason: 'requested_by_customer',
    metadata: { smId, orderId, requestedBy: req.user.uid, note: reason || '' },
  });

  if (firestoreEnabled) {
    await markOrderRefunded({
      smId,
      orderId,
      amount: (refund.amount || 0) / 100,
      refundId: refund.id,
      actorUid: req.user.uid,
      reason,
    });
  }

  res.json({ ok: true, refundId: refund.id, amount: (refund.amount || 0) / 100, status: refund.status });
}));

/* --------------------- Stripe Connect (repasse entregador) ----------------- */

/** Cria/recupera a conta Express do entregador logado e devolve o link de onboarding. */
app.post('/api/connect/account-link', requireAuth, asyncRoute(async (req, res) => {
  const uid = req.user.uid;
  let accountId = req.body?.accountId || null;

  if (!accountId && firestoreEnabled) {
    const snap = await db.doc(`drivers/${uid}`).get();
    accountId = snap.exists ? snap.data().stripeAccountId || null : null;
  }

  try {
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'BR',
        email: req.user.email || undefined,
        // Contas BR exigem card_payments junto com transfers.
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        business_type: 'individual',
        metadata: { driverId: uid },
      });
      accountId = account.id;
      if (firestoreEnabled) {
        await db.doc(`drivers/${uid}`).set(
          { stripeAccountId: accountId, updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        );
      }
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      refresh_url: `${PUBLIC_URL}/return/cancel`,
      return_url: `${PUBLIC_URL}/return/success`,
    });
    res.json({ accountId, url: link.url });
  } catch (e) {
    if (/Connect/i.test(e?.message || '')) {
      return res.status(409).json({
        error: 'Stripe Connect não está habilitado nesta conta. Ative em https://dashboard.stripe.com/connect.',
        connectUnavailable: true,
      });
    }
    throw e;
  }
}));

app.get('/api/connect/status', requireAuth, asyncRoute(async (req, res) => {
  const uid = req.user.uid;
  let accountId = req.query.accountId || null;
  if (!accountId && firestoreEnabled) {
    const snap = await db.doc(`drivers/${uid}`).get();
    accountId = snap.exists ? snap.data().stripeAccountId || null : null;
  }
  if (!accountId) return res.json({ configured: false });
  const account = await stripe.accounts.retrieve(String(accountId));
  res.json({
    configured: true,
    accountId,
    payoutsEnabled: !!account.payouts_enabled,
    detailsSubmitted: !!account.details_submitted,
  });
}));

/** Admin: transfere o valor de um saque aprovado para a conta Connect do entregador. */
app.post('/api/connect/payout', requireAuth, asyncRoute(async (req, res) => {
  if (!(await isAdminUser(req.user))) {
    return res.status(403).json({ error: 'Apenas operadores da plataforma podem executar repasses.' });
  }
  const { driverId, amount, payoutId } = req.body || {};
  const cents = toCents(amount);
  if (!driverId || !(cents > 0)) {
    return res.status(400).json({ error: 'driverId e amount são obrigatórios.' });
  }

  let accountId = req.body?.accountId || null;
  if (!accountId && firestoreEnabled) {
    const snap = await db.doc(`drivers/${driverId}`).get();
    accountId = snap.exists ? snap.data().stripeAccountId || null : null;
  }
  if (!accountId) {
    return res.status(409).json({
      error: 'Entregador ainda não concluiu o onboarding Stripe Connect.',
      connectUnavailable: true,
    });
  }

  const transfer = await stripe.transfers.create({
    amount: cents,
    currency: 'brl',
    destination: accountId,
    metadata: { driverId, payoutId: payoutId || '' },
  });

  if (firestoreEnabled && payoutId) {
    await db.doc(`drivers/${driverId}/payouts/${payoutId}`).set(
      {
        status: 'paid',
        transferId: transfer.id,
        processedBy: req.user.uid,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  res.json({ ok: true, transferId: transfer.id, amount: cents / 100 });
}));

/* --------------------- Push transacional (relay Expo) ---------------------- */

/**
 * Relay de notificações push: loja/entregador chamam este endpoint com o token
 * Expo do cliente (que viaja no documento do pedido) para avisar mudanças de
 * status. O servidor apenas repassa para a API pública do Expo.
 */
app.post('/api/notifications/send', requireAuth, asyncRoute(async (req, res) => {
  const { to, title, body, data } = req.body || {};
  if (!to || !/^Expo(nent)?PushToken\[.+\]$/.test(String(to))) {
    return res.status(400).json({ error: 'Token de push Expo inválido.' });
  }
  if (!title || !body) {
    return res.status(400).json({ error: 'title e body são obrigatórios.' });
  }
  const r = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, title: String(title).slice(0, 120), body: String(body).slice(0, 240), sound: 'default', data: data || {} }),
  });
  const out = await r.json().catch(() => ({}));
  res.json({ ok: r.ok, receipt: out?.data || null });
}));

/* --------------------------------- Webhook -------------------------------- */

async function handleWebhook(req, res) {
  let event = null;
  try {
    if (STRIPE_WEBHOOK_SECRET) {
      event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET);
    } else {
      // Sem segredo configurado aceita sem verificar (útil só em dev local).
      event = JSON.parse(req.body.toString('utf8'));
      console.warn('[webhook] STRIPE_WEBHOOK_SECRET ausente — evento aceito SEM verificação de assinatura.');
    }
  } catch (e) {
    console.error('[webhook] assinatura inválida:', e.message);
    return res.status(400).json({ error: 'Assinatura de webhook inválida.' });
  }

  const obj = event.data?.object || {};
  const meta = obj.metadata || {};
  const { smId, orderId } = meta;

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        if (obj.payment_status === 'paid' && smId && orderId) {
          await markOrderPaid({
            smId,
            orderId,
            sessionId: obj.id,
            paymentIntentId: typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.payment_intent?.id,
          });
        }
        break;
      case 'payment_intent.succeeded':
        if (smId && orderId) {
          await markOrderPaid({ smId, orderId, paymentIntentId: obj.id });
        }
        break;
      case 'payment_intent.payment_failed':
        if (smId && orderId) {
          await markOrderPaymentFailed({
            smId,
            orderId,
            paymentIntentId: obj.id,
            reason: obj.last_payment_error?.message,
          });
        }
        break;
      case 'charge.refunded': {
        const m = obj.metadata || {};
        if (m.smId && m.orderId) {
          await markOrderRefunded({
            smId: m.smId,
            orderId: m.orderId,
            amount: (obj.amount_refunded || 0) / 100,
          });
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    // Loga mas responde 200 nos casos sem Firestore para a Stripe não re-tentar para sempre.
    console.error('[webhook] falha ao processar', event.type, e.message);
  }

  res.json({ received: true, firestoreAdmin: firestoreEnabled });
}

/* --------------------------- Páginas de retorno ---------------------------- */

function returnPage({ title, message, next }) {
  const link = safeNext(next);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{font-family:system-ui,sans-serif;background:#F0FDF4;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#fff;border:2px solid #DCFCE7;border-radius:20px;padding:32px;max-width:380px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.06)}
h1{font-size:22px;color:#14532D;margin:0 0 8px}p{color:#475569;margin:0 0 20px}
a{display:inline-block;background:#58CC02;color:#fff;font-weight:700;padding:12px 24px;border-radius:12px;text-decoration:none}</style>
${link ? `<meta http-equiv="refresh" content="1;url=${link}">` : ''}</head>
<body><div class="card"><h1>${title}</h1><p>${message}</p>
${link ? `<a href="${link}">Voltar para o app</a>` : '<p>Você já pode fechar esta janela e voltar ao app.</p>'}
</div></body></html>`;
}

app.get('/return/success', (req, res) => {
  res
    .type('html')
    .send(returnPage({
      title: 'Pagamento processado ✅',
      message: 'Tudo certo! Volte para o app para acompanhar seu pedido.',
      next: req.query.next,
    }));
});

app.get('/return/cancel', (req, res) => {
  res
    .type('html')
    .send(returnPage({
      title: 'Pagamento não concluído',
      message: 'Nenhum valor foi cobrado. Você pode tentar novamente pelo app.',
      next: req.query.next,
    }));
});

app.listen(PORT, () => {
  console.log(`⚡ Nexmarket payments server em http://localhost:${PORT}`);
  console.log(`   Stripe: ${STRIPE_SECRET_KEY.startsWith('sk_test') ? 'TEST mode' : 'LIVE mode'} · Firestore admin: ${firestoreEnabled ? 'ativo' : 'inativo (fallback no cliente)'}`);
});
