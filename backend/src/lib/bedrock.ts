/**
 * Shared Bedrock Client
 *
 * Provides a singleton AWS Bedrock client for all AI services.
 * Implements two-model stratification:
 * - Haiku: Fast, structured output for mechanics (classification, detection, planning)
 * - Sonnet: Empathetic responses for user-facing interactions
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
  InvokeModelCommand,
  type Message,
  type SystemContentBlock,
  type InferenceConfiguration,
  type ConverseCommandInput,
} from '@aws-sdk/client-bedrock-runtime';
import { usageTracker } from '../services/usage-tracker';
import { extractJsonFromResponse } from '../utils/json-extractor';
import { auditLog } from '../services/audit-logger';

// ============================================================================
// Configuration - Two Model Stratification
// ============================================================================

// Haiku: Fast model for mechanics (retrieval planning, classification, detection)
// ~3x faster and cheaper than Sonnet, good for structured JSON output
export const BEDROCK_HAIKU_MODEL_ID =
  process.env.BEDROCK_HAIKU_MODEL_ID || 'anthropic.claude-3-5-haiku-20241022-v1:0';

// Sonnet: Empathetic model for user-facing responses
// Better at nuance, empathy, and natural conversation
export const BEDROCK_SONNET_MODEL_ID =
  process.env.BEDROCK_SONNET_MODEL_ID || 'anthropic.claude-3-5-sonnet-20241022-v2:0';

// Titan: Embedding model for semantic search
// Outputs 1536-dimensional vectors for similarity matching
export const BEDROCK_TITAN_EMBED_MODEL_ID =
  process.env.BEDROCK_TITAN_EMBED_MODEL_ID || 'amazon.titan-embed-text-v2:0';

// Legacy export for backward compatibility
export const BEDROCK_MODEL_ID = BEDROCK_SONNET_MODEL_ID;

// ============================================================================
// Client Singleton
// ============================================================================

let bedrockClient: BedrockRuntimeClient | null | undefined;

/**
 * Get Bedrock client singleton.
 * Returns null if AWS credentials are not configured.
 */
export function getBedrockClient(): BedrockRuntimeClient | null {
  if (bedrockClient === undefined) {
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      console.warn('[Bedrock] AWS credentials not configured - AI services will use mock responses');
      bedrockClient = null;
    } else {
      bedrockClient = new BedrockRuntimeClient({
        region: process.env.AWS_REGION || 'us-east-1',
      });
    }
  }
  return bedrockClient;
}

/**
 * Reset the client (useful for testing)
 */
export function resetBedrockClient(): void {
  bedrockClient = undefined;
}

// ============================================================================
// Helper Types
// ============================================================================

export interface SimpleMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Base options for LLM completion requests.
 * sessionId and turnId are REQUIRED to ensure proper cost tracking and attribution.
 */
export interface CompletionOptions {
  systemPrompt: string;
  messages: SimpleMessage[];
  maxTokens?: number;
  thinkingBudget?: number;
  /** Session ID for cost attribution - REQUIRED */
  sessionId: string;
  /** Operation name for cost breakdown (e.g., 'intent-detection', 'orchestrator-response') */
  operation: string;
  /** Turn ID to group all costs from a single user action - REQUIRED */
  turnId: string;
}

/**
 * Options for Haiku (fast model) completion requests.
 * sessionId and turnId are REQUIRED to ensure proper cost tracking.
 */
export interface HaikuCompletionOptions {
  systemPrompt: string;
  messages: SimpleMessage[];
  maxTokens?: number;
  /** Session ID for cost attribution - REQUIRED */
  sessionId: string;
  /** Operation name for cost breakdown */
  operation: string;
  /** Turn ID to group all costs from a single user action - REQUIRED */
  turnId: string;
}

/**
 * Options for Sonnet (empathetic model) completion requests.
 * Extends CompletionOptions so sessionId and turnId are REQUIRED.
 */
export interface SonnetCompletionOptions extends CompletionOptions {
  // Sonnet-specific options can be added here
  maxTokens?: number;
  thinkingBudget?: number;
}

