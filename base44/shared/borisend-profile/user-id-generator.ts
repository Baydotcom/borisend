/**
 * BoriSend User ID generation — portable, no Base44 dependencies.
 *
 * Public-facing identifier format: BO/MM/YY/SN
 *   BO = BoriSend
 *   MM = two-digit registration month
 *   YY = last two digits of registration year
 *   SN = monthly serial, starts at 101, no zero-padding (101, 102, ..., 999, 1000)
 *
 * Concurrency safety is provided by an atomic counter repository (see
 * acquireUniqueSerial). This module contains only pure formatting + the
 * optimistic-lock orchestration against a repository interface, so it can be
 * unit-tested and reused on a non-Base44 runtime unchanged.
 */
import type { BoriSendUserIdSegments } from './types.ts';

export const BORISEND_ID_PREFIX = 'BO';
export const SERIAL_START = 101;   // first serial in any month
export const COUNTER_SEED = 100;   // last_serial initial value (so first serial = 101)

export function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Pure format: month (1-12), full 4-digit year, serial number. */
export function buildBoriSendUserId(month: number, fullYear: number, serial: number): BoriSendUserIdSegments {
  const mm = pad2(month);
  const yy = pad2(fullYear % 100);
  const prefix = `${BORISEND_ID_PREFIX}/${mm}/${yy}`;
  return { prefix, serial, fullId: `${prefix}/${serial}` };
}

export function getCurrentMonthYear(now: Date = new Date()): { month: number; year: number } {
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

/**
 * Repository contract the generator needs to atomically acquire a serial.
 * Implementations encapsulate the persistence layer (Base44 or future private
 * server), keeping this module portable.
 */
export interface UserIdCounterRepository {
  getCounter(month: number, year: number): Promise<{ id: string; last_serial: number } | null>;
  createCounter(month: number, year: number, prefix: string): Promise<{ id: string; last_serial: number }>;
  /**
   * Attempt to advance the counter from expectedSerial to newSerial ONLY IF its
   * current last_serial still equals expectedSerial. Returns true if this caller
   * won the advance (i.e. the counter now reads newSerial and no other caller
   * advanced it first).
   */
  conditionalAdvance(counterId: string, expectedSerial: number, newSerial: number): Promise<boolean>;
}

/**
 * Acquires a unique serial for the given month/year using optimistic
 * concurrency control. Two simultaneous registrations never receive the same
 * serial: only the caller whose conditional advance succeeds owns the serial.
 * Under contention a losing caller retries with the updated counter value;
 * gaps in the serial sequence are possible but never collisions, and serials
 * always increase naturally (101 → 999 → 1000 → ...).
 */
export async function acquireUniqueSerial(
  repo: UserIdCounterRepository,
  month: number,
  year: number,
  prefix: string,
  maxRetries = 12
): Promise<number> {
  let counter = await repo.getCounter(month, year);
  if (!counter) {
    counter = await repo.createCounter(month, year, prefix);
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const expected = counter.last_serial;
    const candidate = expected + 1;
    const won = await repo.conditionalAdvance(counter.id, expected, candidate);
    if (won) {
      return candidate;
    }
    // Lost the race — re-read the counter and retry with the new baseline.
    const refreshed = await repo.getCounter(month, year);
    if (!refreshed) {
      // Extremely rare: counter removed between attempts — recreate it.
      counter = await repo.createCounter(month, year, prefix);
    } else {
      counter = refreshed;
    }
  }

  throw new Error('Failed to acquire a unique BoriSend User ID serial after retries');
}