/**
 * ESY AI MCP Service - Server Factory
 *
 * Creates an McpServer instance and registers all domain tools.
 *
 * Validates: Requirements 15.1, 15.2, 15.3
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAllTools } from './tools/index.js';
import type { BackendClient } from './client/backend-client.js';

/**
 * Creates a configured MCP server with all ESY AI tools registered.
 *
 * @param client - Authenticated backend client for API calls
 * @returns Fully configured McpServer instance
 */
export function createEsyMcpServer(client: BackendClient): McpServer {
  const server = new McpServer({
    name: 'esy-ai-mcp-service',
    version: '1.0.0',
  });

  registerAllTools(server, client);
  return server;
}
