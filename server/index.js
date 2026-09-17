/**
 * Nexmarket — Servidor de Pagamentos (Pagar.me/Stone) + Autenticação compartilhada
 * ============================================
 * Único componente da plataforma que usa a CHAVE SECRETA da Pagar.me.
 * Atende os quatro apps (cliente, loja, entregador e painel Empresa):
 *
 *   • POST /api/auth/login · /api/auth/register     → autenticação (loja/empresa/entregador)
 *   • POST /api/payments/checkout                    → cobra um pedido (cartão ou PIX) com split p/ a loja
 *   • GET  /api/payments/status                       → consulta/concilia o status de um pagamento
 *   • POST /api/payments/refund                       → estorno (admin ou dono da loja)
 *   • POST /api/payments/item-refund                  → reembolso self-service por item (teto automático)
 *   • GET/DELETE /api/payments/saved-methods           → cartões salvos do cliente (1 toque)
 *   • POST /api/webhooks/pagarme                       → webhook (marca pedidos pagos/estornados)
 *   • POST /api/recipients/store · /api/recipients/driver → onboarding de recebedor (KYC + conta bancária)
 *   • GET  /api/recipients/store/status · /driver/status  → status do recebedor
 *   • POST /api/payouts/transfer                        → repasse sob demanda p/ entregador (admin)
 *   • GET  /health · GET /config                        → diagnóstico e config pública
 *
 * Variáveis de ambiente: ver .env.example. NUNCA exponha PAGARME_SECRET_KEY
 * em um app cliente ou em repositório — só a PAGARME_PUBLIC_KEY (usada para
 * tokenizar cartão no app, ver GET /config) pode circular no cliente.
 * A Pagar.me é OPCIONAL: sem a secret key o servidor sobe normalmente
 * (autenticação funciona) e só as rotas de pagamento respondem 501.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import {
  requireAuth,
  isAdminUser,
  isStoreOwner,
  firestoreEnabled,
  db,
  adminAuth,
  FieldValue,
  getOrder,
  orderRef,
  markOrderPaid,
  markOrderPaymentFailed,
  markOrderRefunded,
} from './lib/firebase.js';
import { login as authLogin, createCredential, setPassword as authSetPassword } from './lib/auth.js';
import { createPagarmeClient, CLIENT_TOKEN_ENDPOINT } from './lib/pagarme.js';
import { COMMISSION_PCT, MIN_ORDER_BRL, calcOrderBreakdown } from './lib/fees.js';

const PORT = Number(process.env.PORT || 8787);
const PAGARME_SECRET_KEY = process.env.PAGARME_SECRET_KEY || '';
const PAGARME_PUBLIC_KEY = process.env.PAGARME_PUBLIC_KEY || '';
const PAGARME_WEBHOOK_SECRET = process.env.PAGARME_WEBHOOK_SECRET || '';
const CURRENCY = (process.env.CURRENCY || 'brl').toLowerCase();
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const ROOT_ADMIN_EMAIL = (process.env.ROOT_ADMIN_EMAIL || 'caiosazeredo@cos.ufrj.br').toLowerCase();
const MAX_TIP_BRL = Number(process.env.MAX_TIP_BRL || 200);
const SELF_REFUND_LIMIT_BRL = Number(process.env.SELF_REFUND_LIMIT_BRL || 50);

if (!PAGARME_SECRET_KEY) {
  console.warn('[pagarme] PAGARME_SECRET_KEY não definida — rotas de pagamento respondem 501; autenticação (/api/auth/*) funciona normalmente.');
}

/** `null` quando a Pagar.me não está configurada — as rotas de pagamento são
 * barradas pelo middleware requirePayments antes de chegar a usá-lo. */
const pagarme = createPagarmeClient(PAGARME_SECRET_KEY);
const app = express();

app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : true,
  }),
);

app.use(express.json());

/* Sem PAGARME_SECRET_KEY as rotas de pagamento/repasse ficam indisponíveis
 * (501), mas o restante do servidor — principalmente /api/auth/* — segue no
 * ar. Registrado antes das rotas para interceptá-las. */
