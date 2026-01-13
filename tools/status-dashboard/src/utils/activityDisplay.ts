import { BrainActivity, ActivityType } from '../types';
import { deepParse } from './dataParsing';

/**
 * Pretty names for common operations
 */
const OPERATION_NAMES: Record<string, string> = {
  'orchestrator-response': 'Response',
  'converse-sonnet': 'Response',
  'intent-detection': 'Intent Detection',
  'memory-detection': 'Memory Detection',
  'retrieval-planning': 'Retrieval Planning',
  'retrieval': 'Memory Retrieval',
  'embedding': 'Embedding',
  'reconciler': 'Reconciler',
  'reconciler-analysis': 'Empathy Analysis',
  'share-suggestion': 'Share Suggestion',
  'theme-extraction': 'Theme Extraction',
};

/**
 * Icons for activity types
 */
export function getActivityIcon(type: ActivityType): string {
  switch (type) {
    case 'LLM_CALL': return '🤖';
    case 'EMBEDDING': return '🧠';
    case 'RETRIEVAL': return '🔍';
    case 'TOOL_USE': return '🛠️';
    default: return '📝';
  }
}

/**
 * Get a pretty display name for an operation
 */
export function getPrettyOperationName(operation: string): string {
  // Check exact match first
  if (OPERATION_NAMES[operation]) {
    return OPERATION_NAMES[operation];
  }
  
  // Check partial matches
  for (const [key, name] of Object.entries(OPERATION_NAMES)) {
    if (operation.toLowerCase().includes(key.toLowerCase())) {
      return name;
    }
  }
  
  // Convert kebab-case to Title Case
  return operation
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Extract preview information from an activity
 */
export function getActivityPreview(activity: BrainActivity): { name: string; preview: string | null } {
  const operation = activity.metadata?.operation || activity.metadata?.action || '';
  const parsedInput = activity.input ? deepParse(activity.input) : null;
  const parsedOutput = activity.output ? deepParse(activity.output) : null;
  
  // Embedding - show the text being embedded
  if (activity.activityType === 'EMBEDDING') {
    const text = typeof parsedInput === 'string' 
      ? parsedInput 
      : parsedInput?.text || parsedInput?.content;
    return {
      name: 'Embedding',
      preview: truncate(text, 80),
    };
  }
  
  // Retrieval - show queries or result count
  if (activity.activityType === 'RETRIEVAL' || operation.includes('retrieval')) {
    const queries = parsedInput?.searchQueries;
    const resultCount = (parsedOutput?.crossSessionResultsCount || 0) + (parsedOutput?.withinSessionResultsCount || 0);
    
    if (queries && queries.length > 0) {
      return {
        name: 'Memory Retrieval',
        preview: `"${truncate(queries[0], 60)}"${queries.length > 1 ? ` (+${queries.length - 1} more)` : ''}`,
      };
    }
    if (resultCount > 0) {
      return {
        name: 'Memory Retrieval',
        preview: `Found ${resultCount} results`,
      };
    }
  }
  
  // Intent/Memory Detection - show the detected intent
  if (operation.includes('intent') || operation.includes('memory-detection')) {
    const hasIntent = parsedOutput?.text?.hasMemoryIntent ?? parsedOutput?.hasMemoryIntent;
    const topicContext = parsedOutput?.text?.topicContext ?? parsedOutput?.topicContext;
    
    return {
      name: getPrettyOperationName(operation),
      preview: hasIntent 
        ? `Detected: ${truncate(topicContext || 'memory reference', 60)}`
        : 'No memory intent detected',
    };
  }
  
  // Retrieval Planning - show if retrieval is needed
  if (operation.includes('retrieval-planning')) {
    const needsRetrieval = parsedOutput?.text?.needsRetrieval ?? parsedOutput?.needsRetrieval;
    const queries = parsedOutput?.text?.searchQueries ?? parsedOutput?.searchQueries;
    
    return {
      name: 'Retrieval Planning',
      preview: needsRetrieval 
        ? `${queries?.length || 0} queries planned`
        : 'No retrieval needed',
    };
  }
  
  // Reconciler/Empathy Analysis - show themes or suggestion
  if (operation.includes('reconciler') || operation.includes('empathy')) {
    const themes = parsedOutput?.themes;
    const suggestion = parsedOutput?.suggestedContent;
    
    if (suggestion) {
      return {
        name: 'Share Suggestion',
        preview: `"${truncate(suggestion, 70)}"`,
      };
    }
    if (themes && themes.length > 0) {
      return {
        name: 'Empathy Analysis',
        preview: `Themes: ${themes.slice(0, 3).join(', ')}${themes.length > 3 ? '...' : ''}`,
      };
    }
  }
  
  // Main Response - show the response text
  if (operation === 'orchestrator-response' || operation === 'converse-sonnet') {
    const response = extractResponseText(parsedOutput);
    return {
      name: 'Response',
      preview: response ? truncate(response, 100) : null,
    };
  }
  
  // Generic LLM call - show first sentence of the prompt as preview
  if (activity.activityType === 'LLM_CALL') {
    const promptSentence = extractFirstPromptSentence(parsedInput);
    return {
      name: 'LLM',
      preview: promptSentence,
    };
  }
  
  // Tool use - show the tool name
  if (activity.activityType === 'TOOL_USE') {
    const toolName = parsedInput?.tool || parsedInput?.name || operation;
    return {
      name: 'Tool Use',
      preview: toolName ? getPrettyOperationName(toolName) : null,
    };
  }
  
  // Fallback
  return {
    name: getPrettyOperationName(operation || activity.activityType),
    preview: null,
  };
}

/**
 * Extract the first sentence from the prompt to identify what the LLM call does
 */
function extractFirstPromptSentence(input: any): string | null {
  if (!input) return null;
  
  // Try to find the system message or first user message
  const messages = input.messages || input.prompt?.messages;
  if (messages && Array.isArray(messages)) {
    // Prefer system message as it usually describes the task
    const systemMsg = messages.find((m: any) => m.role === 'system');
    if (systemMsg?.content) {
      return getFirstSentence(systemMsg.content);
    }
    
    // Fall back to first user message
    const userMsg = messages.find((m: any) => m.role === 'user');
    if (userMsg?.content) {
      return getFirstSentence(userMsg.content);
    }
  }
  
  // Try direct prompt field
  if (typeof input.prompt === 'string') {
    return getFirstSentence(input.prompt);
  }
  
  // Try system field
  if (typeof input.system === 'string') {
    return getFirstSentence(input.system);
  }
  
  return null;
}

/**
 * Get the first sentence from a text, cleaned up
 */
function getFirstSentence(text: string): string | null {
  if (!text) return null;
  
  // Clean up the text
  let cleaned = text.trim();
  
  // Remove common prefixes like "You are..." or role descriptions
  cleaned = cleaned.replace(/^You are [^.]+\.\s*/i, '');
  
  // Get first sentence (ends with . ! or ?)
  const match = cleaned.match(/^[^.!?]+[.!?]/);
  if (match) {
    let sentence = match[0].trim();
    // Cap at reasonable length
    if (sentence.length > 120) {
      sentence = sentence.slice(0, 117) + '...';
    }
    return sentence;
  }
  
  // If no sentence ending found, take first 100 chars
  if (cleaned.length > 100) {
    return cleaned.slice(0, 97) + '...';
  }
  
  return cleaned || null;
}

/**
 * Extract the main response text from parsed output
 */
function extractResponseText(output: any): string | null {
  if (!output) return null;
  
  // Direct response field
  if (typeof output.response === 'string') return output.response;
  if (typeof output.text === 'string') return output.text;
  if (typeof output.content === 'string') return output.content;
  
  // Nested in text object
  if (output.text && typeof output.text === 'object') {
    if (typeof output.text.response === 'string') return output.text.response;
    if (typeof output.text.text === 'string') return output.text.text;
    if (typeof output.text.content === 'string') return output.text.content;
  }
  
  return null;
}

/**
 * Truncate text to a maximum length
 */
function truncate(text: string | null | undefined, maxLength: number): string | null {
  if (!text) return null;
  // Clean up whitespace
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength - 3) + '...';
}
