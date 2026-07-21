import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { BackendClient } from '../client/backend-client.js';
import { normalizeError, toMcpErrorResponse } from '../errors/index.js';

/**
 * Registers the get_telemetry_history tool.
 *
 * Query historical telemetry data for a device with time range
 * and aggregation options.
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
 */
export function registerGetTelemetryHistory(server: McpServer, client: BackendClient): void {
  server.tool(
    'get_telemetry_history',
    'Query historical telemetry data for a device with time range and aggregation options',
    {
      device_id: z.string().min(1).regex(/^\d+$/, 'device_id must be a numeric identifier').describe('Device database ID'),
      start_time: z.number().int().min(0).optional().describe('Start time as Unix timestamp in seconds'),
      end_time: z.number().int().min(0).optional().describe('End time as Unix timestamp in seconds'),
      aggregation: z.enum(['raw', 'hour', 'day']).optional().describe('Aggregation granularity (default: hour)'),
      limit: z.number().int().min(1).max(500).optional().describe('Maximum number of records to return (1-500, default: 200)'),
    },
    async (params) => {
      try {
        const queryParams: Record<string, string | number> = {
          aggregation: params.aggregation ?? 'hour',
          limit: params.limit ?? 200,
        };

        if (params.start_time !== undefined) {
          queryParams.start_time = params.start_time;
        }
        if (params.end_time !== undefined) {
          queryParams.end_time = params.end_time;
        }

        const data = await client.get(
          `/admin/chat-api/devices/${params.device_id}/telemetry/history`,
          queryParams
        );
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      } catch (error) {
        return toMcpErrorResponse(normalizeError(error));
      }
    }
  );
}
