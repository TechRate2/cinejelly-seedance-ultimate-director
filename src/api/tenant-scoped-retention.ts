/**
 * Retention that cannot be used as a weapon.
 *
 * Both the conversation-session store and the channel-style library keep "the newest N records" in
 * one shared JSON file. Both computed that N over the GLOBAL list, so the newest N records across
 * ALL customers survived and everything older was dropped — which means one customer writing N+1
 * records silently deletes every other customer's saved work.
 *
 * That was reproduced, not theorised. A free zero-credit account posted 205 channel-style profiles in
 * 2.7 seconds and the victim's saved profile was gone: their list returned empty and a direct fetch
 * of their own profile id returned 404. The session-store variant is worse than data loss — the
 * render route resolves its plan from the stored session, so evicting a victim's session also makes
 * the video they had already planned unrenderable.
 *
 * The cap is a per-customer product limit ("you may keep 200 drafts"), never a race between
 * customers for one shared pool. This helper enforces exactly that: each writer's own records are
 * trimmed to the limit, and no record belonging to anyone else is ever touched.
 *
 * The file therefore grows with the number of customers rather than being globally bounded, which is
 * the correct trade: bounded storage is an operator concern with a scheduled answer, while
 * cross-customer deletion is a security defect with none.
 */

/** Minimum shape needed to partition and age records. */
export interface TenantScopedRecord {
  /** Owner. Records with no owner (operator/CLI writes) form their own partition. */
  readonly clientId?: string;
  readonly updatedAt: Date;
}

/**
 * Trim `records` so that no single owner keeps more than `maxPerClient`, newest first.
 *
 * Every owner is trimmed independently, so a write by one customer can never evict another's data.
 * Output order is newest-first overall, matching what the stores previously wrote.
 */
export function retainNewestPerClient<T extends TenantScopedRecord>(
  records: readonly T[],
  maxPerClient: number
): readonly T[] {
  const limit = Number.isFinite(maxPerClient) && maxPerClient > 0 ? Math.floor(maxPerClient) : 1;
  const byClient = new Map<string, T[]>();
  for (const record of records) {
    // Empty string is a real partition key for unowned records, distinct from any customer id.
    const key = record.clientId ?? "";
    const bucket = byClient.get(key);
    if (bucket) {
      bucket.push(record);
    } else {
      byClient.set(key, [record]);
    }
  }
  const kept: T[] = [];
  for (const bucket of byClient.values()) {
    bucket.sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
    kept.push(...bucket.slice(0, limit));
  }
  return kept.sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
}
