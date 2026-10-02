import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';

const COLORS = [
  'bg-rose-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-lime-600',
  'bg-emerald-600',
  'bg-sky-500',
  'bg-indigo-500',
  'bg-fuchsia-500',
];

function colorFor(seed: string) {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

const SIZES = { sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-12 text-base' };

interface Props {
  name: string;
  seed: string;
  size?: keyof typeof SIZES;
  online?: boolean;
  group?: boolean;
  className?: string;
}

export function Avatar({ name, seed, size = 'md', online, group, className }: Props) {
  return (
    <span className={cn('relative inline-flex shrink-0', className)} aria-hidden>
      <span
        className={cn(
          'grid place-items-center rounded-full font-semibold text-white',
          SIZES[size],
          colorFor(seed),
        )}
      >
        {group ? <Users className="size-1/2" /> : initials(name)}
      </span>
      {online && (
        <span className="absolute right-0 bottom-0 size-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
      )}
    </span>
  );
}
