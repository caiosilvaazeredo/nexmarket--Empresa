import * as React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Card } from './Card';

export function Stat({
  label,
  value,
  icon,
  tone = 'brand',
  delta,
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  tone?: 'brand' | 'blue' | 'indigo' | 'amber' | 'red' | 'slate';
  delta?: number;
  hint?: string;
  className?: string;
}) {
  const tones: Record<string, string> = {
    brand: 'bg-brand-soft text-brand-dark dark:bg-brand/15 dark:text-brand',
    blue: 'bg-info-soft text-info dark:bg-info/15 dark:text-info',
    indigo: 'bg-accent-soft text-accent dark:bg-accent/15 dark:text-accent',
    amber: 'bg-warn-soft text-amber-700 dark:bg-warn/15 dark:text-warn',
    red: 'bg-danger-soft text-danger-dark dark:bg-danger/15 dark:text-danger',
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  };
  return (
    <Card className={cn('p-5', className)}>
      <div className="flex items-start justify-between">
        <span className="text-sm font-bold text-slate-400 uppercase tracking-wide">{label}</span>
        {icon && (
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', tones[tone])}>
            {icon}
          </div>
        )}
      </div>
      <div className="mt-2 text-3xl font-black text-slate-800 dark:text-slate-50 tracking-tight">{value}</div>
      <div className="mt-1 flex items-center gap-2">
        {typeof delta === 'number' && (
          <span
            className={cn(
              'inline-flex items-center gap-1 text-xs font-bold',
              delta >= 0 ? 'text-brand-dark' : 'text-danger',
            )}
          >
            {delta >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {Math.abs(delta).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
          </span>
        )}
        {hint && <span className="text-xs text-slate-400">{hint}</span>}
      </div>
    </Card>
  );
}
