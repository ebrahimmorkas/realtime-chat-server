import { describe, expect, it } from 'vitest';
import type { Conversation, Message } from '@/lib/types';
import {
  applyNewMessage,
  applyRead,
  flattenMessages,
  removeMember,
  upsertConversation,
  upsertMessage,
  type MessagesData,
} from './cache';
import { seenBy, typingLabel } from './conversation-utils';

const msg = (overrides: Partial<Message> = {}): Message => ({
  id: 'm1',
  conversationId: 'c1',
  senderId: 'alice',
  text: 'hi',
  clientId: null,
  createdAt: '2026-01-01T10:00:00.000Z',
  editedAt: null,
  deleted: false,
  ...overrides,
});

const conv = (overrides: Partial<Conversation> = {}): Conversation => ({
  id: 'c1',
  type: 'direct',
  name: null,
  createdBy: 'alice',
  members: [
    { user: { id: 'alice' }, role: 'member', joinedAt: '', lastReadAt: '2026-01-01T09:00:00.000Z' },
    { user: { id: 'bob' }, role: 'member', joinedAt: '', lastReadAt: '2026-01-01T09:00:00.000Z' },
  ],
  lastMessage: null,
  lastMessageAt: '2026-01-01T09:00:00.000Z',
  createdAt: '',
  unreadCount: 0,
  ...overrides,
});

const pages = (...data: Message[][]): MessagesData => ({
  pages: data.map((d) => ({ data: d, nextCursor: null })),
  pageParams: data.map(() => null),
});

describe('upsertMessage', () => {
  it('prepends a new message to the newest page', () => {
    const result = upsertMessage(pages([msg({ id: 'old' })]), msg({ id: 'new' }));
    expect(result.pages[0]!.data.map((m) => m.id)).toEqual(['new', 'old']);
  });

  it('replaces the optimistic copy when the server confirms it (matched by clientId)', () => {
    const optimistic = msg({ id: 'temp-1', clientId: 'k1', status: 'sending' });
    const confirmed = msg({ id: 'm9', clientId: 'k1' });

    const result = upsertMessage(pages([optimistic]), confirmed);

    expect(result.pages[0]!.data).toEqual([confirmed]);
  });

  it('ignores the duplicate broadcast of an already confirmed message', () => {
    const confirmed = msg({ id: 'm9', clientId: 'k1' });
    const result = upsertMessage(pages([confirmed]), { ...confirmed });
    expect(result.pages[0]!.data).toHaveLength(1);
  });

  it('does not downgrade a confirmed message back to "sending"', () => {
    const confirmed = msg({ id: 'm9', clientId: 'k1' });
    const lateOptimistic = msg({ id: 'temp-1', clientId: 'k1', status: 'sending' });
    expect(upsertMessage(pages([confirmed]), lateOptimistic).pages[0]!.data[0]).toBe(confirmed);
  });

  it('flattens pages oldest first for rendering', () => {
    const data = pages([msg({ id: '3' }), msg({ id: '2' })], [msg({ id: '1' })]);
    expect(flattenMessages(data).map((m) => m.id)).toEqual(['1', '2', '3']);
  });
});

describe('conversation list', () => {
  const list = [
    conv({ id: 'c1', lastMessageAt: '2026-01-01T09:00:00.000Z' }),
    conv({ id: 'c2', lastMessageAt: '2026-01-01T09:30:00.000Z' }),
  ];

  it('moves a conversation to the top and counts unread messages from others', () => {
    const result = applyNewMessage(list, msg({ conversationId: 'c1', senderId: 'bob' }), {
      meId: 'alice',
      activeId: null,
    })!;
    expect(result.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(result[0]!.unreadCount).toBe(1);
    expect(result[0]!.lastMessage?.text).toBe('hi');
  });

  it('does not count my own messages or the open conversation as unread', () => {
    const mine = applyNewMessage(list, msg({ senderId: 'alice' }), {
      meId: 'alice',
      activeId: null,
    })!;
    const open = applyNewMessage(list, msg({ senderId: 'bob' }), {
      meId: 'alice',
      activeId: 'c1',
    })!;
    expect(mine[0]!.unreadCount).toBe(0);
    expect(open[0]!.unreadCount).toBe(0);
  });

  it('counts a message once even if it arrives twice', () => {
    const once = applyNewMessage(list, msg({ senderId: 'bob' }), { meId: 'alice', activeId: null });
    const twice = applyNewMessage(once, msg({ senderId: 'bob' }), {
      meId: 'alice',
      activeId: null,
    })!;
    expect(twice[0]!.unreadCount).toBe(1);
  });

  it('keeps the local unread count when a conversation update arrives', () => {
    const withUnread = [conv({ id: 'c1', unreadCount: 3 })];
    const result = upsertConversation(withUnread, conv({ id: 'c1', name: 'Renamed' }))!;
    expect(result[0]).toMatchObject({ name: 'Renamed', unreadCount: 3 });
  });

  it('applies read receipts and clears my unread count', () => {
    const at = '2026-01-01T11:00:00.000Z';
    const [mine] = applyRead(
      [conv({ unreadCount: 2 })],
      { conversationId: 'c1', userId: 'alice', lastReadAt: at },
      'alice',
    )!;
    expect(mine!.unreadCount).toBe(0);
    const [theirs] = applyRead(
      [conv()],
      { conversationId: 'c1', userId: 'bob', lastReadAt: at },
      'alice',
    )!;
    expect(theirs!.members.find((m) => m.user.id === 'bob')!.lastReadAt).toBe(at);
  });

  it('drops a conversation I was removed from', () => {
    expect(
      removeMember(list, { conversationId: 'c1', userId: 'alice' }, 'alice')!.map((c) => c.id),
    ).toEqual(['c2']);
  });
});

describe('read receipts and typing labels', () => {
  it('reports who has seen a message', () => {
    const c = conv({
      members: [
        {
          user: { id: 'alice' },
          role: 'member',
          joinedAt: '',
          lastReadAt: '2026-01-01T12:00:00.000Z',
        },
        {
          user: { id: 'bob' },
          role: 'member',
          joinedAt: '',
          lastReadAt: '2026-01-01T09:00:00.000Z',
        },
      ],
    });
    expect(seenBy(c, msg({ senderId: 'bob' })).map((m) => m.user.id)).toEqual(['alice']);
    expect(seenBy(c, msg({ senderId: 'alice' }))).toEqual([]);
  });

  it('describes who is typing', () => {
    const group = conv({
      type: 'group',
      members: ['alice', 'bob', 'carol'].map((id) => ({
        user: {
          id,
          username: id,
          displayName: `${id[0]!.toUpperCase()}${id.slice(1)} X`,
          avatarUrl: null,
          lastSeenAt: null,
        },
        role: 'member' as const,
        joinedAt: '',
        lastReadAt: '',
      })),
    });
    expect(typingLabel(group, [])).toBeNull();
    expect(typingLabel(group, ['bob'])).toBe('Bob is typing…');
    expect(typingLabel(group, ['bob', 'carol'])).toBe('Bob and Carol are typing…');
    expect(typingLabel(conv(), ['bob'])).toBe('typing…');
  });
});
