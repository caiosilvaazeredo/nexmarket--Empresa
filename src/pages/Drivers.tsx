import { useMemo, useState, type ReactNode } from 'react';
import {
  Bike,
  Star,
  ShieldCheck,
  ShieldX,
  Ban,
  CheckCircle2,
  Search as SearchIcon,
  CircleSlash,
  Phone,
  Mail,
  CreditCard,
  RefreshCw,
} from 'lucide-react';
import { Page, PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Tabs } from '../components/ui/Tabs';
import { SearchInput } from '../components/ui/Input';
import { DataTable, type Column } from '../components/ui/Table';
import { Drawer } from '../components/ui/Drawer';
import { confirm } from '../components/ui/Confirm';
import { DocumentViewer } from '../components/DocumentViewer';
import { useSub } from '../hooks/useSub';
import { usePermission } from '../hooks/usePermission';
import { useUIStore } from '../store/useUIStore';
import {
  subscribeDrivers,
  driverApprovalOf,
  setDriverApproval,
  reviewDriverDoc,
  runBackgroundCheck,
  type DriverDocKey,
} from '../lib/drivers';
import { addToBlacklist } from '../lib/blacklist';
import { driverApprovalBadge } from '../lib/status';
import { maskCpf, maskPhone, timeAgo } from '../lib/format';
import type { DriverProfile, DriverApprovalStatus, DocStatus } from '../lib/types';

const TABS = [
  { key: 'pending', label: 'Pendentes' },
  { key: 'approved', label: 'Aprovados' },
  { key: 'rejected', label: 'Recusados' },
  { key: 'blocked', label: 'Bloqueados' },
  { key: 'all', label: 'Todos' },
];

const DOCS: { key: DriverDocKey; label: string; urlField: keyof NonNullable<DriverProfile['documents']> }[] = [
  { key: 'cnh', label: 'CNH', urlField: 'cnhUrl' },
  { key: 'vehicleDoc', label: 'CRLV (Veículo)', urlField: 'vehicleDocUrl' },
  { key: 'profilePhoto', label: 'Selfie / Rosto', urlField: 'profilePhotoUrl' },
  { key: 'proofOfResidence', label: 'Comp. Residência', urlField: 'proofOfResidenceUrl' },
];

export default function Drivers() {
  const drivers = useSub<DriverProfile[]>(subscribeDrivers, []);
  const [tab, setTab] = useState('pending');
  const [search, setSearch] = useState('');
  const [selectedUid, setSelectedUid] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { pending: 0, approved: 0, rejected: 0, blocked: 0, all: drivers.length };
    drivers.forEach((d) => (c[driverApprovalOf(d)] = (c[driverApprovalOf(d)] || 0) + 1));
    return c;
  }, [drivers]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return drivers
      .filter((d) => tab === 'all' || driverApprovalOf(d) === tab)
      .filter((d) =>
        !q ||
        d.name?.toLowerCase().includes(q) ||
        d.email?.toLowerCase().includes(q) ||
        (d.cpf || '').includes(q) ||
        d.vehicle?.plate?.toLowerCase().includes(q),
      )
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [drivers, tab, search]);

  const selected = drivers.find((d) => d.uid === selectedUid) || null;

  const columns: Column<DriverProfile>[] = [
    {
      key: 'name',
      header: 'Entregador',
      render: (d) => (
        <div className="flex items-center gap-3">
          <Avatar name={d.name} src={d.documents?.profilePhotoUrl} size={40} />
          <div className="min-w-0">
            <p className="font-bold text-slate-700 dark:text-slate-100 truncate">{d.name || 'Sem nome'}</p>
            <p className="text-xs text-slate-400 truncate">{d.email || maskCpf(d.cpf)}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'vehicle',
      header: 'Veículo',
      hideOnMobile: true,
      render: (d) => (
        <span className="text-slate-600 dark:text-slate-300">
          {d.vehicle?.model || d.vehicle?.type || '—'}
          {d.vehicle?.plate ? ` · ${d.vehicle.plate}` : ''}
        </span>
      ),
    },
    {
      key: 'rating',
      header: 'Avaliação',
      hideOnMobile: true,
      render: (d) => (
        <span className="inline-flex items-center gap-1 font-bold text-slate-600 dark:text-slate-300">
          <Star className="w-4 h-4 text-amber-400 fill-amber-400" /> {(d.rating ?? 5).toFixed(1)}
        </span>
      ),
    },
    { key: 'created', header: 'Cadastro', hideOnMobile: true, render: (d) => <span className="text-slate-400">{timeAgo(d.createdAt)}</span> },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      render: (d) => {
        const b = driverApprovalBadge(driverApprovalOf(d));
        return <Badge tone={b.tone}>{b.label}</Badge>;
      },
    },
  ];

  return (
    <Page>
      <PageHeader
        title="Entregadores"
        subtitle="Validação de documentos, onboarding e compliance"
        icon={<Bike className="w-6 h-6" />}
        actions={<SearchInput value={search} onChange={setSearch} placeholder="Buscar nome, CPF, placa…" className="w-full sm:w-72" />}
      >
        <Tabs tabs={TABS.map((t) => ({ ...t, count: counts[t.key] }))} active={tab} onChange={setTab} />
      </PageHeader>

      <Card className="overflow-hidden">
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(d) => d.uid}
          onRowClick={(d) => setSelectedUid(d.uid)}
          emptyIcon={<SearchIcon className="w-7 h-7" />}
          emptyTitle="Nenhum entregador"
          emptyDescription="Não há entregadores nesta categoria."
        />
      </Card>

      <DriverDrawer driver={selected} onClose={() => setSelectedUid(null)} />
    </Page>
  );
}

