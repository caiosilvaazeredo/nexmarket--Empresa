# 📘 Manual — Nexmarket Empresa (Painel Administrativo + Servidor de Pagamentos)

Este repositório contém **duas peças** da plataforma Nexmarket:

| Peça | Pasta | O que é |
|---|---|---|
| Painel Empresa | raiz (`src/`) | Backoffice web (PWA) da plataforma: pedidos, lojas, entregadores, financeiro, estornos, repasses, suporte, auditoria |
| Servidor de Pagamentos | `server/` | Backend Node/Express que fala com a **Stripe** usando a chave secreta — atende os 4 apps |

## 🧩 Como os 4 sistemas se integram

Todos os apps usam o **mesmo projeto Firebase** (`gen-lang-client-0615772467`) e o mesmo
banco Firestore nomeado — a configuração compartilhada está em `firebase-applet-config.json`
/ `firebase-config.json` de cada repositório:

```
nexmarket--cliente  ──┐                          ┌── nexmarket---loja (separação/entrega)
                      ├──►  Firestore (pedidos)  ─┤
nexmarket--entregador ┘          ▲                └── nexmarket--Empresa (moderação/финanceiro)
                                 │
        server/ (este repo) ◄────┴── Stripe (cartão, PIX, estornos, Connect)
```

Fluxo de um pedido pago online:
1. **Cliente** finaliza o pedido → chama `server/` → Stripe Checkout (cartão) ou PIX.
2. O **webhook** da Stripe (ou o próprio app) marca o pedido como `paid` no Firestore.
3. A **Loja** só inicia a separação depois do pagamento confirmado.
4. O **Entregador** entrega e acumula ganhos; saques são aprovados no painel e, com
   Stripe Connect, o dinheiro cai direto na conta dele.
5. A **Empresa** concilia tudo (GMV, comissões, estornos, repasses).

---

## ▶️ Rodar localmente

Requisitos: **Node.js 18+** e npm.

### Painel (web)

```bash
npm install
npm run dev          # http://localhost:3000
```

Login: use o e-mail root (`caiosazeredo@cos.ufrj.br`) ou um operador convidado pelo painel.

### Servidor de pagamentos

```bash
cd server
npm install
cp .env.example .env      # e preencha (ver seção Stripe abaixo)
npm start                 # http://localhost:8787
```

Teste rápido: `curl http://localhost:8787/health?deep=1` → deve responder `"ok": true, "stripe": true`.

## 🏗️ Build (renderizar para produção)

```bash
npm run build        # gera dist/ (site estático + PWA)
npm run preview      # pré-visualiza o build em http://localhost:3000
npm run typecheck    # checagem de tipos
```

## 🚀 Publicar

### Painel (site estático — qualquer um destes)

**Firebase Hosting** (recomendado, já é o projeto da plataforma):
```bash
npm i -g firebase-tools
firebase login
firebase init hosting     # public: dist · SPA: yes
npm run build
firebase deploy --only hosting
```

**Vercel/Netlify:** aponte o repositório, build command `npm run build`, output `dist`.
Defina as variáveis `VITE_*` do `.env.example` no painel da hospedagem.

### Servidor de pagamentos (precisa de um host Node com URL pública)

Funciona em qualquer host Node: **Render**, **Railway**, **Fly.io**, **Google Cloud Run**…
1. Publique a pasta `server/` (start command: `npm start`).
2. Configure as variáveis de ambiente do `.env.example` no host (NUNCA commite o `.env`).
3. Defina `PUBLIC_URL` com a URL pública do serviço (usada nos redirects do Checkout).
4. Registre a URL no painel: **Configurações → Integrações → Endpoint de pagamentos**
   e clique em **Testar conexão**.

### Regras do Firestore

Sempre que `firestore.rules` mudar (este repositório é o canônico):
```bash
firebase deploy --only firestore:rules,firestore:indexes
```

---

## 💳 Stripe — configuração completa

As chaves ficam em **Dashboard Stripe → Developers → API keys**.

| Chave | Onde vai | Exposição |
|---|---|---|
| `pk_test_...` (publicável) | `.env` do painel (`VITE_PAYMENTS_PUBLIC_KEY`) e `server/.env` | pública, sem risco |
| `sk_test_...` (secreta) | **somente** `server/.env` (`STRIPE_SECRET_KEY`) | ⚠️ nunca em repositório/app |
| `whsec_...` (webhook) | `server/.env` (`STRIPE_WEBHOOK_SECRET`) | secreta |

### Passo a passo

1. **Chaves**: copie `server/.env.example` → `server/.env` e preencha `STRIPE_SECRET_KEY`
   (test: `sk_test_...`; produção: `sk_live_...`).
2. **Webhook** (recomendado): Dashboard → Developers → Webhooks → *Add endpoint* →
   URL `https://SEU-SERVIDOR/api/webhooks/stripe`, eventos:
   `checkout.session.completed`, `payment_intent.succeeded`,
   `payment_intent.payment_failed`, `charge.refunded`. Copie o `whsec_...` para o `.env`.
   Em desenvolvimento use `stripe listen --forward-to localhost:8787/api/webhooks/stripe`.
3. **Service account do Firebase** (recomendado): Console Firebase → ⚙️ Configurações →
   Contas de serviço → *Gerar nova chave privada* → salve o `.json` e aponte
   `FIREBASE_SERVICE_ACCOUNT` para ele. Com ela o servidor **valida o valor real do
   pedido** antes de cobrar e grava `paid/refunded` via webhook. Sem ela o sistema
   continua funcionando em modo degradado (o app do cliente grava o status).
