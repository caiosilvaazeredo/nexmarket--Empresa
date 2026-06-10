/** Formatting helpers (pt-BR). Shared across every screen. */

export function brl(value: number | undefined | null): string {
  const n = typeof value === 'number' && isFinite(value) ? value : 0;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Compact currency for KPI tiles: R$ 1,2 mi / R$ 340 mil. */
export function brlCompact(value: number | undefined | null): string {
  const n = typeof value === 'number' && isFinite(value) ? value : 0;
  if (Math.abs(n) >= 1_000_000) return `R$ ${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (Math.abs(n) >= 1_000) return `R$ ${(n / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return brl(n);
}

export function num(value: number | undefined | null): string {
  const n = typeof value === 'number' && isFinite(value) ? value : 0;
  return n.toLocaleString('pt-BR');
}

export function pct(value: number | undefined | null, digits = 1): string {
  const n = typeof value === 'number' && isFinite(value) ? value : 0;
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: digits })}%`;
}

/** Accepts a Firestore Timestamp, ISO string, Date, or epoch millis. */
export function toDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
  if (typeof value === 'number') return new Date(value);
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDate(value: any): string {
  const d = toDate(value);
  return d ? d.toLocaleDateString('pt-BR') : '—';
}

export function formatDateTime(value: any): string {
  const d = toDate(value);
  return d
    ? d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
}

export function timeAgo(value: any): string {
  const d = toDate(value);
  if (!d) return '—';
  const diff = Date.now() - d.getTime();
  const s = Math.round(diff / 1000);
  if (s < 60) return 'agora';
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  const days = Math.round(h / 24);
  if (days < 30) return `há ${days} d`;
  return formatDate(value);
}

/* ----------------------------- Documents ----------------------------- */
export function onlyDigits(s: string | undefined | null): string {
  return (s || '').replace(/\D+/g, '');
}

export function maskCpf(s: string | undefined | null): string {
  const d = onlyDigits(s).slice(0, 11);
  if (d.length !== 11) return s || '—';
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function maskCnpj(s: string | undefined | null): string {
  const d = onlyDigits(s).slice(0, 14);
  if (d.length !== 14) return s || '—';
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function maskPhone(s: string | undefined | null): string {
  const d = onlyDigits(s);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s || '—';
}

export function initials(name: string | undefined | null): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function truncate(s: string | undefined | null, n = 60): string {
  const str = s || '';
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

/** Deterministic pastel-ish color from a string (avatars, chips). */
export function colorFromString(s: string | undefined | null): string {
  const str = s || '?';
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 65% 45%)`;
}
