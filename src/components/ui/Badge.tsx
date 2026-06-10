import * as React from 'react';
import { cn } from '../../lib/utils';

export type BadgeTone =
  | 'slate'
  | 'green'
  | 'red'
  | 'amber'
  | 'blue'
  | 'indigo'
  | 'purple'
  | 'pink';

const tones: Record<BadgeTone, string> = {
  slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  green: 'bg-brand-soft text-brand-dark dark:bg-brand/15 dark:text-brand',
  red: 'bg-danger-soft text-danger-dark dark:bg-danger/15 dark:text-danger',
  amber: 'bg-warn-soft text-amber-700 dark:bg-warn/15 dark:text-warn',
  blue: 'bg-info-soft text-info dark:bg-info/15 dark:text-info',
  indigo: 'bg-accent-soft text-accent dark:bg-accent/15 dark:text-accent',
  purple: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
  pink: 'bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300',
};

export function Badge({
  tone = 'slate',
  className,
  children,
  dot,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold',
        tones[tone],
        className,
      )}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
