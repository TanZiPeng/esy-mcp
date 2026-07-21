import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { BackendClient } from '../client/backend-client.js';
import { normalizeError, toMcpErrorResponse } from '../errors/index.js';

/**
 * Registers the get_all_alarms tool.
 *
 * Get all alarms across all devices for the current user with filtering
 * by status, level, device, time range, and pagination.
 *
 * Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7
 */
export function registerGetAllAlarms(server: McpServer, client: BackendClient): void {
  server.tool(
    'get_all_alarms',
    'Get all alarms across all devices for the current user with filtering by status, level, device, time range, and pagination.',
    {
      status: z.enum(['active', 'recovered', 'handled']).optional().describe('Alarm lifecycle status filter'),
      level: z.enum(['1', '2', '3', 'level_1', 'level_2', 'level_3']).optional().describe('Alarm severity level filter'),
      device_id: z.string().optional().describe('Optional device ID filter'),
      start_time: z.number().int().min(0).optional().describe('Start time as Unix timestamp in seconds'),
      end_time: z.number().int().min(0).optional().describe('End time as Unix timestamp in seconds'),
      page: z.number().int().min(1).default(1).optional().describe('Page number (starts from 1)'),
      page_size: z.number().int().min(1).max(100).default(20).optional().describe('Items per page (1-100, default 20)'),
    },
    async (params) => {
      try {
        const queryParams: Record<string, string | number> = {
          page: params.page ?? 1,
          page_size: params.page_size ?? 20,
        };

        if (params.status !== undefined) queryParams.status = params.status;
        if (params.level !== undefined) queryParams.level = params.level;
        if (params.device_id !== undefined) queryParams.device_id = params.device_id;
        if (params.start_time !== undefined) queryParams.start_time = params.start_time;
        if (params.end_time !== undefined) queryParams.end_time = params.end_time;

        const data = await client.get('/admin/chat-api/alarms', queryParams);
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      } catch (error) {
        return toMcpErrorResponse(normalizeError(error));
      }
    }
  );
}
