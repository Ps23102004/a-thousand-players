// Uncertainty helpers for the numbers the app shows: Brier score and a bucket table for stated confidences, Wilson intervals,
// and a player-level bootstrap for rates (rounds of one player are not independent, so resampling rounds would be too narrow).
// Pure code; the measurements behind TRIAGE_CALIBRATION are in docs/calibration.md.
import type { Claim, Persona, RunLine, SessionEnd } from "./types";

export interface Forecast { p: number; y: 0 | 1 } // stated probability, observed outcome

/** Mean squared error of the stated probabilities; 0 is perfect, 0.25 is what always saying 0.5 scores. */
export function brier(fs: Forecast[]): number {
  return fs.length ? fs.reduce((s, f) => s + (f.p - f.y) ** 2, 0) / fs.length : NaN;
}

export interface Bucket { lo: number; hi: number; n: number; meanP: number; observed: number }
/** Forecasts grouped by stated probability into [edge_i, edge_i+1) (the last bucket includes 1). Empty buckets are kept with n 0. */
export function calibrationTable(fs: Forecast[], edges = [0, 0.5, 0.8, 0.9, 0.95, 1]): Bucket[] {
  return edges.slice(0, -1).map((lo, i) => {
    const hi = edges[i + 1], last = i === edges.length - 2;
    const b = fs.filter((f) => f.p >= lo && (f.p < hi || (last && f.p <= hi)));
    const mean = (g: (f: Forecast) => number) => (b.length ? b.reduce((s, f) => s + g(f), 0) / b.length : NaN);
    return { lo, hi, n: b.length, meanP: mean((f) => f.p), observed: mean((f) => f.y) };
  });
}

/** Wilson score interval for k successes in n trials (z 1.96 = 95%). Behaves at k = 0 and k = n, unlike p ± z·se. */
export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = k / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d, h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

/** Small seeded PRNG so a bootstrap gives the same interval on every render. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Percentile bootstrap of sum(k)/sum(n) over groups (one group per player). */
export function bootstrapRatio(groups: { k: number; n: number }[], { iters = 2000, seed = 1, level = 0.95 } = {}): [number, number] {
  if (!groups.length) return [0, 1];
  const rnd = mulberry32(seed), stats: number[] = [];
  for (let i = 0; i < iters; i++) {
    let k = 0, n = 0;
    for (let j = 0; j < groups.length; j++) { const g = groups[Math.floor(rnd() * groups.length)]; k += g.k; n += g.n; }
    stats.push(n ? k / n : 0);
  }
  stats.sort((a, b) => a - b);
  const q = (f: number) => stats[Math.min(iters - 1, Math.max(0, Math.floor(f * iters)))];
  return [q((1 - level) / 2), q(1 - (1 - level) / 2)];
}

const quitReason = (s: SessionEnd) => s.quit.reason === "frustration" || s.quit.reason === "boredom"; // same rule as ai/verify.ts isQuit

/**
 * Per-player {k, n} behind a rate claim, with the same scope rules as ai/verify.ts computeMetric. null for non-rate metrics.
 * winRate / koShare: k = that player's wins (KO losses) among their rounds in scope; quitRate: k = 1 if that player quit there.
 */
export function claimGroups(claim: Claim, personas: Persona[], runs: RunLine[], sessions: SessionEnd[]): { k: number; n: number }[] | null {
  if (claim.metric !== "winRate" && claim.metric !== "koShare" && claim.metric !== "quitRate") return null;
  const arch = new Map(personas.map((p) => [p.id, p.archetype]));
  const { archetype, round } = claim.scope;
  const rs = runs.filter((r) => arch.has(r.p) && (!archetype || arch.get(r.p) === archetype) && (round === undefined || r.round === round));
  const byPlayer = new Map<string, RunLine[]>();
  for (const r of rs) byPlayer.set(r.p, [...(byPlayer.get(r.p) ?? []), r]);
  if (claim.metric === "quitRate") {
    const end = new Map(sessions.map((s) => [s.p, s]));
    return [...byPlayer.keys()].map((p) => {
      const s = end.get(p);
      return { k: s && quitReason(s) && (round === undefined || s.quit.afterRound === round) ? 1 : 0, n: 1 };
    });
  }
  const hit = claim.metric === "winRate" ? (r: RunLine) => r.out === "win" : (r: RunLine) => r.out === "loss" && r.ko !== null;
  return [...byPlayer.values()].map((g) => ({ k: g.filter(hit).length, n: g.length }));
}

/** 95% interval for a rate claim, bootstrapped over players. */
export function claimInterval(claim: Claim, personas: Persona[], runs: RunLine[], sessions: SessionEnd[]): { lo: number; hi: number; players: number } | null {
  const g = claimGroups(claim, personas, runs, sessions);
  if (!g || !g.length) return null;
  const [lo, hi] = bootstrapRatio(g);
  return { lo, hi, players: g.length };
}

/**
 * 95% interval for a rate claim shown in the UI, which has no session list: quit rates are one yes/no per player (Wilson over the
 * players in scope), win and KO shares are bootstrapped over players. value is the recomputed rate.
 */
export function rateInterval(claim: Claim, value: number, personas: Persona[], runs: RunLine[]): { lo: number; hi: number; players: number } | null {
  const g = claimGroups(claim, personas, runs, []);
  if (!g || !g.length) return null;
  const [lo, hi] = claim.metric === "quitRate" ? wilson(Math.round(value * g.length), g.length) : bootstrapRatio(g);
  return { lo, hi, players: g.length };
}

/**
 * What the measured triages say about Ultra's stated confidence (docs/calibration.md, "Ultra triage confidence"): 15 triages with a
 * replay verdict (4 offline, 4 from the recorded demo, 7 from ai/cli/calibrate-triage.ts), plus 7 answers whose patch failed validation.
 * Every stated confidence was 0.85 to 0.95, fixed or not, so the number does not separate good patches from bad ones.
 */
export const TRIAGE_CALIBRATION = { triages: 15, fixed: 2, invalid: 7, minConfidence: 0.85, maxConfidence: 0.95, brier: 0.695, baseRateBrier: 0.116 }; // baseRateBrier = always stating 2/15. Re-scored 2026-10-29: a guard-deleting patch is reused-shipped-fix, not fixed
