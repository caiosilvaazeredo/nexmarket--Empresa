/**
 * Client do SERVIDOR DE PAGAMENTOS (pasta server/ deste repositório).
 *
 * O painel nunca fala com a Stripe diretamente: estornos e repasses rodam no
 * backend com a chave secreta; aqui só circulam o token Firebase do operador
 * e os identificadores do pedido/saque (RNF05).
 */
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from './firebase';

/** URL do servidor: platformConfig/main.paymentsApiUrl > VITE_PAYMENTS_API_URL. */
export async function resolvePaymentsApiUrl(): Promise<string> {
  try {
    const snap = await getDoc(doc(db, 'platformConfig', 'main'));
    const fromConfig = snap.exists() ? String(snap.data().paymentsApiUrl || '') : '';
    if (fromConfig.trim()) return fromConfig.trim().replace(/\/$/, '');
  } catch {
    // sem permissão/offline → tenta o fallback de build
  }
  return (import.meta.env.VITE_PAYMENTS_API_URL || '').trim().replace(/\/$/, '');
}

async function api<T>(
  base: string,
  path: string,
  init?: RequestInit & { query?: Record<string, string> },
): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Sessão expirada — faça login novamente.');
  const qs = init?.query ? `?${new URLSearchParams(init.query).toString()}` : '';
  const res = await fetch(`${base}${path}${qs}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(body?.error || `Servidor de pagamentos respondeu ${res.status}.`);
    err.notOnline = !!body?.notOnline;
    err.connectUnavailable = !!body?.connectUnavailable;
    throw err;
  }
  return body as T;
}

export interface GatewayHealth {
  ok: boolean;
  stripe: boolean;
  firestoreAdmin: boolean;
  webhookConfigured: boolean;
  currency: string;
  stripeAccountLive?: boolean;
}

/** Diagnóstico do servidor (não requer login — usado no “Testar conexão”). */
export async function gatewayHealth(url: string): Promise<GatewayHealth> {
  const res = await fetch(`${url.replace(/\/$/, '')}/health?deep=1`);
  if (!res.ok) throw new Error(`Servidor respondeu ${res.status}.`);
  return res.json();
}

/** Estorno REAL na Stripe. Lança erro com `notOnline=true` quando o pedido não
 * tem pagamento online associado (aí só o registro contábil local se aplica). */
export async function gatewayRefund(input: {
  smId: string;
  orderId: string;
  paymentIntentId?: string;
  amount?: number;
  reason?: string;
}): Promise<{ ok: boolean; refundId: string; amount: number }> {
  const base = await resolvePaymentsApiUrl();
  if (!base) throw Object.assign(new Error('Servidor de pagamentos não configurado.'), { notConfigured: true });
  return api(base, '/api/payments/refund', { method: 'POST', body: JSON.stringify(input) });
}

/** Repasse de saque do entregador via Stripe Connect. */
export async function gatewayPayout(input: {
  driverId: string;
  amount: number;
  payoutId?: string;
}): Promise<{ ok: boolean; transferId: string; amount: number }> {
  const base = await resolvePaymentsApiUrl();
  if (!base) throw Object.assign(new Error('Servidor de pagamentos não configurado.'), { notConfigured: true });
  return api(base, '/api/connect/payout', { method: 'POST', body: JSON.stringify(input) });
}

export async function paymentsGatewayConfigured(): Promise<boolean> {
  return (await resolvePaymentsApiUrl()).length > 0;
}
