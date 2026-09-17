/**
 * Regras comerciais da fase piloto — fonte única de verdade para comissão,
 * frete e taxa de serviço (documento "NexMarket — Regras comerciais
 * fechadas", mercado Unidos/Km 32).
 *
 * Usado pelo checkout (server/index.js) para montar o split da loja e
 * validar valores; espelhado em client-side em cada app (ver src/lib/fees.ts)
 * para exibir estimativas antes de finalizar o pedido.
 */

export const MIN_ORDER_BRL = 40;
/** Comissão retida da loja sobre o subtotal de produtos — loja fica com 90%. */
export const COMMISSION_PCT = 0.10;

const DELIVERY_BASE_KM = 4;
const DELIVERY_BASE_CHARGED = 10.0;
const DELIVERY_BASE_PAID = 7.5;
const MOTO_MAX_KM = 8;
const MOTO_PER_KM_CHARGED = 1.7;
const MOTO_PER_KM_PAID = 1.5;
const CARRO_PER_KM_CHARGED = 2.8;
const CARRO_PER_KM_PAID = 2.4;

const SERVICE_FEE_FLOOR = 1.49;
const SERVICE_FEE_FLOOR_MAX_SUBTOTAL = 60;
const SERVICE_FEE_PCT = 0.025;
const SERVICE_FEE_CEIL = 3.49;
const SERVICE_FEE_CEIL_MIN_SUBTOTAL = 140;

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Frete por distância (km em linha reta loja → cliente):
 *  · até 4km: R$10,00 cobrado / R$7,50 repassado ao entregador
 *  · 4-8km (moto): +R$1,70/km cobrado / +R$1,50/km repassado
 *  · acima de 8km (carro): +R$2,80/km cobrado / +R$2,40/km repassado
 */
export function calcDeliveryFee(distanceKm) {
  const km = Math.max(0, Number(distanceKm) || 0);
  let charged = DELIVERY_BASE_CHARGED;
  let paid = DELIVERY_BASE_PAID;
  if (km > DELIVERY_BASE_KM) {
    const motoKm = Math.min(km, MOTO_MAX_KM) - DELIVERY_BASE_KM;
    charged += motoKm * MOTO_PER_KM_CHARGED;
    paid += motoKm * MOTO_PER_KM_PAID;
  }
  if (km > MOTO_MAX_KM) {
    const carroKm = km - MOTO_MAX_KM;
    charged += carroKm * CARRO_PER_KM_CHARGED;
    paid += carroKm * CARRO_PER_KM_PAID;
  }
  charged = round2(charged);
  paid = round2(paid);
  return { charged, paid, platformMargin: round2(charged - paid) };
}

/** Taxa de serviço: piso R$1,49 (carrinho ≤R$60) · 2,5% (R$60-140) · teto
 * R$3,49 (≥R$140) — 100% retida pela plataforma. */
export function calcServiceFee(subtotal) {
  const s = Math.max(0, Number(subtotal) || 0);
  if (s <= SERVICE_FEE_FLOOR_MAX_SUBTOTAL) return SERVICE_FEE_FLOOR;
  if (s >= SERVICE_FEE_CEIL_MIN_SUBTOTAL) return SERVICE_FEE_CEIL;
  return round2(s * SERVICE_FEE_PCT);
}

/** Comissão da plataforma sobre o subtotal de produtos (10%). */
export function calcCommission(subtotal) {
  return round2(Number(subtotal || 0) * COMMISSION_PCT);
}

export function meetsMinimumOrder(subtotal) {
  return Number(subtotal || 0) >= MIN_ORDER_BRL;
}

/** Quebra completa de um pedido a partir do subtotal de produtos e da
 * distância até o cliente. */
export function calcOrderBreakdown({ subtotal, distanceKm = 0, fulfillment = 'delivery' }) {
  const sub = round2(Number(subtotal || 0));
  const isDelivery = fulfillment !== 'pickup';
  const delivery = isDelivery ? calcDeliveryFee(distanceKm) : { charged: 0, paid: 0, platformMargin: 0 };
  const serviceFee = calcServiceFee(sub);
  const commission = calcCommission(sub);
  const total = round2(sub + delivery.charged + serviceFee);
  return {
    subtotal: sub,
    deliveryFee: delivery.charged,
    deliveryPaidToDriver: delivery.paid,
    serviceFee,
    total,
    storeCommission: commission,
    storeNet: round2(sub - commission),
    meetsMinimum: meetsMinimumOrder(sub),
  };
}
