/**
 * ESY AI MCP Service - Streamable HTTP Transport Setup
 *
 * Creates an Express application with Streamable HTTP transport endpoints
 * for MCP communication. Manages per-session state including token management
 * and backend client instances.
 *
 * Validates: Requirements 15.1, 15.2
 */

import express, { type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TokenManager } from '../auth/token-manager.js';
import { BackendClient } from '../client/backend-client.js';
import { normalizeError, toMcpErrorResponse } from '../errors/index.js';
import { createEsyMcpServer } from '../server.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
}

// ─── Transport App Factory ───────────────────────────────────────────────────

/**
 * Creates an Express app with Streamable HTTP transport for MCP.
 *
 * Endpoints:
 * - POST /mcp  — handles MCP requests (initialize + tool calls)
 * - GET  /mcp  — SSE streaming for server-to-client notifications
 * - DELETE /mcp — session termination
 *
 * Each new session gets its own TokenManager, BackendClient, and McpServer.
 * The `initialize_session` tool must be called first to authenticate.
 *
 * @param baseUrl - ESY AI backend base URL
 */
export function createTransportApp(baseUrl: string): express.Express {
  const app = express();

  // Parse JSON bodies for POST requests
  app.use(express.json());

  // Session storage keyed by transport-generated session ID
  const sessions = new Map<string, SessionEntry>();

  // ─── POST /mcp ─────────────────────────────────────────────────────────

  app.post('/mcp', async (req: Request, res: Response) => {
    try {
      // Check for existing session
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (sessionId && sessions.has(sessionId)) {
        const session = sessions.get(sessionId)!;
        await session.transport.handleRequest(req, res, req.body);
        return;
      }

      // New session — create transport with session ID generator
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id: string) => {
          // Store session once the transport has assigned an ID
          sessions.set(id, { transport, server });
        },
      });

      // Create per-session token manager and backend client
      const tokenManager = new TokenManager(baseUrl);
      const client = new BackendClient(baseUrl, tokenManager);
      const server = createEsyMcpServer(client);

      // Register the initialize_session tool for this session
      server.tool(
        'initialize_session',
        'Initialize the session with a web_session_token to authenticate against the ESY AI backend. Must be called before using any other tools.',
        { web_session_token: z.string().min(1).describe('Web session token from the customer website') },
        async (params) => {
          try {
            await tokenManager.initialize(params.web_session_token);
            return {
              content: [{ type: 'text', text: JSON.stringify({ success: true, message: 'Session initialized successfully' }) }],
            };
          } catch (error) {
            return toMcpErrorResponse(normalizeError(error));
          }
        },
      );

      // Connect server to transport
      await server.connect(transport);

      // Handle the initial request (pre-parsed body passed to avoid re-parsing)
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('Error handling POST /mcp:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  // ─── GET /mcp (SSE) ────────────────────────────────────────────────────

  app.get('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).json({ error: 'Invalid or missing session ID' });
      return;
    }

    try {
      const session = sessions.get(sessionId)!;
      await session.transport.handleRequest(req, res);
    } catch (error) {
      console.error('Error handling GET /mcp:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  // ─── DELETE /mcp (Session Termination) ─────────────────────────────────

  app.delete('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (sessionId && sessions.has(sessionId)) {
      try {
        const session = sessions.get(sessionId)!;
        await session.transport.close();
        sessions.delete(sessionId);
      } catch (error) {
        console.error('Error closing session:', error);
      }
    }

    res.status(200).end();
  });

  return app;
}
