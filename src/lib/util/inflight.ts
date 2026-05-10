// Sprint #7: extracted from cache.ts so the in-flight dedup pattern can be
// unit-tested in isolation. Same behavior as the inline implementation —
// just refactored into a generic helper.
//
// Use case: SEC EDGAR / Yahoo concurrent first-time fetches. Without dedup,
// multiple users (or one user + SWR poll) hitting the same ticker before
// the cache is warm fire N parallel network requests. With dedup, the
// second-to-Nth requesters await the first's Promise.

/**
 * Coalesce concurrent calls for the same key into a single in-flight Promise.
 *
 * - First caller for a given key kicks off `loader()` and stores the Promise
 *   in `map[key]`.
 * - Subsequent callers (while the first is pending) get the same Promise.
 * - When the Promise settles (resolved OR rejected), `map[key]` is cleared
 *   so the next caller starts fresh — failures don't permanently lock out
 *   the key.
 */
export function withInflightDedup<K, V>(
  map: Map<K, Promise<V>>,
  key: K,
  loader: () => Promise<V>,
): Promise<V> {
  const existing = map.get(key);
  if (existing) return existing;
  const p = loader().finally(() => {
    // Best-effort cleanup. If the same key is requested again while we're
    // in this finally callback, the new request would await the same
    // already-settled Promise (which resolves immediately) and then we'd
    // overwrite the map entry — harmless either way.
    map.delete(key);
  });
  map.set(key, p);
  return p;
}
