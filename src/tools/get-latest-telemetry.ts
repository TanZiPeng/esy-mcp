import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { BackendClient } from '../client/backend-client.js';
import { normalizeError, toMcpErrorResponse } from '../errors/index.js';

/**
 * Registers the get_latest_telemetry tool.
 *
 * Returns latest telemetry data for a device including PV power, load power,
 * battery power, grid power, and battery SOC.
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4
 */
export function registerGetLatestTelemetry(server: McpServer, client: BackendClient): void {
  server.tool(
    'get_latest_telemetry',
    'Get latest telemetry data for a device including PV power, load power, battery power, grid power, and battery SOC',
    {
      device_id: z.string().min(1).regex(/^\d+$/, 'device_id must be a numeric identifier').describe('Device database ID'),
    },
    async (params) => {
      try {
        const data = await client.get(`/admin/chat-api/devices/${params.device_id}/telemetry/latest`);
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      } catch (error) {
        return toMcpErrorResponse(normalizeError(error));
      }
    }
  );
}
