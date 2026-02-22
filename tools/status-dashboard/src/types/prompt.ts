export interface SystemPromptBlock {
  label: string;
  content: string;
  tokenCount: number;
  cached: boolean;
}

export interface ParsedResponse {
  text: string;
  structuredData?: Record<string, unknown>;
}

export interface TokenBreakdown {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface CostBreakdown {
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  totalCost: number;
}

export interface PromptDetail {
  activityId: string;
  sessionId: string;
  callType: string;
  model: string;
  systemPrompt: SystemPromptBlock[];
  messages: { role: string; content: string }[];
  response: ParsedResponse;
  tokens: TokenBreakdown;
  cost: CostBreakdown;
  durationMs: number;
  createdAt: string;
}
