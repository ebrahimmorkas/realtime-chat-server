import { ArrowLeft, Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/ui/button';
import { EmptyState, Spinner } from '@/components/ui/feedback';
import { useMe } from '@/features/auth/auth-context';
import { lastSeen } from '@/lib/format';
import type { Conversation } from '@/lib/types';
import { useConversation, useSendMessage } from './api';
import { Composer } from './Composer';
import { conversationTitle, isFullUser, otherMember, typingLabel } from './conversation-utils';
import { GroupInfoDialog } from './GroupInfoDialog';
import { useLive, useTypingUsers } from './live-store';
import { MessageList } from './MessageList';
import { useChatSocket } from './socket-context';

export function ConversationView() {
  const { conversationId = '' } = useParams();
  const me = useMe();
  const { conversation, isPending } = useConversation(conversationId);

  if (isPending) return <Spinner className="flex-1" />;
  if (!conversation) {
    return (
      <div className="grid flex-1 place-items-center p-6">
        <EmptyState
          title="Conversation not found"
          description="It may have been deleted, or you are no longer a member."
          action={
            <Link to="/chat" className="font-medium text-brand-600 hover:underline">
              Back to chats
            </Link>
          }
        />
      </div>
    );
  }
  // Keyed so that switching conversations resets scroll position and drafts.
  return <OpenConversation key={conversation.id} conversation={conversation} meId={me.id} />;
}

function OpenConversation({ conversation, meId }: { conversation: Conversation; meId: string }) {
  const { markRead, setActiveConversation, setTyping } = useChatSocket();
  const { send } = useSendMessage(conversation.id);
  const [infoOpen, setInfoOpen] = useState(false);
  const hasUnread = conversation.unreadCount > 0;

  useEffect(() => {
    setActiveConversation(conversation.id);
    return () => setActiveConversation(null);
  }, [conversation.id, setActiveConversation]);

  // Opening (or returning to) a conversation marks it read.
  useEffect(() => {
    const readIfVisible = () => {
      if (document.visibilityState === 'visible' && hasUnread) markRead(conversation.id);
    };
    readIfVisible();
    document.addEventListener('visibilitychange', readIfVisible);
    return () => document.removeEventListener('visibilitychange', readIfVisible);
  }, [conversation.id, hasUnread, markRead]);

  return (
    <section
      className="flex h-full min-w-0 flex-1 flex-col"
      aria-label={conversationTitle(conversation, meId)}
    >
      <Header conversation={conversation} meId={meId} onInfo={() => setInfoOpen(true)} />
      <MessageList conversation={conversation} meId={meId} />
      <Composer onSend={send} onTyping={(typing) => setTyping(conversation.id, typing)} />
      {conversation.type === 'group' && (
        <GroupInfoDialog
          open={infoOpen}
          conversation={conversation}
          meId={meId}
          onClose={() => setInfoOpen(false)}
        />
      )}
    </section>
  );
}

function Header({
  conversation,
  meId,
  onInfo,
}: {
  conversation: Conversation;
  meId: string;
  onInfo: () => void;
}) {
  const title = conversationTitle(conversation, meId);
  const other = conversation.type === 'direct' ? otherMember(conversation, meId)?.user : undefined;
  const typing = typingLabel(conversation, useTypingUsers(conversation.id));
  const online = useLive((s) => (other ? s.online.has(other.id) : false));
  const liveLastSeen = useLive((s) => (other ? s.lastSeen[other.id] : undefined));
  const onlineInGroup = useLive(
    (s) => conversation.members.filter((m) => m.user.id !== meId && s.online.has(m.user.id)).length,
  );

  let subtitle: string;
  if (typing) subtitle = typing;
  else if (conversation.type === 'group') {
    subtitle = `${conversation.members.length} members${onlineInGroup ? ` · ${onlineInGroup} online` : ''}`;
  } else if (online) subtitle = 'online';
  else {
    const seenAt = liveLastSeen ?? (other && isFullUser(other) ? other.lastSeenAt : null);
    subtitle = seenAt ? lastSeen(seenAt) : 'offline';
  }

  return (
    <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-3 py-2.5 sm:px-4 dark:border-slate-800 dark:bg-slate-900">
      <Link
        to="/chat"
        aria-label="Back to chats"
        className="grid size-9 place-items-center rounded-lg hover:bg-slate-100 md:hidden dark:hover:bg-slate-800"
      >
        <ArrowLeft className="size-5" />
      </Link>
      <Avatar
        name={title}
        seed={other?.id ?? conversation.id}
        group={conversation.type === 'group'}
        online={online}
      />
      <div className="min-w-0 flex-1 leading-tight">
        <h1 className="truncate font-semibold">{title}</h1>
        <p
          className={`truncate text-sm ${typing || online ? 'text-brand-600 dark:text-brand-200' : 'text-slate-500'}`}
          aria-live="polite"
        >
          {subtitle}
        </p>
      </div>
      {conversation.type === 'group' && (
        <Button variant="ghost" size="icon" aria-label="Group info" onClick={onInfo}>
          <Info />
        </Button>
      )}
    </header>
  );
}
