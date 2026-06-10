import { useMemo, useState } from 'react';
import { ScrollText, Search as SearchIcon, ShieldCheck } from 'lucide-react';
import { Page, PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge, type BadgeTone } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { SearchInput, Select } from '../components/ui/Input';
import { DataTable, type Column } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { useSub } from '../hooks/useSub';
import { subscribeAuditLogs } from '../lib/audit';
import { formatDateTime, timeAgo } from '../lib/format';
import type { AuditLog } from '../lib/types';

function actionTone(action: string): BadgeTone {
  if (action.includes('approve') || action.includes('pay')) return 'green';
  if (action.includes('reject') || action.includes('block') || action.includes('refund') || action.includes('suspend') || action.includes('blacklist')) return 'red';
  if (action.includes('hold') || action.includes('flag')) return 'amber';
  if (action.startsWith('fiscal') || action.startsWith('settlement') || action.startsWith('config')) return 'indigo';
  return 'slate';
}

const ACTION_GROUPS = [
  { key: 'all', label: 'Todas as ações' },
  { key: 'driver', label: 'Entregadores' },
  { key: 'store', label: 'Lojas' },
  { key: 'order', label: 'Pedidos' },
  { key: 'payout', label: 'Financeiro' },
  { key: 'settlement', label: 'Repasses' },
  { key: 'ticket', label: 'Suporte' },
  { key: 'admin', label: 'Operadores' },
];

export default function AuditLog() {
  const logs = useSub<AuditLog[]>((cb) => subscribeAuditLogs(300, cb), []);
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('all');
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return logs
      .filter((l) => group === 'all' || l.action.startsWith(group))
      .filter((l) => !q || l.actorName?.toLowerCase().includes(q) || l.target?.toLowerCase().includes(q) || l.action.toLowerCase().includes(q));
  }, [logs, search, group]);

  const columns: Column<AuditLog>[] = [
    {
      key: 'action',
      header: 'Ação',
      render: (l) => <Badge tone={actionTone(l.action)}>{l.action}</Badge>,
    },
    {
      key: 'target',
      header: 'Alvo',
      render: (l) => <span className="text-slate-700 dark:text-slate-200 font-medium">{l.target || '—'}</span>,
    },
    {
      key: 'actor',
      header: 'Operador',
      hideOnMobile: true,
      render: (l) => (
        <div className="flex items-center gap-2">
          <Avatar name={l.actorName} size={28} />
          <span className="text-slate-600 dark:text-slate-300">{l.actorName || l.actorId}</span>
        </div>
      ),
    },
    { key: 'when', header: 'Quando', align: 'right', render: (l) => <span className="text-slate-400" title={formatDateTime(l.createdAt)}>{timeAgo(l.createdAt)}</span> },
  ];

  return (
    <Page>
      <PageHeader
        title="Trilha de auditoria"
        subtitle="Registro imutável de todas as ações sensíveis (RNF02)"
        icon={<ScrollText className="w-6 h-6" />}
        actions={
          <div className="flex items-center gap-2">
            <Select value={group} onChange={(e) => setGroup(e.target.value)} className="w-auto">
              {ACTION_GROUPS.map((g) => (
                <option key={g.key} value={g.key}>{g.label}</option>
              ))}
            </Select>
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar operador, alvo…" className="w-full sm:w-64" />
          </div>
        }
      />

      <Card className="overflow-hidden">
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(l) => l.id}
          onRowClick={(l) => setSelected(l)}
          emptyIcon={<ShieldCheck className="w-7 h-7" />}
          emptyTitle="Nenhum registro"
          emptyDescription="As ações dos operadores serão registradas aqui."
        />
      </Card>

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Detalhe do registro" size="lg">
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge tone={actionTone(selected.action)}>{selected.action}</Badge>
              <span className="text-sm text-slate-400">{formatDateTime(selected.createdAt)}</span>
            </div>
            <Detail label="Alvo" value={selected.target} />
            <Detail label="Operador" value={`${selected.actorName || selected.actorId}${selected.actorRole ? ` · ${selected.actorRole}` : ''}`} />
            {selected.note && <Detail label="Observação" value={selected.note} />}
            <div className="grid grid-cols-2 gap-3">
              <JsonBox label="Antes" value={selected.before} />
              <JsonBox label="Depois" value={selected.after} />
            </div>
          </div>
        )}
      </Modal>
    </Page>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] font-bold text-slate-400 uppercase">{label}</p>
      <p className="font-medium text-slate-700 dark:text-slate-200">{value}</p>
    </div>
  );
}

function JsonBox({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-[11px] font-bold text-slate-400 uppercase mb-1">{label}</p>
      <pre className="text-xs bg-slate-50 dark:bg-slate-800 rounded-xl p-3 overflow-x-auto text-slate-600 dark:text-slate-300 max-h-40">
        {value ? JSON.stringify(value, null, 2) : '—'}
      </pre>
    </div>
  );
}
