import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('GET /health', () => {
  it('reports service status', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.services.mongo).toBe('up');
    expect(res.body.services.redis).toBe(process.env.REDIS_ENABLED === 'true' ? 'up' : 'disabled');
  });

  it('returns a JSON 404 for unknown routes', async () => {
    const res = await request(createApp()).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
