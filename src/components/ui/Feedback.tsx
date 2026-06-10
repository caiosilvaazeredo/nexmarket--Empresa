import * as React from 'react';
import { Loader2, CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useUIStore } from '../../store/useUIStore';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('w-5 h-5 animate-spin text-brand', className)} />;
}

export function LoadingState({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
      <Loader2 className="w-8 h-8 animate-spin text-brand" />
      <span className="font-medium">{label}</span>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-16 px-6 gap-3', className)}>
      {icon && (
        <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200">{title}</h3>
      {description && <p className="text-slate-400 max-w-sm">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

const toastIcon = {
  success: <CheckCircle2 className="w-5 h-5 text-brand" />,
  error: <AlertTriangle className="w-5 h-5 text-danger" />,
  info: <Info className="w-5 h-5 text-info" />,
};

export function Toaster() {
  const { toasts, dismissToast } = useUIStore();
  return (
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2 w-[min(92vw,360px)]">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-start gap-3 bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-2xl shadow-xl p-4 animate-nex-in"
        >
          {toastIcon[t.variant]}
          <p className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">{t.message}</p>
          <button onClick={() => dismissToast(t.id)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
