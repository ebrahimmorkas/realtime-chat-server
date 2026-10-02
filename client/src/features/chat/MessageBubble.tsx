import {
  AlertCircle,
  Check,
  CheckCheck,
  Clock,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { formatMessageTime } from '@/lib/format';
import type { Conversation, Message } from '@/lib/types';
import { cn } from '@/lib/utils';
import { firstName, memberName, seenBy } from './conversation-utils';

interface Props {
  message: Message;
  conversation: Conversation;
  mine: boolean;
  /** First message of a run from the same sender: shows the name in groups. */
  showSender: boolean;
  onRetry: (message: Message) => void;
  onEdit: (message: Message, text: string) => Promise<unknown>;
  onDelete: (message: Message) => void;
}

export function MessageBubble({
  message,
  conversation,
  mine,
  showSender,
  onRetry,
  onEdit,
  onDelete,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const canModify = mine && !message.deleted && message.status === undefined;

  return (
    <div className={cn('group flex', mine ? 'justify-end' : 'justify-start')}>
      <div className={cn('relative max-w-[min(80%,36rem)]', showSender && 'mt-2')}>
        {showSender && !mine && conversation.type === 'group' && (
          <p className="mb-0.5 ml-3 text-xs font-semibold text-brand-700 dark:text-brand-200">
            {memberName(conversation, message.senderId)}
          </p>
        )}
        <div
          className={cn(
            'rounded-2xl px-3.5 py-2 shadow-sm',
            mine
              ? 'rounded-br-md bg-brand-600 text-white'
              : 'rounded-bl-md bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100',
            message.status === 'failed' && 'bg-red-600',
          )}
        >
          {message.deleted ? (
            <p className={cn('text-sm italic', mine ? 'text-brand-100' : 'text-slate-500')}>
              This message was deleted
            </p>
          ) : editing ? (
            <EditBox
              initial={message.text ?? ''}
              onCancel={() => setEditing(false)}
              onSave={async (text) => {
                await onEdit(message, text);
                setEditing(false);
              }}
            />
          ) : (
            <p className="text-[0.9375rem] break-words whitespace-pre-wrap">{message.text}</p>
          )}
          <MessageMeta message={message} conversation={conversation} mine={mine} />
        </div>

        {message.status === 'failed' && (
          <button
            type="button"
            onClick={() => onRetry(message)}
            className="mt-1 ml-auto flex items-center gap-1 text-xs font-medium text-red-600 hover:underline"
          >
            <AlertCircle className="size-3.5" aria-hidden /> Not sent — tap to retry
          </button>
        )}

        {canModify && !editing && (
          <div className="absolute top-1 -left-9 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <button
              type="button"
              aria-label="Message actions"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
              className="grid size-7 place-items-center rounded-full text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              <MoreHorizontal className="size-4" />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute top-8 right-0 z-10 w-32 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-800"
                onMouseLeave={() => setMenuOpen(false)}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-700"
                  onClick={() => {
                    setMenuOpen(false);
                    setEditing(true);
                  }}
                >
                  <Pencil className="size-3.5" aria-hidden /> Edit
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-red-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(message);
                  }}
                >
                  <Trash2 className="size-3.5" aria-hidden /> Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MessageMeta({
  message,
  conversation,
  mine,
}: {
  message: Message;
  conversation: Conversation;
  mine: boolean;
}) {
  const readers = mine && message.status === undefined ? seenBy(conversation, message) : [];
  const everyone = readers.length >= conversation.members.length - 1;
  const seenLabel =
    readers.length === 0
      ? 'Sent'
      : conversation.type === 'direct' || everyone
        ? 'Seen'
        : `Seen by ${readers.map((r) => firstName(memberName(conversation, r.user.id))).join(', ')}`;

  return (
    <div
      className={cn(
        'mt-0.5 flex items-center justify-end gap-1 text-[0.6875rem]',
        mine ? 'text-brand-100' : 'text-slate-400',
      )}
    >
      {message.editedAt && !message.deleted && <span>edited</span>}
      <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
      {mine && message.status === 'sending' && <Clock className="size-3" aria-label="Sending" />}
      {mine && message.status === undefined && (
        <span
          title={seenLabel}
          aria-label={seenLabel}
          data-testid="receipt"
          data-state={readers.length ? 'seen' : 'sent'}
        >
          {readers.length === 0 ? (
            <Check className="size-3.5" />
          ) : (
            <CheckCheck className={cn('size-3.5', everyone && 'text-sky-300')} />
          )}
        </span>
      )}
    </div>
  );
}

function EditBox({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (text: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const save = async () => {
    const trimmed = text.trim();
    if (!trimmed || trimmed === initial) return onCancel();
    setSaving(true);
    try {
      await onSave(trimmed);
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void save();
    }
    if (e.key === 'Escape') onCancel();
  };

  return (
    <div className="min-w-56">
      <textarea
        ref={ref}
        aria-label="Edit message"
        value={text}
        disabled={saving}
        rows={Math.min(6, text.split('\n').length)}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        className="w-full resize-none rounded-md bg-white/15 px-2 py-1 text-[0.9375rem] outline-none"
      />
      <p className="mt-1 text-[0.6875rem] opacity-80">Enter to save · Esc to cancel</p>
    </div>
  );
}
