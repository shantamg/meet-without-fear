/**
 * Memory DTOs for "Things to Always Remember" feature
 *
 * Enables users to request persistent memories that the AI honors across conversations.
 */

// ============================================================================
// Memory Enums (mirror Prisma enums for client use)
// ============================================================================

export type MemoryCategory =
  | 'AI_NAME' // "Call me Alex"
  | 'LANGUAGE' // "Respond in Spanish"
  | 'COMMUNICATION' // "Keep responses brief"
  | 'PERSONAL_INFO' // "Call me Sam", pronouns
  | 'RELATIONSHIP' // "Partner's name is Jordan"
  | 'PREFERENCE'; // "Use examples when explaining"

export type MemoryStatus = 'ACTIVE' | 'REJECTED';

export type MemorySource = 'USER_APPROVED' | 'USER_CREATED' | 'USER_EDITED';

// ============================================================================
// Memory DTO (API response)
// ============================================================================

/**
 * Memory as returned from API
 */
export interface UserMemoryDTO {
  id: string;
  content: string;
  category: MemoryCategory;
  status: MemoryStatus;
  source: MemorySource;
  /** AI's original suggestion if user edited before approving */
  suggestedBy?: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

// ============================================================================
// Create/Update Memory
// ============================================================================

/**
 * Request to create a new memory
 */
export interface CreateMemoryRequest {
  content: string;
  category: MemoryCategory;
}

/**
 * Request to update an existing memory
 */
export interface UpdateMemoryRequest {
  content?: string;
  status?: MemoryStatus;
}

// ============================================================================
// Memory Detection (AI analysis)
// ============================================================================

/**
 * AI-detected memory suggestion (in chat response metadata)
 */
export interface MemorySuggestion {
  /** ID of the pending memory in the database (if already created) */
  id?: string;
  suggestedContent: string;
  category: MemoryCategory;
  confidence: 'high' | 'medium' | 'low';
  /** What triggered this detection */
  evidence: string;
}

/**
 * Result from memory detection (Haiku analysis)
 */
export interface MemoryDetectionResult {
  hasMemoryIntent: boolean;
  suggestions: MemorySuggestion[];
  /** Preserve for returning to topic after memory handling */
  topicContext?: string;
}

// ============================================================================
// Approve/Reject Suggestions
// ============================================================================

/**
 * Request to approve a memory suggestion
 */
export interface ApproveMemoryRequest {
  /** ID of the pending memory to approve (if available) */
  id?: string;
  suggestedContent: string;
  category: MemoryCategory;
  /** If user edited the suggestion before approving */
  editedContent?: string;
}

/**
 * Request to reject a memory suggestion
 */
export interface RejectMemoryRequest {
  /** ID of the pending memory to reject (if available) */
  id?: string;
  suggestedContent: string;
  category: MemoryCategory;
}

// ============================================================================
// List Memories
// ============================================================================

/**
 * Response containing all user memories
 */
export interface ListMemoriesResponse {
  memories: UserMemoryDTO[];
}

// ============================================================================
// AI-Assisted Memory Operations
// ============================================================================

/**
 * Request for AI to format a natural language memory request
 * User types something like "Talk to me like a surfer" and AI formats it properly
 */
export interface FormatMemoryRequest {
  /** Natural language input from user */
  userInput: string;
}

/**
 * AI-formatted memory ready for user approval
 */
export interface FormattedMemorySuggestion {
  /** AI-formatted memory content */
  content: string;
  /** AI-determined category */
  category: MemoryCategory;
  /** Why this category/format was chosen */
  reasoning: string;
}

/**
 * Response from AI memory formatting
 */
export interface FormatMemoryResponse {
  /** Whether the request is valid and can be saved */
  valid: boolean;
  /** Formatted suggestion if valid */
  suggestion?: FormattedMemorySuggestion;
  /** Reason for rejection if not valid */
  rejectionReason?: string;
}

/**
 * Request for AI to update an existing memory
 */
export interface UpdateMemoryAIRequest {
  /** ID of memory to update */
  memoryId: string;
  /** Natural language change request */
  changeRequest: string;
}

/**
 * Response from AI memory update
 */
export interface UpdateMemoryAIResponse {
  /** Whether the update is valid */
  valid: boolean;
  /** Original memory content */
  originalContent: string;
  /** Original category */
  originalCategory: MemoryCategory;
  /** AI-updated content if valid */
  updatedContent?: string;
  /** Updated category if changed */
  updatedCategory?: MemoryCategory;
  /** Explanation of changes made */
  changesSummary?: string;
  /** Reason for rejection if not valid */
  rejectionReason?: string;
}

/**
 * Request to confirm/save an AI-formatted memory
 */
export interface ConfirmMemoryRequest {
  /** Content (from AI suggestion) */
  content: string;
  /** Category (from AI suggestion) */
  category: MemoryCategory;
}

/**
 * Request to confirm/save an AI-updated memory
 */
export interface ConfirmMemoryUpdateRequest {
  /** ID of memory to update */
  memoryId: string;
  /** New content from AI */
  content: string;
  /** New category (may have changed) */
  category: MemoryCategory;
}
