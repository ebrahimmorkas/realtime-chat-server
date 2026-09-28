import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createUser, resetDb } from './helpers/db.js';

const app = createApp();

async function dm() {
  const alice = await createUser('alice');
  const bob = await createUser('bob');
  const res = await request(app)
    .post('/api/v1/conversations/direct')
    .set(alice.auth)
    .send({ userId: bob.id });
  return { alice, bob, id: res.body.conversation.id as string };
}

const send = (auth: Record<string, string>, id: string, body: object) =>
  request(app).post(`/api/v1/conversations/${id}/messages`).set(auth).send(body);

describe('messages', () => {
  beforeEach(resetDb);

  it('sends messages and updates the conversation preview', async () => {
    const { alice, bob, id } = await dm();
    const res = await send(alice.auth, id, { text: 'Hello Bob!' });
    expect(res.status).toBe(201);
    expect(res.body.message).toMatchObject({ text: 'Hello Bob!', senderId: alice.id });

    const list = await request(app).get('/api/v1/conversations').set(bob.auth);
    expect(list.body.data[0].lastMessage.text).toBe('Hello Bob!');
    expect(list.body.data[0].unreadCount).toBe(1);
  });

  it('deduplicates retries that reuse a clientId', async () => {
    const { alice, id } = await dm();
    const first = await send(alice.auth, id, { text: 'once', clientId: 'c-1' });
    const retry = await send(alice.auth, id, { text: 'once', clientId: 'c-1' });
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.message.id).toBe(first.body.message.id);

    const history = await request(app).get(`/api/v1/conversations/${id}/messages`).set(alice.auth);
    expect(history.body.data).toHaveLength(1);
  });

  it('paginates history newest-first with a cursor', async () => {
    const { alice, id } = await dm();
    for (let i = 1; i <= 5; i++) await send(alice.auth, id, { text: `m${i}` });

    const page1 = await request(app)
      .get(`/api/v1/conversations/${id}/messages?limit=2`)
      .set(alice.auth);
    expect(page1.body.data.map((m: { text: string }) => m.text)).toEqual(['m5', 'm4']);
    expect(page1.body.nextCursor).toBeTruthy();

    const page2 = await request(app)
      .get(`/api/v1/conversations/${id}/messages?limit=2&before=${page1.body.nextCursor}`)
      .set(alice.auth);
    expect(page2.body.data.map((m: { text: string }) => m.text)).toEqual(['m3', 'm2']);

    const page3 = await request(app)
      .get(`/api/v1/conversations/${id}/messages?limit=2&before=${page2.body.nextCursor}`)
      .set(alice.auth);
    expect(page3.body.data).toHaveLength(1);
    expect(page3.body.nextCursor).toBeNull();
  });

  it('lets only the sender edit or delete a message', async () => {
    const { alice, bob, id } = await dm();
    const msg = (await send(alice.auth, id, { text: 'typo' })).body.message;

    const hijack = await request(app)
      .patch(`/api/v1/messages/${msg.id}`)
      .set(bob.auth)
      .send({ text: 'mine now' });
    expect(hijack.status).toBe(403);

    const edited = await request(app)
      .patch(`/api/v1/messages/${msg.id}`)
      .set(alice.auth)
      .send({ text: 'fixed' });
    expect(edited.body.message).toMatchObject({ text: 'fixed' });
    expect(edited.body.message.editedAt).toBeTruthy();

    const del = await request(app).delete(`/api/v1/messages/${msg.id}`).set(alice.auth);
    expect(del.status).toBe(204);

    const history = await request(app).get(`/api/v1/conversations/${id}/messages`).set(bob.auth);
    expect(history.body.data[0]).toMatchObject({ deleted: true, text: null });
  });

  it('tracks read receipts and unread counts', async () => {
    const { alice, bob, id } = await dm();
    await send(alice.auth, id, { text: 'one' });
    await send(alice.auth, id, { text: 'two' });

    let bobList = await request(app).get('/api/v1/conversations').set(bob.auth);
    expect(bobList.body.data[0].unreadCount).toBe(2);

    // Own messages never count as unread.
    const aliceList = await request(app).get('/api/v1/conversations').set(alice.auth);
    expect(aliceList.body.data[0].unreadCount).toBe(0);

    const read = await request(app).post(`/api/v1/conversations/${id}/read`).set(bob.auth);
    expect(read.status).toBe(200);

    bobList = await request(app).get('/api/v1/conversations').set(bob.auth);
    expect(bobList.body.data[0].unreadCount).toBe(0);
  });

  it('blocks non-members and validates input', async () => {
    const { id } = await dm();
    const outsider = await createUser('mallory');
    expect((await send(outsider.auth, id, { text: 'hi' })).status).toBe(404);

    const { alice } = { alice: await createUser('zed') };
    expect((await send(alice.auth, id, { text: '' })).status).toBe(400);
  });
});
