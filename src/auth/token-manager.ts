/**
 * ESY AI MCP Service - Token Manager
 *
 * Manages the chat_token lifecycle including acquisition, proactive refresh,
 * and concurrent refresh deduplication.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.3, 2.5
 */

import type { EsyApiResponse, TokenState } from '../types/index.js';

/** Response shape from POST /admin/chat-api/session */
interface SessionResponseData {
  session_id: string;
  chat_token: string;
  expires_in: number;
}

export class TokenManager {
  private readonly baseUrl: string;
  private tokenState: TokenState | null = null;
  private refreshPromise: Promise<string> | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /**
   * Initialize with a web_session_token, obtain initial chat_token.
   *
   * Calls POST /admin/chat-api/session with the web_session_token in
   * Authorization Bearer header.
   *
   * @throws Error if web_session_token is empty/missing
   * @throws Error if backend returns auth error or is unreachable
   */
  async initialize(webSessionToken: string): Promise<void> {
    if (!webSessionToken || webSessionToken.trim() === '') {
      throw new Error('web_session_token is required');
    }

    // Strip "Bearer " prefix if provided (users may pass the full header value)
    const cleanToken = webSessionToken.replace(/^Bearer\s+/i, '').trim();

    const { chat_token, expires_in } = await this.requestSession(cleanToken);

    this.tokenState = {
      chat_token,
      expires_at: Math.floor(Date.now() / 1000) + expires_in,
      web_session_token: cleanToken,
    };
  }

  /**
   * Get a valid token, refreshing proactively if within 60s of expiry.
   *
   * @returns The current valid chat_token
   * @throws Error if not initialized or refresh fails
   */
  async getValidToken(): Promise<string> {
    if (!this.tokenState) {
      throw new Error('TokenManager not initialized. Call initialize() first.');
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = this.tokenState.expires_at - nowSeconds;

    if (timeUntilExpiry < 60) {
      return this.refreshToken();
    }

    return this.tokenState.chat_token;
  }

  /**
   * Force a token refresh. Deduplicates concurrent refresh calls by sharing
   * a single promise among all callers.
   *
   * @returns The new chat_token
   * @throws Error if refresh fails (re-initialization required)
   */
  async refreshToken(): Promise<string> {
    if (!this.tokenState) {
      throw new Error('TokenManager not initialized. Call initialize() first.');
    }

    // Deduplicate concurrent refresh requests
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.doRefresh();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  /**
   * Check if the manager has been initialized with a valid token.
   */
  isInitialized(): boolean {
    return this.tokenState !== null;
  }

  /**
   * Internal: perform the actual refresh call.
   */
  private async doRefresh(): Promise<string> {
    if (!this.tokenState) {
      throw new Error('TokenManager not initialized. Call initialize() first.');
    }

    try {
      const { chat_token, expires_in } = await this.requestSession(
        this.tokenState.web_session_token,
      );

      this.tokenState = {
        ...this.tokenState,
        chat_token,
        expires_at: Math.floor(Date.now() / 1000) + expires_in,
      };

      return chat_token;
    } catch (error) {
      throw new Error(
        `Token refresh failed. Re-initialization required with a new web_session_token. Cause: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Internal: call POST /admin/chat-api/session with the given token.
   * Uses a 10-second timeout via AbortController.
   */
  private async requestSession(webSessionToken: string): Promise<SessionResponseData> {
    const url = `${this.baseUrl}/admin/chat-api/session`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${webSessionToken}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `Backend returned HTTP ${response.status}: ${response.statusText}`,
        );
      }

      const body = (await response.json()) as EsyApiResponse<SessionResponseData>;

      if (body.code !== 0) {
        throw new Error(
          `Backend authentication error (code ${body.code}): ${body.msg}`,
        );
      }

      if (!body.data?.chat_token || !body.data?.expires_in) {
        throw new Error('Backend returned invalid session data (missing chat_token or expires_in)');
      }

      return body.data;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Session request timed out (10s limit exceeded)');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
