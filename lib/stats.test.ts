import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSummary, parseRunsJsonl } from "./stats";
import { encodeToken, decodeToken } from "./replay-token";
import { createLimiter } from "./rate-limit";
import type { Persona, RunLine, SessionEnd } from "./types";

const persona = (id: string, archetype: Persona["archetype"]): Persona => ({
  id, name: id, archetype, skill: 0.5, reaction_ticks: 12, patience: 0.5, frustration_tolerance: 0.5, bio: "", rules: [],
});
const run = (p: string, round: number, out: RunLine["out"], t: number, ko: RunLine["ko"]): RunLine => ({
  p, round, seed: round * 100, tuning: "base", out, t, hp: [0, 0], ko, ev: [], dmg: [0, 0], maxCombo: 0, mood: { frustration: 0, boredom: 0 },
});

const personas = [persona("a", "rusher"), persona("b", "rusher"), persona("c", "casual"), persona("d", "casual")];
const runs = [
  run("a", 1, "win", 30, { x: 9, t: 30 }),
  run("a", 2, "loss", 60, { x: -10.5, t: 60 }),
  run("b", 1, "loss", 10, { x: 10.5, t: 10 }),
  run("c", 1, "draw", 59.9, null),
  run("c", 2, "win", 20, { x: 0, t: 20 }),
  run("d", 1, "win", 40, { x: -20, t: 0 }),
];
const sessions: SessionEnd[] = [
  { p: "a", quit: { afterRound: 2, reason: "satisfied" } },
  { p: "b", quit: { afterRound: 1, reason: "frustration" } },
  { p: "c", quit: { afterRound: 2, reason: "cap" } },
  { p: "d", quit: { afterRound: 1, reason: "boredom" } },
];

test("totals, win rate and simulated hours", () => {
  const s = computeSummary(personas, runs, sessions);
  assert.equal(s.players, 4);
  assert.equal(s.rounds, 6);
  assert.deepEqual([s.wins, s.losses, s.draws], [3, 2, 1]);
  assert.equal(s.winRate, 0.5);
  assert.ok(Math.abs(s.simHours - 219.9 / 3600) < 1e-9);
});

test("quit curve is the fraction of players who played each round", () => {
  const s = computeSummary(personas, runs, sessions);
  assert.deepEqual(s.quitCurve, [{ round: 1, remaining: 1 }, { round: 2, remaining: 0.5 }]);
});

test("archetype quit rate counts only frustration and boredom", () => {
  const s = computeSummary(personas, runs, sessions);
  assert.equal(s.byArchetype.rusher.quitRate, 0.5); // b frustrated, a satisfied
  assert.equal(s.byArchetype.casual.quitRate, 0.5); // d bored, c hit the cap
  assert.equal(s.byArchetype.rusher.winRate, 1 / 3);
  assert.equal(s.byArchetype.rusher.avgDuration, 100 / 3);
  assert.deepEqual(s.quitReasons, { satisfied: 1, frustration: 1, cap: 1, boredom: 1 });
});

test("KO heatmap bins x over -10.5..10.5 and t up to the latest KO, clamping edges", () => {
  const { grid, xBins, tBins } = computeSummary(personas, runs, sessions).koHeat;
  assert.equal(xBins.length, 12);
  assert.equal(tBins.length, 6);
  assert.equal(tBins[1], 10);
  assert.equal(grid.flat().reduce((a, b) => a + b, 0), 5); // the draw has no KO
  assert.equal(grid[3][11], 1);  // x=9, t=30
  assert.equal(grid[5][0], 1);   // x=-10.5 at t=60 (the max) lands in the last t bin
  assert.equal(grid[1][11], 1);  // x=10.5 clamps into the last x bin
  assert.equal(grid[2][6], 1);   // x=0 is the first bin right of center
  assert.equal(grid[0][0], 1);   // x=-20 clamps left
});

test("duration histogram uses nice bins up to the 95th percentile with an overflow last bin", () => {
  const h = computeSummary(personas, runs, sessions).durationHist;
  assert.deepEqual(h.map((b) => b.bin), [0, 10, 20, 30, 40, 50]);
  assert.deepEqual(h.map((b) => b.count), [0, 1, 1, 1, 1, 2]); // 59.9 and 60 share the last bin
});

test("a timeout round longer than every KO does not stretch the KO time axis", () => {
  const s = computeSummary(personas, [...runs, run("d", 2, "draw", 99, null)], sessions);
  assert.equal(s.koHeat.tBins[1], 10);
});

test("empty input does not divide by zero", () => {
  const s = computeSummary([], [], []);
  assert.equal(s.winRate, 0);
  assert.deepEqual(s.quitCurve, []);
  assert.deepEqual(s.durationHist, []);
});

test("parseRunsJsonl splits session ends by the quit key", () => {
  const text = `${JSON.stringify(runs[0])}\n\n${JSON.stringify(sessions[0])}\n`;
  const out = parseRunsJsonl(text);
  assert.equal(out.runs.length, 1);
  assert.equal(out.sessions.length, 1);
});

test("replay token round-trips unicode and rejects junk", () => {
  const tok = { seed: 8812, tuning: null, fighter: "kai" as const, maxT: 60, persona: { ...persona("p1", "cheeser"), bio: "Mira — likes ✦ sweeps" } };
  const s = encodeToken(tok);
  assert.match(s, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeToken(s), tok);
  assert.equal(decodeToken("not-a-token"), null);
  assert.equal(decodeToken(encodeToken({ ...tok, fighter: "zed" } as never)), null);
  assert.equal(decodeToken(null), null);
});

test("rate limiter enforces per-minute and daily caps", () => {
  const check = createLimiter(2, 3);
  const t0 = Date.UTC(2026, 9, 28, 12);
  assert.equal(check("x", t0).ok, true);
  assert.equal(check("x", t0 + 1).ok, true);
  assert.equal(check("x", t0 + 2).ok, false);
  assert.equal(check("y", t0 + 3).ok, true);
  assert.equal(check("z", t0 + 4).ok, false); // daily cap of 3 hit
  assert.equal(check("x", t0 + 61_000).ok, false); // still capped for the day
  assert.equal(check("x", t0 + 86_400_000).ok, true); // next day resets
});

test("replay token rejects a persona or inputs field of the wrong shape (they come from the URL)", () => {
  const base = { seed: 1, tuning: null, fighter: "kai" as const, maxT: 10 };
  assert.equal(decodeToken(encodeToken({ ...base, persona: {} } as never)), null);
  assert.equal(decodeToken(encodeToken({ ...base, inputs: 5 } as never)), null);
  assert.deepEqual(decodeToken(encodeToken({ ...base, inputs: [[0, 1]] })), { ...base, inputs: [[0, 1]] });
});
