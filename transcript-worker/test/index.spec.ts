import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('transcript-worker', () => {
  it('returns 405 for non-POST requests', async () => {
    const request = new IncomingRequest('http://example.com', { method: 'GET' });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(405);
  });

  it('returns 401 when upstash-signature header is missing', async () => {
    const request = new IncomingRequest('http://example.com', {
      method: 'POST',
      body: JSON.stringify({ transcriptId: 'abc', content: 'test' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(401);
  });
});
