/**
 * Lock Service — short-lived generation lock scoped to GenerationKey.
 * Portable: pure logic for lock state evaluation. Entity access in backend function.
 */

export interface LockState {
  id: string;
  generation_key: string;
  status: string;
  locked_at: string;
  locked_until: string;
  request_id: string;
}

/**
 * Check if a lock is currently active (not expired, not released).
 */
export function isLockActive(lock: LockState | null, now: Date = new Date()): boolean {
  if (!lock) return false;
  if (lock.status !== "active") return false;
  const until = new Date(lock.locked_until);
  return until > now;
}

/**
 * Determine if a request should wait for an existing lock.
 * Returns true if the lock belongs to a different request and is still active.
 */
export function shouldWaitForLock(
  lock: LockState | null,
  requestId: string,
  now: Date = new Date()
): boolean {
  if (!isLockActive(lock, now)) return false;
  return lock.request_id !== requestId;
}

/**
 * Calculate lock expiry timestamp.
 */
export function calculateLockExpiry(timeoutMs: number, now: Date = new Date()): string {
  return new Date(now.getTime() + timeoutMs).toISOString();
}

/**
 * Check if a lock has expired and should be cleaned up.
 */
export function isLockExpired(lock: LockState | null, now: Date = new Date()): boolean {
  if (!lock) return false;
  if (lock.status === "released" || lock.status === "expired") return true;
  const until = new Date(lock.locked_until);
  return until <= now;
}