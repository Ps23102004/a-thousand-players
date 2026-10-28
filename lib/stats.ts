import type { Persona, RunLine, SessionEnd, Summary } from "./types";

const KO_X_MIN = -10.5;
const KO_X_MAX = 10.5;
const X_BINS = 12;
const T_BINS = 6;
const NICE_STEPS = [1, 2, 5, 10, 20, 30, 60];

const rate = (n: number, d: number) => (d === 0 ? 0 : n / d);

/** Pure aggregate of a crowd run. Definitions are in the web-agent brief and asserted in stats.test.ts. */
export function computeSummary(personas: Persona[], runs: RunLine[], sessions: SessionEnd[]): Summary {
  const wins = runs.filter((r) => r.out === "win").length;
  const losses = runs.filter((r) => r.out === "loss").length;
  const draws = runs.length - wins - losses;

  const byArchetype: Summary["byArchetype"] = {};
  const quitBy = new Map(sessions.map((s) => [s.p, s.quit.reason]));
  for (const a of new Set(personas.map((p) => p.archetype))) {
    const ids = new Set(personas.filter((p) => p.archetype === a).map((p) => p.id));
    const rs = runs.filter((r) => ids.has(r.p));
    const quitters = [...ids].filter((id) => {
      const reason = quitBy.get(id);
      return reason === "frustration" || reason === "boredom";
    }).length;
    byArchetype[a] = {
      players: ids.size,
      rounds: rs.length,
      winRate: rate(rs.filter((r) => r.out === "win").length, rs.length),
      quitRate: rate(quitters, ids.size),
      avgDuration: rate(rs.reduce((s, r) => s + r.t, 0), rs.length),
    };
  }

  const maxRound = runs.reduce((m, r) => Math.max(m, r.round), 0);
  const quitCurve: Summary["quitCurve"] = [];
  for (let round = 1; round <= maxRound; round++) {
    const played = new Set(runs.filter((r) => r.round === round).map((r) => r.p)).size;
    quitCurve.push({ round, remaining: rate(played, personas.length) });
  }

  const quitReasons: Record<string, number> = {};
  for (const s of sessions) quitReasons[s.quit.reason] = (quitReasons[s.quit.reason] ?? 0) + 1;

  // t axis spans the latest KO, not the longest round: a few timeouts would otherwise squash every KO into one row.
  const maxT = runs.reduce((m, r) => Math.max(m, r.ko?.t ?? 0), 0);
  const xStep = (KO_X_MAX - KO_X_MIN) / X_BINS;
  const tStep = maxT / T_BINS;
  const grid = Array.from({ length: T_BINS }, () => new Array<number>(X_BINS).fill(0));
  for (const r of runs) {
    if (!r.ko) continue;
    const xi = clampIndex(Math.floor((r.ko.x - KO_X_MIN) / xStep), X_BINS);
    const ti = tStep > 0 ? clampIndex(Math.floor(r.ko.t / tStep), T_BINS) : 0;
    grid[ti][xi]++;
  }

  // ~10 bins up to the 95th percentile duration; the last bin also holds everything longer (shown as "N+").
  const sorted = runs.map((r) => r.t).sort((a, b) => a - b);
  const p95 = sorted[Math.floor(0.95 * (sorted.length - 1))] ?? 0;
  const width = NICE_STEPS.find((s) => s >= p95 / 10) ?? 60;
  const histBins = runs.length ? Math.floor(p95 / width) + 1 : 0;
  const durationHist = Array.from({ length: histBins }, (_, i) => ({ bin: i * width, count: 0 }));
  for (const r of runs) durationHist[Math.min(histBins - 1, Math.floor(r.t / width))].count++;

  return {
    players: personas.length,
    rounds: runs.length,
    sessions: sessions.length,
    simHours: runs.reduce((s, r) => s + r.t, 0) / 3600,
    wins, losses, draws,
    winRate: rate(wins, runs.length),
    byArchetype,
    quitCurve,
    quitReasons,
    koHeat: {
      xBins: Array.from({ length: X_BINS }, (_, i) => KO_X_MIN + i * xStep),
      tBins: Array.from({ length: T_BINS }, (_, i) => i * tStep),
      grid,
    },
    durationHist,
  };
}

function clampIndex(i: number, n: number) {
  return Math.min(n - 1, Math.max(0, i));
}

/** Splits a runs.jsonl body into round lines and session-end lines (lines with a "quit" key). */
export function parseRunsJsonl(text: string): { runs: RunLine[]; sessions: SessionEnd[] } {
  const runs: RunLine[] = [];
  const sessions: SessionEnd[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const obj = JSON.parse(line);
    if ("quit" in obj) sessions.push(obj);
    else runs.push(obj);
  }
  return { runs, sessions };
}
