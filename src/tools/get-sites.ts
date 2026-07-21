import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BackendClient } from '../client/backend-client.js';
import { normalizeError, toMcpErrorResponse } from '../errors/index.js';

/**
 * Registers the get_sites tool.
 *
 * Returns all sites/projects with installer info and device counts.
 * No input parameters required (API doc: "无业务参数").
 *
 * Validates: Requirements 13.1, 13.2
 */
export function registerGetSites(server: McpServer, client: BackendClient): void {
  server.tool(
    'get_sites',
    'List all sites/projects with installer info and device counts',
    {},
    async () => {
      try {
        const data = await client.get('/admin/chat-api/sites');
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      } catch (error) {
        return toMcpErrorResponse(normalizeError(error));
      }
    }
  );
}
