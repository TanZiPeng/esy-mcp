# Requirements Document

## Introduction

The ESY AI MCP Service is a standalone service that implements the Model Context Protocol (MCP) to wrap the ESY AI 智能助手 backend APIs. It enables an AI agent (embedded via iframe in customer websites) to interact with IoT device data, alarms, telemetry, and site information through standardized MCP tools. The service handles authentication token lifecycle management and exposes each ESY AI API endpoint as a discrete MCP tool.

## Glossary

- **MCP_Service**: The Model Context Protocol service that wraps ESY AI backend APIs and exposes them as MCP tools
- **Chat_Token**: A temporary authentication token (1800s TTL) obtained from the ESY AI backend by exchanging a web_session_token
- **Web_Session_Token**: A session token passed from the customer website to the iframe via postMessage, representing the end user's authenticated session
- **ESY_AI_Backend**: The backend API server providing device, alarm, telemetry, and site data under the `/admin/chat-api/` path
- **MCP_Tool**: A discrete callable function exposed by the MCP_Service that maps to one ESY AI API endpoint
- **Device**: An IoT device managed by the ESY AI platform (e.g., inverter, battery, energy meter)
- **Telemetry**: Real-time and historical measurement data from devices (e.g., pvPower, loadPower, batteryPower, gridPower, batterySoc)
- **Alarm**: An alert condition raised by a device indicating abnormal operation
- **Site**: A physical location or project containing one or more devices
- **Agent_Platform**: The AI agent orchestration system that connects to the MCP_Service to execute tools

## Requirements

### Requirement 1: Session Initialization

**User Story:** As an agent platform, I want to initialize the MCP service with a web_session_token, so that it can authenticate against the ESY AI backend on behalf of the end user.

#### Acceptance Criteria

1. WHEN the Agent_Platform provides a web_session_token during initialization, THE MCP_Service SHALL call `POST /admin/chat-api/session` with the web_session_token in the Authorization Bearer header to obtain a Chat_Token
2. WHEN the ESY_AI_Backend returns a successful response (code equals 0) containing a non-empty chat_token and expires_in value, THE MCP_Service SHALL store the Chat_Token in memory with its expiry time calculated as current time plus expires_in seconds
3. IF the ESY_AI_Backend returns an authentication error (code not equal to 0 indicating invalid credentials) during session creation, THEN THE MCP_Service SHALL return an error indicating the web_session_token is invalid or expired
4. IF no web_session_token is provided or the web_session_token is an empty string during initialization, THEN THE MCP_Service SHALL return a validation error indicating that a web_session_token is required
5. IF the ESY_AI_Backend is unreachable or returns a non-authentication server error during session creation, THEN THE MCP_Service SHALL return an error indicating the backend service is unavailable

### Requirement 2: Token Lifecycle Management

**User Story:** As an agent platform, I want the MCP service to automatically manage the chat_token lifecycle, so that API calls do not fail due to token expiration.

#### Acceptance Criteria

1. WHILE the Chat_Token is within 60 seconds of its expiry time, WHEN a tool call is requested, THE MCP_Service SHALL refresh the Chat_Token by calling `POST /admin/chat-api/session` before executing the tool call
2. IF a tool call receives an HTTP 401 response from the ESY_AI_Backend, THEN THE MCP_Service SHALL refresh the Chat_Token by calling `POST /admin/chat-api/session` and retry the failed tool call exactly once using the new Chat_Token
3. IF the token refresh call to `POST /admin/chat-api/session` returns a non-2xx response or does not respond within 10 seconds, THEN THE MCP_Service SHALL return an error to the caller indicating that re-initialization is required with a new web_session_token
4. THE MCP_Service SHALL include the Chat_Token in the Authorization header of every request to the ESY_AI_Backend
5. WHILE a Chat_Token refresh is in progress, WHEN additional tool calls are requested, THE MCP_Service SHALL queue those tool calls and execute them with the new Chat_Token after the refresh completes, rather than initiating concurrent refresh requests

### Requirement 3: User Context Tool

**User Story:** As an AI agent, I want to retrieve the current user's context, so that I can personalize responses based on user identity and permissions.

#### Acceptance Criteria

1. WHEN the get_user_context tool is called, THE MCP_Service SHALL call `GET /admin/chat-api/context` and return the user context including user_id, user_name, tenant_id, tenant_name, role, and permissions fields
2. IF the ESY_AI_Backend returns a response with code not equal to 0, THEN THE MCP_Service SHALL return an error response containing the backend error code and message
3. IF the Chat_Token is missing, invalid, or expired and refresh fails, THEN THE MCP_Service SHALL return an authentication error indicating re-initialization is required

