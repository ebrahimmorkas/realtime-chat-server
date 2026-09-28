// Minimal vanilla-JS client demonstrating the REST + Socket.IO API.
/* global io */

const $ = (id) => document.getElementById(id);

const state = {
  token: localStorage.getItem('token'),
  me: null,
  conversations: new Map(),
  activeId: null,
  online: new Set(),
  socket: null,
  typingTimeouts: new Map(),
  lastTypingSent: 0,
  stopTypingTimer: null,
};

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(state.token && { Authorization: `Bearer ${state.token}` }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? 'Request failed');
  return data;
}

// ---------- auth ----------
let registering = false;

$('auth-toggle').addEventListener('click', () => {
  registering = !registering;
  $('auth-view').classList.toggle('register', registering);
  $('auth-submit').textContent = registering ? 'Create account' : 'Sign in';
  $('auth-toggle').textContent = registering ? 'Have an account? Sign in' : 'No account? Register';
  $('auth-subtitle').textContent = registering ? 'Create an account' : 'Sign in to start chatting';
});

$('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = Object.fromEntries(new FormData(e.target));
  $('auth-error').textContent = '';
  try {
    const data = registering
      ? await api('/auth/register', {
          method: 'POST',
          body: {
            username: form.username,
            displayName: form.displayName,
            email: form.email,
            password: form.password,
          },
        })
      : await api('/auth/login', {
          method: 'POST',
          body: { login: form.login, password: form.password },
        });
    state.token = data.token;
    localStorage.setItem('token', data.token);
    await start();
  } catch (err) {
    $('auth-error').textContent = err.message;
  }
});

$('logout').addEventListener('click', () => {
  localStorage.removeItem('token');
  location.reload();
});

// ---------- rendering ----------
function otherMembers(conversation) {
  return conversation.members.filter((m) => m.user.id !== state.me.id).map((m) => m.user);
}

function titleOf(conversation) {
  if (conversation.type === 'group') return conversation.name;
  return otherMembers(conversation)[0]?.displayName ?? 'Unknown';
}

function isOnline(conversation) {
  return otherMembers(conversation).some((u) => state.online.has(u.id));
}

function renderConversations() {
  const list = $('conversation-list');
  list.replaceChildren();
  const sorted = [...state.conversations.values()].sort(
    (a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt),
  );
  for (const c of sorted) {
    const li = document.createElement('li');
    li.className = `conversation${c.id === state.activeId ? ' active' : ''}`;
    const name = document.createElement('div');
    name.className = 'name';
    const dot = document.createElement('span');
    dot.className = `dot${isOnline(c) ? ' online' : ''}`;
    name.append(dot, document.createTextNode(titleOf(c)));
    const preview = document.createElement('div');
    preview.className = 'preview';
    preview.textContent =
      c.lastMessage?.text || (c.lastMessage ? 'Message deleted' : 'No messages yet');
    li.append(name, preview);
    if (c.unreadCount > 0) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = c.unreadCount;
      li.append(badge);
    }
    li.addEventListener('click', () => openConversation(c.id));
    list.append(li);
  }
}

function messageElement(message) {
  const li = document.createElement('li');
  li.dataset.id = message.id ?? '';
  li.dataset.clientId = message.clientId ?? '';
  const mine = message.senderId === state.me.id;
  li.className = `message${mine ? ' mine' : ''}${message.pending ? ' pending' : ''}${message.deleted ? ' deleted' : ''}`;
  li.textContent = message.deleted ? 'This message was deleted' : message.text;
  const meta = document.createElement('span');
  meta.className = 'meta';
  const time = new Date(message.createdAt ?? Date.now()).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  meta.textContent = `${time}${message.editedAt ? ' · edited' : ''}${message.pending ? ' · sending…' : ''}`;
  li.append(meta);
  return li;
}

function appendMessage(message) {
  const list = $('messages');
  const existing =
    (message.clientId &&
      list.querySelector(`[data-client-id="${CSS.escape(message.clientId)}"]`)) ||
    (message.id && list.querySelector(`[data-id="${CSS.escape(message.id)}"]`));
  const el = messageElement(message);
  if (existing) existing.replaceWith(el);
  else list.append(el);
  list.scrollTop = list.scrollHeight;
}

function renderThreadHeader() {
  const c = state.conversations.get(state.activeId);
  if (!c) return;
  $('thread-title').textContent = titleOf(c);
  if (c.type === 'group') {
    $('thread-status').textContent = `${c.members.length} members`;
  } else {
    const other = otherMembers(c)[0];
    $('thread-status').textContent = state.online.has(other?.id)
      ? 'online'
      : other?.lastSeenAt
        ? `last seen ${new Date(other.lastSeenAt).toLocaleString()}`
        : 'offline';
  }
}

// ---------- conversations ----------
async function openConversation(id) {
  state.activeId = id;
  document.querySelector('.chat').classList.add('thread-open');
  $('composer').hidden = false;
  $('typing').textContent = '';
  renderThreadHeader();

  const { data } = await api(`/conversations/${id}/messages?limit=50`);
  $('messages').replaceChildren();
  data.reverse().forEach(appendMessage);

  const c = state.conversations.get(id);
  c.unreadCount = 0;
  renderConversations();
  state.socket.emit('conversation:read', { conversationId: id });
  $('composer-input').focus();
}