4. **PIX**: ative em Dashboard → Settings → Payment methods → **Pix** (conta BR).
   Enquanto não estiver ativo, o app oferece cartão como alternativa automaticamente.
5. **Stripe Connect** (repasses ao entregador): ative em
   https://dashboard.stripe.com/connect (tipo **Express**). O entregador faz o
   onboarding pela Carteira do app; a aprovação de saque no painel transfere o valor.
6. **Cartões de teste**: `4242 4242 4242 4242` (aprova), `4000 0000 0000 0002` (recusa) —
   qualquer validade futura e CVV.

### Endpoints do servidor

| Método | Rota | Uso |
|---|---|---|
| GET | `/health` (`?deep=1`) | diagnóstico (usado pelo botão *Testar conexão*) |
| GET | `/config` | chave publicável + moeda |
| POST | `/api/payments/checkout-session` | Stripe Checkout (cartão); `saveCard: true` guarda o cartão p/ 1 toque |
| POST | `/api/payments/payment-intent` | PaymentIntent p/ **Apple Pay/Google Pay** nativos no app (clientSecret) |
| POST | `/api/payments/pix-intent` | cobrança PIX (QR + copia-e-cola) |
| GET | `/api/payments/status` | consulta/concilia status de pagamento |
| POST | `/api/payments/refund` | estorno (admin ou dono da loja) |
| GET/DELETE | `/api/payments/saved-methods[/:id]` | cartões salvos do usuário (listar/remover) |
| POST | `/api/payments/charge-saved` | pagamento em 1 toque com cartão salvo (`kind: order\|tip`) |
| POST | `/api/payments/tip-checkout` | gorjeta pós-entrega via Checkout |
| POST | `/api/payments/item-refund` | reembolso self-service por item (cliente), com teto automático |
| POST | `/api/notifications/send` | relay de push Expo (notificações transacionais) |
| POST | `/api/payments/wallet/:provider` | cobrança **PicPay/NuPay** (QR + link para o app da carteira) |
| GET | `/api/payments/wallet/:provider/status` | status/conciliação da carteira |
| POST | `/api/webhooks/picpay` | callback do PicPay (valida `x-seller-token`) |
| POST | `/api/webhooks/stripe` | webhook da Stripe |
| POST | `/api/connect/account-link` | onboarding Connect do entregador |
| GET | `/api/connect/status` | status da conta Connect |
| POST | `/api/connect/payout` | repasse de saque (admin) |

Todos os endpoints `/api/*` (exceto webhook) exigem `Authorization: Bearer <Firebase ID token>`.

Variáveis opcionais do servidor: `SELF_REFUND_LIMIT_BRL` (teto do reembolso
automático, padrão 50) e `MAX_TIP_BRL` (teto de gorjeta, padrão 200).

### Carteiras BR: PicPay e NuPay

Os apps consultam `GET /config` e **só exibem as carteiras habilitadas** —
sem credenciais, nada muda para o usuário.

- **PicPay**: gere o `x-picpay-token` e o *seller token* no painel do lojista
  PicPay e preencha `PICPAY_TOKEN`/`PICPAY_SELLER_TOKEN`. O servidor cria a
  cobrança (QR + link), o callback (`/api/webhooks/picpay`) concilia e o
  **estorno do painel roteia automaticamente para o PicPay** quando o pedido
  foi pago lá.
- **NuPay (Nubank)**: a oferta para e-commerce exige credenciamento comercial
  (direto com o Nubank ou via PSP parceiro). A integração está pronta como
  "costura": preencha `NUPAY_API_URL`/`NUPAY_API_KEY` do parceiro e ajuste o
  contrato em `server/index.js` (bloco NuPay) se o esquema do PSP divergir.

### Estado do PIX na conta

A preferência de exibição do Pix já foi ligada via API, mas a *capability*
`pix_payments` de contas BR **só ativa pelo Dashboard**: acesse
Settings → Payment methods → **Pix** → Ativar (pode pedir a conclusão do
cadastro da conta). Até lá o app oferece cartão automaticamente e o servidor
responde `409 pixUnavailable` — nenhuma mudança de código é necessária depois
da ativação.

### Novidades da plataforma (ver ROADMAP.md)

- **Cashback/carteira**: defina o % em Configurações → Comercial; o valor é
  espelhado em `platformConfig/public` e creditado na carteira do cliente a
  cada entrega. O saldo vira desconto no checkout.
- **Dashboard**: KPIs com variação vs. semana anterior + alertas proativos
  (cancelamentos, pagamentos travados, aprovações pendentes, falta de
  entregadores online).
- **Financeiro**: gorjetas somam ao repasse do entregador (100% dele) e nunca
  entram na comissão da plataforma.

## 🔁 Operações de pagamento no painel

- **Estorno**: Pedidos → abrir pedido → *Estornar*. Se o pedido tem pagamento Stripe,
  o estorno é executado **de verdade** no gateway e registrado; senão, só o registro
  contábil (devolução manual).
- **Saques dos entregadores**: Financeiro → Saques → aprovar. Com o servidor
  configurado e o entregador com Connect ativo, o valor é transferido automaticamente.
- **Diagnóstico**: Configurações → Integrações → *Testar conexão*.

## 🆘 Problemas comuns

| Sintoma | Causa provável | Correção |
|---|---|---|
| `Testar conexão` falha | servidor fora do ar / CORS | confira o host e `ALLOWED_ORIGINS` |
| PIX retorna erro 409 | método não ativado na Stripe | ative Pix no dashboard |
| Estorno "sem PaymentIntent" | pedido pago na entrega ou anterior à integração | devolução manual |
| Webhook não marca pago | sem `FIREBASE_SERVICE_ACCOUNT` | gere a service account (passo 3) |
