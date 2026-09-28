import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createRateLimiter } from '../src/middleware/rate-limit.js';

describe('rate limiter', () => {
  it('returns 429 with a JSON body once the limit is exceeded', async () => {
    const app = express();
    app.use(createRateLimiter({ windowMs: 60_000, max: 3, prefix: 'test' }));
    app.get('/', (_req, res) => {
      res.json({ ok: true });
    });

    for (let i = 0; i < 3; i++) {
      expect((await request(app).get('/')).status).toBe(200);
    }
    const limited = await request(app).get('/');
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(limited.headers['ratelimit-policy']).toBeDefined();
  });
});
