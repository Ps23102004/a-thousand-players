import type { Claim, Finding, Persona, RunLine, SessionEnd } from "../lib/types";

// A "quit" is leaving unhappy. Sessions that end "satisfied" or at the round "cap" are not quits,
// otherwise the last round would always show a 100% quit rate.
export const isQuit = (s: SessionEnd) => s.quit.reason === "frustration" || s.quit.reason === "boredom";

const FRACTION_METRICS = new Set<Claim["metric"]>(["winRate", "quitRate", "koShare"]);

/** Recomputes a claim from raw runs. Returns null when the scope has no data. */
export function computeMetric(claim: Claim, personas: Persona[], runs: RunLine[], sessions: SessionEnd[]): number | null {
  const arch = new Map(personas.map((p) => [p.id, p.archetype]));
  const { archetype, round } = claim.scope;
  const inScope = (p: string) => arch.has(p) && (!archetype || arch.get(p) === archetype);

  if (claim.metric === "quitRate") {
    const end = new Map(sessions.map((s) => [s.p, s]));
    const players = round === undefined
      ? [...new Set(runs.map((r) => r.p))].filter(inScope)
      : [...new Set(runs.filter((r) => r.round === round).map((r) => r.p))].filter(inScope);
    if (!players.length) return null;
    const quits = players.filter((p) => {
      const s = end.get(p);
      return s !== undefined && isQuit(s) && (round === undefined || s.quit.afterRound === round);
    });
    return quits.length / players.length;
  }

  const rs = runs.filter((r) => inScope(r.p) && (round === undefined || r.round === round));
  if (!rs.length) return null;
  const mean = (f: (r: RunLine) => number) => rs.reduce((s, r) => s + f(r), 0) / rs.length;
  switch (claim.metric) {
    case "winRate": return mean((r) => (r.out === "win" ? 1 : 0));
    case "koShare": return mean((r) => (r.out === "loss" && r.ko !== null ? 1 : 0));
    case "avgDuration": return mean((r) => r.t);
    case "meanHpLoss": return mean((r) => 100 - r.hp[0]);
  }
}

export function claimOk(claim: Claim, actual: number): boolean {
  if (FRACTION_METRICS.has(claim.metric)) return Math.abs(actual - claim.value) <= 0.05;
  return Math.abs(actual - claim.value) <= 0.1 * Math.max(Math.abs(actual), 1e-9);
}

export const seedKey = (p: string, round: number, seed: number) => `${p}:${round}:${seed}`;

/**
 * Recomputes every claim. A cited seed that matches no run is corrected from its (player, round) when that pair names exactly one
 * round (Ultra mistypes 6-digit seeds; the round it points at is still real), otherwise dropped, as are repeats.
 * Findings left without a seed get confidence capped at 0.3.
 */
export function verifyFindings(findings: Finding[], personas: Persona[], runs: RunLine[], sessions: SessionEnd[]): { findings: Finding[]; droppedSeeds: number; repairedSeeds: number; failedClaims: number } {
  const exists = new Set(runs.map((r) => seedKey(r.p, r.round, r.seed)));
  const byRound = new Map<string, number | null>(); // null = (player, round) is ambiguous, never repair from it
  for (const r of runs) { const k = `${r.p}:${r.round}`; byRound.set(k, byRound.has(k) ? null : r.seed); }
  let droppedSeeds = 0, repairedSeeds = 0, failedClaims = 0;
  const out = findings.map((f) => {
    const kept = new Set<string>();
    const seeds: Finding["seeds"] = [];
    for (const s of f.seeds) {
      let seed = s.seed;
      if (!exists.has(seedKey(s.p, s.round, seed))) {
        const real = byRound.get(`${s.p}:${s.round}`);
        if (real === null || real === undefined) { droppedSeeds++; continue; }
        repairedSeeds++;
        seed = real;
      }
      const k = seedKey(s.p, s.round, seed);
      if (kept.has(k)) { droppedSeeds++; continue; }
      kept.add(k);
      seeds.push({ ...s, seed });
    }
    const verified = f.claims.map((claim) => {
      const actual = computeMetric(claim, personas, runs, sessions);
      // Empty scope: the claim is about data that does not exist, so it fails with actual 0.
      const ok = actual !== null && claimOk(claim, actual);
      if (!ok) failedClaims++;
      return { claim, actual: actual === null ? 0 : Math.round(actual * 1000) / 1000, ok };
    });
    return { ...f, seeds, verified, confidence: seeds.length ? f.confidence : Math.min(f.confidence, 0.3) };
  });
  return { findings: out, droppedSeeds, repairedSeeds, failedClaims };
}
