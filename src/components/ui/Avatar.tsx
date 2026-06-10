import { cn } from '../../lib/utils';
import { initials, colorFromString } from '../../lib/format';

export function Avatar({
  name,
  src,
  size = 40,
  className,
}: {
  name?: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={name || ''}
        width={size}
        height={size}
        className={cn('rounded-full object-cover bg-slate-100 shrink-0', className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={cn('rounded-full flex items-center justify-center text-white font-bold shrink-0', className)}
      style={{ width: size, height: size, background: colorFromString(name), fontSize: size * 0.4 }}
    >
      {initials(name)}
    </div>
  );
}
