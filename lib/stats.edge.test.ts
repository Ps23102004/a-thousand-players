import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { computeSummary, parseRunsJsonl } from "./stats";
import type { Persona, RunLine, SessionEnd } from "./types";

const persona = (id: string, archetype: Persona["archetype"]): Persona => ({ id, name: id, archetype, skill: 0.5, reaction_ticks: 12, patience: 0.5, frustration_tolerance: 0.5, bio: "", rules: [] });
const run = (p: string, round: number, out: RunLine["out"], t: number, ko: RunLine["ko"] = null): RunLine => ({
  p, round, seed: round * 100, tuning: "base", out, t, hp: [0, 0], ko, ev: [], dmg: [0, 0], maxCombo: 0, mood: { frustration: 0, boredom: 0 },
});
const session = (p: string, reason: SessionEnd["quit"]["reason"], afterRound = 1): SessionEnd => ({ p, quit: { afterRound, reason } });
const deepFreeze = <T,>(x: T): T => { if (x && typeof x === "object") { Object.values(x).forEach(deepFreeze); Object.freeze(x); } return x; };

test("computeSummary neither mutates nor aliases its inputs", () => {
  const ps = deepFreeze([persona("a", "rusher")]), rs = deepFreeze([run("a", 1, "win", 10, { x: 0, t: 10 })]), ss = deepFreeze([session("a", "cap")]);
  const s = computeSummary(ps, rs, ss);
  assert.equal(s.rounds, 1);
  const s2 = computeSummary(ps, rs, ss);
  assert.deepEqual(s, s2, "pure");
});

test("an archetype with players but no rounds reports zeros, not NaN", () => {
  const s = computeSummary([persona("a", "rusher"), persona("b", "turtle")], [run("a", 1, "win", 20, { x: 0, t: 20 })], [session("a", "cap")]);
  assert.deepEqual(s.byArchetype.turtle, { players: 1, rounds: 0, winRate: 0, quitRate: 0, avgDuration: 0 });
  assert.equal(s.byArchetype.rusher.winRate, 1);
});

test("runs and sessions of unknown players still count in totals and quit reasons, but not in any archetype", () => {
  const s = computeSummary([persona("a", "rusher")], [run("a", 1, "win", 10), run("ghost", 1, "loss", 30)], [session("a", "cap"), session("ghost", "frustration")]);
  assert.equal(s.rounds, 2); assert.equal(s.sessions, 2);
  assert.deepEqual(s.quitReasons, { cap: 1, frustration: 1 });
  assert.equal(s.byArchetype.rusher.rounds, 1);
  assert.equal(s.byArchetype.rusher.quitRate, 0);
  assert.equal(Object.keys(s.byArchetype).length, 1);
});

test("a player with no session line is neither a quitter nor a stayer; quitRate divides by all players of the archetype", () => {
  const s = computeSummary([persona("a", "casual"), persona("b", "casual"), persona("c", "casual"), persona("d", "casual")], [], [session("a", "boredom"), session("b", "frustration"), session("c", "satisfied")]);
  assert.equal(s.byArchetype.casual.quitRate, 0.5);
});

test("outcomes: anything that is not win or loss is counted as a draw", () => {
  const s = computeSummary([], [run("a", 1, "win", 1), run("a", 2, "loss", 1), run("a", 3, "draw", 1), run("a", 4, "weird" as never, 1)], []);
  assert.deepEqual([s.wins, s.losses, s.draws], [1, 1, 2]);
  assert.equal(s.winRate, 0.25);
});

test("quit curve: players are counted per round from the runs; rounds nobody played show 0; denominator is the persona list", () => {
  const ps = [persona("a", "rusher"), persona("b", "rusher")];
  const s = computeSummary(ps, [run("a", 1, "win", 1), run("b", 1, "win", 1), run("a", 4, "win", 1), run("a", 4, "loss", 1)], []);
  assert.deepEqual(s.quitCurve, [{ round: 1, remaining: 1 }, { round: 2, remaining: 0 }, { round: 3, remaining: 0 }, { round: 4, remaining: 0.5 }], "two rounds by one player in round 4 count once");
  assert.deepEqual(computeSummary([], [run("a", 1, "win", 1)], []).quitCurve, [{ round: 1, remaining: 0 }], "no personas -> 0, not Infinity");
});

test("simHours sums round durations over 3600", () => {
  assert.equal(computeSummary([], [run("a", 1, "win", 1800), run("a", 2, "win", 1800)], []).simHours, 1);
  assert.equal(computeSummary([], [], []).simHours, 0);
});

test("KO heat: all KOs at t=0 give a zero-width time axis without NaN; x outside the arena clamps; no KO leaves an all-zero grid", () => {
  const z = computeSummary([], [run("a", 1, "win", 5, { x: 0, t: 0 }), run("a", 2, "win", 5, { x: 100, t: 0 }), run("a", 3, "win", 5, { x: -100, t: 0 })], []);
  assert.deepEqual(z.koHeat.tBins, [0, 0, 0, 0, 0, 0]);
  assert.equal(z.koHeat.grid[0].reduce((a, b) => a + b, 0), 3);
  assert.equal(z.koHeat.grid[0][0], 1); assert.equal(z.koHeat.grid[0][11], 1); assert.equal(z.koHeat.grid[0][6], 1);
  const none = computeSummary([], [run("a", 1, "draw", 99)], []);
  assert.equal(none.koHeat.grid.flat().reduce((a, b) => a + b, 0), 0);
  assert.equal(none.koHeat.xBins[0], -10.5); assert.equal(none.koHeat.xBins[11], -10.5 + 11 * 1.75);
});

