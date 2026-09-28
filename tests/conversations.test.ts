import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createUser, resetDb } from './helpers/db.js';

const app = createApp();

describe('direct conversations', () => {
  beforeEach(resetDb);

  it('creates a DM once and returns the same one afterwards (from either side)', async () => {
    const alice = await createUser('alice');
    const bob = await createUser('bob');

    const first = await request(app)
      .post('/api/v1/conversations/direct')
      .set(alice.auth)
      .send({ userId: bob.id });
    expect(first.status).toBe(201);
    expect(first.body.conversation.type).toBe('direct');
    expect(first.body.conversation.members).toHaveLength(2);

    const again = await request(app)
      .post('/api/v1/conversations/direct')
      .set(bob.auth)
      .send({ userId: alice.id });
    expect(again.status).toBe(200);
    expect(again.body.conversation.id).toBe(first.body.conversation.id);
  });

  it('does not create duplicates under concurrent requests', async () => {
    const alice = await createUser('alice');
    const bob = await createUser('bob');
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        request(app)
          .post('/api/v1/conversations/direct')
          .set(i % 2 ? alice.auth : bob.auth)
          .send({ userId: i % 2 ? bob.id : alice.id }),
      ),
    );
    const ids = new Set(results.map((r) => r.body.conversation.id));
    expect(ids.size).toBe(1);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
  });

  it('rejects chatting with yourself or unknown users', async () => {
    const alice = await createUser('alice');
    const self = await request(app)
      .post('/api/v1/conversations/direct')
      .set(alice.auth)
      .send({ userId: alice.id });
    expect(self.status).toBe(400);

    const ghost = await request(app)
      .post('/api/v1/conversations/direct')
      .set(alice.auth)
      .send({ userId: '64b7f0000000000000000000' });
    expect(ghost.status).toBe(400);
  });
});

describe('group conversations', () => {
  beforeEach(resetDb);

  async function group() {
    const owner = await createUser('owner');
    const m1 = await createUser('member1');
    const m2 = await createUser('member2');
    const res = await request(app)
      .post('/api/v1/conversations/group')
      .set(owner.auth)
      .send({ name: 'Team', memberIds: [m1.id, m2.id] });
    return { owner, m1, m2, id: res.body.conversation.id as string, res };
  }

  it('creates a group with the creator as admin', async () => {
    const { res, owner } = await group();
    expect(res.status).toBe(201);
    expect(res.body.conversation.members).toHaveLength(3);
    const admin = res.body.conversation.members.find((m: { role: string }) => m.role === 'admin');
    expect(admin.user.id).toBe(owner.id);
  });

  it('only lets admins rename and add members', async () => {
    const { id, owner, m1 } = await group();
    const newbie = await createUser('newbie');

    const denied = await request(app)
      .patch(`/api/v1/conversations/${id}`)
      .set(m1.auth)
      .send({ name: 'Hacked' });
    expect(denied.status).toBe(403);

    const renamed = await request(app)
      .patch(`/api/v1/conversations/${id}`)
      .set(owner.auth)
      .send({ name: 'Core Team' });
    expect(renamed.body.conversation.name).toBe('Core Team');

    const added = await request(app)
      .post(`/api/v1/conversations/${id}/members`)
      .set(owner.auth)
      .send({ userIds: [newbie.id] });
    expect(added.body.conversation.members).toHaveLength(4);
  });

  it('promotes a new admin when the last admin leaves', async () => {
    const { id, owner, m1 } = await group();
    const leave = await request(app)
      .delete(`/api/v1/conversations/${id}/members/${owner.id}`)
      .set(owner.auth);
    expect(leave.status).toBe(200);

    const convo = await request(app).get(`/api/v1/conversations/${id}`).set(m1.auth);
    expect(convo.body.conversation.members).toHaveLength(2);
    expect(convo.body.conversation.members.some((m: { role: string }) => m.role === 'admin')).toBe(
      true,
    );
  });

  it('hides conversations from non-members', async () => {
    const { id } = await group();
    const outsider = await createUser('outsider');
    const res = await request(app).get(`/api/v1/conversations/${id}`).set(outsider.auth);
    expect(res.status).toBe(404);
  });

  it('lists only my conversations', async () => {
    const { m1 } = await group();
    const other = await createUser('other');
    await request(app).post('/api/v1/conversations/direct').set(m1.auth).send({ userId: other.id });

    const mine = await request(app).get('/api/v1/conversations').set(m1.auth);
    expect(mine.body.data).toHaveLength(2);

    const theirs = await request(app).get('/api/v1/conversations').set(other.auth);
    expect(theirs.body.data).toHaveLength(1);
  });
});
