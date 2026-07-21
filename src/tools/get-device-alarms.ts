import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { BackendClient } from '../client/backend-client.js';
import { normalizeError, toMcpErrorResponse } from '../errors/index.js';

/**
 * Registers the get_device_alarms tool.
 *
 * Get alarms for a specific device with filtering by status, level,
 * time range, and pagination support.
 *
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7
 */
export function registerGetDeviceAlarms(server: McpServer, client: BackendClient): void {
  server.tool(
    'get_device_alarms',
    'Get alarms for a specific device with filtering by status, level, time range, and pagination',
    {
      device_id: z.string().min(1).regex(/^\d+$/, 'device_id must be a numeric identifier').describe('Device ID (numeric string)'),
      status: z.enum(['active', 'recovered', 'handled']).optional().describe('Alarm lifecycle status filter'),
      level: z.enum(['1', '2', '3', 'level_1', 'level_2', 'level_3']).optional().describe('Alarm severity level filter'),
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

        if (params.status !== undefined) {
          queryParams.status = params.status;
        }
        if (params.level !== undefined) {
          queryParams.level = params.level;
        }
        if (params.start_time !== undefined) {
          queryParams.start_time = params.start_time;
        }
        if (params.end_time !== undefined) {
          queryParams.end_time = params.end_time;
        }

        const data = await client.get(`/admin/chat-api/devices/${params.device_id}/alarms`, queryParams);
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      } catch (error) {
        return toMcpErrorResponse(normalizeError(error));
      }
    }
  );
}
