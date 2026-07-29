/**
 * ESY AI MCP Service - Backend HTTP Client
 *
 * Wraps all ESY AI backend API calls with token injection,
 * 401 retry logic, timeout handling, and error classification.
 *
 * Validates: Requirements 2.2, 2.4, 14.1, 14.2
 */

import type { EsyApiResponse } from '../types/index.js';
import { BackendError, NetworkError } from '../errors/index.js';

// ─── TokenManager Interface ──────────────────────────────────────────────────

/** Minimal interface for the TokenManager dependency */
export interface TokenManager {
  getValidToken(): Promise<string>;
  refreshToken(): Promise<string>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const REQUEST_TIMEOUT_MS = 30_000;

// ─── BackendClient ───────────────────────────────────────────────────────────

/**
 * HTTP client for the ESY AI backend.
 *
 * - Injects `Authorization: Bearer <token>` on every request
 * - Applies a 30-second timeout via AbortController
 * - On HTTP 401: refreshes token and retries exactly once
 * - On network error: maps to NetworkError with correct failure_type
 * - On code !== 0 in response body: throws BackendError
 */
export class BackendClient {
  private readonly baseUrl: string;
  private readonly tokenManager: TokenManager;

  constructor(baseUrl: string, tokenManager: TokenManager) {
    this.baseUrl = baseUrl.replace(/\/+$/, ''); // Strip trailing slashes
    this.tokenManager = tokenManager;
  }

  /**
   * Make an authenticated GET request to the backend.
   * @param path - API path (e.g. '/admin/chat-api/devices')
   * @param params - Optional query parameters (undefined values are excluded)
   */
  async get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    const url = this.buildUrl(path, params);
    const paramsStr = params ? JSON.stringify(params) : '';
    console.log(`[${new Date().toISOString()}] → GET ${path} ${paramsStr ? '| Params: ' + paramsStr : ''}`);
    const start = Date.now();
    try {
      const result = await this.requestWithRetry<T>(url, { method: 'GET' });
      const duration = Date.now() - start;
      const resultStr = JSON.stringify(result);
      console.log(`[${new Date().toISOString()}] ✓ GET ${path} (${duration}ms) | Response: ${resultStr.length > 300 ? resultStr.substring(0, 300) + '...' : resultStr}`);
      return result;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ✗ GET ${path} (${Date.now() - start}ms) | Error: ${error instanceof Error ? error.message : error}`);
      throw error;
    }
  }

  /**
   * Make an authenticated POST request to the backend.
   * @param path - API path (e.g. '/admin/chat-api/session')
   * @param body - Optional JSON request body
   */
  async post<T>(path: string, body?: unknown): Promise<T> {
    const url = this.buildUrl(path);
    console.log(`[${new Date().toISOString()}] → POST ${path} ${body ? '| Body: ' + JSON.stringify(body).substring(0, 200) : ''}`);
    const start = Date.now();
    const options: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    };
    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }
    try {
      const result = await this.requestWithRetry<T>(url, options);
      const duration = Date.now() - start;
      const resultStr = JSON.stringify(result);
      console.log(`[${new Date().toISOString()}] ✓ POST ${path} (${duration}ms) | Response: ${resultStr.length > 300 ? resultStr.substring(0, 300) + '...' : resultStr}`);
      return result;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ✗ POST ${path} (${Date.now() - start}ms) | Error: ${error instanceof Error ? error.message : error}`);
      throw error;
    }
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  /**
   * Builds a full URL with optional query parameters.
   * Only includes params whose values are not undefined.
   */
  private buildUrl(path: string, params?: Record<string, string | number | undefined>): string {
    const url = new URL(path, this.baseUrl);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  /**
   * Executes a request with auth token, timeout, and 401 retry logic.
   * On first 401, refreshes the token and retries exactly once.
   */
  private async requestWithRetry<T>(url: string, options: RequestInit): Promise<T> {
    try {
      return await this.executeRequest<T>(url, options);
    } catch (error) {
      // On 401, refresh token and retry exactly once
      if (error instanceof BackendError && error.error_code === 401) {
        await this.tokenManager.refreshToken();
        return this.executeRequest<T>(url, options);
      }
      throw error;
    }
  }

  /**
   * Executes a single HTTP request with auth header and timeout.
   * - Injects Bearer token
   * - Applies 30s AbortController timeout
   * - Parses response as EsyApiResponse<T>
   * - Throws BackendError on HTTP 401 or code !== 0
   * - Throws NetworkError on network failures
   */
  private async executeRequest<T>(url: string, options: RequestInit): Promise<T> {
    const token = await this.tokenManager.getValidToken();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...((options.headers as Record<string, string>) ?? {}),
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
      });

      // Handle HTTP 401 by throwing a sentinel BackendError
      if (response.status === 401) {
        throw new BackendError(401, 'Unauthorized');
      }

      // Read response body as text first for better error diagnostics
      const text = await response.text();
      
      let body: EsyApiResponse<T>;
      try {
        body = JSON.parse(text) as EsyApiResponse<T>;
      } catch {
        console.error(`[BackendClient] Non-JSON response from ${url}: status=${response.status}, body=${text.substring(0, 200)}`);
        throw new BackendError(response.status, `Backend returned non-JSON response (HTTP ${response.status})`);
      }

      // Non-zero code means backend-level error
      if (body.code !== 0) {
        console.error(`[BackendClient] Backend error from ${url}: code=${body.code}, msg=${body.msg}`);
        throw new BackendError(body.code, body.msg);
      }

      return body.data;
    } catch (error) {
      // Re-throw our own error types
      if (error instanceof BackendError || error instanceof NetworkError) {
        throw error;
      }

      // Log unexpected errors for debugging
      console.error(`[BackendClient] Unexpected error for ${url}:`, error);

      // Classify network errors
      throw this.classifyNetworkError(error);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Maps a native fetch/network error to a typed NetworkError.
   *
   * - AbortError (timeout) → NetworkError('timeout')
   * - ECONNREFUSED → NetworkError('connection_refused')
   * - ENOTFOUND → NetworkError('dns_failure')
   * - Other → NetworkError('timeout') as fallback
   */
  private classifyNetworkError(error: unknown): NetworkError {
    if (error instanceof Error) {
      // AbortController timeout
      if (error.name === 'AbortError') {
        return new NetworkError('Request timed out', 'timeout');
      }

      // Node.js network errors carry a `code` property
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ECONNREFUSED') {
        return new NetworkError('Connection refused', 'connection_refused');
      }
      if (nodeError.code === 'ENOTFOUND') {
        return new NetworkError('DNS lookup failed', 'dns_failure');
      }

      // Check for cause chain (Node.js fetch wraps errors)
      const cause = (error as { cause?: NodeJS.ErrnoException }).cause;
      if (cause) {
        if (cause.code === 'ECONNREFUSED') {
          return new NetworkError('Connection refused', 'connection_refused');
        }
        if (cause.code === 'ENOTFOUND') {
          return new NetworkError('DNS lookup failed', 'dns_failure');
        }
      }
    }

    // Fallback: treat unknown errors as timeout
    return new NetworkError('Network request failed', 'timeout');
  }
}
