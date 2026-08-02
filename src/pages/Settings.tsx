import { useEffect, useState } from 'react';
import {
  Settings as SettingsIcon,
  Percent,
  Plug,
  CircleSlash,
  Plus,
  Trash2,
  Database,
  Smartphone,
  Building2,
  Save,
  CalendarClock,
} from 'lucide-react';
import { Page, PageHeader } from '../components/layout/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import {
  CADENCE_LABELS,
  DEFAULT_DRIVER_PAYOUT,
  DEFAULT_STORE_PAYOUT,
  WEEKDAY_LABELS,
  describeSchedule,
  formatDate,
  nextPayoutDate,
  sanitizeSchedule,
  withDefaults,
} from '../lib/payoutSchedule';
import type { PayoutCadence, PayoutSchedule } from '../lib/types';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { confirm } from '../components/ui/Confirm';
import { useSub } from '../hooks/useSub';
import { useUIStore } from '../store/useUIStore';
import { subscribePlatformConfig, savePlatformConfig } from '../lib/platform';
import { gatewayHealth, type GatewayHealth } from '../lib/payments';
import { subscribeBlacklist, addToBlacklist, removeFromBlacklist } from '../lib/blacklist';
import { seedDemoData, clearDemoData } from '../lib/seed';
import { maskCpf } from '../lib/format';
import type { PlatformConfig, BlacklistEntry } from '../lib/types';