export type ModelType = 'haiku' | 'sonnet';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert simple messages to Bedrock format
 */
function toBedrockMessages(messages: SimpleMessage[]): Message[] {
  return messages.map((m) => ({
    role: m.role,
    content: [{ text: m.content }],
  }));
}

/**
 * Record token usage from AWS Bedrock response.
 */
function recordUsage(params: {
  sessionId?: string;
  modelId: string;
  operation: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  turnId?: string;
  durationMs?: number;
}): void {
  const inputTokens = params.usage?.inputTokens ?? 0;
  const outputTokens = params.usage?.outputTokens ?? 0;

  if (inputTokens === 0 && outputTokens === 0) return;

  usageTracker.track(
    params.sessionId ?? 'unknown',
    params.modelId,
    params.operation,
    inputTokens,
    outputTokens,
    params.turnId,
    params.durationMs
  );
}

/**
 * Simple completion helper for text-based AI requests.
 * Returns the text response or null if client not configured.
 */
export async function getCompletion(options: CompletionOptions): Promise<string | null> {
  const client = getBedrockClient();
  if (!client) {
    return null;
  }

  const { systemPrompt, messages, maxTokens = 2048, thinkingBudget } = options;

  const system: SystemContentBlock[] = [{ text: systemPrompt }];
  const inferenceConfig: InferenceConfiguration = { maxTokens };

  const commandInput: ConverseCommandInput = {
    modelId: BEDROCK_MODEL_ID,
    messages: toBedrockMessages(messages),
    system,
    inferenceConfig,
  };

  // Add thinking budget if specified
  if (thinkingBudget) {
    commandInput.additionalModelRequestFields = {
      thinking: {
        type: 'enabled',
        budget_tokens: thinkingBudget,
      },
    };
  }

  const command = new ConverseCommand(commandInput);
  const response = await client.send(command);
  recordUsage({
    sessionId: options.sessionId,
    modelId: BEDROCK_MODEL_ID,
    operation: options.operation ?? 'converse',
    usage: response.usage ?? undefined,
  });

  const outputMessage = response.output?.message;
  if (!outputMessage?.content) {
    return null;
  }

  // Find the text block in the response (skip thinking blocks)
  const textBlock = outputMessage.content.find((block) => 'text' in block);
  if (!textBlock || !('text' in textBlock)) {
    return null;
  }

  return textBlock.text ?? null;
}

/**
 * Get completion from a specific model (Haiku or Sonnet).
 * Use this when you need to explicitly choose the model.
 */
export async function getModelCompletion(
  model: ModelType,
  options: CompletionOptions
): Promise<string | null> {
  const client = getBedrockClient();
  if (!client) {
    return null;
  }

  const { systemPrompt, messages, maxTokens = 2048, thinkingBudget } = options;
  const modelId = model === 'haiku' ? BEDROCK_HAIKU_MODEL_ID : BEDROCK_SONNET_MODEL_ID;
  const operation = options.operation ?? `converse-${model}`;
  const startTime = Date.now();

  // Send LLM_START event for live monitoring
  if (process.env.ENABLE_AUDIT_STREAM === 'true') {
    auditLog('LLM_START', `Starting ${model} call`, {
      turnId: options.turnId,
      sessionId: options.sessionId,
      model: model.toUpperCase(),
      operation,
    });
  }

  const system: SystemContentBlock[] = [{ text: systemPrompt }];
  const inferenceConfig: InferenceConfiguration = { maxTokens };

  const commandInput: ConverseCommandInput = {
    modelId,
    messages: toBedrockMessages(messages),
    system,
    inferenceConfig,
  };

  // Add thinking budget if specified (Sonnet only)
  if (thinkingBudget && model === 'sonnet') {
    commandInput.additionalModelRequestFields = {
      thinking: {
        type: 'enabled',
        budget_tokens: thinkingBudget,
      },
    };
  }

  const command = new ConverseCommand(commandInput);
  const response = await client.send(command);
  const durationMs = Date.now() - startTime;

  recordUsage({
    sessionId: options.sessionId,
    modelId,
    operation,
    usage: response.usage ?? undefined,
    turnId: options.turnId,
    durationMs,
  });

  const outputMessage = response.output?.message;
  if (!outputMessage?.content) {
    return null;
  }

  const textBlock = outputMessage.content.find((block) => 'text' in block);
  if (!textBlock || !('text' in textBlock)) {
    return null;
  }

  return textBlock.text ?? null;
}