function DriverDrawer({ driver, onClose }: { driver: DriverProfile | null; onClose: () => void }) {
  const { can } = usePermission();
  const toast = useUIStore((s) => s.toast);
  const canReview = can('drivers.review');
  if (!driver) return null;

  const approval = driverApprovalOf(driver);
  const bc = driver.documents?.backgroundCheck;

  const act = async (status: DriverApprovalStatus, reasonNeeded?: boolean) => {
    let reason: string | undefined;
    if (reasonNeeded) {
      const ok = await confirm({
        title: status === 'blocked' ? 'Bloquear entregador' : 'Recusar cadastro',
        message:
          status === 'blocked'
            ? 'O entregador será bloqueado e ficará offline. Esta ação fica registrada na auditoria.'
            : 'O entregador será notificado para corrigir o cadastro.',
        danger: true,
        confirmLabel: status === 'blocked' ? 'Bloquear' : 'Recusar',
      });
      if (!ok) return;
    }
    await setDriverApproval(driver, status, reason);
    toast(
      status === 'approved' ? 'Entregador aprovado!' : status === 'blocked' ? 'Entregador bloqueado.' : 'Cadastro recusado.',
      status === 'approved' ? 'success' : 'info',
    );
  };

  const reviewDoc = async (key: DriverDocKey, status: DocStatus, reason?: string) => {
    await reviewDriverDoc(driver, key, status, reason);
    toast(status === 'approved' ? 'Documento aprovado.' : 'Documento recusado — reenvio solicitado.', 'success');
  };

  const blacklist = async () => {
    if (!driver.cpf) {
      toast('Entregador sem CPF cadastrado.', 'error');
      return;
    }
    const ok = await confirm({
      title: 'Bloquear e adicionar à blacklist',
      message: `O CPF ${maskCpf(driver.cpf)} será bloqueado permanentemente na plataforma.`,
      danger: true,
      confirmLabel: 'Bloquear definitivamente',
    });
    if (!ok) return;
    await addToBlacklist(driver.cpf, { name: driver.name, reason: 'Bloqueio via análise de entregador', scope: 'driver' });
    await setDriverApproval(driver, 'blocked', 'Adicionado à blacklist');
    toast('CPF adicionado à blacklist e entregador bloqueado.', 'info');
  };

  return (
    <Drawer open={!!driver} onClose={onClose} title={driver.name} subtitle={driver.email}>
      <div className="space-y-5">
        {/* Header card */}
        <Card className="p-5">
          <div className="flex items-center gap-4">
            <Avatar name={driver.name} src={driver.documents?.profilePhotoUrl} size={64} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-black text-lg text-slate-800 dark:text-slate-50">{driver.name}</h3>
                <Badge tone={driverApprovalBadge(approval).tone}>{driverApprovalBadge(approval).label}</Badge>
              </div>
              <div className="flex items-center gap-1 text-amber-500 font-bold text-sm mt-0.5">
                <Star className="w-4 h-4 fill-amber-400" /> {(driver.rating ?? 5).toFixed(1)}
                <span className="text-slate-400 font-medium ml-2">{driver.totalDeliveries ?? 0} entregas</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
            <Info icon={<Phone className="w-4 h-4" />} label="Telefone" value={maskPhone(driver.phone)} />
            <Info icon={<Mail className="w-4 h-4" />} label="E-mail" value={driver.email || '—'} />
            <Info icon={<CreditCard className="w-4 h-4" />} label="CPF" value={maskCpf(driver.cpf)} />
            <Info icon={<Bike className="w-4 h-4" />} label="Veículo" value={`${driver.vehicle?.model || driver.vehicle?.type || '—'} ${driver.vehicle?.plate || ''}`} />
          </div>
        </Card>

        {/* Background check */}
        <Card className="p-4 flex items-center gap-3">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${bc?.status === 'clear' ? 'bg-brand-soft text-brand-dark' : bc?.status === 'flagged' ? 'bg-danger-soft text-danger' : 'bg-warn-soft text-amber-600'}`}>
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm text-slate-700 dark:text-slate-200">Antecedentes / Detran</p>
            <p className="text-xs text-slate-400">
              {bc?.status === 'clear' ? 'Sem restrições' : bc?.status === 'flagged' ? 'Restrição encontrada' : bc?.status === 'pending' ? 'Verificação em andamento' : 'Não verificado'}
            </p>
          </div>
          {canReview && (
            <Button size="sm" variant="outline" onClick={() => runBackgroundCheck(driver)}>
              <RefreshCw className="w-4 h-4" /> Verificar
            </Button>
          )}
        </Card>

        {/* Documents */}
        <div>
          <h4 className="font-bold text-slate-700 dark:text-slate-200 mb-3">Documentos enviados</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {DOCS.map((d) => (
              <DocumentViewer
                key={d.key}
                label={d.label}
                rawUrl={driver.documents?.[d.urlField] as string | undefined}
                review={driver.documents?.review?.[d.key]}
                canReview={canReview}
                onReview={(status, reason) => reviewDoc(d.key, status, reason)}
              />
            ))}
          </div>
        </div>

        {/* Global actions */}
        {canReview && (
          <div className="sticky bottom-0 -mx-5 px-5 py-4 bg-slate-50/95 dark:bg-slate-950/95 border-t-2 border-slate-100 dark:border-slate-800 backdrop-blur space-y-2">
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => act('approved')} disabled={approval === 'approved'}>
                <CheckCircle2 className="w-4 h-4" /> Aprovar entregador
              </Button>
              <Button variant="outline" className="text-amber-600" onClick={() => act('rejected', true)}>
                <ShieldX className="w-4 h-4" /> Recusar
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 text-danger" onClick={() => act('blocked', true)} disabled={approval === 'blocked'}>
                <Ban className="w-4 h-4" /> Bloquear
              </Button>
              <Button variant="danger" className="flex-1" onClick={blacklist}>
                <CircleSlash className="w-4 h-4" /> Blacklist (CPF)
              </Button>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}

function Info({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-slate-400 mt-0.5">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-slate-400 uppercase">{label}</p>
        <p className="font-medium text-slate-700 dark:text-slate-200 truncate">{value}</p>
      </div>
    </div>
  );
}
