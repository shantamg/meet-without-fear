/**
 * Emotional Barometer Validation Schemas
 *
 * Zod schemas for emotional barometer tracking.
 */

import { z } from 'zod';
import { intensityRating } from './utils';

// ============================================================================
// Record Barometer Reading
// ============================================================================

export const recordBarometerRequestSchema = z.object({
  intensity: intensityRating,
  context: z.string().max(500, 'Context too long').optional(),
});

export type RecordBarometerRequestInput = z.infer<typeof recordBarometerRequestSchema>;

export const recordBarometerResponseSchema = z.object({
  id: z.string(),
  intensity: z.number(),
  recordedAt: z.string().datetime(),
  suggestion: z.string().optional(),
  requiresCooling: z.boolean(),
});

export type RecordBarometerResponseInput = z.infer<typeof recordBarometerResponseSchema>;

// ============================================================================
// Cooling Exercise
// ============================================================================

export const exerciseTypeSchema = z.enum(['breathing', 'grounding', 'pause']);

export type ExerciseType = z.infer<typeof exerciseTypeSchema>;

export const exerciseCompleteRequestSchema = z.object({
  exerciseType: exerciseTypeSchema,
  intensityAfter: intensityRating,
  durationSeconds: z.number().int().min(0),
});

export type ExerciseCompleteRequestInput = z.infer<typeof exerciseCompleteRequestSchema>;

export const exerciseCompleteResponseSchema = z.object({
  id: z.string(),
  exerciseType: exerciseTypeSchema,
  intensityBefore: z.number().int().min(1).max(10),
  intensityAfter: z.number().int().min(1).max(10),
  durationSeconds: z.number().int().min(0),
  completedAt: z.string().datetime(),
  canResume: z.boolean(),
});

export type ExerciseCompleteResponseInput = z.infer<typeof exerciseCompleteResponseSchema>;

// ============================================================================
// Barometer History
// ============================================================================

export const barometerReadingSchema = z.object({
  id: z.string(),
  intensity: z.number().int().min(1).max(10),
  context: z.string().nullable(),
  recordedAt: z.string().datetime(),
  sessionId: z.string(),
});

export type BarometerReadingInput = z.infer<typeof barometerReadingSchema>;

export const getBarometerHistoryQuerySchema = z.object({
  sessionId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  before: z.string().datetime().optional(),
});

export type GetBarometerHistoryQueryInput = z.infer<typeof getBarometerHistoryQuerySchema>;

export const getBarometerHistoryResponseSchema = z.object({
  readings: z.array(barometerReadingSchema),
  hasMore: z.boolean(),
});

export type GetBarometerHistoryResponseInput = z.infer<typeof getBarometerHistoryResponseSchema>;
