import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { BackendClient } from '../client/backend-client.js';
import { normalizeError, toMcpErrorResponse } from '../errors/index.js';

/**
 * Registers the get_device_events tool.
 *
 * Get events for a device including online/offline transitions and alarm triggers.
 *
 * Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8
 */
export function registerGetDeviceEvents(server: McpServer, client: BackendClient): void {
  server.tool(
    'get_device_events',
    'Get events for a device including online/offline transitions and alarm triggers',
    {
      device_id: z.string().min(1).regex(/^\d+$/, 'device_id must be a numeric identifier').describe('Device ID (numeric string)'),
      event_type: z.enum(['ONLINE', 'OFFLINE', 'ALARM_START', 'ALARM_RECOVER']).optional().describe('Event type filter'),
      start_time: z.number().int().min(0).optional().describe('Start of time range (Unix timestamp in seconds)'),
      end_time: z.number().int().min(0).optional().describe('End of time range (Unix timestamp in seconds)'),
      page: z.number().int().min(1).default(1).optional().describe('Page number (starts from 1)'),
      page_size: z.number().int().min(1).max(100).default(20).optional().describe('Items per page (1-100, default 20)'),
    },
    async (params) => {
      try {
        const queryParams: Record<string, string | number> = {
          page: params.page ?? 1,
          page_size: params.page_size ?? 20,
        };

        if (params.event_type !== undefined) {
          queryParams.event_type = params.event_type;
        }
        if (params.start_time !== undefined) {
          queryParams.start_time = params.start_time;
        }
        if (params.end_time !== undefined) {
          queryParams.end_time = params.end_time;
        }

        const data = await client.get(`/admin/chat-api/devices/${params.device_id}/events`, queryParams);
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      } catch (error) {
        return toMcpErrorResponse(normalizeError(error));
      }
    }
  );
}
