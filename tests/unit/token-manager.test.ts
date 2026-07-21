/**
 * Unit tests for TokenManager
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.3, 2.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenManager } from '../../src/auth/token-manager.js';

// Helper to create a mock fetch response
function mockSessionResponse(overrides: Partial<{
  ok: boolean;
  status: number;
  statusText: string;
  code: number;
  msg: string;
  chat_token: string;
  expires_in: number;
  session_id: string;
}> = {}) {
  const {
    ok = true,
    status = 200,
    statusText = 'OK',
    code = 0,
    msg = 'success',
    chat_token = 'test-chat-token-123',
    expires_in = 1800,
    session_id = 'session-abc',
  } = overrides;

  return {
    ok,
    status,
    statusText,
    json: async () => ({
      code,
      msg,
      data: { session_id, chat_token, expires_in },
    }),
  };
}

describe('TokenManager', () => {
  let tokenManager: TokenManager;
  const baseUrl = 'https://api.example.com';

  beforeEach(() => {
    tokenManager = new TokenManager(baseUrl);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('initialize()', () => {
    it('should throw if web_session_token is empty', async () => {
      await expect(tokenManager.initialize('')).rejects.toThrow(
        'web_session_token is required',
      );
    });

    it('should throw if web_session_token is whitespace-only', async () => {
      await expect(tokenManager.initialize('   ')).rejects.toThrow(
        'web_session_token is required',
      );
    });

    it('should call POST /admin/chat-api/session with correct headers', async () => {
      const mockFetch = vi.fn().mockResolvedValue(mockSessionResponse());
      vi.stubGlobal('fetch', mockFetch);

      await tokenManager.initialize('my-web-token');

      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/admin/chat-api/session`,
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': 'Bearer my-web-token',
            'Content-Type': 'application/json',
          },
        }),
      );
    });

    it('should store token and compute expires_at correctly', async () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        mockSessionResponse({ expires_in: 1800 }),
      ));

      await tokenManager.initialize('my-web-token');

      expect(tokenManager.isInitialized()).toBe(true);
      // Token should be valid (not trigger refresh since expires_at > now + 60)
      const token = await tokenManager.getValidToken();
      expect(token).toBe('test-chat-token-123');
    });

    it('should throw on backend auth error (code !== 0)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        mockSessionResponse({ code: 401, msg: 'Invalid session token' }),
      ));

      await expect(tokenManager.initialize('bad-token')).rejects.toThrow(
        'Backend authentication error (code 401): Invalid session token',
      );
    });

    it('should throw on non-OK HTTP response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        mockSessionResponse({ ok: false, status: 500, statusText: 'Internal Server Error' }),
      ));

      await expect(tokenManager.initialize('my-token')).rejects.toThrow(
        'Backend returned HTTP 500: Internal Server Error',
      );
    });

    it('should throw on network timeout (10s)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, options: { signal?: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            const error = new Error('The operation was aborted');
            error.name = 'AbortError';
            reject(error);
          });
        });
      }));

      vi.useFakeTimers();

      const initPromise = tokenManager.initialize('my-token');
      vi.advanceTimersByTime(10_000);

      await expect(initPromise).rejects.toThrow('Session request timed out (10s limit exceeded)');

      vi.useRealTimers();
    });
  });

  describe('isInitialized()', () => {
    it('should return false before initialization', () => {
      expect(tokenManager.isInitialized()).toBe(false);
    });

    it('should return true after successful initialization', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockSessionResponse()));
      await tokenManager.initialize('my-token');
      expect(tokenManager.isInitialized()).toBe(true);
    });
  });

  describe('getValidToken()', () => {
    it('should throw if not initialized', async () => {
      await expect(tokenManager.getValidToken()).rejects.toThrow(
        'TokenManager not initialized',
      );
    });

    it('should return current token if not near expiry', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        mockSessionResponse({ chat_token: 'valid-token', expires_in: 1800 }),
      ));

      await tokenManager.initialize('my-token');
      const token = await tokenManager.getValidToken();
      expect(token).toBe('valid-token');
    });

    it('should trigger refresh if token expires within 60 seconds', async () => {
      const mockFetch = vi.fn()
        // First call: initialize with token that expires in 30s
        .mockResolvedValueOnce(mockSessionResponse({ chat_token: 'old-token', expires_in: 30 }))
        // Second call: refresh returns new token
        .mockResolvedValueOnce(mockSessionResponse({ chat_token: 'new-token', expires_in: 1800 }));

      vi.stubGlobal('fetch', mockFetch);

      await tokenManager.initialize('my-token');
      const token = await tokenManager.getValidToken();

      expect(token).toBe('new-token');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('refreshToken()', () => {
    it('should throw if not initialized', async () => {
      await expect(tokenManager.refreshToken()).rejects.toThrow(
        'TokenManager not initialized',
      );
    });

    it('should return a new token on successful refresh', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce(mockSessionResponse({ chat_token: 'initial-token', expires_in: 1800 }))
        .mockResolvedValueOnce(mockSessionResponse({ chat_token: 'refreshed-token', expires_in: 1800 }));

      vi.stubGlobal('fetch', mockFetch);

      await tokenManager.initialize('my-token');
      const token = await tokenManager.refreshToken();
      expect(token).toBe('refreshed-token');
    });

    it('should throw with re-initialization message on refresh failure', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce(mockSessionResponse({ chat_token: 'initial-token', expires_in: 1800 }))
        .mockResolvedValueOnce(mockSessionResponse({ ok: false, status: 500, statusText: 'Server Error' }));

      vi.stubGlobal('fetch', mockFetch);

      await tokenManager.initialize('my-token');
      await expect(tokenManager.refreshToken()).rejects.toThrow(
        'Token refresh failed. Re-initialization required',
      );
    });

    it('should deduplicate concurrent refresh calls', async () => {
      let resolveRefresh: (value: unknown) => void;
      const refreshPromise = new Promise((resolve) => { resolveRefresh = resolve; });

      const mockFetch = vi.fn()
        .mockResolvedValueOnce(mockSessionResponse({ chat_token: 'initial', expires_in: 1800 }))
        .mockImplementationOnce(() => refreshPromise);

      vi.stubGlobal('fetch', mockFetch);

      await tokenManager.initialize('my-token');

      // Start multiple concurrent refresh calls
      const p1 = tokenManager.refreshToken();
      const p2 = tokenManager.refreshToken();
      const p3 = tokenManager.refreshToken();

      // Resolve the single refresh call
      resolveRefresh!(mockSessionResponse({ chat_token: 'shared-token', expires_in: 1800 }));

      const [t1, t2, t3] = await Promise.all([p1, p2, p3]);

      expect(t1).toBe('shared-token');
      expect(t2).toBe('shared-token');
      expect(t3).toBe('shared-token');
      // fetch should only be called twice: once for init, once for the single refresh
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
