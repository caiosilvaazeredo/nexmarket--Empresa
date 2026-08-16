# 🛡️ Nexmarket · Painel Administrativo (Empresa)

> 📘 **[MANUAL.md](./MANUAL.md)** — como rodar, buildar e publicar o painel e o **servidor de pagamentos Stripe** (`server/`).

**Backoffice** da plataforma **Nexmarket** — o sistema interno usado pelos
**funcionários** (Atendimento, Financeiro, Compliance e Administradores) para
operar toda a plataforma de delivery de supermercados, no estilo *iFood / Uber
Eats — visão da empresa*.

É **totalmente integrado** aos outros três apps (`nexmarket--loja`,
`nexmarket--entregador`, `nexmarket--cliente`): os quatro compartilham o **mesmo
projeto Firebase e o mesmo banco Firestore nomeado** (`firebase-applet-config.json`).
Mantém a **identidade visual “Duolingo”** (verde `#58CC02`, botões 3D, tipografia
forte, cantos arredondados) dos demais apps.

> **Web **e** app:** é uma SPA **Vite + React** que também é um **PWA instalável**
> (manifest + service worker). No navegador, use *“Instalar app”* / *“Adicionar à
> tela inicial”* para abri-lo como aplicativo em tela cheia — mesma base de código.

---

## 🧱 Stack

Mesma toolchain do app da loja, para a plataforma ficar em uma stack só:

**Vite 6 · React 19 · TypeScript · Tailwind CSS v4 · Firebase 12 (Auth +
Firestore + Storage) · React Router 7 · Zustand · Recharts · Leaflet (OSM) ·
jsPDF · lucide-react · motion.**

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # gera dist/ (PWA pronto p/ hospedar)
npm run lint     # type-check (tsc --noEmit)
```

---

## ✨ Funcionalidades (mapa dos requisitos)

| RF | Funcionalidade | Onde |
|---|---|---|
| RF01 | Lista de entregadores por status (pendente/aprovado/recusado/bloqueado) | `pages/Drivers.tsx` |
| RF02 | Ver documentos em alta resolução · **Aprovar / Pedir reenvio (c/ motivo) / Bloquear** | `components/DocumentViewer.tsx`, `lib/drivers.ts` |
| RF03 | Cadastro, aprovação e **taxas personalizadas** por loja | `pages/Stores.tsx`, `lib/stores.ts` |
| RF04 | **Visão 360º** (cliente/loja/entregador): histórico, pedidos, faturamento, avaliações | drawers em `Drivers/Stores/Customers` |
| RF05 | Caixa unificada de **tickets** por prioridade e canal (cliente/loja/entregador) | `pages/Support.tsx`, `lib/tickets.ts` |
| RF06 | **Chat em tempo real** do suporte com qualquer ponta (+ Mesa de Resolução) | `components/ChatPanel.tsx`, `lib/tickets.ts` |
| RF07 | **Macros** (respostas rápidas) e **estorno** total/parcial em 2 cliques | `pages/Support.tsx`, `pages/Orders.tsx`, `lib/orders.ts` |
| RF08 | Conciliação: **GMV**, Receita da plataforma, **Split** e repasses | `pages/Finance.tsx`, `lib/finance.ts` |
| RF09 | **Informe de Rendimentos (DIRF)** anual em PDF p/ entregadores e lojas | `pages/Fiscal.tsx`, `lib/fiscal.ts` |
| RF10 | Cupons patrocinados — **quem paga** (Nexmarket × Loja) | `pages/Campaigns.tsx`, `lib/campaigns.ts` |
| RF11 | **“God Mode”**: mapa em tempo real + **Zonas de Calor** | `pages/LiveOps.tsx`, `components/map/LiveMap.tsx` |

| RNF | Como | Onde |
|---|---|---|
| RNF01 | **RBAC** — perfis estritos (master/atendimento/financeiro/compliance/leitura) | `lib/rbac.ts`, `components/layout/RoleGate.tsx` |
| RNF02 | **Trilha de auditoria** imutável (quem/quando/o quê + antes/depois) | `lib/audit.ts`, `pages/AuditLog.tsx` |
| RNF03 | **Signed URLs** p/ documentos (CNH, IR) — nunca URLs públicas abertas | `lib/storage.ts` |
| RNF04 | **Paginação server-side / rolagem** em grids grandes | `lib/orders.ts` (`fetchOrdersPage`), `components/ui/Table.tsx` |
| RNF05 | **Integrações** (Gateways de pagamento, Background check) como *seams* | `pages/Settings.tsx`, `.env.example` |

Outras telas: **Dashboard** (KPIs, GMV, formas de pagamento, mapa, filas) e
**Operadores** (convites + RBAC).

---

## 🔗 Integração & ajustes no banco

Tudo lê/escreve o **mesmo Firestore** dos outros apps. Coleções existentes são
lidas; o painel **modera** alguns campos (aprovação de entregador/loja, estorno,
status de saque) e introduz coleções **somente-admin**:

```
/admins/{uid}                 ★ operadores (RBAC)        /tickets/{id}(+/messages)  ★ helpdesk
/adminInvites/{email}         ★ convites                 /auditLogs/{id}            ★ auditoria (append-only)
/blacklist/{cpf}              ★ fraude                    /settlements/{id}          ★ repasses
/campaigns/{id}               ★ cupons patrocinados       /fiscalReports/{id}        ★ informes de IR
/platformConfig/main          ★ taxas & integrações
```

### ⚠️ Mudança obrigatória nas Security Rules
As `firestore.rules` da plataforma **eram deployadas pelo `nexmarket--loja`** e
tinham `isAdmin()` **desativado** (`return false`). Este repositório traz a
versão **canônica e mesclada** (`firestore.rules`) que:

- **liga o papel de admin** — bootstrap pelo e-mail root (`caiosazeredo@cos.ufrj.br`,
  igual ao `lib/admins.ts`) ou por **convite**;
- dá ao admin leitura global (`orders`/`payouts` via *collection-group*) e
  escrita de moderação em `drivers`, `supermarkets`, `customers`, `orders`;
- adiciona as coleções admin acima.

Deploy (a partir do dono do projeto):
```bash
firebase deploy --only firestore:rules,firestore:indexes
```
Os índices necessários (collection-group de `orders`/`payouts`) estão em
`firestore.indexes.json`. **Nenhuma alteração de código é exigida nos outros três
apps** — apenas publicar estas regras + índices.

---

## 🔐 Acesso & RBAC

O **primeiro acesso** é o e-mail root (`VITE_ROOT_ADMIN_EMAIL`), que entra como
**master** automaticamente. A partir daí, em **Operadores**, convide outros
e-mails e atribua um perfil:

| Perfil | Vê / pode |
|---|---|
| **Master** | tudo, inclusive Operadores e Configurações |
| **Atendimento** | dashboard, entregadores (leitura), lojas (leitura), clientes, pedidos, **suporte**, mapa, **estornos** |
| **Financeiro** | dashboard, pedidos, **financeiro**, **fiscal**, **campanhas** |
| **Compliance** | dashboard, **validação de entregadores/lojas**, clientes, pedidos, **auditoria** |
| **Leitura** | visão somente-leitura |

> RBAC é aplicado na navegação + rotas e, nas escritas mais sensíveis, nas
> *Security Rules*. Em produção, reforce com *custom claims* + Cloud Functions.

---

## 🚀 Deploy (web)

```bash
npm run build
firebase deploy --only hosting        # publica dist/ (SPA + PWA)
```
`firebase.json` já traz `firestore`, `indexes` e `hosting` (com rewrite SPA e
`no-cache` no service worker).

### Variáveis de ambiente (`.env`, opcionais — ver `.env.example`)
`VITE_ROOT_ADMIN_EMAIL`, `VITE_PAYMENTS_*` (gateway p/ split/estornos),
`VITE_BACKGROUND_CHECK_API_URL`, `VITE_MAP_TILES_URL`. Tudo degrada com
elegância sem elas.

---

## 🧭 Estrutura

```
src/
  lib/        firebase, types, rbac, audit, drivers, stores, customers, orders,
              tickets, finance, fiscal, campaigns, blacklist, platform, storage,
              geo, seed, status, format, nav
  store/      useAuthStore, useUIStore (zustand)
  hooks/      useCollection, useSub, usePermission
  components/ ui/ (Button, Card, Badge, Modal, Drawer, Table, Tabs, Stat…),
              layout/ (Sidebar, AppShell, PageHeader, RoleGate),
              charts/ (Recharts), map/ (Leaflet), DocumentViewer, ChatPanel
  pages/      Login, Dashboard, Drivers, Stores, Customers, Orders, Support,
              LiveOps, Finance, Fiscal, Campaigns, AuditLog, Admins, Settings
