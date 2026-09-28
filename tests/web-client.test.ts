import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('demo web client', () => {
  it('serves the static client with a strict CSP', async () => {
    const res = await request(createApp()).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Realtime Chat');
    expect(res.headers['content-security-policy']).toContain("script-src 'self'");
  });
});
