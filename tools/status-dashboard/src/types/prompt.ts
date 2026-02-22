import type { ContextWindow } from './costs';

export interface SystemPromptBlock {
  type: 'static' | 'dynamic';
  content: string;
  tokenCount: number;
  cached: boolean;
}

export interface PromptMessage {
  role: string;
  content: string;
  hasCacheControl: boolean;
}

export interface ParsedResponse {
  text: string;
  thinking: string | null;
  draft: string | null;
  dispatch: string | null;
}

export interface TokenBreakdown {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  uncached: number;
}

export interface CostBreakdown {
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  total: number;
  savings: number;
}

export interface PromptDetail {
  systemPrompt: { blocks: SystemPromptBlock[] };
  messages: PromptMessage[];
  response: ParsedResponse;
  tokens: TokenBreakdown;
  cost: CostBreakdown;
  timing: {
    durationMs: number;
    model: string;
    callType: string;
    status: string;
  };
  contextWindow?: ContextWindow;
}
