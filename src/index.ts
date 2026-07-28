/**
 * ESY AI MCP Service - Entry Point
 *
 * Bootstraps the MCP server in either stdio or HTTP mode based on
 * command-line flags and environment variables.
 *
 * Environment:
 *   ESY_API_BASE_URL (required) - Base URL of the ESY AI backend
 *   PORT (optional, default 3000) - HTTP server port
 *
 * Flags:
 *   --stdio - Run in stdio mode (single session, for CLI/desktop clients)
 *
 * Validates: Requirements 15.1, 15.2
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { TokenManager } from './auth/token-manager.js';
import { BackendClient } from './client/backend-client.js';
import { createStatelessMcpServer } from './server.js';
import { createTransportApp } from './transport/setup.js';

// ─── Environment Validation ──────────────────────────────────────────────────

const baseUrl = process.env.ESY_API_BASE_URL;
if (!baseUrl) {
  console.error('ERROR: ESY_API_BASE_URL environment variable is required');
  process.exit(1);
}

const isStdio = process.argv.includes('--stdio');

// ─── Stdio Mode ──────────────────────────────────────────────────────────────

if (isStdio) {
  const tokenManager = new TokenManager(baseUrl);
  const client = new BackendClient(baseUrl, tokenManager);
  const server = createStatelessMcpServer(client, tokenManager);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('ESY AI MCP Service running in stdio mode');
} else {
  // ─── HTTP Mode ───────────────────────────────────────────────────────────

  const port = parseInt(process.env.PORT || '3000', 10);
  const app = createTransportApp(baseUrl);

  const httpServer = app.listen(port, () => {
    console.log(`ESY AI MCP Service running on port ${port}`);
  });

  // ─── Graceful Shutdown ─────────────────────────────────────────────────

  const shutdown = () => {
    console.log('Shutting down gracefully...');
    httpServer.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });

    // Force exit after 10 seconds if graceful shutdown stalls
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
