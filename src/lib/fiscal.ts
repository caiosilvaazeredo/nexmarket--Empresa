import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import { db } from './firebase';
import { logAudit } from './audit';
import { toDate, brl, maskCpf, maskCnpj } from './format';
import type { Order, FiscalReport, DriverProfile, Supermarket } from './types';
import type { FeeResolver } from './finance';

/**
 * Build per-party annual income reports (RF09 — Informe de Rendimentos / DIRF).
 *  • Drivers are autônomos: gross = total earned (driverEarnings) in the year.
 *  • Stores: gross = sum of subtotals, fees = platform commission withheld.
 */
export function buildDriverReports(
  orders: Order[],
  year: number,
  drivers: DriverProfile[],
): FiscalReport[] {
  const byDriver = new Map<string, { gross: number; count: number }>();
  for (const o of orders) {
    const d = toDate(o.deliveredAt || o.createdAt);
    if (!d || d.getFullYear() !== year) continue;
    if (!o.driverId) continue;
    if (o.status === 'cancelled') continue;
    const cur = byDriver.get(o.driverId) || { gross: 0, count: 0 };
    cur.gross += o.driverEarnings || 0;
    cur.count += 1;
    byDriver.set(o.driverId, cur);
  }
  const nameOf = new Map(drivers.map((d) => [d.uid, d]));
  return Array.from(byDriver.entries())
    .filter(([, v]) => v.gross > 0)
    .map(([partyId, v]) => {
      const drv = nameOf.get(partyId);
      return {
        id: `${year}_driver_${partyId}`,
        year,
        type: 'driver' as const,
        partyId,
        partyName: drv?.name || partyId,
        document: drv?.cpf || drv?.bank?.cpf,
        totalGross: v.gross,
        totalFees: 0,
        totalNet: v.gross,
        ordersCount: v.count,
      };
    })
    .sort((a, b) => b.totalGross - a.totalGross);
}

export function buildStoreReports(
  orders: Order[],
  year: number,
  stores: Supermarket[],
  feeFor: FeeResolver,
): FiscalReport[] {
  const byStore = new Map<string, { gross: number; fees: number; count: number }>();
  for (const o of orders) {
    const d = toDate(o.deliveredAt || o.createdAt);
    if (!d || d.getFullYear() !== year) continue;
    if (o.status === 'cancelled') continue;
    const subtotal = o.subtotal ?? Math.max(0, (o.total || 0) - (o.deliveryFee || 0));
    const { commissionPct, fixedFee } = feeFor(o.supermarketId);
    const commission = (subtotal * commissionPct) / 100 + fixedFee;
    const cur = byStore.get(o.supermarketId) || { gross: 0, fees: 0, count: 0 };
    cur.gross += subtotal;
    cur.fees += commission;
    cur.count += 1;
    byStore.set(o.supermarketId, cur);
  }
  const nameOf = new Map(stores.map((s) => [s.id, s]));
  return Array.from(byStore.entries())
    .filter(([, v]) => v.gross > 0)
    .map(([partyId, v]) => {
      const st = nameOf.get(partyId);
      return {
        id: `${year}_store_${partyId}`,
        year,
        type: 'store' as const,
        partyId,
        partyName: st?.name || partyId,
        document: st?.cnpj,
        totalGross: v.gross,
        totalFees: v.fees,
        totalNet: v.gross - v.fees,
        ordersCount: v.count,
      };
    })
    .sort((a, b) => b.totalGross - a.totalGross);
}

