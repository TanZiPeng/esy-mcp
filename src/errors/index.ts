/**
 * ESY AI MCP Service - Error Types and Normalization
 *
 * Provides typed error classes and utilities for mapping any error
 * to a consistent ToolErrorPayload structure.
 *
 * Validates: Requirements 14.1, 14.2, 14.3, 14.5
 */

import type { ToolErrorPayload } from '../types/index.js';

// ─── Error Classes ───────────────────────────────────────────────────────────

/** Thrown when tool input parameters fail validation */
export class ValidationError extends Error {
  public readonly parameter: string;
  public readonly expected_type: string;
  public readonly received_type: string;

  constructor(message: string, parameter: string, expected_type: string, received_type: string) {
    super(message);
    this.name = 'ValidationError';
    this.parameter = parameter;
    this.expected_type = expected_type;
    this.received_type = received_type;
  }
}

/** Thrown when the ESY AI backend returns a non-zero code */
export class BackendError extends Error {
  public readonly error_code: number;
  public readonly error_message: string;

  constructor(error_code: number, error_message: string) {
    super(error_message);
    this.name = 'BackendError';
    this.error_code = error_code;
    this.error_message = error_message;
  }
}

/** Thrown on network-level failures (timeout, connection refused, DNS) */
export class NetworkError extends Error {
  public readonly failure_type: 'timeout' | 'connection_refused' | 'dns_failure';

  constructor(message: string, failure_type: 'timeout' | 'connection_refused' | 'dns_failure') {
    super(message);
    this.name = 'NetworkError';
    this.failure_type = failure_type;
  }
}

// ─── Error Normalization ─────────────────────────────────────────────────────

/**
 * Maps any thrown error to a structured ToolErrorPayload.
 *
 * - ValidationError → validation_error payload with parameter details
 * - BackendError → backend_error payload with error code
 * - NetworkError → network_error payload with failure type
 * - Unknown errors → network_error with failure_type 'unknown'
 */
export function normalizeError(error: unknown): ToolErrorPayload {
  if (error instanceof ValidationError) {
    return {
      error_type: 'validation_error',
      error_message: error.message,
      parameter: error.parameter,
      expected_type: error.expected_type,
      received_type: error.received_type,
    };
  }

  if (error instanceof BackendError) {
    return {
      error_type: 'backend_error',
      error_code: error.error_code,
      error_message: error.error_message,
    };
  }

  if (error instanceof NetworkError) {
    return {
      error_type: 'network_error',
      error_message: error.message,
      failure_type: error.failure_type,
    };
  }

  // Fallback for unexpected errors
  return {
    error_type: 'network_error',
    error_message: 'An unexpected error occurred',
    failure_type: 'unknown',
  };
}

// ─── MCP Response Helper ─────────────────────────────────────────────────────

/**
 * Wraps a ToolErrorPayload as an MCP-compliant error response object.
 *
 * Returns `{ content: [{type: 'text', text: JSON.stringify(payload)}], isError: true }`
 */
export function toMcpErrorResponse(payload: ToolErrorPayload) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
    isError: true,
  };
}