let searchTimer;
$('user-search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if (!q) return $('search-results').replaceChildren();
  searchTimer = setTimeout(async () => {
    const { data } = await api(`/users?search=${encodeURIComponent(q)}`);
    const results = $('search-results');
    results.replaceChildren();
    for (const user of data) {
      const li = document.createElement('li');
      li.textContent = `${user.displayName} (@${user.username})`;
      li.addEventListener('click', async () => {
        const { conversation } = await api('/conversations/direct', {
          method: 'POST',
          body: { userId: user.id },
        });
        state.conversations.set(conversation.id, conversation);
        $('user-search').value = '';
        results.replaceChildren();
        renderConversations();
        openConversation(conversation.id);
      });
      results.append(li);
    }
  }, 250);
});

// ---------- composer ----------
$('composer').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('composer-input');
  const text = input.value.trim();
  if (!text || !state.activeId) return;
  input.value = '';

  const clientId = crypto.randomUUID();
  appendMessage({ clientId, text, senderId: state.me.id, pending: true });
  state.socket.emit('typing:stop', { conversationId: state.activeId });
  state.socket.emit('message:send', { conversationId: state.activeId, text, clientId }, (ack) => {
    if (!ack.ok) {
      const el = document.querySelector(`[data-client-id="${clientId}"]`);
      if (el) el.querySelector('.meta').textContent = `failed: ${ack.error.message}`;
    }
  });
});

$('composer-input').addEventListener('input', () => {
  if (!state.activeId) return;
  const now = Date.now();
  if (now - state.lastTypingSent > 2000) {
    state.socket.emit('typing:start', { conversationId: state.activeId });
    state.lastTypingSent = now;
  }
  clearTimeout(state.stopTypingTimer);
  state.stopTypingTimer = setTimeout(() => {
    state.socket.emit('typing:stop', { conversationId: state.activeId });
    state.lastTypingSent = 0;
  }, 3000);
});

// ---------- socket ----------
function connectSocket() {
  const socket = io({ auth: { token: state.token } });
  state.socket = socket;

  socket.on('connect', () => ($('connection-status').textContent = 'connected'));
  socket.on('disconnect', () => ($('connection-status').textContent = 'reconnecting…'));
  socket.on('connect_error', (err) => {
    if (err.message === 'UNAUTHORIZED') {
      localStorage.removeItem('token');
      location.reload();
    }
  });

  socket.on('session:ready', ({ onlineContacts }) => {
    state.online = new Set(onlineContacts);
    renderConversations();
    renderThreadHeader();
  });

  socket.on('presence:update', ({ userId, online, lastSeenAt }) => {
    if (online) state.online.add(userId);
    else state.online.delete(userId);
    for (const c of state.conversations.values()) {
      for (const m of c.members)
        if (m.user.id === userId && lastSeenAt) m.user.lastSeenAt = lastSeenAt;
    }
    renderConversations();
    renderThreadHeader();
  });

  socket.on('message:new', (message) => {
    const c = state.conversations.get(message.conversationId);
    if (!c) return;
    c.lastMessage = { text: message.text, createdAt: message.createdAt };
    c.lastMessageAt = message.createdAt;
    if (message.conversationId === state.activeId) {
      appendMessage(message);
      if (message.senderId !== state.me.id) {
        socket.emit('conversation:read', { conversationId: message.conversationId });
      }
    } else if (message.senderId !== state.me.id) {
      c.unreadCount += 1;
    }
    renderConversations();
  });

  socket.on('message:updated', (message) => {
    if (message.conversationId === state.activeId) appendMessage(message);
  });

  socket.on('message:deleted', ({ conversationId, messageId }) => {
    if (conversationId !== state.activeId) return;
    const el = document.querySelector(`[data-id="${CSS.escape(messageId)}"]`);
    if (el) el.replaceWith(messageElement({ id: messageId, deleted: true, senderId: '' }));
  });

  socket.on('conversation:new', (conversation) => {
    state.conversations.set(conversation.id, conversation);
    renderConversations();
  });

  socket.on('conversation:updated', (conversation) => {
    const existing = state.conversations.get(conversation.id);
    state.conversations.set(conversation.id, {
      ...conversation,
      unreadCount: existing?.unreadCount ?? 0,
    });
    renderConversations();
    renderThreadHeader();
  });

  socket.on('typing', ({ conversationId, userId, isTyping }) => {
    if (conversationId !== state.activeId) return;
    const c = state.conversations.get(conversationId);
    const user = c?.members.find((m) => m.user.id === userId)?.user;
    clearTimeout(state.typingTimeouts.get(userId));
    if (!isTyping) {
      $('typing').textContent = '';
      return;
    }
    $('typing').textContent = `${user?.displayName ?? 'Someone'} is typing…`;
    state.typingTimeouts.set(
      userId,
      setTimeout(() => ($('typing').textContent = ''), 4000),
    );
  });
}

// ---------- boot ----------
async function start() {
  try {
    const { user } = await api('/auth/me');
    state.me = user;
  } catch {
    localStorage.removeItem('token');
    state.token = null;
    return;
  }
  $('auth-view').hidden = true;
  $('chat-view').hidden = false;
  $('me-name').textContent = state.me.displayName;

  const { data } = await api('/conversations');
  for (const c of data) state.conversations.set(c.id, c);
  renderConversations();
  connectSocket();
}

if (state.token) start();
