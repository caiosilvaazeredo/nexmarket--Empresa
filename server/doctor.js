#!/usr/bin/env node
/**
 * Diagnóstico da integração de pagamentos — `npm run doctor`.
 *
 * Confere a configuração e, quando há chave secreta, **conversa de verdade
 * com a Stripe**: valida a chave, lista os meios de pagamento habilitados
 * (PIX/cartão), verifica o webhook e o Connect, e opcionalmente cria um
 * PaymentIntent de teste. Serve para responder com fatos à pergunta "a
 * Stripe está funcionando?".
 *
 *   npm run doctor            # checagens de leitura, não cobra nada
 *   npm run doctor -- --deep  # cria (e cancela) um PaymentIntent de teste
 */
import 'dotenv/config';
import Stripe from 'stripe';

const DEEP = process.argv.includes('--deep');

const results = [];
const ok = (name, detail = '') => results.push({ level: 'ok', name, detail });
const warn = (name, detail = '') => results.push({ level: 'warn', name, detail });
const fail = (name, detail = '') => results.push({ level: 'fail', name, detail });

const {
  STRIPE_SECRET_KEY = '',
  STRIPE_PUBLISHABLE_KEY = '',
  STRIPE_WEBHOOK_SECRET = '',
  FIREBASE_SERVICE_ACCOUNT = '',
  PUBLIC_URL = '',
  CURRENCY = 'brl',
} = process.env;

