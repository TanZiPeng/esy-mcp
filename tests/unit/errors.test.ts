/**
 * Unit tests for error types and normalization
 * Validates: Requirements 14.1, 14.2, 14.3, 14.5
 */

import { describe, it, expect } from 'vitest';
import {
  ValidationError,
  BackendError,
  NetworkError,
  normalizeError,
  toMcpErrorResponse,
} from '../../src/errors/index.js';

describe('Error Classes', () => {
  describe('ValidationError', () => {
    it('should carry parameter, expected_type, and received_type', () => {
      const err = new ValidationError(
        'page_size must be between 1 and 100',
        'page_size',
        'integer (1-100)',
        'integer (150)',
      );

      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('ValidationError');
      expect(err.message).toBe('page_size must be between 1 and 100');
      expect(err.parameter).toBe('page_size');
      expect(err.expected_type).toBe('integer (1-100)');
      expect(err.received_type).toBe('integer (150)');
    });
  });

  describe('BackendError', () => {
    it('should carry error_code and error_message', () => {
      const err = new BackendError(10001, 'Device not found');

      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('BackendError');
      expect(err.error_code).toBe(10001);
      expect(err.error_message).toBe('Device not found');
      expect(err.message).toBe('Device not found');
    });
  });

  describe('NetworkError', () => {
    it('should carry failure_type for timeout', () => {
      const err = new NetworkError('Request timed out', 'timeout');

      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('NetworkError');
      expect(err.failure_type).toBe('timeout');
      expect(err.message).toBe('Request timed out');
    });

    it('should carry failure_type for connection_refused', () => {
      const err = new NetworkError('Connection refused', 'connection_refused');
      expect(err.failure_type).toBe('connection_refused');
    });

    it('should carry failure_type for dns_failure', () => {
      const err = new NetworkError('DNS lookup failed', 'dns_failure');
      expect(err.failure_type).toBe('dns_failure');
    });
  });
});

describe('normalizeError', () => {
  it('should map ValidationError to validation_error payload', () => {
    const err = new ValidationError('Invalid param', 'device_id', 'string (numeric)', 'undefined');
    const payload = normalizeError(err);

    expect(payload).toEqual({
      error_type: 'validation_error',
      error_message: 'Invalid param',
      parameter: 'device_id',
      expected_type: 'string (numeric)',
      received_type: 'undefined',
    });
  });

  it('should map BackendError to backend_error payload', () => {
    const err = new BackendError(403, 'Permission denied');
    const payload = normalizeError(err);

    expect(payload).toEqual({
      error_type: 'backend_error',
      error_code: 403,
      error_message: 'Permission denied',
    });
  });

  it('should map NetworkError to network_error payload', () => {
    const err = new NetworkError('Connection refused', 'connection_refused');
    const payload = normalizeError(err);

    expect(payload).toEqual({
      error_type: 'network_error',
      error_message: 'Connection refused',
      failure_type: 'connection_refused',
    });
  });

  it('should map unknown errors to network_error fallback', () => {
    const payload = normalizeError(new Error('Something broke'));

    expect(payload.error_type).toBe('network_error');
    expect(payload.error_message).toBe('An unexpected error occurred');
  });

  it('should handle non-Error values gracefully', () => {
    const payload = normalizeError('string error');

    expect(payload.error_type).toBe('network_error');
    expect(payload.error_message).toBe('An unexpected error occurred');
  });
});

describe('toMcpErrorResponse', () => {
  it('should wrap payload in MCP error response format', () => {
    const payload = normalizeError(new BackendError(500, 'Internal error'));
    const response = toMcpErrorResponse(payload);

    expect(response.isError).toBe(true);
    expect(response.content).toHaveLength(1);
    expect(response.content[0].type).toBe('text');

    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.error_type).toBe('backend_error');
    expect(parsed.error_code).toBe(500);
    expect(parsed.error_message).toBe('Internal error');
  });

  it('should produce valid JSON in the text field', () => {
    const payload = normalizeError(
      new ValidationError('bad param', 'page', 'integer', 'string'),
    );
    const response = toMcpErrorResponse(payload);

    expect(() => JSON.parse(response.content[0].text)).not.toThrow();
  });
});
