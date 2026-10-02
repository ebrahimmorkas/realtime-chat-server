import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useMe } from '@/features/auth/auth-context';
import { api } from '@/lib/api';
import type { Conversation, Message, MessagePage, User } from '@/lib/types';
import {
  applyMessageChange,
  applyNewMessage,
  conversationKeys,
  patchMessage,
  upsertConversation,
  upsertMessage,
  type MessagesData,
} from './cache';
import { useChatSocket } from './socket-context';

const PAGE_SIZE = 30;

/** The inbox. Socket handlers keep it current, so it only refetches after a reconnect. */
export function useConversations() {
  return useQuery({
    queryKey: conversationKeys.all,
    queryFn: async ({ signal }) =>
      (await api<{ data: Conversation[] }>('/conversations', { signal })).data,
    staleTime: Infinity,
  });
}

export function useConversation(conversationId: string) {
  const query = useConversations();
  return { ...query, conversation: query.data?.find((c) => c.id === conversationId) };
}

export function useMessages(conversationId: string) {
  return useInfiniteQuery({
    queryKey: conversationKeys.messages(conversationId),
    queryFn: ({ pageParam, signal }) =>
      api<MessagePage>(`/conversations/${conversationId}/messages`, {
        query: { before: pageParam, limit: PAGE_SIZE },
        signal,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: Infinity,
  });
}

export function useUserSearch(term: string) {
  return useQuery({
    queryKey: ['users', term],
    queryFn: ({ signal }) =>
      api<{ data: User[] }>('/users', { query: { search: term, limit: 10 }, signal }),
    select: (res) => res.data,
    enabled: term.trim().length > 0,
    placeholderData: keepPreviousData,
  });
}

function useStoreConversation() {
  const queryClient = useQueryClient();
  return (conversation: Conversation) =>
    queryClient.setQueryData<Conversation[]>(conversationKeys.all, (list) =>
      upsertConversation(list, conversation),
    );
}

export function useOpenDirect() {
  const store = useStoreConversation();
  return useMutation({
    mutationFn: (userId: string) =>
      api<{ conversation: Conversation }>('/conversations/direct', {
        method: 'POST',
        body: { userId },
      }).then((r) => r.conversation),
    onSuccess: store,
  });
}

export function useCreateGroup() {
  const store = useStoreConversation();
  return useMutation({
    mutationFn: (input: { name: string; memberIds: string[] }) =>
      api<{ conversation: Conversation }>('/conversations/group', {
        method: 'POST',
        body: input,
      }).then((r) => r.conversation),
    onSuccess: store,
  });
}

export function useRenameGroup(conversationId: string) {
  const store = useStoreConversation();
  return useMutation({
    mutationFn: (name: string) =>
      api<{ conversation: Conversation }>(`/conversations/${conversationId}`, {
        method: 'PATCH',
        body: { name },
      }).then((r) => r.conversation),
    onSuccess: store,
  });
}

export function useAddMembers(conversationId: string) {
  const store = useStoreConversation();
  return useMutation({
    mutationFn: (userIds: string[]) =>
      api<{ conversation: Conversation }>(`/conversations/${conversationId}/members`, {
        method: 'POST',
        body: { userIds },
      }).then((r) => r.conversation),
    onSuccess: store,
  });
}

export function useRemoveMember(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api(`/conversations/${conversationId}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: conversationKeys.all }),
  });
}

function useMessageCache(conversationId: string) {
  const queryClient = useQueryClient();
  return (fn: (d: MessagesData | undefined) => MessagesData | undefined) =>
    queryClient.setQueryData<MessagesData>(conversationKeys.messages(conversationId), fn);
}

export function useEditMessage(conversationId: string) {
  const setMessages = useMessageCache(conversationId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      api<{ message: Message }>(`/messages/${id}`, { method: 'PATCH', body: { text } }).then(
        (r) => r.message,
      ),
    onSuccess: (message) => {
      setMessages((d) => upsertMessage(d, message));
      queryClient.setQueryData<Conversation[]>(conversationKeys.all, (list) =>
        applyMessageChange(list, message),
      );
    },
  });
}

export function useDeleteMessage(conversationId: string) {
  const setMessages = useMessageCache(conversationId);
  return useMutation({
    mutationFn: (id: string) => api(`/messages/${id}`, { method: 'DELETE' }),
    onSuccess: (_res, id) =>
      setMessages((d) => patchMessage(d, (m) => m.id === id, { deleted: true, text: null })),
  });
}

/**
 * Optimistic send: the message appears instantly as "sending", is replaced by
 * the server copy on acknowledgement, and is marked "failed" (with retry) if
 * the server can't be reached. Retries reuse the clientId, so the server
 * stores the message at most once.
 */
export function useSendMessage(conversationId: string) {
  const me = useMe();
  const queryClient = useQueryClient();
  const { sendMessage } = useChatSocket();
  const setMessages = useMessageCache(conversationId);

  const deliver = async (text: string, clientId: string, createdAt: string) => {
    const optimistic: Message = {
      id: `temp-${clientId}`,
      conversationId,
      senderId: me.id,
      text,
      clientId,
      createdAt,
      editedAt: null,
      deleted: false,
      status: 'sending',
    };
    setMessages((d) => upsertMessage(d, optimistic));
    try {
      const saved = await sendMessage(conversationId, text, clientId);
      setMessages((d) => upsertMessage(d, saved));
      queryClient.setQueryData<Conversation[]>(conversationKeys.all, (list) =>
        applyNewMessage(list, saved, { meId: me.id, activeId: conversationId }),
      );
    } catch {
      setMessages((d) =>
        patchMessage(d, (m) => m.clientId === clientId && m.status !== undefined, {
          status: 'failed',
        }),
      );
    }
  };

  return {
    send: (text: string) => deliver(text, crypto.randomUUID(), new Date().toISOString()),
    retry: (message: Message) =>
      message.clientId && message.text
        ? deliver(message.text, message.clientId, message.createdAt)
        : Promise.resolve(),
  };
}
