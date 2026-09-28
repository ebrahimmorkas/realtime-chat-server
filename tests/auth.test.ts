import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createUser, resetDb } from './helpers/db.js';

const app = createApp();
const alice = {
  username: 'Alice',
  email: 'alice@example.com',
  displayName: 'Alice Liddell',
  password: 'Wonderland1',
};

describe('auth', () => {
  beforeEach(resetDb);

  it('registers and logs in with username or email', async () => {
    const reg = await request(app).post('/api/v1/auth/register').send(alice);
    expect(reg.status).toBe(201);
    expect(reg.body.user).toMatchObject({ username: 'alice', displayName: 'Alice Liddell' });
    expect(reg.body.user.passwordHash).toBeUndefined();
    expect(reg.body.token).toBeTypeOf('string');

    for (const login of ['alice', 'ALICE@example.com']) {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ login, password: alice.password });
      expect(res.status).toBe(200);
    }

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${reg.body.token}`);
    expect(me.body.user.username).toBe('alice');
  });

  it('rejects duplicates, invalid usernames and bad credentials', async () => {
    await request(app).post('/api/v1/auth/register').send(alice);

    const dup = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...alice, email: 'other@example.com' });
    expect(dup.status).toBe(409);

    const badName = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...alice, username: 'no spaces!', email: 'x@example.com' });
    expect(badName.status).toBe(400);

    const wrong = await request(app)
      .post('/api/v1/auth/login')
      .send({ login: 'alice', password: 'nope12345' });
    expect(wrong.status).toBe(401);
  });

  it('requires a token for protected routes', async () => {
    const res = await request(app).get('/api/v1/users');
    expect(res.status).toBe(401);
  });
});

describe('users', () => {
  beforeEach(resetDb);

  it('searches users by prefix, excluding the caller', async () => {
    const me = await createUser('bob');
    await createUser('bobby');
    await createUser('carol');

    const res = await request(app).get('/api/v1/users?search=bob').set(me.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.map((u: { username: string }) => u.username)).toEqual(['bobby']);
  });

  it('treats regex characters in search literally', async () => {
    const me = await createUser('dave');
    const res = await request(app).get('/api/v1/users?search=.*').set(me.auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('returns 404 for unknown or malformed ids', async () => {
    const me = await createUser('erin');
    expect((await request(app).get('/api/v1/users/not-an-id').set(me.auth)).status).toBe(404);
    expect(
      (await request(app).get('/api/v1/users/64b7f0000000000000000000').set(me.auth)).status,
    ).toBe(404);
  });
});
