/**
 * ESY AI MCP Service - Get User Context Tool
 *
 * Retrieves the current user's context including identity,
 * tenant information, role, and permissions.
 *
 * Validates: Requirements 3.1, 3.2, 3.3
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BackendClient } from '../client/backend-client.js';
import { normalizeError, toMcpErrorResponse } from '../errors/index.js';

export function registerGetUserContext(server: McpServer, client: BackendClient): void {
  server.tool(
    'get_user_context',
    'Retrieve the current user context including user_id, user_name, tenant_id, tenant_name, role, and permissions',
    async () => {
      try {
        const data = await client.get('/admin/chat-api/context');
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      } catch (error) {
        return toMcpErrorResponse(normalizeError(error));
      }
    }
  );
}
