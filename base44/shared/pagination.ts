/**
 * Paginated full scan via skip-based pagination.
 *
 * Avoids the silent truncation that occurs with a single list(..., 500) /
 * filter(..., 500) call when a result set exceeds the limit. Iterates pages
 * (limit + skip) until a page is shorter than the limit, with a bounded cap
 * to stay safe under all conditions.
 *
 * `entityRef` is a Base44 entity handle, e.g. `sr.entities.UserSubscription`.
 *
 * Used by the RC9 credit-optimisation sprint to fix the 500-record truncation
 * defect in ProcessTrialExpiry and CheckActiveUserRewards without introducing
 * unbounded in-memory scans.
 */
export async function listAll<T = any>(
  entityRef: {
    filter: (query: any, sort?: string, limit?: number, skip?: number) => Promise<T[]>;
  },
  query: Record<string, any>,
  sort?: string,
  limit = 500,
  maxPages = 50
): Promise<T[]> {
  const all: T[] = [];
  for (let i = 0; i < maxPages; i++) {
    const page = await entityRef.filter(query, sort, limit, i * limit);
    if (!page || page.length === 0) break;
    all.push(...page);
    if (page.length < limit) break;
  }
  return all;
}