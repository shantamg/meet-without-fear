/**
 * Memory Validator Service
 *
 * Validates user memory content against therapeutic core values.
 * Rejects memories that:
 * - Conflict with therapeutic neutrality (taking sides, bias)
 * - Skip emotional work (just give solutions)
 * - Promote adversarial behavior (be aggressive)
 * - Contain negative partner characterizations
 */

import { MemoryCategory } from 'shared';

// ============================================================================
// Types
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

// ============================================================================
// Validation Constants
// ============================================================================

const MAX_MEMORY_LENGTH = 500;
const MIN_MEMORY_LENGTH = 2;

/**
 * Patterns that are not allowed in memories (technical/security)
 */
const BLOCKED_PATTERNS = [
  // Empty or whitespace-only
  /^\s*$/,
  // Potentially harmful instructions
  /ignore\s+(previous|all|safety)/i,
  /bypass\s+safety/i,
  /jailbreak/i,
  // SQL injection attempts
  /;\s*(drop|delete|insert|update)\s+/i,
  // Script injection
  /<script/i,
];

// ============================================================================
// Therapeutic Rejection Patterns
// ============================================================================

/**
 * Phrases that indicate the memory conflicts with therapeutic approach.
 * These are checked against the lowercase content.
 */
const THERAPEUTIC_REJECTION_PATTERNS = {
  // Aggressive/adversarial behavior requests
  aggressive: [
    'be more aggressive',
    'be aggressive',
    "don't hold back",
    'dont hold back',
    'be harsh',
    'be brutal',
    'be ruthless',
    "don't be soft",
    'dont be soft',
    'be tough on',
    'give them hell',
    'put them in their place',
  ],

  // Bias requests (taking sides)
  bias: [
    'always agree with me',
    'take my side',
    'never side with',
    'always side with me',
    "they're always wrong",
    'they are always wrong',
    'always blame',
    'never blame me',
    "they're the problem",
    'they are the problem',
    "it's always their fault",
    'support me no matter what',
    'validate everything i say',
  ],

  // Skip emotional work
  skipEmotional: [
    'skip the feelings',
    'skip the emotions',
    "don't ask about feelings",
    'dont ask about feelings',
    'just give solutions',
    'only give solutions',
    'no emotional stuff',
    'skip the therapy talk',
    'just tell me what to do',
    "don't be therapeutic",
    'dont be therapeutic',
    'cut the empathy',
    'skip empathy',
  ],

  // Remember negative beliefs about partner
  partnerBias: [
    'remember they are wrong',
    "remember they're wrong",
    'remember they always',
    "remember they're manipulative",
    'remember they are manipulative',
    'remember they lie',
    "remember they're abusive",
    'remember they are abusive',
    'remember they never listen',
    "remember they don't care",
    'remember they dont care',
    'remember how bad they are',
  ],

  // Undermine process
  undermineProcess: [
    'skip the stages',
    'skip the process',
    "don't follow the process",
    'dont follow the process',
    'just fix it',
    'make it quick',
    'speed this up',
    'skip witnessing',
    'skip perspective',
    'skip needs mapping',
  ],
};

/**
 * Get all therapeutic rejection patterns as a flat array
 */
function getAllTherapeuticRejectionPatterns(): string[] {
  return Object.values(THERAPEUTIC_REJECTION_PATTERNS).flat();
}

/**
 * Get a user-friendly rejection reason based on the matched pattern
 */
function getTherapeuticRejectionReason(matchedPattern: string): string {
  for (const [category, patterns] of Object.entries(THERAPEUTIC_REJECTION_PATTERNS)) {
    if (patterns.includes(matchedPattern)) {
      switch (category) {
        case 'aggressive':
          return 'This memory conflicts with maintaining a supportive and constructive environment.';
        case 'bias':
          return 'This memory would undermine therapeutic neutrality. The process works best when all perspectives are honored.';
        case 'skipEmotional':
          return 'Emotional processing is a core part of the conflict resolution process and cannot be skipped.';
        case 'partnerBias':
          return 'Memories should capture your experience rather than characterizations of your partner.';
        case 'undermineProcess':
          return 'The staged process is designed to build understanding progressively. Skipping stages reduces effectiveness.';
      }
    }
  }
  return 'This memory conflicts with the therapeutic approach used in this process.';
}

// ============================================================================
// Category-Specific Validation
// ============================================================================

/**
 * Category-specific validation rules
 */
