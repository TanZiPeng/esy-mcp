/**
 * ESY AI MCP Service - Get Device Summary Tool
 *
 * Retrieves a statistical overview of all devices including
 * total, online, offline, running, stopped, alarm counts.
 *
 * Validates: Requirements 12.1, 12.2
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BackendClient } from '../client/backend-client.js';
import { normalizeError, toMcpErrorResponse } from '../errors/index.js';
import type { DeviceSummary } from '../types/index.js';

export function registerGetDeviceSummary(server: McpServer, client: BackendClient): void {
  server.tool(
    'get_device_summary',
    'Get statistical overview of all devices: total, online, offline, running, stopped, alarm counts',
    async () => {
      try {
        const data = await client.get<DeviceSummary>('/admin/chat-api/devices/summary');
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      } catch (error) {
        return toMcpErrorResponse(normalizeError(error));
      }
    }
  );
}
