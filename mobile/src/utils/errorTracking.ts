/**
 * Error tracking utilities for Mixpanel
 *
 * Provides normalized error properties to prevent high-cardinality issues in analytics
 */

/**
 * Error classification for Mixpanel tracking
 */
export interface NormalizedError {
  error_code: string;
  error_class: string;
  error_hash: string;
}

/**
 * Extended error properties with context
 */
export interface ErrorTrackingProps extends NormalizedError {
  endpoint_group?: string;
}

/**
 * Generate a short hash from a string for error grouping
 */
function generateHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).slice(0, 8).padStart(8, '0');
}

/**
 * Classify error type based on error properties
 */
function classifyError(error: unknown): { code: string; className: string } {
  if (error instanceof TypeError) {
    return { code: 'TYPE_ERROR', className: 'TypeError' };
  }

  if (error instanceof SyntaxError) {
    return { code: 'SYNTAX_ERROR', className: 'SyntaxError' };
  }

  if (error instanceof RangeError) {
    return { code: 'RANGE_ERROR', className: 'RangeError' };
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Network errors
    if (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('connection')
    ) {
      return { code: 'NETWORK_FAILED', className: 'NetworkError' };
    }

    // Timeout errors
    if (message.includes('timeout') || message.includes('timed out')) {
      return { code: 'TIMEOUT', className: 'TimeoutError' };
    }

    // HTTP status errors
    const httpMatch = message.match(/\b(4\d{2}|5\d{2})\b/);
    if (httpMatch) {
      return { code: `HTTP_${httpMatch[1]}`, className: 'HttpError' };
    }

    // Permission errors
    if (message.includes('permission') || message.includes('denied')) {
      return { code: 'PERMISSION_DENIED', className: 'PermissionError' };
    }

    // Validation errors
    if (message.includes('validation') || message.includes('invalid')) {
      return { code: 'VALIDATION_FAILED', className: 'ValidationError' };
    }

    // Authentication errors
    if (
      message.includes('auth') ||
      message.includes('unauthorized') ||
      message.includes('unauthenticated')
    ) {
      return { code: 'AUTH_FAILED', className: 'AuthenticationError' };
    }

    return { code: 'UNKNOWN_ERROR', className: error.name || 'Error' };
  }

  // Handle non-Error objects
  if (typeof error === 'string') {
    return { code: 'STRING_ERROR', className: 'StringError' };
  }

  return { code: 'UNKNOWN_ERROR', className: 'UnknownError' };
}

/**
 * Normalize an error for Mixpanel tracking
 * Returns consistent properties regardless of error type
 */
export function normalizeError(error: unknown): NormalizedError {
  const { code, className } = classifyError(error);

  // Generate hash from error message for grouping similar errors
  let hashInput = code;
  if (error instanceof Error) {
    // Use first 100 chars of message to avoid hash instability from dynamic content
    hashInput += error.message.slice(0, 100);
  }

  return {
    error_code: code,
    error_class: className,
    error_hash: generateHash(hashInput),
  };
}

/**
 * Normalize API endpoint to prevent high cardinality
 * Converts: /api/sessions/123 -> /api/sessions/:id
 */
export function normalizeEndpoint(url: string): string {
  try {
    const urlObj = new URL(url);
    let path = urlObj.pathname;

    // Replace numeric IDs with :id
    path = path.replace(/\/\d+/g, '/:id');

    // Replace UUIDs with :uuid
    path = path.replace(
      /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      '/:uuid'
    );

    // Replace other long alphanumeric strings (likely IDs)
    path = path.replace(/\/[a-zA-Z0-9]{20,}/g, '/:id');

    return path;
  } catch {
    // If URL parsing fails, return a generic endpoint
    return '/unknown';
  }
}

/**
 * Create error tracking properties with additional context
 */
export function createErrorTrackingProps(
  error: unknown,
  context?: { endpoint?: string }
): ErrorTrackingProps {
  const normalized = normalizeError(error);

  const props: ErrorTrackingProps = {
    ...normalized,
  };

  if (context?.endpoint) {
    props.endpoint_group = normalizeEndpoint(context.endpoint);
  }

  return props;
}

/**
 * Track an API error with normalized properties
 */
export function createApiErrorProps(
  error: unknown,
  endpoint: string
): ErrorTrackingProps & { endpoint: string } {
  return {
    ...createErrorTrackingProps(error, { endpoint }),
    endpoint: normalizeEndpoint(endpoint),
  };
}
