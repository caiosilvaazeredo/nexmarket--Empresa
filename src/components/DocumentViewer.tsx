import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Maximize2, FileWarning, ShieldCheck, Clock } from 'lucide-react';
import { resolveDocUrl, isImageUrl } from '../lib/storage';
import { cn } from '../lib/utils';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { Input } from './ui/Input';
import type { ReviewableDoc, DocStatus } from '../lib/types';

const REJECT_PRESETS = [
  'Foto borrada / ilegível',
  'Documento vencido',
  'Documento não corresponde ao cadastro',
  'Faltam informações na imagem',
  'Suspeita de fraude',
];

export function DocumentViewer({
  label,
  rawUrl,
  review,
  canReview,
  onReview,
}: {
  label: string;
  rawUrl?: string | null;
  review?: ReviewableDoc;
  canReview?: boolean;
  onReview?: (status: DocStatus, reason?: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => {
    let alive = true;
    resolveDocUrl(rawUrl).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [rawUrl]);

  const status = review?.status;
  const statusBadge =
    status === 'approved' ? (
      <Badge tone="green" dot>Aprovado</Badge>
    ) : status === 'rejected' ? (
      <Badge tone="red" dot>Recusado</Badge>
    ) : (
      <Badge tone="amber" dot>Pendente</Badge>
    );

  return (
    <div className="rounded-2xl border-2 border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b-2 border-slate-100 dark:border-slate-800">
        <span className="font-bold text-sm text-slate-700 dark:text-slate-200">{label}</span>
        {statusBadge}
      </div>

      <div className="relative aspect-[4/3] bg-slate-100 dark:bg-slate-800 group">
        {url && isImageUrl(url) ? (
          <>
            <img src={url} alt={label} className="w-full h-full object-cover" />
            <button
              onClick={() => setOpen(true)}
              className="absolute inset-0 flex items-center justify-center bg-slate-900/0 group-hover:bg-slate-900/40 transition-colors"
            >
              <Maximize2 className="w-7 h-7 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          </>
        ) : url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-500"
          >
            <ShieldCheck className="w-8 h-8" />
            <span className="font-bold text-sm">Abrir documento</span>
          </a>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400">
            <FileWarning className="w-8 h-8" />
            <span className="font-medium text-sm">Não enviado</span>
          </div>
        )}
      </div>

      {review?.rejectionReason && status === 'rejected' && (
        <p className="px-4 py-2 text-xs text-danger bg-danger-soft font-medium">Motivo: {review.rejectionReason}</p>
      )}

      {canReview && onReview && url && (
        <div className="p-3 border-t-2 border-slate-100 dark:border-slate-800">
          {!rejecting ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={status === 'approved' ? 'subtle' : 'primary'}
                className="flex-1"
                onClick={() => onReview('approved')}
              >
                <CheckCircle2 className="w-4 h-4" /> Aprovar
              </Button>
              <Button size="sm" variant="outline" className="flex-1 text-danger" onClick={() => setRejecting(true)}>
                <XCircle className="w-4 h-4" /> Recusar
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Input
                autoFocus
                placeholder="Motivo da recusa"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <div className="flex flex-wrap gap-1.5">
                {REJECT_PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setReason(p)}
                    className={cn(
                      'px-2 py-1 rounded-lg text-[11px] font-bold border',
                      reason === p
                        ? 'bg-danger-soft text-danger border-danger/30'
                        : 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800 dark:border-slate-700',
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  className="flex-1"
                  disabled={!reason.trim()}
                  onClick={() => {
                    onReview('rejected', reason.trim());
                    setRejecting(false);
                    setReason('');
                  }}
                >
                  Confirmar recusa
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
                  Voltar
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={label} size="xl">
        {url && <img src={url} alt={label} className="w-full rounded-xl" />}
        <p className="mt-3 text-xs text-slate-400 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" /> Acesso via URL assinada e temporária (RNF03 / LGPD).
        </p>
      </Modal>
    </div>
  );
}
