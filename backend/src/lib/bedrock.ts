/**
 * Shared Bedrock Client
 *
 * Provides a singleton AWS Bedrock client for all AI services.
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Message,
  type SystemContentBlock,
  type InferenceConfiguration,
  type ConverseCommandInput,
} from '@aws-sdk/client-bedrock-runtime';

// ============================================================================
// Configuration
// ============================================================================

export const BEDROCK_MODEL_ID = 'anthropic.claude-sonnet-4-20250514-v1:0';

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

export interface CompletionOptions {
  systemPrompt: string;
  messages: SimpleMessage[];
  maxTokens?: number;
  thinkingBudget?: number;
}

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
