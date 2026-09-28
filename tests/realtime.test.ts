import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { UserModel } from '../src/modules/users/user.model.js';
import { createUser, resetDb } from './helpers/db.js';
import {
  connect,
  disconnectAll,
  emitWithAck,
  nextEvent,
  noEvent,
  startTestServer,
  type TestServer,
} from './helpers/socket.js';

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer();
});
afterAll(async () => {
  await server.sockets.close();
});
beforeEach(resetDb);
afterEach(disconnectAll);

async function dm() {
  const alice = await createUser('alice');
  const bob = await createUser('bob');
  const res = await request(server.httpServer)
    .post('/api/v1/conversations/direct')
    .set(alice.auth)
    .send({ userId: bob.id });
  return { alice, bob, conversationId: res.body.conversation.id as string };
}

describe('realtime', () => {
  it('rejects connections without a valid token', async () => {
    await expect(connect(server.url, 'not-a-token')).rejects.toThrow('UNAUTHORIZED');
  });

  it('delivers socket messages to other members and acknowledges the sender', async () => {
    const { alice, bob, conversationId } = await dm();
    const a = await connect(server.url, alice.token);
    const b = await connect(server.url, bob.token);

    const received = nextEvent<{ text: string; senderId: string }>(b.socket, 'message:new');
    const ack = await emitWithAck(a.socket, 'message:send', {
      conversationId,
      text: 'hi over websockets',
      clientId: 'tmp-1',
    });

    expect(ack.ok).toBe(true);
    expect(await received).toMatchObject({ text: 'hi over websockets', senderId: alice.id });
  });

  it('pushes messages sent over REST to connected clients', async () => {
    const { alice, bob, conversationId } = await dm();
    const b = await connect(server.url, bob.token);
    const received = nextEvent<{ text: string }>(b.socket, 'message:new');

    await request(server.httpServer)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set(alice.auth)
      .send({ text: 'sent via REST' });

    expect((await received).text).toBe('sent via REST');
  });

  it('relays typing indicators to other members only', async () => {
    const { alice, bob, conversationId } = await dm();
    const a = await connect(server.url, alice.token);
    const b = await connect(server.url, bob.token);

    const bobSees = nextEvent(b.socket, 'typing');
    const aliceSeesOwn = noEvent(a.socket, 'typing');
    a.socket.emit('typing:start', { conversationId });

    expect(await bobSees).toEqual({ conversationId, userId: alice.id, isTyping: true });
    expect(await aliceSeesOwn).toBe(true);
  });

  it('ignores typing events for conversations the user is not in', async () => {
    const { bob, conversationId } = await dm();
    const mallory = await createUser('mallory');
    const m = await connect(server.url, mallory.token);
    const b = await connect(server.url, bob.token);

    const silent = noEvent(b.socket, 'typing');
    m.socket.emit('typing:start', { conversationId });
    expect(await silent).toBe(true);
  });

  it('tracks presence across multiple tabs and records last seen', async () => {
    const { alice, bob } = await dm();
    const b = await connect(server.url, bob.token);

    const online = nextEvent(b.socket, 'presence:update');
    const tab1 = await connect(server.url, alice.token);
    expect(await online).toEqual({ userId: alice.id, online: true });
    expect(tab1.ready.onlineContacts).toEqual([bob.id]);

    const tab2 = await connect(server.url, alice.token);
    // Closing one of two tabs must not flip Alice to offline.
    const stillOnline = noEvent(b.socket, 'presence:update', 400);
    tab1.socket.disconnect();
    expect(await stillOnline).toBe(true);

    const offline = nextEvent<{ online: boolean; lastSeenAt: string }>(b.socket, 'presence:update');
    tab2.socket.disconnect();
    expect(await offline).toMatchObject({ userId: alice.id, online: false });

    const stored = await UserModel.findById(alice.id);
    expect(stored?.lastSeenAt).toBeInstanceOf(Date);
  });

  it('joins sockets to conversations created after they connected', async () => {
    const alice = await createUser('alice');
    const bob = await createUser('bob');
    const a = await connect(server.url, alice.token);
    const b = await connect(server.url, bob.token);

    const invite = nextEvent<{ id: string }>(b.socket, 'conversation:new');
    const created = await request(server.httpServer)
      .post('/api/v1/conversations/direct')
      .set(alice.auth)
      .send({ userId: bob.id });
    const conversation = await invite;
    expect(conversation.id).toBe(created.body.conversation.id);

    const message = nextEvent<{ text: string }>(b.socket, 'message:new');
    await emitWithAck(a.socket, 'message:send', { conversationId: conversation.id, text: 'yo' });
    expect((await message).text).toBe('yo');
  });

  it('stops delivering to members removed from a group', async () => {
    const owner = await createUser('owner');
    const bob = await createUser('bob');
    const carol = await createUser('carol');
    const group = await request(server.httpServer)
      .post('/api/v1/conversations/group')
      .set(owner.auth)
      .send({ name: 'Team', memberIds: [bob.id, carol.id] });
    const conversationId = group.body.conversation.id as string;

    const o = await connect(server.url, owner.token);
    const c = await connect(server.url, carol.token);

    const removed = nextEvent(c.socket, 'conversation:member-removed');
    await request(server.httpServer)
      .delete(`/api/v1/conversations/${conversationId}/members/${carol.id}`)
      .set(owner.auth);
    await removed;

    const carolHearsNothing = noEvent(c.socket, 'message:new');
    await emitWithAck(o.socket, 'message:send', { conversationId, text: 'secret plans' });
    expect(await carolHearsNothing).toBe(true);
  });

  it('broadcasts read receipts', async () => {
    const { alice, bob, conversationId } = await dm();
    const a = await connect(server.url, alice.token);
    const b = await connect(server.url, bob.token);

    const receipt = nextEvent<{ userId: string }>(a.socket, 'conversation:read');
    const ack = await emitWithAck(b.socket, 'conversation:read', { conversationId });
    expect(ack.ok).toBe(true);
    expect((await receipt).userId).toBe(bob.id);
  });

  it('rate limits message floods and validates payloads', async () => {
    const { alice, conversationId } = await dm();
    const a = await connect(server.url, alice.token);

    const invalid = await emitWithAck(a.socket, 'message:send', { conversationId, text: '' });
    expect(invalid).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });

    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(await emitWithAck(a.socket, 'message:send', { conversationId, text: `#${i}` }));
    }
    expect(results.slice(0, 4).every((r) => r.ok)).toBe(true);
    expect(results.at(-1)).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
  });
});