async function main() {
  /* ----------------------------- Configuração ---------------------------- */

  if (!STRIPE_SECRET_KEY) {
    fail('STRIPE_SECRET_KEY', 'ausente — nenhuma rota de pagamento funciona (501).');
  } else if (!/^sk_(test|live)_/.test(STRIPE_SECRET_KEY)) {
    fail('STRIPE_SECRET_KEY', 'formato inesperado (deve começar com sk_test_ ou sk_live_).');
  } else {
    ok('STRIPE_SECRET_KEY', STRIPE_SECRET_KEY.startsWith('sk_live_') ? 'modo PRODUÇÃO' : 'modo teste');
  }

  if (!STRIPE_PUBLISHABLE_KEY) {
    warn('STRIPE_PUBLISHABLE_KEY', 'ausente — os apps não conseguem montar o formulário de cartão.');
  } else if (!/^pk_(test|live)_/.test(STRIPE_PUBLISHABLE_KEY)) {
    fail('STRIPE_PUBLISHABLE_KEY', 'formato inesperado (deve começar com pk_test_ ou pk_live_).');
  } else {
    const secretMode = STRIPE_SECRET_KEY.startsWith('sk_live_') ? 'live' : 'test';
    const pubMode = STRIPE_PUBLISHABLE_KEY.startsWith('pk_live_') ? 'live' : 'test';
    if (STRIPE_SECRET_KEY && secretMode !== pubMode) {
      fail('Par de chaves', `secreta em ${secretMode} e publicável em ${pubMode} — precisam ser do mesmo modo.`);
    } else {
      ok('STRIPE_PUBLISHABLE_KEY', `modo ${pubMode}`);
    }
  }

  if (!STRIPE_WEBHOOK_SECRET) {
    warn(
      'STRIPE_WEBHOOK_SECRET',
      'ausente — eventos são aceitos SEM verificação de assinatura (inseguro fora de dev).',
    );
  } else {
    ok('STRIPE_WEBHOOK_SECRET', 'configurado');
  }

  if (!FIREBASE_SERVICE_ACCOUNT) {
    warn(
      'FIREBASE_SERVICE_ACCOUNT',
      'ausente — o valor da cobrança vem do cliente (não do pedido salvo) e /api/auth/* fica fora do ar.',
    );
  } else {
    ok('FIREBASE_SERVICE_ACCOUNT', 'configurado (valor da cobrança lido do pedido)');
  }

  if (!PUBLIC_URL || PUBLIC_URL.includes('localhost')) {
    warn('PUBLIC_URL', `${PUBLIC_URL || 'vazio'} — o Checkout precisa de URL pública para o retorno.`);
  } else {
    ok('PUBLIC_URL', PUBLIC_URL);
  }

  if (CURRENCY !== 'brl') {
    warn('CURRENCY', `${CURRENCY} — PIX exige BRL.`);
  } else {
    ok('CURRENCY', 'brl');
  }

  /* -------------------------- Chamadas reais à API ----------------------- */

  if (STRIPE_SECRET_KEY) {
    const stripe = new Stripe(STRIPE_SECRET_KEY);

    try {
      const account = await stripe.accounts.retrieve();
      ok('Conexão com a Stripe', `conta ${account.id} (${account.country || '??'})`);

      if (account.charges_enabled) ok('Cobranças habilitadas', 'charges_enabled');
      else fail('Cobranças habilitadas', 'a conta ainda não pode cobrar — complete o cadastro na Stripe.');

      if (account.payouts_enabled) ok('Saques habilitados', 'payouts_enabled');
      else warn('Saques habilitados', 'a conta ainda não pode sacar.');
    } catch (e) {
      fail('Conexão com a Stripe', e.message);
      // Sem conexão o resto não faz sentido.
      return report();
    }

    // Meios de pagamento habilitados (PIX é o mais comum de faltar no BR).
    try {
      const methods = await stripe.paymentMethodConfigurations.list({ limit: 1 });
      const cfg = methods.data[0];
      if (cfg) {
        const pix = cfg.pix?.display_preference?.value;
        const card = cfg.card?.display_preference?.value;
        card === 'off'
          ? fail('Cartão', 'desativado na configuração de meios de pagamento.')
          : ok('Cartão', 'habilitado');
        pix === 'off' || pix === undefined
          ? warn('PIX', 'não habilitado — /api/payments/pix-intent vai responder 409.')
          : ok('PIX', 'habilitado');
      } else {
        warn('Meios de pagamento', 'nenhuma configuração encontrada — verifique no dashboard.');
      }
    } catch (e) {
      warn('Meios de pagamento', `não foi possível verificar: ${e.message}`);
    }

    // Webhook apontando para este servidor.
    try {
      const hooks = await stripe.webhookEndpoints.list({ limit: 20 });
      if (hooks.data.length === 0) {
        warn('Webhook', 'nenhum endpoint cadastrado — pagamentos não serão conciliados sozinhos.');
      } else {
        const mine = PUBLIC_URL
          ? hooks.data.find((h) => h.url.startsWith(PUBLIC_URL))
          : null;
        if (mine) {
          ok('Webhook', `${mine.url} (${mine.status})`);
          const needed = [
            'checkout.session.completed',
            'payment_intent.succeeded',
            'payment_intent.payment_failed',
            'charge.refunded',
          ];
          const missing = needed.filter(
            (e) => !mine.enabled_events.includes(e) && !mine.enabled_events.includes('*'),
          );
          missing.length
            ? warn('Eventos do webhook', `faltam: ${missing.join(', ')}`)
            : ok('Eventos do webhook', 'todos os necessários estão ativos');
        } else {
          warn('Webhook', `nenhum endpoint aponta para ${PUBLIC_URL || '(PUBLIC_URL vazio)'}.`);
        }
      }
    } catch (e) {
      warn('Webhook', `não foi possível verificar: ${e.message}`);
    }

    // Stripe Connect — necessário para repassar aos entregadores.
    try {
      await stripe.accounts.list({ limit: 1 });
      ok('Stripe Connect', 'habilitado (repasse a entregadores disponível)');
    } catch (e) {
      /Connect/i.test(e.message)
        ? warn('Stripe Connect', 'não habilitado — ative em dashboard.stripe.com/connect para repassar.')
        : warn('Stripe Connect', e.message);
    }

    // Teste de ponta a ponta: cria e cancela um PaymentIntent de R$ 1,00.
    if (DEEP) {
      try {
        const intent = await stripe.paymentIntents.create({
          amount: 100,
          currency: CURRENCY,
          payment_method_types: ['card'],
          metadata: { source: 'nexmarket-doctor' },
        });
        await stripe.paymentIntents.cancel(intent.id);
        ok('PaymentIntent de teste', `${intent.id} criado e cancelado`);
      } catch (e) {
        fail('PaymentIntent de teste', e.message);
      }
    }
  }

  report();
}

function report() {
  const icon = { ok: '✅', warn: '⚠️ ', fail: '❌' };
  const pad = Math.max(...results.map((r) => r.name.length));
  console.log('\n Diagnóstico de pagamentos — Nexmarket\n');
  for (const r of results) {
    console.log(` ${icon[r.level]} ${r.name.padEnd(pad)}  ${r.detail}`);
  }
  const fails = results.filter((r) => r.level === 'fail').length;
  const warns = results.filter((r) => r.level === 'warn').length;
  console.log(
    `\n ${fails === 0 ? 'Sem erros' : `${fails} erro(s)`}` +
      `${warns ? `, ${warns} aviso(s)` : ''}.` +
      `${DEEP ? '' : ' Use --deep para testar uma cobrança real (R$ 1,00, cancelada em seguida).'}\n`,
  );
  process.exit(fails > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Falha no diagnóstico:', e);
  process.exit(1);
});
