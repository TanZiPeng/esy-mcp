# Implementation Plan: ESY AI MCP Service

## Overview

Implement a Node.js/TypeScript MCP service that wraps ESY AI backend APIs as 11 MCP tools, with per-session token management, input validation via Zod v4, and dual transport support (Streamable HTTP + SSE and stdio). Tasks are ordered by dependency: scaffolding → core infrastructure → tools → transport → entry point → testing.

## Tasks

- [x] 1. Project scaffolding and configuration
  - [x] 1.1 Create package.json with dependencies and scripts
    - Initialize `package.json` with name `esy-ai-mcp-service`, type `module`
    - Add dependencies: `@modelcontextprotocol/sdk`, `@modelcontextprotocol/express`, `express`, `zod`
    - Add devDependencies: `typescript`, `vitest`, `fast-check`, `@types/express`, `@types/node`, `tsx`
    - Add scripts: `build`, `start`, `dev`, `test`, `test:property`
    - _Requirements: 15.1, 15.2_

  - [x] 1.2 Create tsconfig.json and project structure
    - Configure TypeScript with `target: ES2022`, `module: Node16`, `strict: true`, `outDir: dist`
    - Create directory structure: `src/auth/`, `src/client/`, `src/tools/`, `src/transport/`, `src/schemas/`, `src/errors/`, `src/types/`
    - Create `.env.example` with `ESY_API_BASE_URL` and `PORT` variables
    - _Requirements: 15.2_

- [x] 2. Core types and shared schemas
  - [x] 2.1 Create TypeScript interfaces (`src/types/index.ts`)
    - Define `EsyApiResponse<T>` envelope interface
    - Define `TokenState`, `ToolErrorPayload`, `ToolSuccessPayload` interfaces
    - Define domain model interfaces: `UserContext`, `DeviceListItem`, `DeviceDetails`, `DeviceStatus`, `LatestTelemetry`, `TelemetryMetric`, `TelemetryHistoryItem`, `AlarmItem`, `EventItem`, `DeviceSummary`, `SiteItem`
    - _Requirements: 14.4, 14.5_

  - [x] 2.2 Create shared Zod validation schemas (`src/schemas/common.ts`)
    - Implement `deviceIdSchema` — string, min length 1, regex `^\d+$`
    - Implement `paginationSchema` — object with optional `page` (int, min 1) and `page_size` (int, min 1, max 100)
    - Implement `timestampSchema` — number, int, min 0
    - Implement `timeRangeSchema` — object with optional `start_time`/`end_time`, refine that start ≤ end
    - Implement `alarmLevelSchema` — enum `['1','2','3','level_1','level_2','level_3']`
    - Implement `alarmStatusSchema` — enum `['active','recovered','handled']`
    - Implement `eventTypeSchema` — enum `['ONLINE','OFFLINE','ALARM_START','ALARM_RECOVER']`
    - Implement `aggregationSchema` — enum `['raw','hour','day']`
    - _Requirements: 4.2, 4.3, 5.2, 8.3, 8.4, 9.2, 9.3, 9.5, 9.6, 10.2, 10.3, 10.4, 10.5, 10.6, 11.2, 11.3, 11.4, 11.6, 11.7_

- [x] 3. Error handling module
  - [x] 3.1 Implement error types and normalization (`src/errors/index.ts`)
    - Create `ValidationError`, `BackendError`, `NetworkError` classes extending `Error`
    - Implement `normalizeError()` function that maps any error to a `ToolErrorPayload`
    - `BackendError` should carry `error_code` and `error_message`
    - `NetworkError` should carry `failure_type` (timeout | connection_refused | dns_failure)
    - `ValidationError` should carry `parameter`, `expected_type`, `received_type`
    - Implement `toMcpErrorResponse()` helper that wraps `ToolErrorPayload` as MCP `{ content: [{type:'text', text}], isError: true }`
    - _Requirements: 14.1, 14.2, 14.3, 14.5_

