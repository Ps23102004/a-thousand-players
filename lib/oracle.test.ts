import { test } from "node:test";
import assert from "node:assert/strict";
import { matchOracle } from "./oracle";
import { fighterFor } from "./replay-token";
import type { Oracle, RunLine } from "./types";

const run = (ev: RunLine["ev"], over: Partial<RunLine> = {}): RunLine => ({
  p: "p1", round: 1, seed: 1, tuning: "base", out: "loss", t: 20, hp: [0, 50], ko: { x: 1, t: 20 }, ev, dmg: [0, 0], maxCombo: 0, mood: { frustration: 0, boredom: 0 }, ...over,
});
const o = (combine: Oracle["combine"], ...atoms: Oracle["atoms"]): Oracle => ({ description: "", combine, atoms });

test("event, who, arg and window filters", () => {
  const r = run([[5, "hit", 1, "SWEEP"], [9, "hit", 0, "JAB"], [12, "stuck", 0, "KNOCKDOWN"]]);
  assert.ok(matchOracle(o("all", { event: "hit", who: 1, arg: "sweep" }), r));
  assert.equal(matchOracle(o("all", { event: "hit", who: 1, arg: "JAB" }), r), null);
  assert.equal(matchOracle(o("all", { event: "hit", withinSeconds: [6, 20] , who: 1}), r), null);
  assert.ok(matchOracle(o("all", { event: "stuck", who: 0, arg: "knock" }), r));
});

test("minCount, combine all vs any, and gameplay minDuration", () => {
  const r = run([[1, "knockdown", 0], [4, "knockdown", 0], [30, "knockdown", 0]]);
  assert.ok(matchOracle(o("all", { event: "knockdown", minCount: 3 }), r));
  assert.equal(matchOracle(o("all", { event: "knockdown", minCount: 4 }), r), null);
  assert.equal(matchOracle(o("all", { event: "knockdown", minCount: 2, minDuration: 40 }), r), null);
  assert.ok(matchOracle(o("any", { event: "oob" }, { event: "knockdown", minCount: 2 }), r));
  assert.equal(matchOracle(o("all", { event: "oob" }, { event: "knockdown" }), r), null);
});

test("an arg on an event that never carries one is ignored", () => {
  assert.ok(matchOracle(o("all", { event: "airborne", who: 0, arg: "BLOCK" }), run([[10, "airborne", 0]])));
});

test("outcome atoms and invariant minDuration is not re-checked", () => {
  assert.ok(matchOracle(o("all", { event: "player_ko" }), run([])));
  assert.equal(matchOracle(o("all", { event: "rival_ko" }), run([])), null);
  assert.ok(matchOracle(o("all", { event: "timeout" }), run([], { ko: null, out: "draw", t: 99 })));
  assert.ok(matchOracle(o("all", { event: "airborne", minDuration: 3 }), run([[10, "airborne", 0]])));
});

test("fighterFor matches the engine rule", async () => {
  const engine = await import("../engine/crowd-worker-lib.mjs");
  for (let i = 0; i < 300; i++) { const id = `p${String(i).padStart(4, "0")}`; assert.equal(fighterFor(id), engine.fighterFor(id), id); }
  assert.deepEqual(new Set([fighterFor("p0537"), fighterFor("p0653")]), new Set(["kai", "rook"]));
});
