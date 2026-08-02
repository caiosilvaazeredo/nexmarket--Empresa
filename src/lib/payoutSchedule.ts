import type { PayoutCadence, PayoutSchedule } from './types';

/**
 * Calendário de repasses (temporalidade dos pagamentos).
 *
 * A plataforma define de quanto em quanto tempo loja e entregador recebem,
 * qual a carência após a entrega (D+N) e o valor mínimo por repasse. O painel
 * grava em `platformConfig/main` e espelha em `platformConfig/public` para os
 * apps do entregador e da loja mostrarem "próximo pagamento" ao parceiro.
 */

export const CADENCE_LABELS: Record<PayoutCadence, string> = {
  daily: 'Diário',
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
  monthly: 'Mensal',
};

export const WEEKDAY_LABELS = [
  '', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo',
];

export const DEFAULT_STORE_PAYOUT: Required<PayoutSchedule> = {
  cadence: 'weekly',
  weekday: 5, // sexta
  monthDay: 5,
  holdDays: 7,
  minimumAmount: 0,
  autoTransfer: false,
};

export const DEFAULT_DRIVER_PAYOUT: Required<PayoutSchedule> = {
  cadence: 'weekly',
  weekday: 2, // terça
  monthDay: 5,
  holdDays: 1,
  minimumAmount: 20,
  autoTransfer: false,
};

export function withDefaults(
  s: PayoutSchedule | undefined,
  fallback: Required<PayoutSchedule>,
): Required<PayoutSchedule> {
  return {
    cadence: s?.cadence ?? fallback.cadence,
    weekday: s?.weekday ?? fallback.weekday,
    monthDay: s?.monthDay ?? fallback.monthDay,
    holdDays: s?.holdDays ?? fallback.holdDays,
    minimumAmount: s?.minimumAmount ?? fallback.minimumAmount,
    autoTransfer: s?.autoTransfer ?? fallback.autoTransfer,
  };
}

/** Normaliza o que veio do formulário para valores gravitáveis e coerentes. */
export function sanitizeSchedule(
  s: PayoutSchedule,
  fallback: Required<PayoutSchedule>,
): Required<PayoutSchedule> {
  const merged = withDefaults(s, fallback);
  const clamp = (v: number, min: number, max: number) =>
    Math.min(max, Math.max(min, Math.round(Number.isFinite(v) ? v : min)));
  return {
    cadence: (['daily', 'weekly', 'biweekly', 'monthly'] as PayoutCadence[]).includes(merged.cadence)
      ? merged.cadence
      : fallback.cadence,
    weekday: clamp(Number(merged.weekday), 1, 7),
    // 28 é o maior dia que existe em todo mês — evita pular fevereiro.
    monthDay: clamp(Number(merged.monthDay), 1, 28),
    holdDays: clamp(Number(merged.holdDays), 0, 90),
    minimumAmount: Math.max(0, Number(merged.minimumAmount) || 0),
    autoTransfer: !!merged.autoTransfer,
  };
}

/** Frase curta para exibir ao parceiro: "Toda sexta · liberado em D+7". */
export function describeSchedule(s: PayoutSchedule | undefined, fallback: Required<PayoutSchedule>): string {
  const c = withDefaults(s, fallback);
  const when =
    c.cadence === 'daily'
      ? 'Todo dia útil'
      : c.cadence === 'monthly'
        ? `Todo dia ${c.monthDay}`
        : c.cadence === 'biweekly'
          ? `A cada 15 dias (${WEEKDAY_LABELS[c.weekday]})`
          : `Toda ${WEEKDAY_LABELS[c.weekday]?.toLowerCase()}`;
  const hold = c.holdDays > 0 ? ` · liberado em D+${c.holdDays}` : '';
  const min = c.minimumAmount > 0 ? ` · mínimo R$ ${c.minimumAmount.toFixed(2)}` : '';
  return `${when}${hold}${min}`;
}

const dayOnly = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Converte weekday 1..7 (seg..dom) para o getDay() do JS (0=dom). */
const toJsDay = (weekday: number) => (weekday === 7 ? 0 : weekday);

/**
 * Próxima data de repasse a partir de `from` (padrão: hoje).
 *
 * - `daily`: próximo dia útil (pula sábado e domingo);
 * - `weekly`: próximo dia da semana escolhido;
 * - `biweekly`: mesmo dia da semana, saltando para daqui a 14 dias quando a
 *   ocorrência mais próxima está a menos de 7 dias;
 * - `monthly`: dia do mês escolhido, no mês seguinte se já passou.
 */
export function nextPayoutDate(
  s: PayoutSchedule | undefined,
  fallback: Required<PayoutSchedule>,
  from: Date = new Date(),
): Date {
  const c = withDefaults(s, fallback);
  const base = dayOnly(from);

  if (c.cadence === 'daily') {
    const d = new Date(base);
    do {
      d.setDate(d.getDate() + 1);
    } while (d.getDay() === 0 || d.getDay() === 6);
    return d;
  }

  if (c.cadence === 'monthly') {
    const d = new Date(base.getFullYear(), base.getMonth(), c.monthDay);
    if (d <= base) d.setMonth(d.getMonth() + 1);
    return d;
  }

  const target = toJsDay(c.weekday);
  const d = new Date(base);
  let delta = (target - d.getDay() + 7) % 7;
  if (delta === 0) delta = 7; // hoje já passou: vai para a próxima ocorrência
  d.setDate(d.getDate() + delta);
  if (c.cadence === 'biweekly' && delta < 7) d.setDate(d.getDate() + 7);
  return d;
}

/** Data em que um valor entregue em `deliveredAt` fica disponível (D+N). */
export function availableFrom(
  s: PayoutSchedule | undefined,
  fallback: Required<PayoutSchedule>,
  deliveredAt: Date,
): Date {
  const c = withDefaults(s, fallback);
  const d = dayOnly(deliveredAt);
  d.setDate(d.getDate() + c.holdDays);
  return d;
}

export const formatDate = (d: Date) =>
  d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
