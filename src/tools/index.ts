/**
 * ESY AI MCP Service - Tool Registration Index
 *
 * Exports a single function that registers all 11 MCP tools
 * with the server instance.
 *
 * Validates: Requirements 15.3
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BackendClient } from '../client/backend-client.js';

import { registerGetUserContext } from './get-user-context.js';
import { registerListDevices } from './list-devices.js';
import { registerGetDeviceDetails } from './get-device-details.js';
import { registerGetDeviceStatus } from './get-device-status.js';
import { registerGetLatestTelemetry } from './get-latest-telemetry.js';
import { registerGetTelemetryHistory } from './get-telemetry-history.js';
import { registerGetDeviceAlarms } from './get-device-alarms.js';
import { registerGetAllAlarms } from './get-all-alarms.js';
import { registerGetDeviceEvents } from './get-device-events.js';
import { registerGetDeviceSummary } from './get-device-summary.js';
import { registerGetSites } from './get-sites.js';

/**
 * Registers all 11 MCP tools with the given server instance.
 */
export function registerAllTools(server: McpServer, client: BackendClient): void {
  registerGetUserContext(server, client);
  registerListDevices(server, client);
  registerGetDeviceDetails(server, client);
  registerGetDeviceStatus(server, client);
  registerGetLatestTelemetry(server, client);
  registerGetTelemetryHistory(server, client);
  registerGetDeviceAlarms(server, client);
  registerGetAllAlarms(server, client);
  registerGetDeviceEvents(server, client);
  registerGetDeviceSummary(server, client);
  registerGetSites(server, client);
}
