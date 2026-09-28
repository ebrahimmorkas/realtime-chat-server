import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createUser, resetDb } from './helpers/db.js';
import {
  connect,
  disconnectAll,
  emitWithAck,
  nextEvent,
  startTestServer,
  type TestServer,
} from './helpers/socket.js';

/**
 * Two independent server instances connected only through Redis. Proves that
 * rooms, broadcasts and presence work across a horizontally scaled deployment.
 */
describe.skipIf(process.env.REDIS_ENABLED !== 'true')('horizontal scaling (Redis adapter)', () => {
  let a: TestServer;
  let b: TestServer;

  beforeAll(async () => {
    a = await startTestServer();
    b = await startTestServer();
  });
  afterAll(async () => {
    disconnectAll();
    await a.sockets.close();
    await b.sockets.close();
  });
  beforeEach(resetDb);

  it('delivers messages and presence between clients on different instances', async () => {
    const alice = await createUser('alice');
    const bob = await createUser('bob');
    const dm = await request(a.httpServer)
      .post('/api/v1/conversations/direct')
      .set(alice.auth)
      .send({ userId: bob.id });
    const conversationId = dm.body.conversation.id as string;

    const bobOnB = await connect(b.url, bob.token);
    const presence = nextEvent(bobOnB.socket, 'presence:update');
    const aliceOnA = await connect(a.url, alice.token);
    expect(await presence).toMatchObject({ userId: alice.id, online: true });

    const received = nextEvent<{ text: string }>(bobOnB.socket, 'message:new');
    const ack = await emitWithAck(aliceOnA.socket, 'message:send', {
      conversationId,
      text: 'across instances',
    });
    expect(ack.ok).toBe(true);
    expect((await received).text).toBe('across instances');
  });
});
