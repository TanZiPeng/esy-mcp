/**
 * ESY AI MCP Service - TypeScript Interfaces
 *
 * All field names use snake_case per Requirement 14.4.
 */

// ─── API Response Envelope ───────────────────────────────────────────────────

/** Generic ESY AI backend response envelope */
export interface EsyApiResponse<T> {
  code: number;
  msg: string;
  data: T;
}

// ─── Token State ─────────────────────────────────────────────────────────────

/** Internal token state tracked by TokenManager */
export interface TokenState {
  chat_token: string;
  expires_at: number; // Unix seconds (current_time + expires_in)
  web_session_token: string; // Stored for refresh calls
}

// ─── Tool Error / Success Payloads ───────────────────────────────────────────

/** Structured error payload returned in MCP error responses */
export interface ToolErrorPayload {
  error_type: 'backend_error' | 'network_error' | 'validation_error';
  error_code?: number; // Backend error code (for backend_error)
  error_message: string; // Human-readable description
  parameter?: string; // Invalid parameter name (for validation_error)
  expected_type?: string; // Expected type (for validation_error)
  received_type?: string; // Received type (for validation_error)
  failure_type?: string; // timeout | connection_refused | dns_failure (for network_error)
}

/** Success payload shape (generic key-value with snake_case fields) */
export interface ToolSuccessPayload {
  [key: string]: unknown;
}

// ─── Domain Models ───────────────────────────────────────────────────────────

/** User context returned by GET /admin/chat-api/context */
export interface UserContext {
  user_id: string;
  user_name: string;
  tenant_id: string;
  tenant_name: string;
  role: string;
  permissions: string[];
}

/** Device list item returned by GET /admin/chat-api/devices */
export interface DeviceListItem {
  device_id: string;
  device_name: string;
  serial_number: string;
  sn: string;
  device_type: string;
  model: string;
  site_id: string;
  site_name: string;
  status: string;
  alarm_status: string;
}

/** Full device details returned by GET /admin/chat-api/devices/{device_id} */
export interface DeviceDetails extends DeviceListItem {
  install_location: string;
  install_time: number; // Unix seconds
  country_code: string;
  time_zone_id: string;
}

/** Device status returned by GET /admin/chat-api/devices/{device_id}/status */
export interface DeviceStatus {
  device_id: string;
  device_name: string;
  online_status: 'online' | 'offline' | 'upgrade';
  running_status: 'running' | 'standby' | 'starting' | 'stopped' | 'unknown';
  alarm_status: 'alarm' | 'normal';
  last_online_time: number; // Unix seconds
  data_time: number; // Unix seconds
}

/** A single telemetry metric with value and unit */
export interface TelemetryMetric {
  value: number | null;
  unit: string;
}

/** Latest telemetry snapshot for a device */
export interface LatestTelemetry {
  device_id: string;
  data_time: number; // Unix seconds
  pvPower: TelemetryMetric;
  loadPower: TelemetryMetric;
  batteryPower: TelemetryMetric;
  gridPower: TelemetryMetric;
  batterySoc: TelemetryMetric;
}

/** Single item in telemetry history response */
export interface TelemetryHistoryItem {
  time: number; // Unix seconds
  pv_power: number | null;
  load_power: number | null;
  battery_power: number | null;
  grid_power: number | null;
  battery_soc: number | null;
}

/** Alarm item returned by alarm endpoints */
export interface AlarmItem {
  alarm_id: string;
  device_id: string;
  device_name: string;
  sn: string;
  alarm_code: string;
  alarm_name: string;
  alarm_level: string;
  alarm_status: string;
  start_time: number; // Unix seconds
  end_time: number | null; // Unix seconds, null if active
  possible_causes: string;
  solutions: string;
}

/** Event item returned by GET /admin/chat-api/devices/{device_id}/events */
export interface EventItem {
  event_type: string;
  event_name: string;
  event_time: number; // Unix seconds
  detail?: string;
}

/** Fleet-level device summary statistics */
export interface DeviceSummary {
  total: number;
  online: number;
  offline: number;
  running: number;
  stopped: number;
  alarm_devices: number;
  active_alarms: number;
}

/** Site/project item returned by GET /admin/chat-api/sites */
export interface SiteItem {
  installer_id: string;
  company_name: string;
  device_count: number;
}
