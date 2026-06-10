import { useState } from 'react';
import { Megaphone, Plus, Pencil, Trash2, Ticket, Building2, Tag } from 'lucide-react';
import { Page, PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Field, Input, Select } from '../components/ui/Input';
import { EmptyState } from '../components/ui/Feedback';
import { confirm } from '../components/ui/Confirm';
import { useSub } from '../hooks/useSub';
import { usePermission } from '../hooks/usePermission';
import { useUIStore } from '../store/useUIStore';
import { subscribeCampaigns, createCampaign, updateCampaign, deleteCampaign } from '../lib/campaigns';
import { subscribeStores } from '../lib/stores';
import { brl, num } from '../lib/format';
import type { Campaign, Supermarket, CampaignPayer } from '../lib/types';

export default function Campaigns() {
  const { can } = usePermission();
  const toast = useUIStore((s) => s.toast);
  const campaigns = useSub<Campaign[]>(subscribeCampaigns, []);
  const stores = useSub<Supermarket[]>(subscribeStores, []);
  const canManage = can('campaigns.manage');
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [open, setOpen] = useState(false);

  const openNew = () => {
    setEditing(null);
    setOpen(true);
  };
  const openEdit = (c: Campaign) => {
    setEditing(c);
    setOpen(true);
  };

  const remove = async (c: Campaign) => {
    const ok = await confirm({ title: 'Remover campanha', message: `A campanha ${c.code} será removida.`, danger: true, confirmLabel: 'Remover' });
    if (!ok) return;
    await deleteCampaign(c.id);
    toast('Campanha removida.', 'info');
  };

  return (
    <Page>
      <PageHeader
        title="Campanhas & Cupons"
        subtitle="Cupons patrocinados pela plataforma ou pelas lojas"
        icon={<Megaphone className="w-6 h-6" />}
        actions={canManage ? <Button onClick={openNew}><Plus className="w-4 h-4" /> Nova campanha</Button> : undefined}
      />

      {campaigns.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Ticket className="w-7 h-7" />}
            title="Nenhuma campanha"
            description="Crie cupons de desconto e defina quem paga por eles."
            action={canManage ? <Button onClick={openNew}><Plus className="w-4 h-4" /> Nova campanha</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {campaigns.map((c) => {
            const used = c.usedCount || 0;
            const pctBudget = c.budget ? Math.min(100, (used / c.budget) * 100) : 0;
            return (
              <Card key={c.id} className="p-5 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-2xl bg-brand-soft text-brand-dark flex items-center justify-center shrink-0">
                      <Tag className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-black text-slate-800 dark:text-slate-50 truncate">{c.code}</p>
                      <p className="text-xs text-slate-400 truncate">{c.title || 'Cupom de desconto'}</p>
                    </div>
                  </div>
                  <Badge tone={c.active ? 'green' : 'slate'} dot>{c.active ? 'Ativa' : 'Inativa'}</Badge>
                </div>

                <div className="flex items-center gap-2 mt-4">
                  <span className="text-2xl font-black text-slate-800 dark:text-slate-50">
                    {c.type === 'percent' ? `${c.value}%` : c.type === 'free_shipping' ? 'Frete grátis' : brl(c.value)}
                  </span>
                  <Badge tone={c.payer === 'platform' ? 'indigo' : 'blue'}>
                    {c.payer === 'platform' ? 'Nexmarket paga' : 'Loja paga'}
                  </Badge>
                </div>

                {c.budget ? (
                  <div className="mt-4">
                    <div className="flex justify-between text-xs font-bold text-slate-400 mb-1">
                      <span>{num(used)} usos</span>
                      <span>orçamento {brl(c.budget)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div className="h-full bg-brand" style={{ width: `${pctBudget}%` }} />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 mt-4">{num(used)} usos</p>
                )}

                {canManage && (
                  <div className="flex gap-2 mt-4 pt-4 border-t-2 border-slate-100 dark:border-slate-800">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => updateCampaign(c.id, { active: !c.active })}>
                      {c.active ? 'Pausar' : 'Ativar'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(c)}><Pencil className="w-4 h-4" /></Button>
                    <Button size="sm" variant="ghost" className="text-danger" onClick={() => remove(c)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {open && <CampaignModal campaign={editing} stores={stores} onClose={() => setOpen(false)} />}
    </Page>
  );
}

function CampaignModal({ campaign, stores, onClose }: { campaign: Campaign | null; stores: Supermarket[]; onClose: () => void }) {
  const toast = useUIStore((s) => s.toast);
  const [code, setCode] = useState(campaign?.code || '');
  const [title, setTitle] = useState(campaign?.title || '');
  const [type, setType] = useState<Campaign['type']>(campaign?.type || 'percent');
  const [value, setValue] = useState(String(campaign?.value ?? 10));
  const [payer, setPayer] = useState<CampaignPayer>(campaign?.payer || 'platform');
  const [supermarketId, setSupermarketId] = useState(campaign?.supermarketId || '');
  const [minSubtotal, setMinSubtotal] = useState(String(campaign?.minSubtotal ?? 0));
  const [maxDiscount, setMaxDiscount] = useState(String(campaign?.maxDiscount ?? 0));
  const [budget, setBudget] = useState(String(campaign?.budget ?? 0));

  const submit = async () => {
    if (!code.trim()) return;
    const payload = {
      code: code.trim().toUpperCase(),
      title: title.trim() || undefined,
      type,
      value: Number(value) || 0,
      payer,
      supermarketId: payer === 'store' ? supermarketId || undefined : undefined,
      minSubtotal: Number(minSubtotal) || undefined,
      maxDiscount: Number(maxDiscount) || undefined,
      budget: Number(budget) || undefined,
      active: campaign?.active ?? true,
    };
    if (campaign) {
      await updateCampaign(campaign.id, payload);
      toast('Campanha atualizada.', 'success');
    } else {
      await createCampaign(payload as any);
      toast('Campanha criada.', 'success');
    }
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={campaign ? 'Editar campanha' : 'Nova campanha'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={!code.trim()}>{campaign ? 'Salvar' : 'Criar'}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Código do cupom"><Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="BEMVINDO20" /></Field>
          <Field label="Título"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Boas-vindas" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo">
            <Select value={type} onChange={(e) => setType(e.target.value as Campaign['type'])}>
              <option value="percent">Percentual (%)</option>
              <option value="fixed">Valor fixo (R$)</option>
              <option value="free_shipping">Frete grátis</option>
            </Select>
          </Field>
          <Field label="Valor"><Input type="number" value={value} onChange={(e) => setValue(e.target.value)} disabled={type === 'free_shipping'} /></Field>
        </div>
        <Field label="Quem paga o desconto?">
          <Select value={payer} onChange={(e) => setPayer(e.target.value as CampaignPayer)}>
            <option value="platform">A Nexmarket paga (subsidiado)</option>
            <option value="store">A loja paga</option>
          </Select>
        </Field>
        {payer === 'store' && (
          <Field label="Loja patrocinadora" hint="Deixe em branco para todas as lojas">
            <Select value={supermarketId} onChange={(e) => setSupermarketId(e.target.value)}>
              <option value="">Todas as lojas</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>
        )}
        <div className="grid grid-cols-3 gap-3">
          <Field label="Mín. subtotal"><Input type="number" value={minSubtotal} onChange={(e) => setMinSubtotal(e.target.value)} /></Field>
          <Field label="Desc. máx."><Input type="number" value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} /></Field>
          <Field label="Orçamento"><Input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} /></Field>
        </div>
        <p className="text-xs text-slate-400 flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> O cupom fica disponível nos apps dos clientes conforme as regras definidas.</p>
      </div>
    </Modal>
  );
}
