/**
 * ESY AI MCP Service - Streamable HTTP Transport Setup
 *
 * Stateless design: each session gets a shared TokenManager that is initialized
 * on the first tool call carrying web_session_token. Since the Agent platform
 * may not preserve mcp-session-id, all tools accept web_session_token as input
 * and handle auth inline.
 */

import express, { type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TokenManager } from '../auth/token-manager.js';
import { BackendClient } from '../client/backend-client.js';
import { createStatelessMcpServer } from '../server.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
}

// ─── Transport App Factory ───────────────────────────────────────────────────

export function createTransportApp(baseUrl: string): express.Express {
  const app = express();
  app.use(express.json());

  const sessions = new Map<string, SessionEntry>();

  // ─── POST /mcp ─────────────────────────────────────────────────────────

  app.post('/mcp', async (req: Request, res: Response) => {
    try {
      console.log(`[${new Date().toISOString()}] ← POST /mcp (session: ${req.headers['mcp-session-id'] || 'new'})`);
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (sessionId && sessions.has(sessionId)) {
        const session = sessions.get(sessionId)!;
        await session.transport.handleRequest(req, res, req.body);
        return;
      }

      // New session
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id: string) => {
          sessions.set(id, { transport, server });
        },
      });

      const tokenManager = new TokenManager(baseUrl);
      const client = new BackendClient(baseUrl, tokenManager);
      const server = createStatelessMcpServer(client, tokenManager);

      await server.connect(transport);
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

  // ─── DELETE /mcp ───────────────────────────────────────────────────────

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
