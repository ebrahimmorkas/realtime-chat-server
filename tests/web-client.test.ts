import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('web client hosting', () => {
  let webDir: string;

  beforeAll(() => {
    // A stand-in for `client/dist`, so the test doesn't depend on a client build.
    webDir = mkdtempSync(join(tmpdir(), 'chat-web-'));
    mkdirSync(join(webDir, 'assets'));
    writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Chatterbox</title>');
    writeFileSync(join(webDir, 'assets', 'app-abc123.js'), 'console.log(1)');
  });

  it('serves the SPA shell with a strict CSP', async () => {
    const res = await request(createApp({ webDir })).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Chatterbox');
    expect(res.headers['content-security-policy']).toContain("script-src 'self'");
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('falls back to the shell for client-side routes', async () => {
    const res = await request(createApp({ webDir })).get('/chat/abc');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Chatterbox');
  });

  it('caches fingerprinted assets for a year', async () => {
    const res = await request(createApp({ webDir })).get('/assets/app-abc123.js');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('max-age=31536000');
    expect(res.headers['cache-control']).toContain('immutable');
  });

  it('never answers API routes with the HTML shell', async () => {
    const res = await request(createApp({ webDir })).get('/api/v1/nope');
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body.error).toBeDefined();
  });

  it('works without a client build', async () => {
    const res = await request(createApp({ webDir: join(webDir, 'missing') })).get('/');
    expect(res.status).toBe(404);
  });
});
