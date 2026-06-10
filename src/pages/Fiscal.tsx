import { useMemo, useState } from 'react';
import { FileText, Download, Bike, Store as StoreIcon, Save, FileSpreadsheet } from 'lucide-react';
import { Page, PageHeader } from '../components/layout/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { Stat } from '../components/ui/Stat';
import { Button } from '../components/ui/Button';
import { Tabs } from '../components/ui/Tabs';
import { Select } from '../components/ui/Input';
import { Avatar } from '../components/ui/Avatar';
import { DataTable, type Column } from '../components/ui/Table';
import { useSub } from '../hooks/useSub';
import { usePermission } from '../hooks/usePermission';
import { useUIStore } from '../store/useUIStore';
import { subscribeRecentOrders } from '../lib/orders';
import { subscribeStores } from '../lib/stores';
import { subscribeDrivers } from '../lib/drivers';
import { subscribePlatformConfig } from '../lib/platform';
import { DEFAULT_COMMISSION_PCT, DEFAULT_FIXED_FEE } from '../lib/finance';
import { buildDriverReports, buildStoreReports, downloadInformePdf, saveFiscalBatch } from '../lib/fiscal';
import { brl, brlCompact, maskCpf, maskCnpj, num } from '../lib/format';
import type { Order, Supermarket, DriverProfile, PlatformConfig, FiscalReport } from '../lib/types';

export default function Fiscal() {
  const { can } = usePermission();
  const toast = useUIStore((s) => s.toast);
  const orders = useSub<Order[]>((cb) => subscribeRecentOrders(1000, cb), []);
  const stores = useSub<Supermarket[]>(subscribeStores, []);
  const drivers = useSub<DriverProfile[]>(subscribeDrivers, []);
  const config = useSub<PlatformConfig | null>(subscribePlatformConfig, null);

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [tab, setTab] = useState<'driver' | 'store'>('driver');

  const feeFor = useMemo(() => {
    const map = new Map(stores.map((s) => [s.id, s]));
    return (smId: string) => {
      const s = map.get(smId);
      return {
        commissionPct: s?.fees?.commissionPct ?? config?.defaultCommissionPct ?? DEFAULT_COMMISSION_PCT,
        fixedFee: s?.fees?.fixedFee ?? config?.defaultFixedFee ?? DEFAULT_FIXED_FEE,
      };
    };
  }, [stores, config]);

  const driverReports = useMemo(() => buildDriverReports(orders, year, drivers), [orders, year, drivers]);
  const storeReports = useMemo(() => buildStoreReports(orders, year, stores, feeFor), [orders, year, stores, feeFor]);
  const reports = tab === 'driver' ? driverReports : storeReports;

  const totalGross = reports.reduce((s, r) => s + r.totalGross, 0);
  const canGenerate = can('fiscal.generate');
  const company = { name: config?.companyName, cnpj: config?.companyCnpj };

  const saveBatch = async () => {
    await saveFiscalBatch(reports, year, tab);
    toast(`${reports.length} informes registrados no histórico.`, 'success');
  };

  const columns: Column<FiscalReport>[] = [
    {
      key: 'party',
      header: tab === 'driver' ? 'Entregador' : 'Loja',
      render: (r) => (
        <div className="flex items-center gap-3">
          <Avatar name={r.partyName} size={34} />
          <div className="min-w-0">
            <p className="font-bold text-slate-700 dark:text-slate-100 truncate">{r.partyName}</p>
            <p className="text-xs text-slate-400">{r.document ? (tab === 'driver' ? maskCpf(r.document) : maskCnpj(r.document)) : '—'}</p>
          </div>
        </div>
      ),
    },
    { key: 'count', header: tab === 'driver' ? 'Entregas' : 'Pedidos', align: 'right', hideOnMobile: true, render: (r) => num(r.ordersCount) },
    { key: 'gross', header: 'Bruto', align: 'right', render: (r) => <span className="font-bold">{brl(r.totalGross)}</span> },
    { key: 'fees', header: 'Retenções', align: 'right', hideOnMobile: true, render: (r) => brl(r.totalFees) },
    { key: 'net', header: 'Líquido', align: 'right', render: (r) => <span className="font-bold text-brand-dark">{brl(r.totalNet)}</span> },
    {
      key: 'pdf',
      header: '',
      align: 'right',
      render: (r) => (
        <Button size="sm" variant="outline" onClick={() => downloadInformePdf(r, company)}>
          <Download className="w-4 h-4" /> PDF
        </Button>
      ),
    },
  ];

  const years = Array.from({ length: 4 }, (_, i) => currentYear - i);

  return (
    <Page>
      <PageHeader
        title="Fiscal · Imposto de Renda"
        subtitle="Informe de Rendimentos (DIRF) de entregadores e lojas"
        icon={<FileText className="w-6 h-6" />}
        actions={
          <div className="flex items-center gap-2">
            <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-auto">
              {years.map((y) => (
                <option key={y} value={y}>Ano {y}</option>
              ))}
            </Select>
            {canGenerate && reports.length > 0 && (
              <Button variant="secondary" onClick={saveBatch}><Save className="w-4 h-4" /> Salvar lote</Button>
            )}
          </div>
        }
      >
        <Tabs
          active={tab}
          onChange={(k) => setTab(k as any)}
          tabs={[
            { key: 'driver', label: 'Entregadores', count: driverReports.length },
            { key: 'store', label: 'Lojas', count: storeReports.length },
          ]}
        />
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <Stat label={`Beneficiários ${year}`} value={num(reports.length)} icon={tab === 'driver' ? <Bike className="w-5 h-5" /> : <StoreIcon className="w-5 h-5" />} tone="indigo" />
        <Stat label="Total bruto declarado" value={brlCompact(totalGross)} icon={<FileSpreadsheet className="w-5 h-5" />} tone="brand" />
        <Stat label="Ano-calendário" value={String(year)} icon={<FileText className="w-5 h-5" />} tone="slate" />
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title={`Informes de ${year} — ${tab === 'driver' ? 'Entregadores (autônomos)' : 'Lojas parceiras'}`}
          subtitle="Gere o PDF normatizado individualmente ou salve o lote no histórico"
        />
        <DataTable
          columns={columns}
          rows={reports}
          rowKey={(r) => r.id}
          emptyIcon={<FileText className="w-7 h-7" />}
          emptyTitle="Sem rendimentos no período"
          emptyDescription="Não há movimentações para gerar informes neste ano."
        />
      </Card>

      <p className="text-xs text-slate-400 mt-4 max-w-2xl">
        Os valores consideram os pedidos carregados em tempo real. Para o fechamento anual oficial, conecte um
        backend que percorra todos os pedidos do ano-calendário e gere a DIRF consolidada.
      </p>
    </Page>
  );
}