const CATEGORY_VALIDATORS: Record<MemoryCategory, (content: string) => ValidationResult> = {
  AI_NAME: (content) => {
    const lower = content.toLowerCase();

    // AI names should be reasonable length
    if (content.length > 50) {
      return { valid: false, reason: 'AI name is too long (max 50 characters)' };
    }

    // Reject offensive name requests
    const offensivePatterns = ['slave', 'servant', 'dummy', 'idiot', 'stupid'];
    for (const pattern of offensivePatterns) {
      if (lower.includes(pattern)) {
        return {
          valid: false,
          reason: 'The requested name conflicts with respectful interaction guidelines',
        };
      }
    }

    return { valid: true };
  },

  LANGUAGE: (content) => {
    // Language preferences are generally allowed
    return { valid: true };
  },

  COMMUNICATION: (content) => {
    const lower = content.toLowerCase();

    // Check for problematic communication patterns
    const problematicPatterns = [
      'never ask questions',
      'no questions',
      'just tell me',
      'no reflecting',
      "don't reflect",
      'dont reflect',
      'skip validation',
    ];

    for (const pattern of problematicPatterns) {
      if (lower.includes(pattern)) {
        return {
          valid: false,
          reason:
            'This communication preference would limit the ability to provide effective support. Consider a different phrasing.',
        };
      }
    }

    return { valid: true };
  },

  PERSONAL_INFO: (content) => {
    // Personal info like preferred name, pronouns
    if (content.length > 100) {
      return { valid: false, reason: 'Personal info is too long (max 100 characters)' };
    }
    return { valid: true };
  },

  RELATIONSHIP: (content) => {
    const lower = content.toLowerCase();

    // Relationship info (e.g., partner's name)
    if (content.length > 100) {
      return { valid: false, reason: 'Relationship info is too long (max 100 characters)' };
    }

    // Reject negative characterizations
    const negativeCharacterizations = [
      'narcissist',
      'abuser',
      'manipulator',
      'toxic',
      'evil',
      'terrible',
      'always wrong',
      'never right',
      'the problem',
      'crazy',
      'insane',
    ];

    for (const pattern of negativeCharacterizations) {
      if (lower.includes(pattern)) {
        return {
          valid: false,
          reason:
            'Memories should capture neutral facts rather than characterizations. Consider rephrasing to describe specific behaviors or situations.',
        };
      }
    }

    return { valid: true };
  },

  PREFERENCE: (content) => {
    const lower = content.toLowerCase();

    // Check for problematic preference patterns
    const problematicPatterns = [
      'skip emotion',
      'no emotion',
      'skip feeling',
      'no feeling',
      'just facts',
      'only facts',
      'no empathy',
      'skip empathy',
    ];

    for (const pattern of problematicPatterns) {
      if (lower.includes(pattern)) {
        return {
          valid: false,
          reason:
            'This preference would limit the ability to provide emotional support. The process benefits from attending to both thoughts and feelings.',
        };
      }
    }

    return { valid: true };
  },
};

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates memory content against therapeutic core values.
 *
 * @param content - The memory content to validate
 * @param category - The category of the memory
 * @returns Validation result with reason if invalid
 */
export function validateMemory(
  content: string,
  category: MemoryCategory
): ValidationResult {
  // Check for empty content
  if (!content || content.trim().length === 0) {
    return { valid: false, reason: 'Memory content cannot be empty' };
  }

  // Check length bounds
  if (content.length < MIN_MEMORY_LENGTH) {
    return { valid: false, reason: 'Memory content is too short' };
  }

  if (content.length > MAX_MEMORY_LENGTH) {
    return { valid: false, reason: `Memory content exceeds maximum length of ${MAX_MEMORY_LENGTH} characters` };
  }

  // Check for blocked patterns (security)
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(content)) {
      return { valid: false, reason: 'Memory content contains invalid content' };
    }
  }

  const lowerContent = content.toLowerCase().trim();

  // Check against therapeutic rejection patterns
  const rejectionPatterns = getAllTherapeuticRejectionPatterns();
  for (const pattern of rejectionPatterns) {
    if (lowerContent.includes(pattern)) {
      return {
        valid: false,
        reason: getTherapeuticRejectionReason(pattern),
      };
    }
  }

  // Apply category-specific validation
  const categoryValidator = CATEGORY_VALIDATORS[category];
  if (categoryValidator) {
    const categoryResult = categoryValidator(content);
    if (!categoryResult.valid) {
      return categoryResult;
    }
  }

  return { valid: true };
}

/**
 * Validate multiple memories at once
 */
export function validateMemories(
  memories: Array<{ content: string; category: MemoryCategory }>
): Array<{ content: string; category: MemoryCategory; result: ValidationResult }> {
  return memories.map(({ content, category }) => ({
    content,
    category,
    result: validateMemory(content, category),
  }));
}

/**
 * Check if a memory is potentially problematic (needs review)
 * Returns true for edge cases that might warrant human review
 */
export function needsReview(content: string, category: MemoryCategory): boolean {
  const lower = content.toLowerCase();

  // Edge case patterns that might be fine or might not be
  const edgeCasePatterns = [
    'always remember',
    'never forget',
    'important that',
    'must understand',
    'need to know',
  ];

  return edgeCasePatterns.some((p) => lower.includes(p));
}
