import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bootstrapRatio, brier, calibrationTable, claimGroups, claimInterval, rateInterval, wilson } from "./calibration";
import { computeMetric } from "../ai/verify";
import { parseRunsJsonl } from "./stats";
import type { Claim, Persona } from "./types";

test("brier: perfect, always-0.5 and confidently wrong", () => {
  assert.equal(brier([{ p: 1, y: 1 }, { p: 0, y: 0 }]), 0);
  assert.equal(brier([{ p: 0.5, y: 1 }, { p: 0.5, y: 0 }]), 0.25);
  assert.ok(Math.abs(brier([{ p: 0.9, y: 0 }]) - 0.81) < 1e-12);
  assert.ok(Number.isNaN(brier([])));
});

test("calibrationTable buckets by stated probability, last bucket includes 1", () => {
  const t = calibrationTable([{ p: 0.92, y: 1 }, { p: 0.92, y: 0 }, { p: 1, y: 1 }, { p: 0.3, y: 0 }]);
  assert.deepEqual(t.map((b) => b.n), [1, 0, 0, 2, 1]);
  assert.equal(t[3].observed, 0.5);
  assert.equal(t[4].observed, 1);
  assert.ok(Number.isNaN(t[1].meanP));
});

test("wilson: sensible at 0, n and the middle", () => {
  const [lo0, hi0] = wilson(0, 10);
  assert.equal(lo0, 0);
  assert.ok(hi0 > 0.25 && hi0 < 0.35); // 0.278
  const [lo, hi] = wilson(5, 10);
  assert.ok(Math.abs(lo + hi - 1) < 1e-12 && lo > 0.2 && lo < 0.25);
  assert.deepEqual(wilson(0, 0), [0, 1]);
  assert.equal(wilson(10, 10)[1], 1);
});

test("bootstrapRatio: deterministic, brackets the point estimate, narrows with more players", () => {
  const groups = Array.from({ length: 40 }, (_, i) => ({ k: i % 4 === 0 ? 3 : 1, n: 4 }));
  const a = bootstrapRatio(groups), b = bootstrapRatio(groups);
  assert.deepEqual(a, b);
  const point = groups.reduce((s, g) => s + g.k, 0) / groups.reduce((s, g) => s + g.n, 0);
  assert.ok(a[0] < point && point < a[1]);
  const wide = bootstrapRatio(groups.slice(0, 8));
  assert.ok(wide[1] - wide[0] > a[1] - a[0]);
});

test("claimGroups sums to the same value ai/verify.ts recomputes (fixture data)", () => {
  const personas = JSON.parse(readFileSync("data/fixtures-ai/personas.json", "utf8")) as Persona[];
  const { runs, sessions } = parseRunsJsonl(readFileSync("data/fixtures-ai/runs.jsonl", "utf8"));
  const claims: Claim[] = [
    { metric: "winRate", scope: { archetype: "rusher", round: 2 }, value: 0 },
    { metric: "quitRate", scope: { archetype: "turtle" }, value: 0 },
    { metric: "quitRate", scope: { round: 2 }, value: 0 },
    { metric: "koShare", scope: {}, value: 0 },
  ];
  for (const c of claims) {
    const g = claimGroups(c, personas, runs, sessions)!;
    const ratio = g.reduce((s, x) => s + x.k, 0) / g.reduce((s, x) => s + x.n, 0);
    assert.ok(Math.abs(ratio - computeMetric(c, personas, runs, sessions)!) < 1e-12, JSON.stringify(c));
    const iv = claimInterval(c, personas, runs, sessions)!;
    assert.ok(iv.lo <= ratio && ratio <= iv.hi);
  }
  assert.equal(claimGroups({ metric: "avgDuration", scope: {}, value: 0 }, personas, runs, sessions), null);
});

test("rateInterval: Wilson for quit rates, bootstrap for win rates, null for durations", () => {
  const personas = JSON.parse(readFileSync("data/fixtures-ai/personas.json", "utf8")) as Persona[];
  const { runs, sessions } = parseRunsJsonl(readFileSync("data/fixtures-ai/runs.jsonl", "utf8"));
  const quit: Claim = { metric: "quitRate", scope: { archetype: "turtle" }, value: 0 };
  const q = computeMetric(quit, personas, runs, sessions)!;
  const iv = rateInterval(quit, q, personas, runs)!;
  assert.deepEqual([iv.lo, iv.hi], wilson(Math.round(q * iv.players), iv.players));
  const win: Claim = { metric: "winRate", scope: {}, value: 0 };
  const w = rateInterval(win, computeMetric(win, personas, runs, sessions)!, personas, runs)!;
  assert.ok(w.lo < w.hi && w.players > 0);
  assert.equal(rateInterval({ metric: "avgDuration", scope: {}, value: 0 }, 30, personas, runs), null);
});