app.use(['/api/payments', '/api/recipients', '/api/payouts'], (req, res, next) => {
  if (!pagarme) {
    return res.status(501).json({
      error: 'Pagamentos indisponíveis: PAGARME_SECRET_KEY não configurada no servidor.',
      paymentsUnavailable: true,
    });
  }
  next();
});

const asyncRoute = (fn) => (req, res) => fn(req, res).catch((e) => sendApiError(res, e));

function sendApiError(res, e) {
  console.error('[api]', e?.message || e);
  const status = e?.statusCode && e.statusCode >= 400 && e.statusCode < 600 ? e.statusCode : 500;
  res.status(status).json({
    error: e?.message || 'Erro interno no servidor de pagamentos.',
    code: e?.code || undefined,
  });
}

const toCents = (v) => Math.round(Number(v) * 100);
const onlyDigits = (s) => String(s || '').replace(/\D/g, '');

/** Deep links de volta ao app: aceita apenas esquemas simples (evita open redirect). */
function safeNext(next) {
  if (typeof next !== 'string') return '';
  return /^[a-z][a-z0-9+.-]*:\/\/[^\s]*$/i.test(next) && !/^javascript:/i.test(next) ? next : '';
}

/** paid|failed|pending a partir do status do pedido/cobrança da Pagar.me. */
function mapPagarmeStatus(orderStatus, chargeStatus) {
  if (orderStatus === 'paid' || chargeStatus === 'paid') return 'paid';
  if (['failed', 'canceled'].includes(orderStatus) || ['failed', 'canceled'].includes(chargeStatus)) return 'failed';
  return 'pending';
}

/* ------------------------- Cliente Pagar.me por usuário --------------------- */
/** Cartões salvos ficam presos a um Customer da Pagar.me amarrado ao uid do
 * Firebase — persistido em customers/{uid}.pagarmeCustomerId (sobrevive a
 * reinícios do servidor, diferente do cache em memória que a versão Stripe
 * usava). */
async function getOrCreatePagarmeCustomer(user) {
  if (db) {
    const ref = db.doc(`customers/${user.uid}`);
    const snap = await ref.get();
    const existing = snap.exists ? snap.data()?.pagarmeCustomerId : null;
    if (existing) return existing;
  }
  const customer = await pagarme.createCustomer({
    name: user.name || (user.email ? user.email.split('@')[0] : 'Cliente Nexmarket'),
    email: user.email || undefined,
    type: 'individual',
    code: user.uid,
  });
  if (db) {
    await db.doc(`customers/${user.uid}`).set(
      { pagarmeCustomerId: customer.id, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  }
  return customer.id;
}

/**
 * Monta o split da loja: 90% do subtotal de produtos, como valor fixo (flat,
 * em centavos) — assim a comissão (10%) + 100% do frete + 100% da taxa de
 * serviço ficam retidos na plataforma automaticamente (o restante da API não
 * precisa listar a plataforma como recipient — o que não é dividido fica com
 * a conta principal por padrão na Pagar.me).
 *
 * Sem cadastro de recebedor concluído pela loja, retorna `null`: 100% do
 * pedido fica retido na plataforma e o repasse deve ser feito manualmente
 * (ver coleção `settlements` no painel Empresa) até a loja se cadastrar.
 */
async function buildStoreSplit(smId, subtotal) {
  if (!db) return null;
  const snap = await db.doc(`supermarkets/${smId}`).get();
  const pg = snap.exists ? snap.data()?.pagarme : null;
  if (!pg?.recipientId || pg.status !== 'active') return null;
  const storeAmount = Math.round(Number(subtotal || 0) * (1 - COMMISSION_PCT) * 100);
  if (!(storeAmount > 0)) return null;
  return [
    {
      amount: storeAmount,
      type: 'flat',
      recipient_id: pg.recipientId,
      options: { liable: false, charge_processing_fee: false, charge_remainder_fee: false },
    },
  ];
}

/* ------------------------------- Diagnóstico ------------------------------- */

app.get('/health', asyncRoute(async (req, res) => {
  res.json({
    ok: true,
    service: 'nexmarket-payments',
    pagarme: !!pagarme,
    firestoreAdmin: firestoreEnabled,
    webhookConfigured: !!PAGARME_WEBHOOK_SECRET,
    currency: CURRENCY,
  });
}));

app.get('/config', (req, res) => {
  res.json({
    publicKey: PAGARME_PUBLIC_KEY,
    tokenEndpoint: CLIENT_TOKEN_ENDPOINT,
    currency: CURRENCY,
    provider: 'pagarme',
    paymentsEnabled: !!pagarme,
    minOrderBRL: MIN_ORDER_BRL,
  });
});

/** Estimativa de frete/taxa de serviço/comissão antes de fechar o pedido —
 * usada pelo checkout do app do cliente para mostrar o total real (ver
 * src/lib/fees.ts, que replica a mesma fórmula localmente para UI instantânea;
 * este endpoint existe para conferência/uso server-side). */
app.get('/api/fees/quote', (req, res) => {
  const subtotal = Number(req.query.subtotal || 0);
  const distanceKm = Number(req.query.distanceKm || 0);
  const fulfillment = req.query.fulfillment === 'pickup' ? 'pickup' : 'delivery';
  res.json(calcOrderBreakdown({ subtotal, distanceKm, fulfillment }));
});

/* ------------------------------ Autenticação -------------------------------
 * Login/senha vivem 100% no Firestore (server/lib/auth.js) — nunca nos
 * provedores nativos do Firebase (sem e-mail/senha nativo, sem Google). Este
 * servidor valida a credencial e emite um Firebase Custom Token, trocado no
 * app por signInWithCustomToken. Usado por loja, empresa e entregador — o
 * app cliente final continua no Firebase Authentication nativo. */

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const { app: appName, email, password } = req.body || {};
  const { customToken, uid } = await authLogin({ app: appName, email, password, ip: req.ip });
  res.json({ customToken, uid });
}));

