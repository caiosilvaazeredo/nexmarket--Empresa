import * as React from 'react';
import { motion, type HTMLMotionProps } from 'motion/react';
import { cn } from '../../lib/utils';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline' | 'subtle';
type Size = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'ref'> {
  variant?: Variant;
  size?: Size;
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-2xl font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:pointer-events-none disabled:opacity-50 active:translate-y-px select-none whitespace-nowrap';

// "Duolingo" 3D buttons: solid fill + darker bottom border that collapses on press.
const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white border-b-4 border-brand-dark hover:bg-brand-hover active:border-b-0',
  secondary:
    'bg-white text-slate-600 border-2 border-b-4 border-slate-200 hover:bg-slate-50 active:border-b-2 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700',
  danger: 'bg-danger text-white border-b-4 border-danger-dark hover:brightness-105 active:border-b-0',
  outline:
    'bg-transparent text-slate-700 border-2 border-slate-200 hover:bg-slate-50 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-800',
  ghost: 'bg-transparent text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
  subtle: 'bg-brand-soft text-brand-dark hover:brightness-95 dark:bg-brand/15 dark:text-brand',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-xs',
  md: 'h-11 px-4 text-sm',
  lg: 'h-13 px-6 text-base',
  icon: 'h-10 w-10',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => (
    <motion.button
      whileTap={{ scale: 0.97 }}
      ref={ref}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
