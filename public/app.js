// Helper module extracted from inline script
function tradeKey(trade) {
  if (trade && trade.tx) return `tx:${String(trade.tx).toLowerCase()}`;
  if (trade && trade.hash) return `tx:${String(trade.hash).toLowerCase()}`;
  if (trade && trade.id != null) return `id:${trade.id}`;
  const time = trade && trade.time ? trade.time : '';
  const addr = trade && trade.address ? trade.address : '';
  const size = trade && typeof trade.size !== 'undefined' ? trade.size : '';
  const price = trade && typeof trade.price !== 'undefined' ? trade.price : '';
  return `time:${time}|addr:${addr}|size:${size}|price:${price}`;
}

export function mergeTrades(existing, incoming) {
  const seen = new Set(existing.map(t => tradeKey(t)));
  const additions = [];
  for (const t of incoming) {
    const key = tradeKey(t);
    if (!seen.has(key)) { seen.add(key); additions.push(t); }
  }
  if (!additions.length) return existing.slice();
  const merged = existing.concat(additions);
  merged.sort((a,b)=>{
    const ta = new Date(a.time).getTime();
    const tb = new Date(b.time).getTime();
    if (ta !== tb) return tb - ta;
    return b.id - a.id;
  });
  return merged;
}

export function canLoadMore(state, minIntervalMs) {
  const now = Date.now();
  if (now - state.lastAt < minIntervalMs) return false;
  state.lastAt = now;
  return true;
}