- [x] 4. Token management
  - [x] 4.1 Implement TokenManager class (`src/auth/token-manager.ts`)
    - `initialize(webSessionToken: string)` — calls `POST /admin/chat-api/session`, stores token and computes `expires_at = now + expires_in`
    - `getValidToken()` — returns current token if `(expires_at - now) >= 60`, otherwise triggers refresh first
    - `refreshToken()` — deduplicates concurrent refresh calls via a shared promise; calls `POST /admin/chat-api/session` with stored web_session_token
    - `isInitialized()` — returns whether a valid token has been acquired
    - Token refresh timeout: 10 seconds
    - On refresh failure: throw error indicating re-initialization required
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.3, 2.5_

  - [ ]* 4.2 Write property tests for TokenManager (`tests/property/token-lifecycle.property.ts`)
    - **Property 1: Token Expiry Computation** — for any positive `expires_in` and current timestamp, `expires_at === current_time + expires_in`
    - **Property 2: Proactive Refresh Trigger** — refresh triggered iff `(expires_at - now) < 60`
    - **Property 5: Concurrent Refresh Deduplication** — N concurrent calls produce exactly 1 POST /session
    - **Validates: Requirements 1.2, 2.1, 2.5**

- [x] 5. Backend HTTP client
  - [x] 5.1 Implement BackendClient class (`src/client/backend-client.ts`)
    - Constructor takes `baseUrl: string` and `tokenManager: TokenManager`
    - `get<T>(path, params?)` — makes GET request with `Authorization: Bearer <token>` header and 30s timeout
    - `post<T>(path, body?)` — makes POST request with same auth and timeout
    - On HTTP 401: calls `tokenManager.refreshToken()`, retries exactly once
    - On network error: maps to `NetworkError` with correct `failure_type` (timeout from AbortController, ECONNREFUSED, ENOTFOUND)
    - On `code !== 0` in response body: throws `BackendError` with code and msg
    - _Requirements: 2.2, 2.4, 14.1, 14.2_

  - [ ]* 5.2 Write property tests for BackendClient (`tests/property/error-normalization.property.ts`)
    - **Property 3: 401 Retry Exactly Once** — any 401 triggers exactly one retry, second 401 stops
    - **Property 4: Authorization Header Invariant** — every request includes Bearer token header
    - **Property 6: Backend Error Normalization** — any `code !== 0` maps to `{error_type: 'backend_error', error_code, error_message}`
    - **Property 11: Network Error Classification** — any network failure maps to `{error_type: 'network_error', failure_type}`
    - **Validates: Requirements 2.2, 2.4, 14.1, 14.2**

- [x] 6. Checkpoint - Core infrastructure verification
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Tool implementations (Part 1 — Simple tools)
  - [x] 7.1 Implement get_user_context tool (`src/tools/get-user-context.ts`)
    - No input parameters
    - Calls `GET /admin/chat-api/context`
    - Returns user context fields: user_id, user_name, tenant_id, tenant_name, role, permissions
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 7.2 Implement get_device_summary tool (`src/tools/get-device-summary.ts`)
    - No input parameters
    - Calls `GET /admin/chat-api/devices/summary`
    - Returns: total, online, offline, running, stopped, alarm_devices, active_alarms
    - _Requirements: 12.1, 12.2_

  - [x] 7.3 Implement get_sites tool (`src/tools/get-sites.ts`)
    - No input parameters
    - Calls `GET /admin/chat-api/sites`
    - Returns total count and items with installer_id, company_name, device_count
    - _Requirements: 13.1, 13.2_