/**
 * Get structured JSON output from Haiku.
 * Use for: retrieval planning, classification, detection, extraction.
 * Fast and cheap - ideal for mechanical tasks.
 *
 * @returns Parsed JSON object or null if parsing fails
 */
export async function getHaikuJson<T>(
  options: HaikuCompletionOptions
): Promise<T | null> {
  const response = await getModelCompletion('haiku', {
    ...options,
    maxTokens: options.maxTokens ?? 1024,
    operation: options.operation ?? 'haiku-json',
  });

  if (!response) {
    return null;
  }

  try {
    return extractJsonFromResponse(response) as T;
  } catch (error) {
    console.error('[Bedrock] Failed to parse Haiku JSON response:', error);
    console.error('[Bedrock] Raw response:', response);
    return null;
  }
}

/**
 * Get empathetic response from Sonnet.
 * Use for: user-facing responses, witnessing, empathy building.
 * Better at nuance and natural conversation.
 */
export async function getSonnetResponse(
  options: SonnetCompletionOptions
): Promise<string | null> {
  return getModelCompletion('sonnet', {
    ...options,
    maxTokens: options.maxTokens ?? 2048,
    operation: options.operation ?? 'sonnet-response',
  });
}

// ============================================================================
// Embeddings (Titan)
// ============================================================================

/**
 * Embedding dimensions for vector storage.
 * Titan v2 supports 256, 512, or 1024 dimensions.
 * We use 1024 for best quality - matches schema: vector(1024).
 */
export const EMBEDDING_DIMENSIONS = 1024;

/**
 * Generate an embedding vector for text using Titan.
 * Use for: semantic search, similarity matching, vector storage.
 *
 * @param text - The text to embed (max ~8000 tokens)
 * @returns Float array of embedding dimensions, or null if unavailable
 */
export async function getEmbedding(text: string, options?: { sessionId?: string; turnId?: string }): Promise<number[] | null> {
  const client = getBedrockClient();
  if (!client) {
    return null;
  }

  // Truncate text if too long (Titan has ~8000 token limit)
  const truncatedText = text.slice(0, 30000); // Rough character limit

  try {
    const command = new InvokeModelCommand({
      modelId: BEDROCK_TITAN_EMBED_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        inputText: truncatedText,
        dimensions: EMBEDDING_DIMENSIONS,
        normalize: true,
      }),
    });

    const response = await client.send(command);

    if (!response.body) {
      return null;
    }

    // Extract actual token count from response headers (Bedrock returns this for InvokeModel)
    // Fallback to estimation if not available
    const headerTokenCount = (response as any).$metadata?.httpHeaders?.['x-amzn-bedrock-input-token-count'];
    const inputTokens = headerTokenCount ? parseInt(headerTokenCount, 10) : Math.ceil(truncatedText.length / 4);

    recordUsage({
      modelId: BEDROCK_TITAN_EMBED_MODEL_ID,
      operation: 'embedding',
      sessionId: options?.sessionId,
      turnId: options?.turnId,
      usage: { inputTokens },
    });

    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    return responseBody.embedding as number[];
  } catch (error) {
    console.error('[Bedrock] Failed to generate embedding:', error);
    return null;
  }
}

/**
 * Generate embeddings for multiple texts in batch.
 * More efficient than calling getEmbedding() multiple times.
 *
 * @param texts - Array of texts to embed
 * @returns Array of embeddings (null for any that failed)
 */
export async function getEmbeddings(texts: string[]): Promise<(number[] | null)[]> {
  // Titan doesn't support batch embeddings natively, so we parallelize
  const results = await Promise.all(texts.map((text) => getEmbedding(text)));
  return results;
}
