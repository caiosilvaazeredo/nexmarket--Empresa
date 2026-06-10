import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

/** Right-side slide-over drawer (used for 360° user views, order details…). */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = 'max-w-xl',
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  width?: string;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/55 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          'relative w-full bg-slate-50 dark:bg-slate-950 h-full shadow-2xl flex flex-col animate-nex-slide',
          width,
        )}
      >
        <div className="flex items-center justify-between gap-3 p-5 bg-white dark:bg-slate-900 border-b-2 border-slate-100 dark:border-slate-800 shrink-0">
          <div className="min-w-0">
            {title && <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 truncate">{title}</h2>}
            {subtitle && <p className="text-sm text-slate-400 truncate">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