firestore.rules · firestore.indexes.json · firebase.json
public/       manifest.webmanifest · sw.js · ícones (PWA)
```

### Dados de demonstração
Em **Configurações → Dados de demonstração**, o master pode popular o painel
(lojas, entregadores com documentos, clientes, pedidos, tickets, campanha) —
tudo marcado como `demo: true` e removível com um clique.

---

## 🗓️ Calendário de pagamentos (temporalidade)

`Configurações → Calendário de pagamentos` define, separadamente para
**lojas** e **entregadores**:

| Parâmetro | O que faz |
|---|---|
| Frequência | diário (dias úteis), semanal, quinzenal ou mensal |
| Dia | dia da semana (semanal/quinzenal) ou do mês (1–28) |
| Carência | D+N após a entrega até o valor ficar disponível |
| Valor mínimo | abaixo disso o valor acumula para o próximo ciclo |
| Transferência automática | envia pela Stripe Connect ao fechar o ciclo |

Fica em `platformConfig/main` e é espelhado em `platformConfig/public`, de
onde os apps da **loja** e do **entregador** leem para mostrar ao parceiro
quando ele recebe e qual é a data do próximo pagamento
(`src/lib/payoutSchedule.ts` calcula a próxima data).

## 💳 Servidor de pagamentos e Stripe

```bash
cd server
cp .env.example .env      # preencha STRIPE_SECRET_KEY e o resto
npm install
npm run doctor            # diagnóstico da configuração + API real
npm start
```

`npm run doctor` responde objetivamente se a Stripe está funcionando: valida o
par de chaves (recusa misturar test/live), conecta na API, confere se a conta
pode cobrar e sacar, lista se **cartão e PIX** estão habilitados, verifica se
há **webhook** apontando para o `PUBLIC_URL` com os eventos necessários e se o
**Connect** está ativo. Com `--deep` ele cria e cancela um PaymentIntent real
de R$ 1,00.

```bash
npm test                              # 15 testes: falha segura, validações, rotas
STRIPE_SECRET_KEY=sk_test_... npm test  # + integração real (cartão, recusa, estorno, webhook)
```

Os testes de integração são **pulados** sem a chave e **recusam rodar com
chave de produção** (`sk_live_`).

---

## 👤 Conta única e e-mails transacionais

O mesmo e-mail passa a ser **uma única pessoa** nos quatro apps
(`identities/{email}`), com papéis acumuláveis e senha única. O disparo de
e-mails de cadastro e recuperação de senha sai deste servidor via **Resend**.

📘 **[server/GUIA-EMAIL-E-CONTAS.md](./server/GUIA-EMAIL-E-CONTAS.md)** — como
ligar o e-mail em ~5 minutos e como a identidade unificada funciona.
