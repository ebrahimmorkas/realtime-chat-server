import { NavLink } from 'react-router';
import { Avatar } from '@/components/Avatar';
import { formatListTime } from '@/lib/format';
import type { Conversation } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  conversationTitle,
  firstName,
  memberName,
  otherMember,
  typingLabel,
} from './conversation-utils';
import { useIsOnline, useTypingUsers } from './live-store';

export function ConversationListItem({
  conversation,
  meId,
}: {
  conversation: Conversation;
  meId: string;
}) {
  const title = conversationTitle(conversation, meId);
  const other =
    conversation.type === 'direct' ? otherMember(conversation, meId)?.user.id : undefined;
  const online = useIsOnline(other);
  const typing = typingLabel(conversation, useTypingUsers(conversation.id));
  const last = conversation.lastMessage;
  const unread = conversation.unreadCount;

  let preview = 'No messages yet';
  if (last) {
    const text = last.text ?? 'Message deleted';
    if (last.sender === meId) preview = `You: ${text}`;
    else if (conversation.type === 'group' && last.sender)
      preview = `${firstName(memberName(conversation, last.sender))}: ${text}`;
    else preview = text;
  }

  return (
    <NavLink
      to={`/chat/${conversation.id}`}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors',
          isActive
            ? 'bg-brand-50 dark:bg-brand-900/40'
            : 'hover:bg-slate-100 dark:hover:bg-slate-800/60',
        )
      }
    >
      <Avatar
        name={title}
        seed={other ?? conversation.id}
        group={conversation.type === 'group'}
        online={online}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={cn('truncate', unread ? 'font-semibold' : 'font-medium')}>{title}</span>
          {last && (
            <time
              dateTime={last.createdAt}
              className={cn(
                'shrink-0 text-xs',
                unread ? 'font-semibold text-brand-600' : 'text-slate-500',
              )}
            >
              {formatListTime(last.createdAt)}
            </time>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              'truncate text-sm',
              typing
                ? 'text-brand-600 italic dark:text-brand-200'
                : unread
                  ? 'text-slate-800 dark:text-slate-200'
                  : 'text-slate-500',
              !typing && last && last.text === null && 'italic',
            )}
          >
            {typing ?? preview}
          </span>
          {unread > 0 && (
            <span
              className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-brand-600 px-1.5 text-xs font-semibold text-white"
              aria-label={`${unread} unread`}
            >
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </div>
      </div>
    </NavLink>
  );
}
