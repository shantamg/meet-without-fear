/**
 * Turn Trace Types (mirrors backend/src/types/turn-trace.ts)
 */

export type TraceStepType = 'decision' | 'llm_call' | 'retrieval' | 'parsing' | 'dispatch';

export type TraceStepStatus = 'success' | 'error' | 'skipped';

export interface TraceStep {
  name: string;
  type: TraceStepType;
  startMs: number;
  durationMs: number;
  result: string;
  status: TraceStepStatus;
}

export interface TurnTrace {
  totalDurationMs: number;
  modelUsed: string;
  usedMock: boolean;
  steps: TraceStep[];
}
