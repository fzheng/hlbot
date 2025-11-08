export interface TradeRow {
  id: number;
  time: string; // ISO
  address: string;
  action: string;
  size: number;
  startPosition: number | null;
  price: number;
  closedPnl: number | null;
  tx?: string | null;
}

/**
 * mergeTrades: merges two chronologically descending arrays (newer first) ensuring no duplicates.
 * Dedupe key: id|time. Assumes both inputs individually have no duplicates.
 * Returns a new array sorted descending by time then id.
 */
function tradeKey(t: Partial<TradeRow>): string {
  if (t?.tx) return `tx:${String(t.tx).toLowerCase()}`;
  if ((t as any)?.hash) return `tx:${String((t as any).hash).toLowerCase()}`;
  if (t?.id != null) return `id:${t.id}`;
  return `time:${t?.time}|addr:${t?.address}|size:${t?.size}|price:${t?.price}`;
}

export function mergeTrades(existing: TradeRow[], incoming: TradeRow[]): TradeRow[] {
  const seen = new Set(existing.map((t) => tradeKey(t)));
  const additions: TradeRow[] = [];
  for (const t of incoming) {
    const key = tradeKey(t);
    if (!seen.has(key)) {
      seen.add(key);
      additions.push(t);
    }
  }
  if (additions.length === 0) return existing.slice();
  const merged = existing.concat(additions);
  // Sort descending by time then id
  merged.sort((a,b) => {
    const ta = new Date(a.time).getTime();
    const tb = new Date(b.time).getTime();
    if (ta !== tb) return tb - ta;
    return b.id - a.id;
  });
  return merged;
}

/** Simple rate limiter state */
export interface RateState { lastAt: number; }

/** canLoadMore: enforces a minimum interval between loadMore calls */
export function canLoadMore(state: RateState, minIntervalMs: number): boolean {
  const now = Date.now();
  if (now - state.lastAt < minIntervalMs) return false;
  state.lastAt = now;
  return true;
}
