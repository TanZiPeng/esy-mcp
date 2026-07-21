import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { BackendClient } from '../client/backend-client.js';
import { normalizeError, toMcpErrorResponse } from '../errors/index.js';

/**
 * Registers the get_device_details tool.
 *
 * Returns full device details including installation info, location,
 * and timezone for a specific device.
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4
 */
export function registerGetDeviceDetails(server: McpServer, client: BackendClient): void {
  server.tool(
    'get_device_details',
    'Get detailed information about a specific device including installation info, location, and timezone',
    {
      device_id: z.string().min(1).regex(/^\d+$/, 'device_id must be a numeric identifier').describe('Device database ID'),
    },
    async (params) => {
      try {
        const data = await client.get(`/admin/chat-api/devices/${params.device_id}`);
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      } catch (error) {
        return toMcpErrorResponse(normalizeError(error));
      }
    }
  );
}