- [x] 8. Tool implementations (Part 2 — Device tools)
  - [x] 8.1 Implement list_devices tool (`src/tools/list-devices.ts`)
    - Input schema: keyword (string, max 100), status, device_type, model, site_id, alarm_status (all optional strings), page (int min 1), page_size (int min 1 max 100)
    - Default page=1, page_size=20
    - Calls `GET /admin/chat-api/devices` with filter params
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 8.2 Implement get_device_details tool (`src/tools/get-device-details.ts`)
    - Input schema: device_id (required, numeric string)
    - Calls `GET /admin/chat-api/devices/{device_id}`
    - Returns full device details
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 8.3 Implement get_device_status tool (`src/tools/get-device-status.ts`)
    - Input schema: device_id (required, numeric string)
    - Calls `GET /admin/chat-api/devices/{device_id}/status`
    - Returns online_status, running_status, alarm_status, last_online_time, data_time
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 8.4 Implement get_latest_telemetry tool (`src/tools/get-latest-telemetry.ts`)
    - Input schema: device_id (required, numeric string)
    - Calls `GET /admin/chat-api/devices/{device_id}/telemetry/latest`
    - Returns telemetry metrics preserving null values
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 8.5 Implement get_telemetry_history tool (`src/tools/get-telemetry-history.ts`)
    - Input schema: device_id (required), start_time (optional timestamp), end_time (optional timestamp), aggregation (optional enum), limit (optional int 1-500)
    - Defaults: start_time = now - 24h, end_time = now, aggregation = "hour", limit = 200
    - Calls `GET /admin/chat-api/devices/{device_id}/telemetry/history`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

- [x] 9. Tool implementations (Part 3 — Alarms and Events)
  - [x] 9.1 Implement get_device_alarms tool (`src/tools/get-device-alarms.ts`)
    - Input schema: device_id (required), status (optional enum), level (optional enum), start_time, end_time (optional timestamps), page, page_size (optional pagination)
    - Default page=1, page_size=20
    - Calls `GET /admin/chat-api/devices/{device_id}/alarms`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [x] 9.2 Implement get_all_alarms tool (`src/tools/get-all-alarms.ts`)
    - Input schema: status (optional enum), level (optional enum), device_id (optional string), start_time, end_time (optional timestamps with start ≤ end validation), page, page_size (optional pagination)
    - Default page=1, page_size=20
    - Calls `GET /admin/chat-api/alarms`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [x] 9.3 Implement get_device_events tool (`src/tools/get-device-events.ts`)
    - Input schema: device_id (required), event_type (optional enum), start_time, end_time (optional timestamps with start ≤ end validation), page, page_size (optional pagination)
    - Calls `GET /admin/chat-api/devices/{device_id}/events`
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8_

- [x] 10. Tool registration orchestrator
  - [x] 10.1 Create tool registration index (`src/tools/index.ts`)
    - Export `registerAllTools(server: McpServer, client: BackendClient)` function
    - Call all 11 tool registration functions
    - _Requirements: 15.3_

  - [ ]* 10.2 Write property tests for validation schemas (`tests/property/validation.property.ts`)
    - **Property 7: Pagination Validation** — any page < 1 or page_size outside [1,100] is rejected
    - **Property 8: Device ID Format Validation** — any empty or non-numeric string is rejected
    - **Property 9: Enum Parameter Validation** — any string not in the allowed set is rejected
    - **Property 10: Time Range Ordering** — start_time > end_time is rejected
    - **Validates: Requirements 4.2, 4.3, 5.2, 8.4, 8.5, 9.2, 9.3, 9.5, 9.6, 10.2, 10.3, 10.4, 10.5, 10.6, 11.3, 11.4, 11.6, 11.7**

