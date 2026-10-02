import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '@/components/Avatar';
import { Input } from '@/components/ui/form';
import type { User } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useDebouncedValue } from '@/lib/use-debounce';
import { useUserSearch } from './api';

interface Props {
  selected: User[];
  onChange: (users: User[]) => void;
  /** Users who can't be picked, e.g. existing group members. */
  excludeIds?: string[];
}

export function PeoplePicker({ selected, onChange, excludeIds = [] }: Props) {
  const [search, setSearch] = useState('');
  const term = useDebouncedValue(search.trim(), 250);
  const { data: users = [], isFetching } = useUserSearch(term);
  const selectedIds = new Set(selected.map((u) => u.id));
  const results = users.filter((u) => !excludeIds.includes(u.id));

  const toggle = (user: User) =>
    onChange(
      selectedIds.has(user.id) ? selected.filter((u) => u.id !== user.id) : [...selected, user],
    );

  return (
    <div className="space-y-3">
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Selected people">
          {selected.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                onClick={() => toggle(user)}
                className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-1 pr-2 pl-3 text-sm text-brand-700 hover:bg-brand-100 dark:bg-brand-900/40 dark:text-brand-100"
                aria-label={`Remove ${user.displayName}`}
              >
                {user.displayName} <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Input
        aria-label="Search people"
        placeholder="Search by name or username"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {term && (
        <ul className={cn('max-h-56 overflow-y-auto', isFetching && 'opacity-70')}>
          {results.length === 0 && !isFetching && (
            <li className="px-2 py-3 text-sm text-slate-500">No people match “{term}”.</li>
          )}
          {results.map((user) => {
            const picked = selectedIds.has(user.id);
            return (
              <li key={user.id}>
                <button
                  type="button"
                  aria-pressed={picked}
                  onClick={() => toggle(user)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Avatar name={user.displayName} seed={user.id} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{user.displayName}</span>
                    <span className="block truncate text-xs text-slate-500">@{user.username}</span>
                  </span>
                  {picked && <Check className="size-4 text-brand-600" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
