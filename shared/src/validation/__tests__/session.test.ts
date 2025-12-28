/**
 * Session Validation Schema Tests
 */

import { stageSchema, sessionStatusSchema, stageStatusSchema, stageProgressSchema } from '../session';
import { Stage, SessionStatus, StageStatus } from '../../enums';

describe('stageSchema', () => {
  it('validates all stage values', () => {
    expect(stageSchema.parse(Stage.ONBOARDING)).toBe(Stage.ONBOARDING);
    expect(stageSchema.parse(Stage.WITNESS)).toBe(Stage.WITNESS);
    expect(stageSchema.parse(Stage.PERSPECTIVE_STRETCH)).toBe(Stage.PERSPECTIVE_STRETCH);
    expect(stageSchema.parse(Stage.NEED_MAPPING)).toBe(Stage.NEED_MAPPING);
    expect(stageSchema.parse(Stage.STRATEGIC_REPAIR)).toBe(Stage.STRATEGIC_REPAIR);
  });

  it('rejects invalid stage', () => {
    expect(() => stageSchema.parse(99)).toThrow();
    expect(() => stageSchema.parse('STAGE_99')).toThrow();
  });
});

describe('sessionStatusSchema', () => {
  it('validates all session status values', () => {
    expect(sessionStatusSchema.parse(SessionStatus.CREATED)).toBe(SessionStatus.CREATED);
    expect(sessionStatusSchema.parse(SessionStatus.ACTIVE)).toBe(SessionStatus.ACTIVE);
    expect(sessionStatusSchema.parse(SessionStatus.RESOLVED)).toBe(SessionStatus.RESOLVED);
  });

  it('rejects invalid status', () => {
    expect(() => sessionStatusSchema.parse('INVALID')).toThrow();
  });
});

describe('stageStatusSchema', () => {
  it('validates all stage status values', () => {
    expect(stageStatusSchema.parse(StageStatus.NOT_STARTED)).toBe(StageStatus.NOT_STARTED);
    expect(stageStatusSchema.parse(StageStatus.IN_PROGRESS)).toBe(StageStatus.IN_PROGRESS);
    expect(stageStatusSchema.parse(StageStatus.COMPLETED)).toBe(StageStatus.COMPLETED);
  });

  it('rejects invalid status', () => {
    expect(() => stageStatusSchema.parse('INVALID')).toThrow();
  });
});

describe('stageProgressSchema', () => {
  it('validates complete stage progress', () => {
    const result = stageProgressSchema.safeParse({
      stage: Stage.WITNESS,
      status: StageStatus.IN_PROGRESS,
      startedAt: '2024-01-01T00:00:00.000Z',
      completedAt: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts completed stage with completedAt', () => {
    const result = stageProgressSchema.safeParse({
      stage: Stage.ONBOARDING,
      status: StageStatus.COMPLETED,
      startedAt: '2024-01-01T00:00:00.000Z',
      completedAt: '2024-01-01T01:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid datetime format', () => {
    const result = stageProgressSchema.safeParse({
      stage: Stage.WITNESS,
      status: StageStatus.IN_PROGRESS,
      startedAt: 'not-a-date',
      completedAt: null,
    });
    expect(result.success).toBe(false);
  });
});
