import { z } from 'zod';

/**
 * Shared Zod validation schemas for ESY AI MCP Service tools.
 */

/** Device ID must be a non-empty numeric string (digits only). */
export const deviceIdSchema = z
  .string()
  .min(1)
  .regex(/^\d+$/, 'device_id must be a numeric identifier');

/** Pagination parameters with sensible bounds. */
export const paginationSchema = z.object({
  page: z.number().int().min(1).optional(),
  page_size: z.number().int().min(1).max(100).optional(),
});

/** A Unix timestamp in seconds (non-negative integer). */
export const timestampSchema = z.number().int().min(0);

/** Time range with optional start/end; validates start ≤ end when both provided. */
export const timeRangeSchema = z
  .object({
    start_time: timestampSchema.optional(),
    end_time: timestampSchema.optional(),
  })
  .refine(
    (data) => !(data.start_time !== undefined && data.end_time !== undefined && data.start_time > data.end_time),
    { message: 'start_time must not be later than end_time' }
  );

/** Alarm severity level. */
export const alarmLevelSchema = z.enum(['1', '2', '3', 'level_1', 'level_2', 'level_3']);

/** Alarm lifecycle status. */
export const alarmStatusSchema = z.enum(['active', 'recovered', 'handled']);

/** Device event type. */
export const eventTypeSchema = z.enum(['ONLINE', 'OFFLINE', 'ALARM_START', 'ALARM_RECOVER']);

/** Telemetry aggregation granularity. */
export const aggregationSchema = z.enum(['raw', 'hour', 'day']);