### Requirement 4: Device Listing Tool

**User Story:** As an AI agent, I want to list and filter devices, so that I can help users find specific devices in their fleet.

#### Acceptance Criteria

1. WHEN the list_devices tool is called with optional filter parameters (keyword, status, device_type, model, site_id, alarm_status, page, page_size), THE MCP_Service SHALL call `GET /admin/chat-api/devices` with the provided parameters and return a response containing the total count of matching devices and a list of device items, where each item includes device_id, device_name, serial_number, sn, device_type, model, site_id, site_name, status, and alarm_status
2. IF the page parameter is provided and is less than 1, THEN THE MCP_Service SHALL reject the request with an error message indicating the page value is invalid
3. IF the page_size parameter is provided and is less than 1 or greater than 100, THEN THE MCP_Service SHALL reject the request with an error message indicating the page_size value is out of the allowed range of 1 to 100
4. WHEN page is not provided, THE MCP_Service SHALL use the default value of 1, and WHEN page_size is not provided, THE MCP_Service SHALL use the default value of 20
5. WHEN the list_devices tool is called with filters that match no devices, THE MCP_Service SHALL return a response with total set to 0 and an empty items list
6. IF the keyword parameter is provided and exceeds 100 characters in length, THEN THE MCP_Service SHALL reject the request with an error message indicating the keyword is too long

### Requirement 5: Device Details Tool

**User Story:** As an AI agent, I want to get detailed information about a specific device, so that I can answer user questions about device configuration and properties.

#### Acceptance Criteria

1. WHEN the get_device_details tool is called with a valid device_id, THE MCP_Service SHALL call `GET /admin/chat-api/devices/{device_id}` and return the device details including device_id, device_name, serial_number, sn, device_type, model, site_id, site_name, install_location, install_time, status, country_code, and time_zone_id
2. IF the device_id is empty, not provided, or not a valid numeric identifier, THEN THE MCP_Service SHALL return a validation error indicating device_id is required and must be a valid numeric identifier
3. IF the ESY_AI_Backend returns a not-found or permission-denied error, THEN THE MCP_Service SHALL return a descriptive error indicating the device is not accessible
4. IF the ESY_AI_Backend returns an unexpected error (code not equal to 0 and not a permission/not-found error), THEN THE MCP_Service SHALL return the backend error code and message

### Requirement 6: Device Status Tool

**User Story:** As an AI agent, I want to check the real-time status of a device, so that I can inform users whether their device is online, running, or in alarm state.

#### Acceptance Criteria

1. WHEN the get_device_status tool is called with a valid device_id, THE MCP_Service SHALL call `GET /admin/chat-api/devices/{device_id}/status` and return the device status including device_id, device_name, online_status (online/offline/upgrade), running_status (running/standby/starting/stopped/unknown), alarm_status (alarm/normal), last_online_time (unix seconds), and data_time (unix seconds)
2. IF the device_id is empty or not provided, THEN THE MCP_Service SHALL return a validation error indicating device_id is required
3. IF the API returns a response indicating the device_id does not match any known device, THEN THE MCP_Service SHALL return an error indicating the device was not found
4. IF the `GET /admin/chat-api/devices/{device_id}/status` endpoint is unreachable or returns a server error, THEN THE MCP_Service SHALL return an error indicating the device status could not be retrieved

### Requirement 7: Latest Telemetry Tool

**User Story:** As an AI agent, I want to retrieve the latest telemetry data for a device, so that I can report current power generation, consumption, and battery levels.

#### Acceptance Criteria

1. WHEN the get_latest_telemetry tool is called with a device_id, THE MCP_Service SHALL call `GET /admin/chat-api/devices/{device_id}/telemetry/latest` and return the device_id, data_time (Unix timestamp in seconds), and the latest telemetry metrics (pvPower, loadPower, batteryPower, gridPower, batterySoc) with their values and units
2. THE MCP_Service SHALL present power values in kW and batterySoc in percent as returned by the ESY_AI_Backend, preserving null values when no data is available for a metric
3. IF the device_id is empty or not provided, THEN THE MCP_Service SHALL return a validation error indicating device_id is required
4. IF the ESY_AI_Backend returns a not-found or permission-denied error, THEN THE MCP_Service SHALL return a descriptive error indicating the device is not accessible

### Requirement 8: Historical Telemetry Tool

**User Story:** As an AI agent, I want to query historical telemetry data, so that I can provide trend analysis and historical comparisons for device performance.

#### Acceptance Criteria