test("KO heat bin edges: x on a bin boundary falls in the right-hand bin", () => {
  const rs = [-10.5, -8.75, -7, 10.4999, 7].map((x, i) => run("a", i + 1, "win", 5, { x, t: 1 }));
  const row = computeSummary([], rs, []).koHeat.grid[5]; // every KO is at t=1 = the latest KO, so they all land in the last time bin
  assert.deepEqual(row, [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1]);
});

test("duration histogram: bin width follows the p95 (nice steps), counts always sum to the number of rounds, last bin absorbs the tail", () => {
  const mk = (ts: number[]) => computeSummary([], ts.map((t, i) => run("a", i + 1, "win", t)), []).durationHist;
  const cases: [number[], number][] = [[[0], 1], [[5, 5, 5], 1], [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 1], [[10, 20, 30, 40, 50, 60, 70, 80, 90, 99], 10], [[200, 300, 700, 650, 640, 900], 60]];
  for (const [ts, width] of cases) {
    const h = mk(ts);
    assert.equal(h.reduce((s, b) => s + b.count, 0), ts.length, JSON.stringify(ts));
    assert.equal(h[1] ? h[1].bin - h[0].bin : width, width, `width for ${JSON.stringify(ts)}`);
    assert.equal(h[0].bin, 0);
  }
  const tail = mk([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 90]);
  assert.equal(tail.at(-1)!.count >= 1, true, "the single outlier lands in the last bin");
  assert.deepEqual(computeSummary([], [], []).durationHist, []);
});

test("parseRunsJsonl tolerates CRLF, trailing blank lines and indentation, and keeps file order", () => {
  const a = run("a", 1, "win", 5), b = run("a", 2, "loss", 6), q = session("a", "cap", 2);
  const text = `${JSON.stringify(a)}\r\n\r\n  ${JSON.stringify(b)}  \r\n${JSON.stringify(q)}\r\n\r\n\r\n`;
  const out = parseRunsJsonl(text);
  assert.deepEqual(out.runs.map((r) => r.round), [1, 2]);
  assert.deepEqual(out.sessions, [q]);
  assert.deepEqual(parseRunsJsonl(""), { runs: [], sessions: [] });
  assert.deepEqual(parseRunsJsonl("\n \n\t\n"), { runs: [], sessions: [] });
});

test("parseRunsJsonl throws on corrupt lines instead of silently dropping data", () => {
  assert.throws(() => parseRunsJsonl('{"p":"a"'), SyntaxError);
  assert.throws(() => parseRunsJsonl("not json"), SyntaxError);
  assert.throws(() => parseRunsJsonl("null"), TypeError);
  assert.throws(() => parseRunsJsonl("5"), TypeError);
});

// ------------------------------------------------------------------ invariants on the shipped dataset and the fixtures
for (const name of ["data/run-main", "data/fixtures"]) {
  const base = new URL(`../${name}/`, import.meta.url);
  const have = existsSync(new URL("runs.jsonl", base)) && existsSync(new URL("personas.json", base));
  test(`${name}: summary invariants hold on the real files`, { skip: have ? false : `no ${name}` }, () => {
    const personas: Persona[] = JSON.parse(readFileSync(new URL("personas.json", base), "utf8"));
    const parsed = parseRunsJsonl(readFileSync(new URL("runs.jsonl", base), "utf8"));
    const extra: SessionEnd[] = existsSync(new URL("sessions.json", base)) ? JSON.parse(readFileSync(new URL("sessions.json", base), "utf8")) : [];
    const sessions = [...parsed.sessions, ...extra], runs = parsed.runs;
    const s = computeSummary(personas, runs, sessions);
    assert.equal(s.players, personas.length); assert.equal(s.rounds, runs.length); assert.equal(s.sessions, sessions.length);
    assert.equal(s.wins + s.losses + s.draws, s.rounds);
    assert.equal(s.winRate, s.wins / s.rounds);
    assert.equal(Object.values(s.byArchetype).reduce((a, b) => a + b.players, 0), personas.length);
    assert.equal(Object.values(s.byArchetype).reduce((a, b) => a + b.rounds, 0), runs.filter((r) => personas.some((p) => p.id === r.p)).length);
    for (const a of Object.values(s.byArchetype)) { for (const v of [a.winRate, a.quitRate]) assert.ok(v >= 0 && v <= 1); assert.ok(a.avgDuration >= 0 && a.avgDuration <= 99.01); }
    assert.equal(s.quitCurve[0]?.remaining, new Set(runs.filter((r) => r.round === 1).map((r) => r.p)).size / personas.length);
    for (let i = 1; i < s.quitCurve.length; i++) assert.ok(s.quitCurve[i].remaining <= s.quitCurve[i - 1].remaining + 1e-12, "players never come back after quitting");
    assert.equal(Object.values(s.quitReasons).reduce((a, b) => a + b, 0), sessions.length);
    assert.equal(s.koHeat.grid.flat().reduce((a, b) => a + b, 0), runs.filter((r) => r.ko).length);
    assert.equal(s.koHeat.grid.length, 6); assert.ok(s.koHeat.grid.every((row) => row.length === 12));
    assert.equal(s.durationHist.reduce((a, b) => a + b.count, 0), runs.length);
    assert.ok(Math.abs(s.simHours - runs.reduce((a, r) => a + r.t, 0) / 3600) < 1e-9);
    assert.deepEqual(computeSummary(personas, runs, sessions), s, "deterministic");
  });
}
