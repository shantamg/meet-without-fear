export type ActivityType = 'LLM_CALL' | 'EMBEDDING' | 'RETRIEVAL' | 'TOOL_USE' | 'SYSTEM' | 'USER';
export type ActivityStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

export interface BrainActivity {
  id: string;
  sessionId: string;
  turnId?: string | null;
  activityType: ActivityType;
  model?: string | null;
  input: any;
  output: any;
  metadata: any;
  tokenCountInput: number;
  tokenCountOutput: number;
  cost: number;
  durationMs: number;
  status: ActivityStatus;
  createdAt: string;
  completedAt?: string | null;
}

export interface AuditLogData {
  sessionId?: string;
  turnId?: string;
  data?: any;
}
