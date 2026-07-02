# 🗺️ Nexmarket — Roadmap da Plataforma

Status dos requisitos funcionais inspirados em concorrentes (iFood, Uber, 99)
e das melhorias de UX/UI. Este arquivo é o canônico da plataforma (os quatro
repositórios evoluem juntos).

Legenda: ✅ implementado · 🟡 parcial (base pronta, falta evolução) · ⬜ planejado

## Descoberta e conversão

| # | Requisito | Status | Notas |
|---|---|---|---|
| 1 | Busca unificada multi-loja por item | ✅ | Aba Buscar → "Em todas as lojas": compara preços e permite trocar de loja. Escala: migrar para índice dedicado (Algolia/Typesense) quando o catálogo crescer |
| 1b | Filtros de busca (preço, promoções, marca, tags) | ✅ | Na loja atual; filtros por tempo de entrega/avaliação de loja ⬜ (exige rating por loja) |
| 2 | Recomendações ("Compre de novo", mais vendidos, vitrine por horário) | ✅ | Home do cliente. "Quem comprou X levou Y" ⬜ (exige co-ocorrência no backend) |
| 3 | Programa de fidelidade/clube (mensalidade + frete grátis) | ⬜ | Base pronta: Stripe Customer por usuário + Checkout `mode: subscription`; entitlement via webhook `customer.subscription.*` |
| 4 | Cashback e carteira digital | ✅ | % configurável em Configurações → Comercial; crédito automático na entrega; saldo usável no checkout |

## Pedido e pagamento

| # | Requisito | Status | Notas |
|---|---|---|---|
| 5 | Cartão salvo (1 toque, `setup_future_usage`) | ✅ | Checkout salva o cartão no Stripe Customer; pagamento off-session com fallback 3DS; gestão no Perfil |
| 5b | Apple Pay / Google Pay | ✅ | Ativos na conta Stripe (aparecem no Checkout hospedado) + botão nativo in-app via `@stripe/stripe-react-native` (requer dev build; Apple exige Merchant ID no Apple Developer) |
| 5c | PicPay | 🟡 | Integração completa (cobrança/QR/status/webhook/estorno) — falta o token do lojista PicPay (`PICPAY_TOKEN`); a opção só aparece nos apps quando configurado |
| 5d | NuPay (Nubank) | 🟡 | Costura pronta (mesma interface do PicPay); exige credenciamento comercial/PSP parceiro (`NUPAY_API_URL`/`NUPAY_API_KEY`) |
| 5e | Login com Google | ✅ | Nos 4 apps: web (popup Firebase) e mobile (expo-auth-session; requer client IDs OAuth no Google Cloud + provider Google habilitado no Firebase Auth) |
| 6 | Gorjeta ao entregador (checkout + pós-entrega) | ✅ | 100% do valor vai ao entregador (saldo + relatórios); pós-entrega paga em 1 toque ou Checkout |
| 7 | Pedido em grupo / listas recorrentes | ⬜ | Pedido em grupo exige carrinho compartilhado (doc próprio + link web). Listas: reaproveitar `useReorder` + agendamento existente |
| 8 | Divisão de pagamento | 🟡 | Saldo da carteira + cartão/PIX no mesmo pedido já funciona; split cartão+vale ⬜ |

## Logística

| # | Requisito | Status | Notas |
|---|---|---|---|
| 9 | ETA dinâmico com trânsito | ⬜ | Hoje: distância haversine + recálculo por localização ao vivo. Trânsito real exige Google Distance Matrix (chave paga) |
| 10 | Atribuição automática (cascata por proximidade/score) | 🟡 | Oferta com countdown existe; cascata servidor-side exige Cloud Function/worker de dispatch |
| 11 | Surge/frete dinâmico + missões | 🟡 | Surge automático por fila da loja ✅ (x1.5 ≥5 pedidos, x2 ≥10). Missões/incentivos ⬜ (Campanhas do painel são a base) |
| 12 | Batching (rota multi-pedido) | ⬜ | Exige dispatcher servidor-side (mesmo worker do item 10) |
| 13 | PIN de confirmação de entrega | ✅ | Cliente vê o código; entregador precisa digitá-lo (fallback: foto obrigatória) |

## Confiança e suporte

| # | Requisito | Status | Notas |
|---|---|---|---|
| 14 | Central de segurança | 🟡 | Entregador: botão de emergência (190/192 + compartilhar localização). Cliente: compartilhar acompanhamento. Detecção de anomalia de rota ⬜ |
| 15 | Reembolso self-service por item | ✅ | Estorno parcial automático até o teto (`SELF_REFUND_LIMIT_BRL`); acima vira análise |
| 16 | Bot de 1ª camada + ligação mascarada | ⬜ | FAQ existe no app; proxy de telefone exige Twilio/Zenvia |
| 17 | Score/níveis do entregador + turnos | 🟡 | Níveis Bronze→Diamante ✅ (entregas + nota). Benefícios reais atrelados e agenda de turnos ⬜ |

## Plataforma

| # | Requisito | Status | Notas |
|---|---|---|---|
| 18 | Push transacional completo | ✅ | Relay Expo no servidor; loja e entregador notificam o cliente em cada etapa. Requer projectId EAS no app (`eas build:configure`) |
| 19 | NF-e/cupom fiscal automático | ⬜ | Painel Fiscal é o esqueleto; emissão real exige certificado A1 + provedor (FocusNFe/eNotas) |
| 20 | Multi-endereço inteligente por localização | 🟡 | Banner "endereço primeiro" na home ✅; reverse-geocode automático na abertura ⬜ (`expo-location` já disponível) |

## UX/UI

| # | Melhoria | Status |
|---|---|---|
| C1 | Onboarding com endereço primeiro | ✅ banner acionável na home |
| C2 | Skeleton loaders | ✅ home do cliente (componente reutilizável `Skeleton.tsx`) |
| C3 | Tracker animado estilo "pizza tracker" | ✅ barra de progresso + pulso no passo atual |
| C4 | Carrinho persistente + stepper no card | ✅ já existia (CartBar + stepper); mantido |
| C5 | Preço/unidade nos cards (R$ X / kg) | ✅ |
| C6 | Estados vazios acionáveis | ✅ home ("Ver outras lojas") e busca ("Buscar em todas as lojas") |
| E7 | Waze/Google Maps + heat map | ✅ deep links (preferência do entregador) · heat map de demanda ⬜ |
| E8 | Oferta com countdown circular + R$/km | ✅ |
| E9 | Resumo gamificado (meta diária) | ✅ barra de meta + troféu; streaks ⬜ |
| L10 | Campainha + destaque de pedido novo + timer de aceite | ✅ som sintetizado + pulso + "aguardando há X min" |
| L11 | Kanban de pedidos com drag-and-drop | ✅ Novo → Separação → Pronto → Em entrega |
| A12 | Dashboard com comparativos + alertas proativos | ✅ Δ% vs semana anterior + alertas (cancelamento, pagamentos travados, aprovações, sem entregadores) |
| T13 | Acessibilidade (alvos ≥44px, contraste, labels) | 🟡 alvos de toque ok nos componentes base; auditoria completa ⬜ |
| T14 | Feedback háptico e otimista | ✅ háptica nas ações-chave; escrita otimista já coberta pelo Firestore local-first |
