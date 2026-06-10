import * as React from 'react';
import { cn } from '../../lib/utils';

export function Page({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('p-5 md:p-8 w-full max-w-[1500px] mx-auto', className)}>{children}</div>;
}

export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          {icon && (
            <div className="w-12 h-12 rounded-2xl bg-brand-soft dark:bg-brand/15 text-brand-dark dark:text-brand flex items-center justify-center shrink-0">
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-black text-slate-800 dark:text-slate-50 tracking-tight truncate">
              {title}
            </h1>
            {subtitle && <p className="text-slate-400 font-medium">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}
