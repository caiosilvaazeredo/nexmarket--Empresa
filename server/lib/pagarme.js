/**
 * Cliente HTTP mínimo da API Pagar.me v5 (https://docs.pagar.me — REST puro,
 * sem SDK oficial em Node). Autenticação: HTTP Basic com a secret key como
 * usuário e senha vazia — igual ao padrão Stripe que este servidor usava
 * antes, só troca a chave.
 *
 * Endpoints usados: clientes, pedidos (checkout com split), cobranças
 * (estorno), recebedores (onboarding de loja/entregador) e transferências
 * (repasse sob demanda ao entregador).
 *
 * ⚠️ `createTransfer` usa `POST /recipients/{id}/transfers`, seguindo o
 * padrão REST aninhado do resto da API v5 — mas a documentação pública não
 * confirmou 100% esse path (a extração automática retornou `POST /transfers`
 * com significado ambíguo do campo `recipient_id`). Antes de operar em
 * produção, valide contra a coleção oficial do Postman da Pagar.me/Stone
 * (link enviado pela equipe deles) e ajuste se necessário.
 */
const API_BASE = 'https://api.pagar.me/core/v5';

function authHeader(secretKey) {
  return `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;
}

export function createPagarmeClient(secretKey) {
  if (!secretKey) return null;

  async function request(path, { method = 'GET', body, query } = {}) {
    const qs = query
      ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v != null)).toString()
      : '';
    const res = await fetch(`${API_BASE}${path}${qs}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader(secretKey),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message =
        json?.message ||
        (Array.isArray(json?.errors) ? json.errors.map((e) => e.message || JSON.stringify(e)).join('; ') : null) ||
        `Pagar.me respondeu ${res.status}.`;
      throw Object.assign(new Error(message), {
        statusCode: res.status >= 400 && res.status < 500 ? 400 : 502,
        pagarmeStatus: res.status,
        pagarmeBody: json,
      });
    }
    return json;
  }

  return {
    /* -------------------------------- Clientes -------------------------------- */
    createCustomer: (data) => request('/customers', { method: 'POST', body: data }),
    getCustomer: (id) => request(`/customers/${id}`),
    listCustomerCards: (customerId) => request(`/customers/${customerId}/cards`),
    createCustomerCard: (customerId, data) =>
      request(`/customers/${customerId}/cards`, { method: 'POST', body: data }),
    deleteCustomerCard: (customerId, cardId) =>
      request(`/customers/${customerId}/cards/${cardId}`, { method: 'DELETE' }),

    /* -------------------------------- Pedidos --------------------------------- */
    createOrder: (data) => request('/orders', { method: 'POST', body: data }),
    getPagarmeOrder: (id) => request(`/orders/${id}`),

    /* -------------------------------- Cobranças -------------------------------- */
    getCharge: (id) => request(`/charges/${id}`),
    /** Cancela (total ou parcialmente, via `amount` em centavos) uma cobrança já paga. */
    cancelCharge: (id, amount) =>
      request(`/charges/${id}/cancel`, { method: 'POST', body: amount ? { amount } : undefined }),

    /* ------------------------------- Recebedores ------------------------------- */
    createRecipient: (data) => request('/recipients', { method: 'POST', body: data }),
    getRecipient: (id) => request(`/recipients/${id}`),
    updateRecipient: (id, data) => request(`/recipients/${id}`, { method: 'PUT', body: data }),
    getRecipientBalance: (id) => request(`/recipients/${id}/balance`),

    /* ----------------------------- Transferências ------------------------------ */
    createTransfer: (recipientId, amount, metadata) =>
      request(`/recipients/${recipientId}/transfers`, {
        method: 'POST',
        body: { amount, ...(metadata ? { metadata } : {}) },
      }),
  };
}

/** Cria um token de cartão no client-side — NUNCA chame isto do servidor com
 * a secret key; documentado aqui só para referência dos apps (usa a
 * PUBLIC key via query `appId`, sem Basic Auth). Ver src/lib/payments.ts de
 * cada app cliente para a implementação real. */
export const CLIENT_TOKEN_ENDPOINT = 'https://api.pagar.me/core/v5/tokens';
