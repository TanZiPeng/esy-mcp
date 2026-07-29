/**
 * ESY AI MCP Service - Streamable HTTP Transport Setup
 *
 * Stateless design with comprehensive request/response logging.
 */

import express, { type Request, type Response, type NextFunction } from 'express';
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ts(): string {
  return new Date().toISOString();
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  if (Array.isArray(forwarded)) return forwarded[0];
  return req.socket.remoteAddress || 'unknown';
}

function truncate(str: string, max = 500): string {
  return str.length > max ? str.substring(0, max) + '...(truncated)' : str;
}

// ─── Transport App Factory ───────────────────────────────────────────────────

export function createTransportApp(baseUrl: string): express.Express {
  const app = express();
  app.use(express.json());

  // ─── 全局请求日志中间件 ────────────────────────────────────────────────

  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    const ip = getClientIp(req);
    const method = req.method;
    const path = req.path;
    const sessionId = req.headers['mcp-session-id'] || '-';

    // 打印请求信息
    console.log(`[${ts()}] ← ${method} ${path} | IP: ${ip} | Session: ${sessionId}`);
    if (req.body && Object.keys(req.body).length > 0) {
      console.log(`[${ts()}]   Request Body: ${truncate(JSON.stringify(req.body))}`);
    }

    // 拦截响应，打印状态码和耗时
    const originalEnd = res.end.bind(res);
    res.end = function (...args: any[]) {
      const duration = Date.now() - start;
      console.log(`[${ts()}] → ${method} ${path} | Status: ${res.statusCode} | ${duration}ms`);
      return originalEnd(...args);
    } as any;

    next();
  });

  const sessions = new Map<string, SessionEntry>();

  // ─── POST /mcp ─────────────────────────────────────────────────────────

  app.post('/mcp', async (req: Request, res: Response) => {
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (sessionId && sessions.has(sessionId)) {
        const session = sessions.get(sessionId)!;
        await session.transport.handleRequest(req, res, req.body);
        return;
      }

      // New session
      console.log(`[${ts()}]   Creating new MCP session`);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id: string) => {
          console.log(`[${ts()}]   Session initialized: ${id}`);
          sessions.set(id, { transport, server });
        },
      });

      const tokenManager = new TokenManager(baseUrl);
      const client = new BackendClient(baseUrl, tokenManager);
      const server = createStatelessMcpServer(client, tokenManager);

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error(`[${ts()}] ✗ POST /mcp error:`, error);
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
      console.error(`[${ts()}] ✗ GET /mcp error:`, error);
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
        console.log(`[${ts()}]   Session closed: ${sessionId}`);
      } catch (error) {
        console.error(`[${ts()}] ✗ Error closing session:`, error);
      }
    }
    res.status(200).end();
  });

  return app;
}