app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const { app: appName, email, password, profile } = req.body || {};
  if (!['empresa', 'loja', 'entregador'].includes(appName)) {
    return res.status(400).json({ error: 'App inválido.' });
  }
  const normEmail = String(email || '').trim().toLowerCase();

  if (appName === 'empresa') {
    if (!db) return res.status(500).json({ error: 'Servidor sem acesso ao Firestore.' });
    const isRoot = normEmail === ROOT_ADMIN_EMAIL;
    const inviteSnap = isRoot ? null : await db.doc(`adminInvites/${normEmail}`).get();
    if (!isRoot && !inviteSnap?.exists) {
      return res.status(403).json({
        error: 'Este e-mail não tem convite pendente. Peça a um administrador master.',
      });
    }
    const uid = randomUUID();
    await createCredential({ app: appName, email: normEmail, password, uid });
    const role = isRoot ? 'master' : (inviteSnap.data().role || 'viewer');
    await db.doc(`admins/${uid}`).set({
      name: profile?.name || normEmail.split('@')[0],
      email: normEmail,
      role,
      active: true,
      photoUrl: '',
      createdBy: isRoot ? 'root' : (inviteSnap.data().invitedBy || 'invite'),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (!isRoot) await db.doc(`adminInvites/${normEmail}`).delete().catch(() => {});
    const customToken = await adminAuth.createCustomToken(uid, { app: appName });
    return res.json({ customToken, uid });
  }

  // Loja e Entregador: cadastro aberto — o app cria o próprio perfil
  // (users/{uid} ou drivers/{uid}) depois do login, como já fazia.
  const uid = randomUUID();
  await createCredential({ app: appName, email: normEmail, password, uid });
  const customToken = await adminAuth.createCustomToken(uid, { app: appName });
  res.json({ customToken, uid });
}));

/** Master admin redefine a senha de um operador/lojista/entregador (sem
 * transporte de e-mail configurado, isto substitui o "esqueci minha senha"
 * self-service que existia via Firebase Auth). */
app.post('/api/auth/admin-reset-password', requireAuth, asyncRoute(async (req, res) => {
  if (!(await isAdminUser(req.user))) {
    return res.status(403).json({ error: 'Apenas operadores master podem redefinir senhas de terceiros.' });
  }
  const { app: appName, email, newPassword } = req.body || {};
  await authSetPassword({ app: appName, email, newPassword });
  res.json({ ok: true });
}));

