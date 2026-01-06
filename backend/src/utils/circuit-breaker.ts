/**
 * Circuit Breaker Utility
 *
 * Provides timeout and fallback mechanisms for Haiku calls.
 * If Haiku fails or times out (>1.5s), returns safe fallback values.
 */

/**
 * Execute a promise with a timeout.
 * If the timeout is exceeded, returns null.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T | null> {
  const timeoutPromise = new Promise<null>((resolve) => {
    setTimeout(() => {
      console.warn(`[CircuitBreaker] ${operationName} timed out after ${timeoutMs}ms`);
      resolve(null);
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } catch (error) {
    console.error(`[CircuitBreaker] ${operationName} failed:`, error);
    return null;
  }
}

/**
 * Circuit breaker for Haiku operations.
 * Default timeout: 1.5 seconds
 */
export const HAIKU_TIMEOUT_MS = 1500;

/**
 * Execute a Haiku operation with circuit breaker protection.
 * Returns fallback value if operation fails or times out.
 */
export async function withHaikuCircuitBreaker<T>(
  operation: () => Promise<T | null>,
  fallback: T,
  operationName: string
): Promise<T> {
  const startTime = Date.now();
  
  try {
    const result = await withTimeout(
      operation(),
      HAIKU_TIMEOUT_MS,
      operationName
    );
    
    const duration = Date.now() - startTime;
    
    if (result === null) {
      console.warn(`[CircuitBreaker] ${operationName} failed, using fallback (took ${duration}ms)`);
      return fallback;
    }
    
    if (duration > 1000) {
      console.warn(`[CircuitBreaker] ${operationName} took ${duration}ms (slow but succeeded)`);
    }
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[CircuitBreaker] ${operationName} threw error after ${duration}ms:`, error);
    return fallback;
  }
}


