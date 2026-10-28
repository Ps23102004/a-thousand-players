// ponytail: in-memory, per process. Resets on restart and is not shared across instances; use a store (Redis/KV) if deployed to more than one.
export function createLimiter(perMinute: number, perDay: number) {
  const recent = new Map<string, number[]>();
  let day = "";
  let dayCount = 0;

  return function check(ip: string, now = Date.now()): { ok: true } | { ok: false; retryAfter: number; reason: string } {
    const today = new Date(now).toISOString().slice(0, 10);
    if (today !== day) { day = today; dayCount = 0; recent.clear(); }
    if (dayCount >= perDay) return { ok: false, retryAfter: 3600, reason: `daily cap of ${perDay} requests reached` };

    const hits = (recent.get(ip) ?? []).filter((t) => now - t < 60_000);
    if (hits.length >= perMinute) {
      recent.set(ip, hits);
      return { ok: false, retryAfter: Math.ceil((60_000 - (now - hits[0])) / 1000), reason: `limit is ${perMinute} per minute` };
    }
    hits.push(now);
    recent.set(ip, hits);
    dayCount++;
    return { ok: true };
  };
}