/** Generate a normatized Informe de Rendimentos PDF and trigger the download. */
export function downloadInformePdf(
  report: FiscalReport,
  company: { name?: string; cnpj?: string } = {},
) {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = pdf.internal.pageSize.getWidth();
  const M = 48;

  pdf.setFillColor(0x58, 0xcc, 0x02);
  pdf.rect(0, 0, W, 96, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.text('Nexmarket', M, 44);
  pdf.setFontSize(13);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Informe de Rendimentos', M, 68);
  pdf.setFontSize(10);
  pdf.text(`Ano-calendário ${report.year}`, W - M, 68, { align: 'right' });

  pdf.setTextColor(30, 41, 59);
  let y = 140;
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Fonte Pagadora', M, y);
  pdf.setFont('helvetica', 'normal');
  pdf.text(company.name || 'Nexmarket Tecnologia Ltda.', M, y + 18);
  if (company.cnpj) pdf.text(`CNPJ ${maskCnpj(company.cnpj)}`, M, y + 34);

  y += 70;
  pdf.setFont('helvetica', 'bold');
  pdf.text(report.type === 'driver' ? 'Beneficiário (Prestador autônomo)' : 'Beneficiário (Loja parceira)', M, y);
  pdf.setFont('helvetica', 'normal');
  pdf.text(report.partyName || report.partyId, M, y + 18);
  if (report.document) {
    const docLabel = report.type === 'driver' ? maskCpf(report.document) : maskCnpj(report.document);
    pdf.text(`${report.type === 'driver' ? 'CPF' : 'CNPJ'} ${docLabel}`, M, y + 34);
  }

  y += 78;
  const rows: [string, string][] = [
    ['Total bruto recebido no ano', brl(report.totalGross)],
    ['Retenções / Comissão da plataforma', brl(report.totalFees)],
    ['Valor líquido', brl(report.totalNet)],
    ['Pedidos / entregas no período', String(report.ordersCount ?? 0)],
  ];
  pdf.setDrawColor(226, 232, 240);
  rows.forEach(([label, value], i) => {
    const ry = y + i * 30;
    if (i % 2 === 0) {
      pdf.setFillColor(248, 250, 252);
      pdf.rect(M, ry - 18, W - M * 2, 28, 'F');
    }
    pdf.setFont('helvetica', 'normal');
    pdf.text(label, M + 10, ry);
    pdf.setFont('helvetica', 'bold');
    pdf.text(value, W - M - 10, ry, { align: 'right' });
  });

  y += rows.length * 30 + 40;
  pdf.setFontSize(8);
  pdf.setTextColor(100, 116, 139);
  pdf.text(
    'Documento gerado automaticamente pela plataforma Nexmarket para fins de declaração de imposto de renda. ' +
      'Os valores referem-se a operações intermediadas pela plataforma no ano-calendário indicado.',
    M,
    y,
    { maxWidth: W - M * 2 },
  );
  pdf.text(`Emitido em ${new Date().toLocaleString('pt-BR')}`, M, y + 28);

  const safe = (report.partyName || report.partyId).replace(/[^a-z0-9]+/gi, '_').slice(0, 40);
  pdf.save(`informe_${report.year}_${report.type}_${safe}.pdf`);
}

/* ----------------------- Persisted report history ----------------------- */
export function subscribeFiscalReports(cb: (r: FiscalReport[]) => void) {
  return onSnapshot(
    query(collection(db, 'fiscalReports'), orderBy('createdAt', 'desc')),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as FiscalReport))),
    () => cb([]),
  );
}

export async function saveFiscalBatch(reports: FiscalReport[], year: number, type: 'driver' | 'store') {
  for (const r of reports) {
    await addDoc(collection(db, 'fiscalReports'), {
      year: r.year,
      type: r.type,
      partyId: r.partyId,
      partyName: r.partyName ?? null,
      document: r.document ?? null,
      totalGross: r.totalGross,
      totalFees: r.totalFees,
      totalNet: r.totalNet,
      ordersCount: r.ordersCount ?? 0,
      generatedBy: null,
      createdAt: serverTimestamp(),
    });
  }
  await logAudit({
    action: 'fiscal.generate',
    target: `Informe ${type} · ${year}`,
    targetType: 'config',
    after: { count: reports.length, year, type },
  });
}
