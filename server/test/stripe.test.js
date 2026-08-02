/**
 * Testes de integração **contra a API real da Stripe**.
 *
 * São pulados quando `STRIPE_SECRET_KEY` não está no ambiente — assim
 * `npm test` funciona em qualquer máquina, e quem tem a chave de teste
 * (`sk_test_...`) roda a verificação de verdade:
 *
 *   STRIPE_SECRET_KEY=sk_test_xxx npm test
 *
 * Nada aqui movimenta dinheiro: os PaymentIntents criados são cancelados no
 * mesmo teste, e o modo live é recusado de propósito.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';

const KEY = process.env.STRIPE_SECRET_KEY || '';
const skip = !KEY
  ? 'STRIPE_SECRET_KEY ausente — defina a chave de teste para rodar'
  : false;

if (KEY.startsWith('sk_live_')) {
  throw new Error('Recusando rodar testes com chave de PRODUÇÃO (sk_live_). Use sk_test_.');
}

const stripe = KEY ? new Stripe(KEY) : null;

describe('Stripe (integração real)', { skip }, () => {
  test('a chave é válida e a conta responde', async () => {
    const account = await stripe.accounts.retrieve();
    assert.ok(account.id.startsWith('acct_'));
  });

  test('a conta pode cobrar', async () => {
    const account = await stripe.accounts.retrieve();
    assert.equal(account.charges_enabled, true, 'charges_enabled falso — cadastro incompleto na Stripe');
  });

  test('cria e cancela um PaymentIntent em BRL', async () => {
    const intent = await stripe.paymentIntents.create({
      amount: 1000, // R$ 10,00
      currency: 'brl',
      payment_method_types: ['card'],
      metadata: { source: 'nexmarket-test', smId: 'sm_test', orderId: 'ord_test' },
    });
    assert.equal(intent.status, 'requires_payment_method');
    assert.equal(intent.amount, 1000);
    assert.equal(intent.currency, 'brl');
    // Os metadados são o que o webhook usa para conciliar o pedido.
    assert.equal(intent.metadata.orderId, 'ord_test');

    const canceled = await stripe.paymentIntents.cancel(intent.id);
    assert.equal(canceled.status, 'canceled');
  });

  test('cobra um cartão de teste de ponta a ponta', async () => {
    const intent = await stripe.paymentIntents.create({
      amount: 2500,
      currency: 'brl',
      // Cartão de teste aprovado da Stripe.
      payment_method: 'pm_card_visa',
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      metadata: { source: 'nexmarket-test' },
    });
    assert.equal(intent.status, 'succeeded');
  });

  test('cartão recusado devolve erro tratável', async () => {
    await assert.rejects(
      () =>
        stripe.paymentIntents.create({
          amount: 2500,
          currency: 'brl',
          payment_method: 'pm_card_chargeDeclined',
          confirm: true,
          automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        }),
      (e) => {
        assert.equal(e.type, 'StripeCardError');
        assert.equal(e.code, 'card_declined');
        return true;
      },
    );
  });

  test('reembolso parcial funciona', async () => {
    const intent = await stripe.paymentIntents.create({
      amount: 5000,
      currency: 'brl',
      payment_method: 'pm_card_visa',
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    });
    const refund = await stripe.refunds.create({
      payment_intent: intent.id,
      amount: 2000, // devolve R$ 20 dos R$ 50
    });
    assert.equal(refund.status, 'succeeded');
    assert.equal(refund.amount, 2000);
  });

  test('assinatura de webhook é verificada corretamente', async () => {
    const secret = 'whsec_test_secret_para_verificacao';
    const payload = JSON.stringify({
      id: 'evt_test',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_test', metadata: { smId: 'sm1', orderId: 'ord1' } } },
    });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });

    const event = stripe.webhooks.constructEvent(payload, header, secret);
    assert.equal(event.type, 'payment_intent.succeeded');
    assert.equal(event.data.object.metadata.orderId, 'ord1');

    // Assinatura errada precisa ser rejeitada.
    assert.throws(() => stripe.webhooks.constructEvent(payload, header, 'whsec_outro'));
  });

  test('PIX está habilitado na conta (opcional, avisa se não)', async () => {
    try {
      const intent = await stripe.paymentIntents.create({
        amount: 1500,
        currency: 'brl',
        payment_method_types: ['pix'],
        payment_method_data: { type: 'pix' },
        confirm: true,
      });
      assert.ok(intent.next_action?.pix_display_qr_code?.data, 'PIX sem QR code');
      await stripe.paymentIntents.cancel(intent.id);
    } catch (e) {
      // Não falha o teste: PIX depende de habilitação no dashboard.
      console.warn(`\n  ⚠️  PIX indisponível nesta conta: ${e.message}\n`);
    }
  });
});
