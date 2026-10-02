import { MessagesSquare, WifiOff } from 'lucide-react';
import { Outlet, useParams } from 'react-router';
import { cn } from '@/lib/utils';
import { useLive } from './live-store';
import { Sidebar } from './Sidebar';
import { SocketProvider } from './socket-context';

export function ChatLayout() {
  const { conversationId } = useParams();
  return (
    <SocketProvider>
      <div className="flex h-full flex-col">
        <ConnectionBanner />
        <div className="flex min-h-0 flex-1">
          {/* On phones the list and the conversation take turns filling the screen. */}
          <div
            className={cn(
              'w-full shrink-0 md:block md:w-80 lg:w-96',
              conversationId ? 'hidden' : 'block',
            )}
          >
            <Sidebar />
          </div>
          <main
            className={cn(
              'min-w-0 flex-1 flex-col bg-slate-100 md:flex dark:bg-slate-950',
              conversationId ? 'flex' : 'hidden',
            )}
          >
            <Outlet />
          </main>
        </div>
      </div>
    </SocketProvider>
  );
}

export function NoConversationSelected() {
  return (
    <div className="grid flex-1 place-items-center p-6 text-center">
      <div>
        <MessagesSquare className="mx-auto size-14 text-brand-500" aria-hidden />
        <h1 className="mt-4 text-xl font-semibold">Welcome to Chatterbox</h1>
        <p className="mt-1 max-w-sm text-sm text-slate-500">
          Pick a conversation, or search for someone to start a new one. Open a second browser
          window as another demo user to watch messages arrive in real time.
        </p>
      </div>
    </div>
  );
}

function ConnectionBanner() {
  const connection = useLive((s) => s.connection);
  if (connection === 'connected' || connection === 'connecting') return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-1.5 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
    >
      <WifiOff className="size-4" aria-hidden />
      {connection === 'offline'
        ? 'Cannot reach the chat server. Retrying…'
        : 'Connection lost. Reconnecting… Messages you send will be delivered when it is back.'}
    </div>
  );
}