- [x] 11. Checkpoint - All tools implementation complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Transport and server setup
  - [x] 12.1 Implement MCP server factory (`src/server.ts`)
    - `createEsyMcpServer(tokenManager, backendClient)` — creates `McpServer` instance, calls `registerAllTools`, returns server
    - Configure server with name `esy-ai-mcp-service` and version from package.json
    - _Requirements: 15.3_

  - [x] 12.2 Implement Streamable HTTP + SSE transport (`src/transport/setup.ts`)
    - Create Express app with `@modelcontextprotocol/express`
    - Mount MCP handler on `POST /mcp` and `GET /mcp` endpoints
    - Configure per-session state (TokenManager + BackendClient per session)
    - Support session initialization via tool call with web_session_token
    - _Requirements: 15.1_

  - [x] 12.3 Implement entry point and configuration (`src/index.ts`)
    - Read `ESY_API_BASE_URL` from environment, fail if not set
    - Read `PORT` from environment (default 3000)
    - Support stdio transport mode via `--stdio` flag
    - Implement graceful shutdown: complete in-flight calls within 10s, close connections
    - Start HTTP server or stdio transport based on mode
    - _Requirements: 15.1, 15.2, 15.4_

- [x] 13. Checkpoint - Service runs end-to-end
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 14. Unit and integration tests
  - [ ]* 14.1 Write unit tests for TokenManager (`tests/unit/token-manager.test.ts`)
    - Test initialization happy path with valid web_session_token
    - Test auth error during session creation (code !== 0)
    - Test missing/empty web_session_token
    - Test backend unavailable during session
    - Test token refresh failure handling
    - Test proactive refresh when within 60s of expiry
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.3_

  - [ ]* 14.2 Write unit tests for BackendClient (`tests/unit/backend-client.test.ts`)
    - Test successful GET/POST with auth header
    - Test 401 response triggers refresh and retry
    - Test network timeout produces NetworkError
    - Test connection refused produces NetworkError
    - Test backend code !== 0 produces BackendError
    - _Requirements: 2.2, 2.4, 14.1, 14.2_

  - [ ]* 14.3 Write unit tests for validation schemas (`tests/unit/validation.test.ts`)
    - Test deviceIdSchema accepts valid numeric strings, rejects empty/non-numeric
    - Test paginationSchema defaults and boundary values
    - Test timeRangeSchema rejects start > end
    - Test all enum schemas accept valid values, reject invalid
    - _Requirements: 4.2, 4.3, 5.2, 8.3, 8.4, 9.5, 9.6, 10.4, 10.5, 11.7_

  - [ ]* 14.4 Write unit tests for error handler (`tests/unit/error-handler.test.ts`)
    - Test BackendError normalization to ToolErrorPayload
    - Test NetworkError normalization with failure_type
    - Test ValidationError normalization with parameter details
    - Test snake_case field names in all error responses
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

  - [ ]* 14.5 Write property tests for data passthrough (`tests/property/data-passthrough.property.ts`)
    - **Property 12: Null Telemetry Preservation** — null metric values are preserved through transformation
    - **Property 13: Snake Case Field Names** — all response field names match `^[a-z][a-z0-9]*(_[a-z0-9]+)*$`
    - **Validates: Requirements 7.2, 14.4**

- [x] 15. Final checkpoint - All tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The service uses `@modelcontextprotocol/sdk` v2 with `McpServer.registerTool()` API
- Zod v4 is imported as `zod/v4` per the SDK's requirements
- All tool responses use snake_case field names per Requirement 14.4

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "2.2"] },
    { "id": 2, "tasks": ["3.1"] },
    { "id": 3, "tasks": ["4.1", "5.1"] },
    { "id": 4, "tasks": ["4.2", "5.2"] },
    { "id": 5, "tasks": ["7.1", "7.2", "7.3", "8.1", "8.2", "8.3", "8.4", "8.5"] },
    { "id": 6, "tasks": ["9.1", "9.2", "9.3"] },
    { "id": 7, "tasks": ["10.1", "10.2"] },
    { "id": 8, "tasks": ["12.1"] },
    { "id": 9, "tasks": ["12.2", "12.3"] },
    { "id": 10, "tasks": ["14.1", "14.2", "14.3", "14.4", "14.5"] }
  ]
}
```
