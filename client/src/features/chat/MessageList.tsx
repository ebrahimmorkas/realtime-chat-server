import { ArrowDown, Loader2 } from 'lucide-react';
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ErrorState, Spinner } from '@/components/ui/feedback';
import { errorMessage } from '@/lib/api';
import { formatDayDivider, sameDay } from '@/lib/format';
import type { Conversation, Message } from '@/lib/types';
import { useDeleteMessage, useEditMessage, useMessages, useSendMessage } from './api';
import { flattenMessages } from './cache';
import { MessageBubble } from './MessageBubble';

/** Consecutive messages from one sender within this window are visually grouped. */
const GROUP_WINDOW_MS = 5 * 60_000;
const NEAR_BOTTOM_PX = 150;

export function MessageList({ conversation, meId }: { conversation: Conversation; meId: string }) {
  const query = useMessages(conversation.id);
  const { retry } = useSendMessage(conversation.id);
  const editMessage = useEditMessage(conversation.id);
  const deleteMessage = useDeleteMessage(conversation.id);
  const [pendingDelete, setPendingDelete] = useState<Message | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const prevHeight = useRef(0);
  const prevNewestId = useRef<string | undefined>(undefined);
  const prevOldestId = useRef<string | undefined>(undefined);
  const [unseenBelow, setUnseenBelow] = useState(false);

  const messages = flattenMessages(query.data);
  const oldestId = messages[0]?.id;
  const newest = messages.at(-1);

  const scrollToBottom = (behavior: ScrollBehavior = 'auto') => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
    setUnseenBelow(false);
  };

  // Keep the viewport stable: stick to the bottom for new messages, and keep the
  // reading position when older pages are prepended above.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const prependedOlder = prevOldestId.current !== undefined && oldestId !== prevOldestId.current;
    const newArrived = newest && newest.id !== prevNewestId.current;

    if (prevNewestId.current === undefined && newest) {
      el.scrollTop = el.scrollHeight;
    } else if (prependedOlder && !newArrived) {
      el.scrollTop += el.scrollHeight - prevHeight.current;
    } else if (newArrived) {
      if (nearBottom.current || newest.senderId === meId) el.scrollTop = el.scrollHeight;
      else setUnseenBelow(true);
    }
    prevHeight.current = el.scrollHeight;
    prevOldestId.current = oldestId;
    prevNewestId.current = newest?.id;
  });

  // Load older messages when the top of the history scrolls into view.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    const el = topRef.current;
    if (!el || !hasNextPage) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { root: scrollRef.current, rootMargin: '200px 0px 0px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (nearBottom.current) setUnseenBelow(false);
  };

  if (query.isPending) return <Spinner className="flex-1" label="Loading messages" />;
  if (query.isError) {
    return (
      <div className="flex-1 p-6">
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </div>
    );
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="h-full overflow-y-auto px-4 py-4 sm:px-8"
        role="log"
        aria-live="polite"
        aria-label="Messages"
      >
        <div ref={topRef} />
        {isFetchingNextPage && (
          <div className="flex justify-center py-2 text-slate-400">
            <Loader2 className="size-5 animate-spin" aria-label="Loading older messages" />
          </div>
        )}
        {!hasNextPage && messages.length > 0 && (
          <p className="py-4 text-center text-xs text-slate-500">
            This is the start of the conversation.
          </p>
        )}
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-500">No messages yet. Say hi! 👋</p>
        )}

        <div className="space-y-1">
          {messages.map((message, index) => {
            const previous = messages[index - 1];
            const newDay = !previous || !sameDay(previous.createdAt, message.createdAt);
            const startsRun =
              newDay ||
              previous.senderId !== message.senderId ||
              new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() >
                GROUP_WINDOW_MS;
            return (
              <Fragment key={message.clientId ?? message.id}>
                {newDay && (
                  <div className="sticky top-0 z-[1] flex justify-center py-2">
                    <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm backdrop-blur dark:bg-slate-800/90 dark:text-slate-300">
                      {formatDayDivider(message.createdAt)}
                    </span>
                  </div>
                )}
                <MessageBubble
                  message={message}
                  conversation={conversation}
                  mine={message.senderId === meId}
                  showSender={startsRun}
                  onRetry={retry}
                  onEdit={(m, text) =>
                    editMessage.mutateAsync({ id: m.id, text }).catch((err) => {
                      toast.error(errorMessage(err));
                      throw err;
                    })
                  }
                  onDelete={setPendingDelete}
                />
              </Fragment>
            );
          })}
        </div>
      </div>

      {unseenBelow && (
        <button
          type="button"
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-brand-700"
        >
          <ArrowDown className="size-4" aria-hidden /> New messages
        </button>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete message?"
        description="It will be replaced with “This message was deleted” for everyone."
        confirmLabel="Delete"
        loading={deleteMessage.isPending}
        onClose={() => setPendingDelete(null)}
        onConfirm={() =>
          pendingDelete &&
          deleteMessage.mutate(pendingDelete.id, {
            onSuccess: () => setPendingDelete(null),
            onError: (err) => toast.error(errorMessage(err)),
          })
        }
      />
    </div>
  );
}
