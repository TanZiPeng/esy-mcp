/**
 * ESY AI MCP Service - Get Device Status Tool
 *
 * Retrieves real-time status of a specific device including
 * online status, running status, and alarm status from the ESY AI backend.
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BackendClient } from '../client/backend-client.js';
import { normalizeError, toMcpErrorResponse } from '../errors/index.js';

export function registerGetDeviceStatus(server: McpServer, client: BackendClient): void {
  server.tool(
    'get_device_status',
    'Get real-time status of a device including online status, running status, and alarm status',
    {
      device_id: z.string().min(1).regex(/^\d+$/, 'device_id must be a numeric identifier').describe('Device database ID (numeric string)'),
    },
    async (params) => {
      try {
        const data = await client.get(`/admin/chat-api/devices/${params.device_id}/status`);
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      } catch (error) {
        return toMcpErrorResponse(normalizeError(error));
      }
    }
  );
}
