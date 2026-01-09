export type AuditSection =
  | 'USER'        // User message received
  | 'INTENT'      // The brain's decision
  | 'RETRIEVAL'   // Memory access
  | 'PROMPT'      // Context assembly
  | 'RESPONSE'    // AI Output
  | 'COST'        // Financial impact (LLM call complete)
  | 'LLM_START'   // LLM call started (for live monitoring)
  | 'MEMORY_DETECTION' // Memory suggestions from user input
  | 'MEMORY_ACTION'    // User actions on memories (approve, reject, create, update, delete)
  | 'ERROR';      // Failures

export interface AuditLogEntry {
  timestamp: string;
  section: AuditSection;
  message: string;
  // Unique identifier for the turn/message that triggered this log
  // Format: `${sessionId}-${turnCount}` - groups all logs from a single user message
  turnId?: string;
  // We keep data flexible, but specific sections will usually have:
  // INTENT: { intent, depth, confidence }
  // COST: { model, inputTokens, outputTokens, totalCost }
  // RETRIEVAL: { queryCount, resultsFound }
  data?: Record<string, any>;
  cost?: number;
  sessionId?: string;
}
