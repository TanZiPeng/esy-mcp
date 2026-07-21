import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { BackendClient } from '../client/backend-client.js';
import { normalizeError, toMcpErrorResponse } from '../errors/index.js';

/**
 * Registers the list_devices tool.
 *
 * List and filter IoT devices with keyword search, status/type/model/site
 * filtering, alarm status filtering, and pagination support.
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */
export function registerListDevices(server: McpServer, client: BackendClient): void {
  server.tool(
    'list_devices',
    'List and filter IoT devices. Supports keyword search, status/type/model/site filtering, and pagination.',
    {
      keyword: z.string().max(100).optional().describe('Device SN, serial number, or name fuzzy search'),
      status: z.enum(['online', 'offline', 'upgrade']).optional().describe('Device online status filter'),
      device_type: z.string().optional().describe('Device type identifier'),
      model: z.string().optional().describe('Model name fuzzy filter'),
      site_id: z.string().optional().describe('Site/installer ID filter'),
      alarm_status: z.enum(['alarm', 'normal']).optional().describe('Alarm status filter'),
      page: z.number().int().min(1).default(1).optional().describe('Page number (starts from 1)'),
      page_size: z.number().int().min(1).max(100).default(20).optional().describe('Items per page (1-100, default 20)'),
    },
    async (params) => {
      try {
        const data = await client.get('/admin/chat-api/devices', {
          keyword: params.keyword,
          status: params.status,
          device_type: params.device_type,
          model: params.model,
          site_id: params.site_id,
          alarm_status: params.alarm_status,
          page: params.page ?? 1,
          page_size: params.page_size ?? 20,
        });
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      } catch (error) {
        return toMcpErrorResponse(normalizeError(error));
      }
    }
  );
}
