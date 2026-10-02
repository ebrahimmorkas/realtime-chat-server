import { LogOut, MessageSquarePlus, Moon, Search, Sun, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Input } from '@/components/ui/form';
import { useAuth, useMe } from '@/features/auth/auth-context';
import { errorMessage } from '@/lib/api';
import { useTheme } from '@/lib/theme';
import { useDebouncedValue } from '@/lib/use-debounce';
import { useConversations, useOpenDirect, useUserSearch } from './api';
import { conversationTitle } from './conversation-utils';
import { ConversationListItem } from './ConversationListItem';
import { useIsOnline } from './live-store';
import { NewGroupDialog } from './NewGroupDialog';

export function Sidebar() {
  const me = useMe();
  const { logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [search, setSearch] = useState('');
  const [groupOpen, setGroupOpen] = useState(false);
  const term = useDebouncedValue(search.trim(), 250);
  const conversations = useConversations();

  const filtered = term
    ? conversations.data?.filter((c) =>
        conversationTitle(c, me.id).toLowerCase().includes(term.toLowerCase()),
      )
    : conversations.data;

  return (
    <aside className="flex h-full flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <Avatar name={me.displayName} seed={me.id} size="sm" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate font-semibold">{me.displayName}</p>
          <p className="truncate text-xs text-slate-500">@{me.username}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="New group"
          onClick={() => setGroupOpen(true)}
        >
          <MessageSquarePlus />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <Sun /> : <Moon />}
        </Button>
        <Button variant="ghost" size="icon" aria-label="Log out" onClick={logout}>
          <LogOut />
        </Button>
      </header>

      <div className="p-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <Input
            aria-label="Search chats and people"
            placeholder="Search chats or find people"
            className="rounded-full bg-slate-100 pr-9 pl-9 dark:bg-slate-800"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              onClick={() => setSearch('')}
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      <nav aria-label="Conversations" className="flex-1 overflow-y-auto px-2 pb-3">
        {conversations.isPending ? (
          <div className="space-y-2 px-1">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : conversations.isError ? (
          <ErrorState error={conversations.error} onRetry={() => conversations.refetch()} />
        ) : (
          <>
            {filtered && filtered.length > 0 ? (
              <ul className="space-y-0.5">
                {filtered.map((c) => (
                  <li key={c.id}>
                    <ConversationListItem conversation={c} meId={me.id} />
                  </li>
                ))}
              </ul>
            ) : (
              !term && (
                <EmptyState
                  className="mx-1 py-10"
                  title="No conversations yet"
                  description="Search for someone above to start chatting."
                />
              )
            )}
            {term && <PeopleResults term={term} onPicked={() => setSearch('')} />}
          </>
        )}
      </nav>

      <NewGroupDialog open={groupOpen} onClose={() => setGroupOpen(false)} />
    </aside>
  );
}

function PeopleResults({ term, onPicked }: { term: string; onPicked: () => void }) {
  const navigate = useNavigate();
  const { data: users, isPending } = useUserSearch(term);
  const openDirect = useOpenDirect();

  const start = (userId: string) =>
    openDirect.mutate(userId, {
      onSuccess: (conversation) => {
        onPicked();
        navigate(`/chat/${conversation.id}`);
      },
      onError: (err) => toast.error(errorMessage(err)),
    });

  return (
    <section aria-labelledby="people-heading" className="mt-3">
      <h2
        id="people-heading"
        className="px-3 pb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase"
      >
        People
      </h2>
      {isPending ? (
        <Skeleton className="mx-1 h-12" />
      ) : users && users.length > 0 ? (
        <ul>
          {users.map((user) => (
            <li key={user.id}>
              <PersonButton
                name={user.displayName}
                username={user.username}
                userId={user.id}
                disabled={openDirect.isPending}
                onClick={() => start(user.id)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-3 py-2 text-sm text-slate-500">No people match “{term}”.</p>
      )}
    </section>
  );
}

function PersonButton({
  name,
  username,
  userId,
  disabled,
  onClick,
}: {
  name: string;
  username: string;
  userId: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const online = useIsOnline(userId);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-slate-100 disabled:opacity-60 dark:hover:bg-slate-800/60"
    >
      <Avatar name={name} seed={userId} size="sm" online={online} />
      <span className="min-w-0">
        <span className="block truncate font-medium">{name}</span>
        <span className="block truncate text-xs text-slate-500">@{username}</span>
      </span>
    </button>
  );
}
