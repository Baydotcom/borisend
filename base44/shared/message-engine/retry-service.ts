/**
 * MessageRetryService — Controls retry with backoff and fallback.
 * Never creates an endless regeneration loop.
 * Portable: no Base44 dependencies.
 */

import { FailureClassification } from './types.ts';

export async function withRetry<T>(
  operation: () => Promise<T>,
  maxAttempts: number,
  failureClassifier: (error: Error) => FailureClassification
): Promise<{ result: T | null; lastError: Error | null; attempts: number; lastClassification: FailureClassification | null }> {
  let lastError: Error | null = null;
  let lastClassification: FailureClassification | null = null;
  let attempts = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    attempts++;
    try {
      const result = await operation();
      return { result, lastError: null, attempts, lastClassification: null };
    } catch (err) {
      lastError = err as Error;
      lastClassification = failureClassifier(lastError);

      // Permanent failures do not retry
      if (lastClassification.is_permanent) {
        return { result: null, lastError, attempts, lastClassification };
      }

      // Temporary failures: backoff before next attempt
      if (attempt < maxAttempts - 1 && lastClassification.should_retry) {
        const backoffMs = 1000 * (attempt + 1); // 1s, 2s, 3s...
        await new Promise(r => setTimeout(r, backoffMs));
      }
    }
  }

  return { result: null, lastError, attempts, lastClassification };
}