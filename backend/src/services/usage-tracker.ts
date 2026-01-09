import fs from 'fs';
import path from 'path';
import { auditLog } from './audit-logger'; // Import the logger to broadcast costs

// AWS Bedrock Pricing (USD per 1,000 tokens) - Verified Jan 2026
const PRICING = {
  // Main Chat Model (Claude 3.5 Sonnet)
  'anthropic.claude-3-5-sonnet-20241022-v2:0': { input: 0.003, output: 0.015 },

  // Fast Model (Claude 3.5 Haiku)
  // Note: This is 4x the price of the old Haiku 3.0 ($0.00025)
  'anthropic.claude-3-5-haiku-20241022-v1:0': { input: 0.001, output: 0.005 },

  // Embeddings (Titan v2) - INPUT ONLY
  'amazon.titan-embed-text-v2:0': { input: 0.00002, output: 0.0 },

  // Fallbacks / Aliases
  'claude-3-5-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-5-haiku': { input: 0.001, output: 0.005 },
  'titan-embed': { input: 0.00002, output: 0.0 },
} as const;

const LOG_DIR = path.join(process.cwd(), 'logs');
const USAGE_FILE = path.join(LOG_DIR, 'ai-usage.csv');

// Initialize
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
if (!fs.existsSync(USAGE_FILE)) {
  fs.writeFileSync(USAGE_FILE, 'Timestamp,SessionID,Model,Operation,InputTokens,OutputTokens,CostUSD\n');
}

export const usageTracker = {
  track: (
    sessionId: string,
    modelId: string,
    operation: string,
    inputTokens: number,
    outputTokens: number,
    turnId?: string,
    durationMs?: number,
  ) => {
    // 1. Calculate Cost
    const price = PRICING[modelId as keyof typeof PRICING] || { input: 0, output: 0 };
    const costValue = (inputTokens / 1000) * price.input + (outputTokens / 1000) * price.output;
    const costString = costValue.toFixed(6);
    const timestamp = new Date().toISOString();

    // 2. Write to CSV (Permanent Record)
    const line = `${timestamp},${sessionId},${modelId},${operation},${inputTokens},${outputTokens},${costString},${durationMs ?? ''}\n`;
    fs.appendFile(USAGE_FILE, line, err => {
      if (err) console.error('[UsageTracker] Failed to write CSV:', err);
    });

    // 3. Broadcast to Live Monitor (Visual Record)
    // We log this as a distinct 'COST' event so the dashboard can sum it up
    if (inputTokens > 0 || outputTokens > 0) {
      auditLog('COST', `Micro-transaction: $${costValue.toFixed(5)}`, {
        turnId,
        sessionId,
        model: modelId.split(':')[0].split('/').pop() || modelId, // Simplify name
        operation,
        inputTokens,
        outputTokens,
        totalCost: costValue,
        durationMs,
      });
    }
  },
};