1. WHEN the get_telemetry_history tool is called with a device_id and optional parameters start_time, end_time, aggregation, and limit, THE MCP_Service SHALL call `GET /admin/chat-api/devices/{device_id}/telemetry/history` with the provided parameters and return the historical telemetry data including the aggregation level and items array containing time, pv_power, load_power, battery_power, grid_power, and battery_soc fields
2. IF start_time is not provided, THEN THE MCP_Service SHALL default to 24 hours before the current time as a Unix timestamp in seconds; IF end_time is not provided, THEN THE MCP_Service SHALL default to the current time as a Unix timestamp in seconds; IF aggregation is not provided, THEN THE MCP_Service SHALL default to "hour"
3. IF start_time or end_time is provided, THEN THE MCP_Service SHALL validate that each is a Unix timestamp in seconds representing a non-negative integer, and IF validation fails, THEN THE MCP_Service SHALL return a validation error indicating which parameter has an invalid format
4. THE MCP_Service SHALL validate that aggregation is one of "raw", "hour", or "day", and IF validation fails, THEN THE MCP_Service SHALL return a validation error indicating the accepted values
5. IF the device_id parameter is missing, THEN THE MCP_Service SHALL return a validation error indicating that device_id is required
6. IF the limit parameter is provided, THEN THE MCP_Service SHALL validate that it is an integer between 1 and 500 inclusive; IF limit is not provided, THEN THE MCP_Service SHALL default to 200
7. IF the API returns an error for the given device_id, THEN THE MCP_Service SHALL return an error indicating the device was not found or the request failed

### Requirement 9: Device Alarms Tool

**User Story:** As an AI agent, I want to retrieve alarms for a specific device, so that I can inform users about current and historical issues with their device.

#### Acceptance Criteria

1. WHEN the get_device_alarms tool is called with a device_id and optional filter parameters (status, level, start_time, end_time, page, page_size), THE MCP_Service SHALL call `GET /admin/chat-api/devices/{device_id}/alarms` with the provided parameters and return the alarm list including total count and items with alarm_id, device_id, device_name, sn, alarm_code, alarm_name, alarm_level, alarm_status, start_time, end_time, possible_causes, and solutions
2. IF page is provided and is less than 1, THEN THE MCP_Service SHALL return a validation error indicating page must be greater than or equal to 1
3. IF page_size is provided and is less than 1 or greater than 100, THEN THE MCP_Service SHALL return a validation error indicating page_size must be between 1 and 100
4. IF device_id is empty or not provided, THEN THE MCP_Service SHALL return a validation error indicating device_id is required
5. IF level is provided and is not one of "1", "2", "3", "level_1", "level_2", or "level_3", THEN THE MCP_Service SHALL return a validation error indicating invalid alarm level
6. IF status is provided and is not one of "active", "recovered", or "handled", THEN THE MCP_Service SHALL return a validation error indicating invalid alarm status
7. WHEN page is not provided, THE MCP_Service SHALL use the default value of 1; WHEN page_size is not provided, THE MCP_Service SHALL use the default value of 20

### Requirement 10: All Alarms Tool

**User Story:** As an AI agent, I want to retrieve all alarms across all devices for the user, so that I can provide a summary of active issues.

#### Acceptance Criteria

1. WHEN the get_all_alarms tool is called with optional filter parameters (status, level, device_id, start_time, end_time, page, page_size), THE MCP_Service SHALL call `GET /admin/chat-api/alarms` with the provided parameters and return the alarm list including total count and items with alarm_id, device_id, device_name, sn, alarm_code, alarm_name, alarm_level, alarm_status, start_time, end_time, possible_causes, and solutions
2. IF page is provided and is less than 1, THEN THE MCP_Service SHALL return a validation error indicating page must be greater than or equal to 1
3. IF page_size is provided and is less than 1 or greater than 100, THEN THE MCP_Service SHALL return a validation error indicating page_size must be between 1 and 100
4. IF level is provided and is not one of "1", "2", "3", "level_1", "level_2", or "level_3", THEN THE MCP_Service SHALL return a validation error indicating invalid alarm level
5. IF status is provided and is not one of "active", "recovered", or "handled", THEN THE MCP_Service SHALL return a validation error indicating invalid alarm status
6. IF start_time and end_time are both provided and start_time is greater than end_time, THEN THE MCP_Service SHALL return a validation error indicating start_time must not be later than end_time
7. WHEN page is not provided, THE MCP_Service SHALL use the default value of 1; WHEN page_size is not provided, THE MCP_Service SHALL use the default value of 20

### Requirement 11: Device Events Tool

