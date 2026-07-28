/**
 * ESY AI MCP Service - Server Factory
 *
 * Creates an McpServer with stateless tools. Each tool accepts web_session_token
 * and handles authentication inline — no separate initialize_session step needed.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { BackendClient } from './client/backend-client.js';
import type { TokenManager } from './auth/token-manager.js';
import { normalizeError, toMcpErrorResponse } from './errors/index.js';

/**
 * Ensures the token manager is initialized before making API calls.
 * If already initialized, this is a no-op.
 */
async function ensureAuth(tokenManager: TokenManager, webSessionToken: string): Promise<void> {
  if (!tokenManager.isInitialized()) {
    await tokenManager.initialize(webSessionToken);
  }
}

/** Timestamp for log lines */
function ts(): string {
  return new Date().toISOString();
}

/** Logging wrapper for tool handlers */
function withLogging(
  toolName: string,
  handler: (params: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>,
) {
  return async (params: Record<string, unknown>) => {
    const start = Date.now();
    console.log(`[${ts()}] ▶ ${toolName} called`);
    try {
      const result = await handler(params);
      const duration = Date.now() - start;
      if (result.isError) {
        console.error(`[${ts()}] ✗ ${toolName} failed (${duration}ms): ${result.content[0]?.text}`);
      } else {
        console.log(`[${ts()}] ✓ ${toolName} success (${duration}ms)`);
      }
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      console.error(`[${ts()}] ✗ ${toolName} threw (${duration}ms):`, error);
      throw error;
    }
  };
}

/**
 * Creates a stateless MCP server where every tool includes web_session_token parameter.
 */
export function createStatelessMcpServer(client: BackendClient, tokenManager: TokenManager): McpServer {
  const server = new McpServer({
    name: 'esy-ai-mcp-service',
    version: '1.0.0',
  });

  // ─── initialize_session (kept for backward compatibility) ──────────────

  server.tool(
    'initialize_session',
    'Initialize the session with a web_session_token. Optional — other tools will auto-initialize if you pass web_session_token to them directly.',
    { web_session_token: z.string().min(1).describe('Web session token from the customer website') },
    async (params) => {
      try {
        await tokenManager.initialize(params.web_session_token);
        console.log(`[${new Date().toISOString()}] ✓ initialize_session success`);
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: 'Session initialized successfully' }) }] };
      } catch (error) {
        console.error(`[${new Date().toISOString()}] ✗ initialize_session failed:`, error instanceof Error ? error.message : error);
        return toMcpErrorResponse(normalizeError(error));
      }
    },
  );

  // ─── get_user_context ──────────────────────────────────────────────────

  server.tool(
    'get_user_context',
    'Get current user context including user ID, name, tenant, role, and permissions',
    { web_session_token: z.string().min(1).describe('Web session token for authentication') },
    async (params) => {
      try {
        await ensureAuth(tokenManager, params.web_session_token);
        const data = await client.get('/admin/chat-api/context');
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      } catch (error) {
        return toMcpErrorResponse(normalizeError(error));
      }
    },
  );

  // ─── list_devices ──────────────────────────────────────────────────────

  server.tool(
    'list_devices',
    'List and filter IoT devices. Supports keyword search, status/type/model/site/alarm filtering, and pagination.',
    {
      web_session_token: z.string().min(1).describe('Web session token for authentication'),
      keyword: z.string().max(100).optional().describe('Device SN, serial number, or name (fuzzy search)'),
      status: z.string().optional().describe('Device status: online, offline, or upgrade'),
      device_type: z.string().optional().describe('Device type identifier'),
      model: z.string().optional().describe('Model name (fuzzy match)'),
      site_id: z.string().optional().describe('Site/installer ID'),
      alarm_status: z.string().optional().describe('Alarm status: alarm or normal'),
      page: z.number().int().min(1).optional().describe('Page number (default: 1)'),
      page_size: z.number().int().min(1).max(100).optional().describe('Items per page (default: 20, max: 100)'),
    },
    async (params) => {
      try {
        await ensureAuth(tokenManager, params.web_session_token);
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
    },
  );

  // ─── get_device_details ────────────────────────────────────────────────

  server.tool(
    'get_device_details',
    'Get detailed information about a specific device',
    {
      web_session_token: z.string().min(1).describe('Web session token for authentication'),
      device_id: z.string().min(1).regex(/^\d+$/, 'device_id must be numeric').describe('Device database ID'),
    },
    async (params) => {
      try {
        await ensureAuth(tokenManager, params.web_session_token);
        const data = await client.get(`/admin/chat-api/devices/${params.device_id}`);
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      } catch (error) {
        return toMcpErrorResponse(normalizeError(error));
      }
    },
  );

  // ─── get_device_status ─────────────────────────────────────────────────

  server.tool(
    'get_device_status',
    'Get real-time status of a device including online, running, and alarm status',
    {
      web_session_token: z.string().min(1).describe('Web session token for authentication'),
      device_id: z.string().min(1).regex(/^\d+$/, 'device_id must be numeric').describe('Device database ID'),
    },
    async (params) => {
      try {
        await ensureAuth(tokenManager, params.web_session_token);
        const data = await client.get(`/admin/chat-api/devices/${params.device_id}/status`);
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      } catch (error) {
        return toMcpErrorResponse(normalizeError(error));
      }
    },
  );

  // ─── get_latest_telemetry ──────────────────────────────────────────────

  server.tool(
    'get_latest_telemetry',
    'Get latest telemetry data for a device (PV power, load, battery, grid, SOC)',
    {
      web_session_token: z.string().min(1).describe('Web session token for authentication'),
      device_id: z.string().min(1).regex(/^\d+$/, 'device_id must be numeric').describe('Device database ID'),
    },
    async (params) => {
      try {
        await ensureAuth(tokenManager, params.web_session_token);
        const data = await client.get(`/admin/chat-api/devices/${params.device_id}/telemetry/latest`);
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      } catch (error) {
        return toMcpErrorResponse(normalizeError(error));
      }
    },
  );

  // ─── get_telemetry_history ─────────────────────────────────────────────

  server.tool(
    'get_telemetry_history',
    'Query historical telemetry data with time range and aggregation',
    {
      web_session_token: z.string().min(1).describe('Web session token for authentication'),
      device_id: z.string().min(1).regex(/^\d+$/, 'device_id must be numeric').describe('Device database ID'),
      start_time: z.number().int().min(0).optional().describe('Start time (Unix seconds)'),
      end_time: z.number().int().min(0).optional().describe('End time (Unix seconds)'),
      aggregation: z.enum(['raw', 'hour', 'day']).optional().describe('Aggregation: raw, hour, day (default: hour)'),
      limit: z.number().int().min(1).max(500).optional().describe('Max records (default: 200, max: 500)'),
    },
    async (params) => {
      try {
        await ensureAuth(tokenManager, params.web_session_token);
        const queryParams: Record<string, string | number> = {
          aggregation: params.aggregation ?? 'hour',
          limit: params.limit ?? 200,
        };
        if (params.start_time !== undefined) queryParams.start_time = params.start_time;
        if (params.end_time !== undefined) queryParams.end_time = params.end_time;
        const data = await client.get(`/admin/chat-api/devices/${params.device_id}/telemetry/history`, queryParams);
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      } catch (error) {
        return toMcpErrorResponse(normalizeError(error));
      }
    },
  );

  // ─── get_device_alarms ─────────────────────────────────────────────────

  server.tool(
    'get_device_alarms',
    'Get alarms for a specific device with filtering',
    {
      web_session_token: z.string().min(1).describe('Web session token for authentication'),
      device_id: z.string().min(1).regex(/^\d+$/, 'device_id must be numeric').describe('Device database ID'),
      status: z.enum(['active', 'recovered', 'handled']).optional().describe('Alarm status filter'),
      level: z.enum(['1', '2', '3', 'level_1', 'level_2', 'level_3']).optional().describe('Alarm level filter'),
      start_time: z.number().int().min(0).optional().describe('Start time (Unix seconds)'),
      end_time: z.number().int().min(0).optional().describe('End time (Unix seconds)'),
      page: z.number().int().min(1).optional().describe('Page number (default: 1)'),
      page_size: z.number().int().min(1).max(100).optional().describe('Items per page (default: 20)'),
    },
    async (params) => {
      try {
        await ensureAuth(tokenManager, params.web_session_token);
        const queryParams: Record<string, string | number> = { page: params.page ?? 1, page_size: params.page_size ?? 20 };
        if (params.status !== undefined) queryParams.status = params.status;
        if (params.level !== undefined) queryParams.level = params.level;
        if (params.start_time !== undefined) queryParams.start_time = params.start_time;
        if (params.end_time !== undefined) queryParams.end_time = params.end_time;
        const data = await client.get(`/admin/chat-api/devices/${params.device_id}/alarms`, queryParams);
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      } catch (error) {
        return toMcpErrorResponse(normalizeError(error));
      }
    },
  );

  // ─── get_all_alarms ────────────────────────────────────────────────────

  server.tool(
    'get_all_alarms',
    'Get all alarms across all devices for the current user',
    {
      web_session_token: z.string().min(1).describe('Web session token for authentication'),
      status: z.enum(['active', 'recovered', 'handled']).optional().describe('Alarm status filter'),
      level: z.enum(['1', '2', '3', 'level_1', 'level_2', 'level_3']).optional().describe('Alarm level filter'),
      device_id: z.string().optional().describe('Optional device ID filter'),
      start_time: z.number().int().min(0).optional().describe('Start time (Unix seconds)'),
      end_time: z.number().int().min(0).optional().describe('End time (Unix seconds)'),
      page: z.number().int().min(1).optional().describe('Page number (default: 1)'),
      page_size: z.number().int().min(1).max(100).optional().describe('Items per page (default: 20)'),
    },
    async (params) => {
      try {
        await ensureAuth(tokenManager, params.web_session_token);
        const queryParams: Record<string, string | number> = { page: params.page ?? 1, page_size: params.page_size ?? 20 };
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
    },
  );

  // ─── get_device_events ─────────────────────────────────────────────────

  server.tool(
    'get_device_events',
    'Get events for a device (online/offline transitions and alarm triggers)',
    {
      web_session_token: z.string().min(1).describe('Web session token for authentication'),
      device_id: z.string().min(1).regex(/^\d+$/, 'device_id must be numeric').describe('Device database ID'),
      event_type: z.enum(['ONLINE', 'OFFLINE', 'ALARM_START', 'ALARM_RECOVER']).optional().describe('Event type filter'),
      start_time: z.number().int().min(0).optional().describe('Start time (Unix seconds)'),
      end_time: z.number().int().min(0).optional().describe('End time (Unix seconds)'),
      page: z.number().int().min(1).optional().describe('Page number (default: 1)'),
      page_size: z.number().int().min(1).max(100).optional().describe('Items per page (default: 20)'),
    },
    async (params) => {
      try {
        await ensureAuth(tokenManager, params.web_session_token);
        const queryParams: Record<string, string | number> = { page: params.page ?? 1, page_size: params.page_size ?? 20 };
        if (params.event_type !== undefined) queryParams.event_type = params.event_type;
        if (params.start_time !== undefined) queryParams.start_time = params.start_time;
        if (params.end_time !== undefined) queryParams.end_time = params.end_time;
        const data = await client.get(`/admin/chat-api/devices/${params.device_id}/events`, queryParams);
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      } catch (error) {
        return toMcpErrorResponse(normalizeError(error));
      }
    },
  );

  // ─── get_device_summary ────────────────────────────────────────────────

  server.tool(
    'get_device_summary',
    'Get device fleet statistics (total, online, offline, running, stopped, alarms)',
    { web_session_token: z.string().min(1).describe('Web session token for authentication') },
    async (params) => {
      try {
        await ensureAuth(tokenManager, params.web_session_token);
        const data = await client.get('/admin/chat-api/devices/summary');
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      } catch (error) {
        return toMcpErrorResponse(normalizeError(error));
      }
    },
  );

  // ─── get_sites ─────────────────────────────────────────────────────────

  server.tool(
    'get_sites',
    'List all sites/projects with installer info and device count',
    { web_session_token: z.string().min(1).describe('Web session token for authentication') },
    async (params) => {
      try {
        await ensureAuth(tokenManager, params.web_session_token);
        const data = await client.get('/admin/chat-api/sites');
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      } catch (error) {
        return toMcpErrorResponse(normalizeError(error));
      }
    },
  );

  return server;
}