/* --------------------------- Checkout (cartão/PIX) -------------------------- */

/**
 * Cobra um pedido (kind='order', padrão) ou uma gorjeta avulsa pós-entrega
 * (kind='tip'). Cartão: recebe `cardToken` (tokenizado no app via
 * CLIENT_TOKEN_ENDPOINT, o número do cartão nunca passa por este servidor)
 * ou `cardId` de um cartão salvo. PIX: devolve QR code + copia-e-cola.
 *
 * Pedidos com loja já cadastrada como recebedora saem com split automático
 * (90% do subtotal de produtos vai direto para a conta da loja na Pagar.me).
 */
app.post('/api/payments/checkout', requireAuth, asyncRoute(async (req, res) => {
  const {
    smId,
    orderId,
    paymentMethod,
    cardToken,
    cardId,
    installments,
    saveCard,
    kind = 'order',
    amount: tipAmount,
    driverName,
  } = req.body || {};

  if (!smId || !orderId) return res.status(400).json({ error: 'smId e orderId são obrigatórios.' });
  if (!['card', 'pix'].includes(paymentMethod)) {
    return res.status(400).json({ error: 'paymentMethod deve ser "card" ou "pix".' });
  }
  if (!firestoreEnabled) return res.status(500).json({ error: 'Servidor sem acesso ao Firestore.' });

  let cents;
  let description;
  let split = null;
  let afterPaid = async () => {};

  if (kind === 'tip') {
    cents = toCents(tipAmount);
    const maxTipCents = toCents(MAX_TIP_BRL);
    if (!(cents > 0) || cents > maxTipCents) {
      return res.status(400).json({ error: 'Valor de gorjeta inválido.' });
    }
    description = `Gorjeta${driverName ? ` para ${driverName}` : ''} — pedido #${String(orderId).slice(0, 8)}`;
    afterPaid = async () => {
      await orderRef(smId, orderId).set(
        { tipPendingCredit: FieldValue.increment(cents / 100), updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    };
  } else {
    const order = await getOrder(smId, orderId);
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });
    if (order.customerId !== req.user.uid) {
      return res.status(403).json({ error: 'Este pedido não é seu.' });
    }
    if (order.paymentStatus === 'paid') {
      return res.status(409).json({ error: 'Este pedido já foi pago.' });
    }
    cents = toCents(order.total);
    if (!(cents > 0)) return res.status(400).json({ error: 'Pedido com valor inválido.' });
    description = `Pedido #${String(orderId).slice(0, 8)}${order.storeName ? ` — ${order.storeName}` : ''}`;
    split = await buildStoreSplit(smId, order.subtotal);
    afterPaid = async () => {
      await markOrderPaid({ smId, orderId, paymentIntentId: pgOrder.id, chargeId: charge?.id, provider: 'pagarme', method: paymentMethod === 'pix' ? 'pix' : 'card_online' });
    };
  }

  const customerId = await getOrCreatePagarmeCustomer(req.user);

  const paymentEntry = { payment_method: paymentMethod === 'pix' ? 'pix' : 'credit_card' };
  if (paymentMethod === 'card') {
    if (!cardToken && !cardId) {
      return res.status(400).json({ error: 'cardToken (ou cardId de um cartão salvo) é obrigatório para cartão.' });
    }
    paymentEntry.credit_card = {
      installments: Math.min(Math.max(Number(installments) || 1, 1), 12),
      statement_descriptor: 'NEXMARKET',
      ...(cardToken ? { card_token: cardToken } : { card_id: cardId }),
    };
  } else {
    paymentEntry.pix = { expires_in: 3600 };
  }
  if (split) paymentEntry.split = split;

  const pgOrder = await pagarme.createOrder({
    code: orderId,
    customer_id: customerId,
    metadata: { smId, orderId, uid: req.user.uid, kind },
    items: [{ code: orderId, description, amount: cents, quantity: 1 }],
    payments: [paymentEntry],
  });

  const charge = pgOrder.charges?.[0];
  const status = mapPagarmeStatus(pgOrder.status, charge?.status);

  if (status === 'paid') {
    await afterPaid();
    if (kind === 'order' && saveCard && cardToken) {
      // Melhor esforço: não falha o pagamento se o cartão não puder ser salvo.
      await pagarme.createCustomerCard(customerId, { card_token: cardToken }).catch(() => {});
    }
  } else if (status === 'failed' && kind === 'order') {
    await markOrderPaymentFailed({
      smId,
      orderId,
      paymentIntentId: pgOrder.id,
      reason: charge?.last_transaction?.gateway_response?.errors?.[0]?.message,
    });
  }

  const lastTx = charge?.last_transaction || {};
  res.json({
    ok: status === 'paid',
    status,
    pagarmeOrderId: pgOrder.id,
    chargeId: charge?.id || null,
    amount: cents / 100,
    ...(paymentMethod === 'pix'
      ? {
          pix: {
            qrData: lastTx.qr_code || null,
            qrImageUrl: lastTx.qr_code_url || null,
            expiresAt: lastTx.expires_at || null,
          },
        }
      : {}),
  });
}));