**User Story:** As an AI agent, I want to retrieve events for a device, so that I can inform users about device state changes like online/offline transitions and alarm triggers.

#### Acceptance Criteria

1. WHEN the get_device_events tool is called with a device_id and optional filter parameters (event_type, start_time, end_time, page, page_size), THE MCP_Service SHALL call `GET /admin/chat-api/devices/{device_id}/events` with the provided parameters and return the response containing total count and event items (each with event_type, event_name, event_time, and optional detail)
2. IF start_time or end_time is provided and is not a positive integer representing a Unix timestamp in seconds, THEN THE MCP_Service SHALL return a validation error indicating the timestamp format is invalid
3. IF page is provided and is less than 1, THEN THE MCP_Service SHALL return a validation error indicating page must be greater than or equal to 1
4. IF page_size is provided and is not between 1 and 100, THEN THE MCP_Service SHALL return a validation error indicating page_size must be between 1 and 100
5. IF device_id is empty or not provided, THEN THE MCP_Service SHALL return a validation error indicating device_id is required
6. IF start_time and end_time are both provided and start_time is greater than end_time, THEN THE MCP_Service SHALL return a validation error indicating that start_time must not be later than end_time
7. IF event_type is provided and is not one of ONLINE, OFFLINE, ALARM_START, or ALARM_RECOVER, THEN THE MCP_Service SHALL return a validation error indicating the event_type value is invalid
8. IF the API returns a non-success response, THEN THE MCP_Service SHALL return an error indicating the upstream service failure

### Requirement 12: Device Summary Tool

**User Story:** As an AI agent, I want to get a statistical overview of all devices, so that I can provide users with a quick fleet health summary.

#### Acceptance Criteria

1. WHEN the get_device_summary tool is called, THE MCP_Service SHALL call `GET /admin/chat-api/devices/summary` and return the device statistics including total, online, offline, running, stopped, alarm_devices, and active_alarms fields
2. IF the ESY_AI_Backend returns a response with code not equal to 0, THEN THE MCP_Service SHALL return an error response containing the backend error code and message

### Requirement 13: Sites Listing Tool

**User Story:** As an AI agent, I want to list all sites/projects, so that I can help users navigate their installations by location.

#### Acceptance Criteria

1. WHEN the get_sites tool is called, THE MCP_Service SHALL call `GET /admin/chat-api/sites` and return the site list including total count and items with installer_id, company_name, and device_count fields
2. IF the ESY_AI_Backend returns a response with code not equal to 0, THEN THE MCP_Service SHALL return an error response containing the backend error code and message

### Requirement 14: Error Handling

**User Story:** As an agent platform, I want consistent and descriptive error responses, so that the AI agent can communicate issues clearly to end users.

#### Acceptance Criteria

1. WHEN the ESY_AI_Backend returns a response with code not equal to 0, THE MCP_Service SHALL return an MCP error response containing the backend error code in the `error_code` field and the backend message in the `error_message` field
2. IF a network error (connection refused, DNS failure, or response timeout exceeding 30 seconds) occurs while calling the ESY_AI_Backend, THEN THE MCP_Service SHALL return an error indicating the backend is unreachable and identifying the failure type (timeout, connection refused, or DNS failure)
3. IF a tool call contains invalid parameter types, THEN THE MCP_Service SHALL return a validation error that identifies the invalid parameter name, the expected type, and the received type, before making any backend call
4. THE MCP_Service SHALL use snake_case for all JSON field names in error and success responses
5. THE MCP_Service SHALL include an `error_type` field in every error response with one of the following values: "backend_error", "network_error", or "validation_error"

### Requirement 15: Service Deployment

**User Story:** As a system operator, I want to deploy the MCP service as a standalone process, so that the agent platform can connect to it over a standard transport.

#### Acceptance Criteria

1. THE MCP_Service SHALL expose both stdio and HTTP/SSE transport endpoints for the Agent_Platform to connect
2. THE MCP_Service SHALL accept configuration for the ESY_AI_Backend base URL via the `ESY_API_BASE_URL` environment variable, and IF the variable is not set, THE MCP_Service SHALL fail to start with an error message indicating the required configuration is missing
3. WHEN the MCP_Service starts, THE MCP_Service SHALL register all 11 tools (get_user_context, list_devices, get_device_details, get_device_status, get_latest_telemetry, get_telemetry_history, get_device_alarms, get_all_alarms, get_device_events, get_device_summary, get_sites) with their names, descriptions, and JSON Schema parameter definitions
4. THE MCP_Service SHALL support graceful shutdown by completing in-flight tool calls within a 10-second grace period and then closing all active connections
