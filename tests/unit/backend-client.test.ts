/**
 * Unit tests for BackendClient
 *
 * Tests cover:
 * - GET requests with Authorization header and query params
 * - POST requests with JSON body
 * - 30-second timeout via AbortController
 * - 401 retry: refreshes token and retries exactly once
 * - BackendError thrown on code !== 0
 * - NetworkError classification (timeout, ECONNREFUSED, ENOTFOUND)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BackendClient, type TokenManager } from '../../src/client/backend-client.js';
import { BackendError, NetworkError } from '../../src/errors/index.js';

// ─── Mock Setup ──────────────────────────────────────────────────────────────

function createMockTokenManager(token = 'test-token'): TokenManager {
  return {
    getValidToken: vi.fn().mockResolvedValue(token),
    refreshToken: vi.fn().mockResolvedValue('refreshed-token'),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('BackendClient', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('strips trailing slashes from baseUrl', async () => {
      const tm = createMockTokenManager();
      const client = new BackendClient('https://api.example.com/', tm);

      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 0, msg: 'ok', data: { result: true } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await client.get('/test');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^https:\/\/api\.example\.com\/test/),
        expect.anything(),
      );
    });
  });

  describe('get()', () => {
    it('sends GET request with Authorization Bearer header', async () => {
      const tm = createMockTokenManager('my-token');
      const client = new BackendClient('https://api.example.com', tm);

      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 0, msg: 'ok', data: { id: 1 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await client.get('/admin/chat-api/devices');

      const [, options] = fetchSpy.mock.calls[0];
      expect(options?.method).toBe('GET');
      expect((options?.headers as Record<string, string>).Authorization).toBe('Bearer my-token');
    });

    it('appends query params (excluding undefined values)', async () => {
      const tm = createMockTokenManager();
      const client = new BackendClient('https://api.example.com', tm);

      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 0, msg: 'ok', data: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await client.get('/devices', { page: 1, page_size: 20, keyword: undefined });

      const [url] = fetchSpy.mock.calls[0];
      const parsedUrl = new URL(url as string);
      expect(parsedUrl.searchParams.get('page')).toBe('1');
      expect(parsedUrl.searchParams.get('page_size')).toBe('20');
      expect(parsedUrl.searchParams.has('keyword')).toBe(false);
    });

    it('returns response.data on success (code === 0)', async () => {
      const tm = createMockTokenManager();
      const client = new BackendClient('https://api.example.com', tm);

      const expectedData = { device_id: '123', device_name: 'Solar Panel' };
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 0, msg: 'ok', data: expectedData }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const result = await client.get('/devices/123');
      expect(result).toEqual(expectedData);
    });
  });

  describe('post()', () => {
    it('sends POST request with JSON body and Authorization header', async () => {
      const tm = createMockTokenManager('post-token');
      const client = new BackendClient('https://api.example.com', tm);

      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 0, msg: 'ok', data: { success: true } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await client.post('/admin/chat-api/session', { web_session_token: 'abc' });

      const [, options] = fetchSpy.mock.calls[0];
      expect(options?.method).toBe('POST');
      expect((options?.headers as Record<string, string>).Authorization).toBe('Bearer post-token');
      expect((options?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
      expect(options?.body).toBe(JSON.stringify({ web_session_token: 'abc' }));
    });

    it('sends POST without body when body is undefined', async () => {
      const tm = createMockTokenManager();
      const client = new BackendClient('https://api.example.com', tm);

      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 0, msg: 'ok', data: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await client.post('/some-endpoint');

      const [, options] = fetchSpy.mock.calls[0];
      expect(options?.body).toBeUndefined();
    });
  });

  describe('401 retry logic', () => {
    it('refreshes token and retries exactly once on HTTP 401', async () => {
      const tm = createMockTokenManager('initial-token');
      (tm.getValidToken as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce('initial-token')
        .mockResolvedValueOnce('refreshed-token');

      const client = new BackendClient('https://api.example.com', tm);

      // First call returns 401
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 401, msg: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      // Retry returns success
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 0, msg: 'ok', data: { retried: true } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const result = await client.get('/protected');

      expect(tm.refreshToken).toHaveBeenCalledOnce();
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ retried: true });
    });

    it('throws BackendError if retry also returns 401', async () => {
      const tm = createMockTokenManager();
      const client = new BackendClient('https://api.example.com', tm);

      // Both calls return 401
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ code: 401, msg: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await expect(client.get('/protected')).rejects.toThrow(BackendError);
      // Original request + exactly one retry = 2 calls
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('BackendError on code !== 0', () => {
    it('throws BackendError with code and msg from response body', async () => {
      const tm = createMockTokenManager();
      const client = new BackendClient('https://api.example.com', tm);

      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 10001, msg: 'Device not found', data: null }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      try {
        await client.get('/devices/999');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(BackendError);
        const backendErr = error as BackendError;
        expect(backendErr.error_code).toBe(10001);
        expect(backendErr.error_message).toBe('Device not found');
      }
    });
  });

  describe('Network error classification', () => {
    it('maps AbortError to NetworkError with failure_type "timeout"', async () => {
      const tm = createMockTokenManager();
      const client = new BackendClient('https://api.example.com', tm);

      const abortError = new DOMException('The operation was aborted', 'AbortError');
      fetchSpy.mockRejectedValueOnce(abortError);

      try {
        await client.get('/test');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(NetworkError);
        expect((error as NetworkError).failure_type).toBe('timeout');
      }
    });

    it('maps ECONNREFUSED to NetworkError with failure_type "connection_refused"', async () => {
      const tm = createMockTokenManager();
      const client = new BackendClient('https://api.example.com', tm);

      const connError = new Error('connect ECONNREFUSED');
      (connError as NodeJS.ErrnoException).code = 'ECONNREFUSED';
      fetchSpy.mockRejectedValueOnce(connError);

      try {
        await client.get('/test');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(NetworkError);
        expect((error as NetworkError).failure_type).toBe('connection_refused');
      }
    });

    it('maps ENOTFOUND to NetworkError with failure_type "dns_failure"', async () => {
      const tm = createMockTokenManager();
      const client = new BackendClient('https://api.example.com', tm);

      const dnsError = new Error('getaddrinfo ENOTFOUND');
      (dnsError as NodeJS.ErrnoException).code = 'ENOTFOUND';
      fetchSpy.mockRejectedValueOnce(dnsError);

      try {
        await client.get('/test');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(NetworkError);
        expect((error as NetworkError).failure_type).toBe('dns_failure');
      }
    });

    it('maps ECONNREFUSED in error cause to NetworkError', async () => {
      const tm = createMockTokenManager();
      const client = new BackendClient('https://api.example.com', tm);

      const cause = new Error('connect ECONNREFUSED');
      (cause as NodeJS.ErrnoException).code = 'ECONNREFUSED';
      const wrappedError = new TypeError('fetch failed', { cause });
      fetchSpy.mockRejectedValueOnce(wrappedError);

      try {
        await client.get('/test');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(NetworkError);
        expect((error as NetworkError).failure_type).toBe('connection_refused');
      }
    });

    it('maps unknown errors to NetworkError with failure_type "timeout" as fallback', async () => {
      const tm = createMockTokenManager();
      const client = new BackendClient('https://api.example.com', tm);

      fetchSpy.mockRejectedValueOnce(new Error('Something weird happened'));

      try {
        await client.get('/test');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(NetworkError);
        expect((error as NetworkError).failure_type).toBe('timeout');
      }
    });
  });

  describe('timeout', () => {
    it('passes an AbortSignal to fetch', async () => {
      const tm = createMockTokenManager();
      const client = new BackendClient('https://api.example.com', tm);

      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 0, msg: 'ok', data: {} }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await client.get('/test');

      const [, options] = fetchSpy.mock.calls[0];
      expect(options?.signal).toBeInstanceOf(AbortSignal);
    });
  });
});