/* ------------------------------ Status/conciliação ------------------------ */

app.get('/api/payments/status', requireAuth, asyncRoute(async (req, res) => {
  const { pagarmeOrderId, smId, orderId } = req.query;
  if (!pagarmeOrderId) return res.status(400).json({ error: 'Informe pagarmeOrderId.' });

  const pgOrder = await pagarme.getPagarmeOrder(String(pagarmeOrderId));
  const charge = pgOrder.charges?.[0];
  const status = mapPagarmeStatus(pgOrder.status, charge?.status);

  if (status === 'paid' && firestoreEnabled && smId && orderId) {
    await markOrderPaid({ smId: String(smId), orderId: String(orderId), paymentIntentId: pgOrder.id, chargeId: charge?.id, provider: 'pagarme' });
  }

  res.json({ status, paid: status === 'paid', pagarmeOrderId: pgOrder.id, chargeId: charge?.id || null });
}));

/* --------------------------------- Estorno -------------------------------- */

app.post('/api/payments/refund', requireAuth, asyncRoute(async (req, res) => {
  const { smId, orderId, amount, reason } = req.body || {};
  if (!smId || !orderId) return res.status(400).json({ error: 'smId e orderId são obrigatórios.' });

  const admin = await isAdminUser(req.user);
  const owner = !admin && (await isStoreOwner(req.user, smId));
  if (!admin && !owner) {
    return res.status(403).json({ error: 'Apenas operadores da plataforma ou o dono da loja podem estornar.' });
  }

  const order = firestoreEnabled ? await getOrder(smId, orderId) : null;
  const chargeId = req.body?.chargeId || order?.payment?.chargeId;
  if (!chargeId) {
    return res.status(400).json({
      error: 'Pedido sem cobrança Pagar.me associada (pagamento não-online ou anterior à integração).',
      notOnline: true,
    });
  }

  const cents = amount ? toCents(amount) : undefined;
  const canceled = await pagarme.cancelCharge(chargeId, cents);
  const refundedAmount = (cents || toCents(order?.total || 0)) / 100;

  if (firestoreEnabled) {
    await markOrderRefunded({ smId, orderId, amount: refundedAmount, refundId: canceled.id || chargeId, actorUid: req.user.uid, reason });
  }

  res.json({ ok: true, refundId: canceled.id || chargeId, amount: refundedAmount, status: canceled.status || 'canceled' });
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

  const LIMIT = toCents(SELF_REFUND_LIMIT_BRL);
  let chargeId = req.body?.chargeId;
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
    chargeId = chargeId || order.payment?.chargeId;
    maxCents = Math.min(LIMIT, Math.floor(toCents(order.total || 0) * 0.5));
  }

  if (!chargeId) {
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

  const canceled = await pagarme.cancelCharge(chargeId, cents);

  if (firestoreEnabled) {
    await orderRef(smId, orderId).set(
      {
        payment: {
          refundedAmount: cents / 100,
          refundId: canceled.id || chargeId,
          refundReason: reason || 'Itens com problema (self-service)',
          refundedAt: FieldValue.serverTimestamp(),
          selfRefunded: true,
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  res.json({ ok: true, refundId: canceled.id || chargeId, amount: cents / 100 });
}));

/* ------------------------- Cartões salvos (1 toque) ------------------------ */

app.get('/api/payments/saved-methods', requireAuth, asyncRoute(async (req, res) => {
  const customerId = await getOrCreatePagarmeCustomer(req.user);
  const list = await pagarme.listCustomerCards(customerId);
  res.json({
    methods: (list.data || []).map((c) => ({
      id: c.id,
      brand: c.brand || 'card',
      last4: c.last_four_digits || '',
      expMonth: c.exp_month,
      expYear: c.exp_year,
    })),
  });
}));

app.delete('/api/payments/saved-methods/:id', requireAuth, asyncRoute(async (req, res) => {
  const customerId = await getOrCreatePagarmeCustomer(req.user);
  await pagarme.deleteCustomerCard(customerId, req.params.id);
  res.json({ ok: true });
}));

/* ------------------------------ Recebedores --------------------------------
 * Onboarding de loja e entregador na Pagar.me (KYC + conta bancária). Uma vez
 * ativo, o recebedor da loja entra automaticamente no split de cada cobrança
 * (buildStoreSplit); o do entregador só é usado sob demanda, nos repasses
 * (POST /api/payouts/transfer), porque o entregador de um pedido só é
 * definido depois que o pagamento já foi feito. */

function buildRecipientPayload(body) {
  const isCompany = body.type === 'corporation';
  const register_information = isCompany
    ? {
        type: 'corporation',
        document: onlyDigits(body.document),
        email: body.email,
        company_name: body.companyName || body.name,
        trading_name: body.tradingName || body.name,
        annual_revenue: Number(body.annualRevenue) || 0,
        main_address: body.address,
        managing_partners: body.managingPartners || [],
      }
    : {
        type: 'individual',
        document: onlyDigits(body.document),
        email: body.email,
        name: body.name,
        birthdate: body.birthdate,
        monthly_income: Number(body.monthlyIncome) || 0,
        professional_occupation: body.occupation || 'Comerciante',
      };
  return {
    register_information,
    default_bank_account: {
      holder_name: body.bank?.holderName,
      holder_type: isCompany ? 'company' : 'individual',
      holder_document: onlyDigits(body.bank?.holderDocument || body.document),
      bank: body.bank?.bank,
      branch_number: body.bank?.branchNumber,
      branch_check_digit: body.bank?.branchCheckDigit || '',
      account_number: body.bank?.accountNumber,
      account_check_digit: body.bank?.accountCheckDigit,
      type: body.bank?.accountType === 'savings' ? 'savings' : 'checking',
    },
    transfer_settings: { transfer_enabled: true, transfer_interval: 'Daily' },
  };
}

app.post('/api/recipients/store', requireAuth, asyncRoute(async (req, res) => {
  const { smId } = req.body || {};
  if (!smId) return res.status(400).json({ error: 'smId é obrigatório.' });
  const owner = await isStoreOwner(req.user, smId);
  const admin = !owner && (await isAdminUser(req.user));
  if (!owner && !admin) return res.status(403).json({ error: 'Apenas o dono da loja pode cadastrar o recebedor.' });

  const recipient = await pagarme.createRecipient(buildRecipientPayload(req.body));
  if (db) {
    await db.doc(`supermarkets/${smId}`).set(
      { pagarme: { recipientId: recipient.id, status: recipient.status || 'active', updatedAt: FieldValue.serverTimestamp() } },
      { merge: true },
    );
  }
  res.json({ ok: true, recipientId: recipient.id, status: recipient.status });
}));

app.get('/api/recipients/store/status', requireAuth, asyncRoute(async (req, res) => {
  const { smId } = req.query;
  if (!smId || !db) return res.json({ configured: false });
  const snap = await db.doc(`supermarkets/${String(smId)}`).get();
  const pg = snap.exists ? snap.data()?.pagarme : null;
  if (!pg?.recipientId) return res.json({ configured: false });
  const recipient = await pagarme.getRecipient(pg.recipientId);
  res.json({ configured: true, recipientId: pg.recipientId, status: recipient.status });
}));

app.post('/api/recipients/driver', requireAuth, asyncRoute(async (req, res) => {
  const recipient = await pagarme.createRecipient(buildRecipientPayload({ ...req.body, type: 'individual' }));
  if (db) {
    await db.doc(`drivers/${req.user.uid}`).set(
      { pagarme: { recipientId: recipient.id, status: recipient.status || 'active', updatedAt: FieldValue.serverTimestamp() } },
      { merge: true },
    );
  }
  res.json({ ok: true, recipientId: recipient.id, status: recipient.status });
}));

app.get('/api/recipients/driver/status', requireAuth, asyncRoute(async (req, res) => {
  if (!db) return res.json({ configured: false });
  const snap = await db.doc(`drivers/${req.user.uid}`).get();
  const pg = snap.exists ? snap.data()?.pagarme : null;
  if (!pg?.recipientId) return res.json({ configured: false });
  const recipient = await pagarme.getRecipient(pg.recipientId);
  res.json({ configured: true, recipientId: pg.recipientId, status: recipient.status });
}));

/* --------------------- Repasse sob demanda ao entregador -------------------- */

/** Admin aprova um saque solicitado pelo entregador (drivers/{id}/payouts) e
 * este endpoint transfere o valor da conta da plataforma para o recebedor do
 * entregador na Pagar.me. */
app.post('/api/payouts/transfer', requireAuth, asyncRoute(async (req, res) => {
  if (!(await isAdminUser(req.user))) {
    return res.status(403).json({ error: 'Apenas operadores da plataforma podem executar repasses.' });
  }
  const { driverId, amount, payoutId } = req.body || {};
  const cents = toCents(amount);
  if (!driverId || !(cents > 0)) {
    return res.status(400).json({ error: 'driverId e amount são obrigatórios.' });
  }

  const snap = firestoreEnabled ? await db.doc(`drivers/${driverId}`).get() : null;
  const recipientId = snap?.exists ? snap.data()?.pagarme?.recipientId : null;
  if (!recipientId) {
    return res.status(409).json({
      error: 'Entregador ainda não concluiu o cadastro de recebedor na Pagar.me.',
      connectUnavailable: true,
    });
  }

  const transfer = await pagarme.createTransfer(recipientId, cents, { driverId, payoutId: payoutId || '' });

  if (firestoreEnabled && payoutId) {
    await db.doc(`drivers/${driverId}/payouts/${payoutId}`).set(
      { status: 'paid', transferId: transfer.id, processedBy: req.user.uid, updatedAt: FieldValue.serverTimestamp() },
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

/**
 * A Pagar.me não documenta publicamente um esquema de assinatura HMAC para
 * v5 (verificado contra a documentação oficial em 2026-09), então a
 * autenticidade é garantida por um segredo na própria URL do webhook
 * (?key=...) — configure a mesma string em PAGARME_WEBHOOK_SECRET e no
 * cadastro do webhook no dashboard Pagar.me. Se a Pagar.me expuser um
 * cabeçalho de assinatura no futuro, priorize trocar para ele.
 *
 * smId/orderId vêm do `metadata` que enviamos ao criar o pedido
 * (POST /api/payments/checkout) — sem eles o evento é ignorado com log, pois
 * não há como localizar o pedido no Firestore sem essa referência.
 */
app.post('/api/webhooks/pagarme', express.json(), asyncRoute(async (req, res) => {
  if (PAGARME_WEBHOOK_SECRET && req.query.key !== PAGARME_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Chave de webhook inválida.' });
  }

  const { type, data } = req.body || {};
  const meta = data?.metadata || data?.order?.metadata || {};
  const smId = meta.smId;
  const orderId = meta.orderId || data?.code || data?.order?.code;
  const pgOrderId = type?.startsWith('order.') ? data?.id : data?.order?.id || data?.id;
  const chargeId = type?.startsWith('charge.') ? data?.id : data?.charges?.[0]?.id;

  if (!smId || !orderId) {
    console.warn('[pagarme webhook] evento sem smId/orderId em metadata —', type);
    return res.json({ received: true, ignored: true });
  }

  try {
    switch (type) {
      case 'order.paid':
      case 'charge.paid':
        if (firestoreEnabled) {
          await markOrderPaid({ smId, orderId, paymentIntentId: pgOrderId, chargeId, provider: 'pagarme' });
        }
        break;
      case 'order.payment_failed':
      case 'charge.payment_failed':
        if (firestoreEnabled) {
          await markOrderPaymentFailed({
            smId,
            orderId,
            paymentIntentId: pgOrderId,
            reason: data?.last_transaction?.gateway_response?.errors?.[0]?.message,
          });
        }
        break;
      case 'charge.refunded':
        if (firestoreEnabled) {
          await markOrderRefunded({ smId, orderId, amount: (data?.amount || 0) / 100, refundId: chargeId });
        }
        break;
      default:
        break;
    }
  } catch (e) {
    // Loga mas responde 200 para a Pagar.me não re-tentar para sempre.
    console.error('[pagarme webhook] falha ao processar', type, e.message);
  }

  res.json({ received: true });
}));

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
  res.type('html').send(returnPage({ title: 'Pagamento processado ✅', message: 'Tudo certo! Volte para o app para acompanhar seu pedido.', next: req.query.next }));
});

app.get('/return/cancel', (req, res) => {
  res.type('html').send(returnPage({ title: 'Pagamento não concluído', message: 'Nenhum valor foi cobrado. Você pode tentar novamente pelo app.', next: req.query.next }));
});

/* --------------------- Expiração de item em falta (10 min) ---------------------
 * Fluxo de item em falta (especificação "Checklist de separação", seção 3,
 * item 4): se o cliente não responder à sugestão de substituição/remoção a
 * tempo, aplica a regra padrão — remove o item com desconto automático.
 * Mesma fórmula de recomputo de total usada em respondToSubstitutions
 * (repo nexmarket--cliente, src/lib/orders.ts). Roda a cada 2 minutos; só
 * age quando o servidor tem Firestore admin (senão os apps já cuidam disso
 * ao abrir o pedido — ver respondToSubstitutions, que também fecha o
 * pedido em 'ready' assim que a última pendência é resolvida). */
const SUBSTITUTION_TIMEOUT_MS = 10 * 60 * 1000;

async function expirePendingSubstitutions() {
  if (!db) return;
  try {
    const snap = await db.collectionGroup('orders').where('status', '==', 'waiting_substitution').get();
    const now = Date.now();
    for (const docSnap of snap.docs) {
      const order = docSnap.data();
      const items = Array.isArray(order.items) ? order.items : [];
      let changed = false;
      const newItems = items.map((it) => {
        const pending = (it.missing || it.substituted) && (!it.customerDecision || it.customerDecision === 'pending');
        if (pending && typeof it.missingAt === 'number' && now - it.missingAt > SUBSTITUTION_TIMEOUT_MS) {
          changed = true;
          return { ...it, substituted: false, missing: true, customerDecision: 'rejected' };
        }
        return it;
      });
      if (!changed) continue;

      const stillPending = newItems.some(
        (it) => (it.missing || it.substituted) && (!it.customerDecision || it.customerDecision === 'pending'),
      );
      const subtotal = newItems.reduce((acc, it) => {
        if (it.missing && it.customerDecision === 'rejected' && !it.substituted) return acc;
        const price = it.substituted && typeof it.substitutePrice === 'number' ? it.substitutePrice : it.price;
        return acc + (price || 0) * (it.quantity || 0);
      }, 0);
      const total = Math.max(0, subtotal + (order.deliveryFee || 0) - (order.discount || 0));

      await docSnap.ref.set(
        {
          items: newItems,
          total,
          ...(stillPending ? {} : { status: 'ready' }),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      console.log(`[substitution-timeout] pedido ${docSnap.id}: item(ns) expirado(s) e removido(s) com desconto.`);
    }
  } catch (e) {
    console.error('[substitution-timeout] falha ao expirar substituições pendentes:', e.message);
  }
}

if (db) {
  setInterval(expirePendingSubstitutions, 2 * 60 * 1000);
}

app.listen(PORT, () => {
  console.log(`⚡ Nexmarket payments server em http://localhost:${PORT}`);
  console.log(`   Pagar.me: ${pagarme ? 'configurada' : 'NÃO configurada (pagamentos desativados)'} · Firestore admin: ${firestoreEnabled ? 'ativo' : 'inativo (fallback no cliente)'}`);
});
