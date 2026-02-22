/**
 * Turn Trace Types
 *
 * Defines the structure for pipeline tracing in the AI orchestrator.
 * Each orchestrateResponse() call produces a TurnTrace with TraceStep[] entries
 * recording timing, status, and result for every pipeline stage.
 */

export type TraceStepType = 'decision' | 'llm_call' | 'retrieval' | 'parsing' | 'dispatch';

export type TraceStepStatus = 'success' | 'error' | 'skipped';

export interface TraceStep {
  /** Human-readable step name (e.g., "Memory Intent", "LLM Call") */
  name: string;
  /** Step category for coloring/grouping */
  type: TraceStepType;
  /** Milliseconds from orchestration start when this step began */
  startMs: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Short summary of the step result */
  result: string;
  /** Whether the step succeeded, failed, or was skipped */
  status: TraceStepStatus;
}

export interface TurnTrace {
  /** Total orchestration duration in milliseconds */
  totalDurationMs: number;
  /** Model used for the main LLM call */
  modelUsed: string;
  /** Whether a mock response was used */
  usedMock: boolean;
  /** Ordered list of pipeline steps */
  steps: TraceStep[];
}