export default function Settings() {
  const toast = useUIStore((s) => s.toast);
  const config = useSub<PlatformConfig | null>(subscribePlatformConfig, null);
  const blacklist = useSub<BlacklistEntry[]>(subscribeBlacklist, []);

  const [form, setForm] = useState<PlatformConfig>({});
  useEffect(() => {
    if (config) setForm(config);
  }, [config]);

  const set = (patch: Partial<PlatformConfig>) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    await savePlatformConfig({
      defaultCommissionPct: Number(form.defaultCommissionPct) || 0,
      defaultFixedFee: Number(form.defaultFixedFee) || 0,
      cashbackPct: Number(form.cashbackPct) || 0,
      companyName: form.companyName || '',
      companyCnpj: form.companyCnpj || '',
      paymentsProvider: form.paymentsProvider || '',
      paymentsApiUrl: form.paymentsApiUrl || '',
      backgroundCheckApiUrl: form.backgroundCheckApiUrl || '',
      storePayout: sanitizeSchedule(form.storePayout ?? {}, DEFAULT_STORE_PAYOUT),
      driverPayout: sanitizeSchedule(form.driverPayout ?? {}, DEFAULT_DRIVER_PAYOUT),
    });
    toast('Configurações salvas.', 'success');
  };

  return (
    <Page>
      <PageHeader
        title="Configurações"
        subtitle="Parâmetros da plataforma, integrações e dados"
        icon={<SettingsIcon className="w-6 h-6" />}
        actions={<Button onClick={save}><Save className="w-4 h-4" /> Salvar</Button>}
      />

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Commercial */}
        <Card className="p-5">
          <CardHeader title="Comercial" subtitle="Taxas padrão e dados da empresa" icon={<Percent className="w-5 h-5 text-brand-dark" />} className="p-0 mb-4" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Comissão padrão %"><Input type="number" value={form.defaultCommissionPct ?? ''} onChange={(e) => set({ defaultCommissionPct: Number(e.target.value) })} placeholder="12" /></Field>
            <Field label="Taxa fixa padrão R$"><Input type="number" value={form.defaultFixedFee ?? ''} onChange={(e) => set({ defaultFixedFee: Number(e.target.value) })} placeholder="0.99" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <Field label="Razão social"><Input value={form.companyName ?? ''} onChange={(e) => set({ companyName: e.target.value })} placeholder="Nexmarket Ltda." /></Field>
            <Field label="CNPJ"><Input value={form.companyCnpj ?? ''} onChange={(e) => set({ companyCnpj: e.target.value })} placeholder="00.000.000/0001-00" /></Field>
          </div>
          <div className="mt-3">
            <Field label="Cashback ao cliente (%)" hint="Creditado na carteira do cliente a cada pedido entregue (0 desliga).">
              <Input type="number" value={form.cashbackPct ?? ''} onChange={(e) => set({ cashbackPct: Number(e.target.value) })} placeholder="2" />
            </Field>
          </div>
        </Card>

        {/* Payout schedule (temporalidade dos pagamentos) */}
        <Card className="p-5">
          <CardHeader
            title="Calendário de pagamentos"
            subtitle="Quando lojas e entregadores recebem"
            icon={<CalendarClock className="w-5 h-5 text-brand-dark" />}
            className="p-0 mb-4"
          />
          <div className="space-y-5">
            <ScheduleEditor
              title="Lojas parceiras"
              value={form.storePayout}
              fallback={DEFAULT_STORE_PAYOUT}
              onChange={(storePayout) => set({ storePayout })}
            />
            <div className="border-t border-slate-100 dark:border-slate-800" />
            <ScheduleEditor
              title="Entregadores"
              value={form.driverPayout}
              fallback={DEFAULT_DRIVER_PAYOUT}
              onChange={(driverPayout) => set({ driverPayout })}
            />
          </div>
        </Card>

        {/* Integrations */}
        <Card className="p-5">
          <CardHeader title="Integrações" subtitle="Gateways e serviços externos (RNF05)" icon={<Plug className="w-5 h-5 text-accent" />} className="p-0 mb-4" />
          <div className="space-y-3">
            <Field label="Gateway de pagamento (Split/estornos)"><Input value={form.paymentsProvider ?? ''} onChange={(e) => set({ paymentsProvider: e.target.value })} placeholder="stripe · pagarme · mercadopago" /></Field>
            <Field label="Endpoint de pagamentos (servidor)" hint="Servidor da pasta server/ deste repositório — estornos e repasses rodam nele com a chave secreta da Stripe.">
              <Input value={form.paymentsApiUrl ?? ''} onChange={(e) => set({ paymentsApiUrl: e.target.value })} placeholder="https://pagamentos.suaempresa.com" />
            </Field>
            <PaymentsHealthCheck url={form.paymentsApiUrl || ''} />
            <Field label="API de background check (CPF/Detran)"><Input value={form.backgroundCheckApiUrl ?? ''} onChange={(e) => set({ backgroundCheckApiUrl: e.target.value })} placeholder="https://api.checagora.com" /></Field>
          </div>
        </Card>

        {/* Blacklist */}
        <Card className="p-5">
          <CardHeader title="Blacklist de CPFs" subtitle="Bloqueio permanente na plataforma" icon={<CircleSlash className="w-5 h-5 text-danger" />} className="p-0 mb-4" />
          <BlacklistForm />
          <div className="mt-4 space-y-2 max-h-64 overflow-y-auto">
            {blacklist.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Nenhum CPF bloqueado.</p>}
            {blacklist.map((b) => (
              <div key={b.cpf} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm text-slate-700 dark:text-slate-200">{maskCpf(b.cpf)}</p>
                  <p className="text-xs text-slate-400 truncate">{b.name || '—'} · {b.reason || 'sem motivo'}</p>
                </div>
                <Badge tone="slate">{b.scope || 'all'}</Badge>
                <button onClick={() => removeFromBlacklist(b.cpf)} className="text-slate-400 hover:text-danger"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </Card>

        {/* Demo + PWA */}
        <div className="space-y-5">
          <DemoCard />
          <Card className="p-5">
            <CardHeader title="Instalar como app" subtitle="Web e aplicativo na mesma base" icon={<Smartphone className="w-5 h-5 text-info" />} className="p-0 mb-3" />
            <p className="text-sm text-slate-500 dark:text-slate-300">
              Este painel é um <b>PWA</b>: no navegador (desktop ou celular) use <b>“Instalar app”</b> /
              <b> “Adicionar à tela inicial”</b> para abri-lo como aplicativo, em tela cheia e com ícone próprio.
            </p>
          </Card>
        </div>
      </div>
    </Page>
  );
}

/** Diagnóstico do servidor de pagamentos (server/): Stripe, webhook e Firestore admin. */
function PaymentsHealthCheck({ url }: { url: string }) {
  const [checking, setChecking] = useState(false);
  const [health, setHealth] = useState<GatewayHealth | null>(null);
  const [error, setError] = useState('');

  const check = async () => {
    if (!url.trim()) {
      setError('Preencha o endpoint acima antes de testar.');
      setHealth(null);
      return;
    }
    setChecking(true);
    setError('');
    setHealth(null);
    try {
      setHealth(await gatewayHealth(url.trim()));
    } catch (e: any) {
      setError(e?.message || 'Não foi possível conectar ao servidor de pagamentos.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button variant="secondary" onClick={check} disabled={checking}>
        <Plug className="w-4 h-4" /> {checking ? 'Testando…' : 'Testar conexão'}
      </Button>
      {error && <p className="text-xs font-bold text-danger">{error}</p>}
      {health && (
        <div className="flex flex-wrap gap-2">
          <Badge tone={health.stripe ? 'green' : 'red'}>Stripe {health.stripe ? 'OK' : 'falhou'}</Badge>
          <Badge tone={health.stripeAccountLive ? 'amber' : 'blue'}>{health.stripeAccountLive ? 'Modo LIVE' : 'Modo TESTE'}</Badge>
          <Badge tone={health.webhookConfigured ? 'green' : 'amber'}>Webhook {health.webhookConfigured ? 'configurado' : 'pendente'}</Badge>
          <Badge tone={health.firestoreAdmin ? 'green' : 'amber'}>Firestore admin {health.firestoreAdmin ? 'ativo' : 'inativo'}</Badge>
        </div>
      )}
    </div>
  );
}

function BlacklistForm() {
  const toast = useUIStore((s) => s.toast);
  const [cpf, setCpf] = useState('');
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');

  const add = async () => {
    if (!cpf.trim()) return;
    try {
      await addToBlacklist(cpf, { name: name.trim() || undefined, reason: reason.trim() || undefined, scope: 'all' });
      toast('CPF adicionado à blacklist.', 'success');
      setCpf('');
      setName('');
      setReason('');
    } catch (e: any) {
      toast(e?.message || 'CPF inválido.', 'error');
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
      <Input value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="CPF" />
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome (opcional)" />
      <Button onClick={add}><Plus className="w-4 h-4" /> Bloquear</Button>
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (opcional)" className="sm:col-span-3" />
    </div>
  );
}

function DemoCard() {
  const toast = useUIStore((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const run = async (mode: 'seed' | 'clear') => {
    if (mode === 'clear') {
      const ok = await confirm({ title: 'Remover dados de demonstração', message: 'Todos os registros demo serão apagados.', danger: true, confirmLabel: 'Remover' });
      if (!ok) return;
    }
    setBusy(true);
    try {
      if (mode === 'seed') await seedDemoData(setMsg);
      else await clearDemoData(setMsg);
      toast(mode === 'seed' ? 'Dados de demonstração criados!' : 'Dados removidos.', 'success');
    } catch (e) {
      console.error(e);
      toast('Falha ao executar. Veja o console.', 'error');
    } finally {
      setBusy(false);
      setMsg('');
    }
  };

  return (
    <Card className="p-5">
      <CardHeader title="Dados de demonstração" subtitle="Popular o painel para explorar" icon={<Database className="w-5 h-5 text-amber-600" />} className="p-0 mb-3" />
      <p className="text-sm text-slate-500 dark:text-slate-300 mb-4">
        Cria lojas, entregadores (com documentos), clientes, pedidos, tickets e uma campanha de exemplo —
        todos marcados como <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">demo</code>.
      </p>
      {busy && msg && <p className="text-xs text-brand-dark font-bold mb-2 flex items-center gap-1"><Building2 className="w-3 h-3" /> {msg}</p>}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => run('seed')} disabled={busy}>{busy ? 'Processando…' : 'Popular dados'}</Button>
        <Button variant="outline" className="flex-1 text-danger" onClick={() => run('clear')} disabled={busy}>Limpar</Button>
      </div>
    </Card>
  );
}


/* --------------------- Calendário de repasse (temporalidade) --------------- */

/**
 * Edita quando um lado da plataforma recebe: frequência, dia, carência (D+N),
 * valor mínimo e se o repasse sai automático pela Stripe Connect.
 */
function ScheduleEditor({
  title,
  value,
  fallback,
  onChange,
}: {
  title: string;
  value?: PayoutSchedule;
  fallback: Required<PayoutSchedule>;
  onChange: (s: PayoutSchedule) => void;
}) {
  const current = withDefaults(value, fallback);
  const set = (patch: Partial<PayoutSchedule>) => onChange({ ...current, ...patch });
  const next = nextPayoutDate(current, fallback);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="font-bold text-sm text-slate-700 dark:text-slate-200">{title}</p>
        <Badge tone="slate">Próximo: {formatDate(next)}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Frequência">
          <select
            className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
            value={current.cadence}
            onChange={(e) => set({ cadence: e.target.value as PayoutCadence })}
          >
            {Object.entries(CADENCE_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </Field>

        {current.cadence === 'monthly' ? (
          <Field label="Dia do mês" hint="1 a 28">
            <Input
              type="number"
              min={1}
              max={28}
              value={current.monthDay}
              onChange={(e) => set({ monthDay: Number(e.target.value) })}
            />
          </Field>
        ) : current.cadence === 'daily' ? (
          <Field label="Dia" hint="Repasse em todo dia útil">
            <Input value="Dias úteis" disabled />
          </Field>
        ) : (
          <Field label="Dia da semana">
            <select
              className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
              value={current.weekday}
              onChange={(e) => set({ weekday: Number(e.target.value) })}
            >
              {WEEKDAY_LABELS.map((label, i) =>
                i === 0 ? null : <option key={i} value={i}>{label}</option>,
              )}
            </select>
          </Field>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mt-3">
        <Field label="Carência (dias)" hint="D+N após a entrega para liberar o valor">
          <Input
            type="number"
            min={0}
            max={90}
            value={current.holdDays}
            onChange={(e) => set({ holdDays: Number(e.target.value) })}
          />
        </Field>
        <Field label="Valor mínimo R$" hint="Abaixo disso acumula para o próximo ciclo">
          <Input
            type="number"
            min={0}
            value={current.minimumAmount}
            onChange={(e) => set({ minimumAmount: Number(e.target.value) })}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 mt-3 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
        <input
          type="checkbox"
          checked={current.autoTransfer}
          onChange={(e) => set({ autoTransfer: e.target.checked })}
          className="w-4 h-4 accent-brand"
        />
        Transferir automaticamente ao fechar o ciclo (Stripe Connect)
      </label>

      <p className="mt-2 text-xs text-slate-400">{describeSchedule(current, fallback)}</p>
    </div>
  );
}
