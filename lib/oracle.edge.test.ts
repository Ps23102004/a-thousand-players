import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { atomMatches, EVENT_CAP, matchOracle } from "./oracle";
import { parseRunsJsonl } from "./stats";
import type { Ev, Oracle, OracleAtom, RunLine } from "./types";

const run = (ev: RunLine["ev"], over: Partial<RunLine> = {}): RunLine => ({
  p: "p1", round: 1, seed: 1, tuning: "base", out: "loss", t: 20, hp: [0, 50], ko: { x: 1, t: 20 }, ev, dmg: [0, 0], maxCombo: 0, mood: { frustration: 0, boredom: 0 }, ...over,
});
const o = (combine: Oracle["combine"], ...atoms: OracleAtom[]): Oracle => ({ description: "", combine, atoms });
const times = (evs: Ev[] | null) => evs?.map((e) => e[0]);

test("EVENT_CAP is the cap the engine really applies", () => {
  const src = readFileSync(new URL("../engine/sim.mjs", import.meta.url), "utf8");
  assert.ok(src.includes(`sim.events.length < ${EVENT_CAP}`), "engine/sim.mjs push() cap drifted from lib/oracle.ts EVENT_CAP");
  assert.equal(EVENT_CAP, 220);
});

// ------------------------------------------------------------------ event atoms
test("who filter: 0 only the player, 1 only the rival, omitted both", () => {
  const r = run([[1, "hit", 0, "JAB"], [2, "hit", 1, "JAB"], [3, "hit", 1, "HOOK"]]);
  assert.deepEqual(times(atomMatches({ event: "hit", who: 0 }, r)), [1]);
  assert.deepEqual(times(atomMatches({ event: "hit", who: 1 }, r)), [2, 3]);
  assert.deepEqual(times(atomMatches({ event: "hit" }, r)), [1, 2, 3]);
});

test("arg is a case-insensitive substring match against the event arg, stringifying numbers", () => {
  const r = run([[1, "hit", 1, "ROUNDHOUSE_KICK"], [2, "hit", 1, "jab"], [3, "stuck", 0, "KNOCKDOWN"], [4, "hit", 1]]);
  assert.deepEqual(times(atomMatches({ event: "hit", arg: "KICK" }, r)), [1]);
  assert.deepEqual(times(atomMatches({ event: "hit", arg: "round" }, r)), [1]);
  assert.deepEqual(times(atomMatches({ event: "hit", arg: "JAB" }, r)), [2]);
  assert.deepEqual(times(atomMatches({ event: "hit", arg: "" }, r)), [1, 2, 4], "empty arg matches every hit, including one without an arg");
  assert.deepEqual(times(atomMatches({ event: "hit", arg: "nothing" }, r)), []);
  assert.deepEqual(times(atomMatches({ event: "stuck", arg: "down" }, r)), [3]);
  assert.deepEqual(times(atomMatches({ event: "hit", arg: "0" }, run([[1, "hit", 0, 0 as unknown as string]]))), [1], "numeric args are stringified");
});

test("arg on events that never carry one (oob, airborne, knockdown, block, ...) is ignored, not a filter", () => {
  for (const event of ["oob", "airborne", "knockdown", "block", "parry", "nan", "clip", "combo", "mount", "prop"] as const) {
    assert.equal(atomMatches({ event, arg: "zzz" }, run([[5, event, 0, 11.2]])).length, 1, event);
  }
});

test("withinSeconds is inclusive on both ends; an inverted range matches nothing", () => {
  const r = run([[5, "hit", 0], [10, "hit", 0], [10.01, "hit", 0]]);
  assert.deepEqual(times(atomMatches({ event: "hit", withinSeconds: [5, 10] }, r)), [5, 10]);
  assert.deepEqual(times(atomMatches({ event: "hit", withinSeconds: [10, 10] }, r)), [10]);
  assert.deepEqual(times(atomMatches({ event: "hit", withinSeconds: [10, 5] }, r)), []);
  assert.deepEqual(times(atomMatches({ event: "hit", withinSeconds: [0, 4.99] }, r)), []);
});

test("minCount counts only events passing the other filters", () => {
  const r = run([[1, "hit", 0], [2, "hit", 1], [3, "hit", 1], [30, "hit", 1]]);
  assert.equal(atomMatches({ event: "hit", who: 1, minCount: 3 }, r).length, 3);
  assert.equal(atomMatches({ event: "hit", who: 1, minCount: 4 }, r).length, 0);
  assert.equal(atomMatches({ event: "hit", who: 1, minCount: 3, withinSeconds: [0, 10] }, r).length, 0, "only two inside the window");
});

test("minDuration for gameplay events is the span first..last (inclusive); one event spans 0 s", () => {
  const r = run([[10, "knockdown", 0], [14, "knockdown", 0], [20, "knockdown", 0]]);
  assert.equal(atomMatches({ event: "knockdown", minDuration: 10 }, r).length, 3);
  assert.equal(atomMatches({ event: "knockdown", minDuration: 10.01 }, r).length, 0);
  assert.equal(atomMatches({ event: "knockdown", minDuration: 0 }, r).length, 3, "0 means no duration condition");
  assert.equal(atomMatches({ event: "knockdown", minDuration: 1 }, run([[10, "knockdown", 0]])).length, 0);
});

test("minDuration is never re-checked for the invariant events (their engine threshold is the duration)", () => {
  for (const event of ["stuck", "oob", "nan", "clip", "airborne", "softlock", "crash"] as const) {
    assert.equal(atomMatches({ event, minDuration: 999 }, run([[3, event, 0]])).length, 1, event);
  }
});

test("empty event list and unknown event names match nothing", () => {
  assert.deepEqual(atomMatches({ event: "hit" }, run([])), []);
  assert.deepEqual(atomMatches({ event: "teleport" as never }, run([[1, "hit", 0]])), []);
});

// ------------------------------------------------------------------ outcome atoms
test("player_ko needs a loss, a recorded KO and hp <= 0; a loss on points (timeout) is not a KO", () => {
  assert.equal(atomMatches({ event: "player_ko" }, run([], { out: "loss", hp: [0, 40], ko: { x: 0, t: 12 } })).length, 1);
  assert.equal(atomMatches({ event: "player_ko" }, run([], { out: "loss", hp: [10, 40], ko: null, t: 99 })).length, 0);
  assert.equal(atomMatches({ event: "player_ko" }, run([], { out: "loss", hp: [10, 40], ko: { x: 0, t: 12 } })).length, 0, "hp still positive");
  assert.equal(atomMatches({ event: "player_ko" }, run([], { out: "win", hp: [50, 0], ko: { x: 0, t: 12 } })).length, 0);
});

test("rival_ko is the mirror: a win with the rival at 0 hp", () => {
  assert.equal(atomMatches({ event: "rival_ko" }, run([], { out: "win", hp: [50, 0], ko: { x: 0, t: 12 } })).length, 1);
  assert.equal(atomMatches({ event: "rival_ko" }, run([], { out: "win", hp: [50, 10], ko: null, t: 99 })).length, 0);
  assert.equal(atomMatches({ event: "rival_ko" }, run([], { out: "loss", hp: [0, 40], ko: { x: 0, t: 12 } })).length, 0);
});

test("timeout: no KO and the round ran to 98 s or more", () => {
  const to = (t: number, ko: RunLine["ko"] = null) => run([], { out: "draw", t, ko });
  assert.equal(atomMatches({ event: "timeout" }, to(98)).length, 1);
  assert.equal(atomMatches({ event: "timeout" }, to(99)).length, 1);
  assert.equal(atomMatches({ event: "timeout" }, to(97.99)).length, 0);
  assert.equal(atomMatches({ event: "timeout" }, to(99, { x: 0, t: 99 })).length, 0, "a KO in the last second is not a timeout");
});

test("outcome atoms honour withinSeconds against the KO time (or the round length for a timeout) and ignore who/minCount", () => {
  const ko = run([], { out: "loss", hp: [0, 50], ko: { x: 0, t: 12 }, t: 12 });
  assert.equal(atomMatches({ event: "player_ko", withinSeconds: [10, 15] }, ko).length, 1);
  assert.equal(atomMatches({ event: "player_ko", withinSeconds: [13, 15] }, ko).length, 0);
  assert.equal(atomMatches({ event: "player_ko", withinSeconds: [0, 12] }, ko).length, 1, "inclusive");
  assert.equal(atomMatches({ event: "player_ko", who: 1, minCount: 5 }, ko).length, 1, "who/minCount have no meaning for outcomes");
  assert.equal(atomMatches({ event: "timeout", withinSeconds: [0, 50] }, run([], { out: "draw", ko: null, t: 99 })).length, 0);
});

test("an outcome match returns one pseudo 'hit' event stamped at the KO time", () => {
  const evs = atomMatches({ event: "player_ko" }, run([], { out: "loss", hp: [0, 50], ko: { x: 0, t: 12.34 } }));
  assert.deepEqual(evs, [[12.34, "hit", 0]]);
});

// ------------------------------------------------------------------ combining
test("all: every atom must hold; any: at least one; the result merges and time-sorts the matching events", () => {
  const r = run([[9, "hit", 1, "SWEEP"], [3, "knockdown", 0], [6, "oob", 1, 11]], { out: "loss", hp: [0, 50], ko: { x: 0, t: 20 } });
  const all = matchOracle(o("all", { event: "knockdown" }, { event: "oob" }, { event: "hit", arg: "sweep" }), r);
  assert.deepEqual(all?.map((e) => e[1]), ["knockdown", "oob", "hit"], "sorted by time even though atoms were listed in another order");
  assert.equal(matchOracle(o("all", { event: "knockdown" }, { event: "airborne" }), r), null);
  const any = matchOracle(o("any", { event: "airborne" }, { event: "oob" }), r);
  assert.deepEqual(any?.map((e) => e[1]), ["oob"], "only the atoms that held contribute");
  assert.equal(matchOracle(o("any", { event: "airborne" }, { event: "clip" }), r), null);
});

test("outcome atoms combine with gameplay atoms", () => {
  const r = run([[18, "stuck", 0, "KNOCKDOWN"]], { out: "loss", hp: [0, 50], ko: { x: 0, t: 20 } });
  const hit = matchOracle(o("all", { event: "stuck" }, { event: "player_ko" }), r);
  assert.deepEqual(hit?.map((e) => e[0]), [18, 20]);
  assert.equal(matchOracle(o("all", { event: "stuck" }, { event: "rival_ko" }), r), null);
});

test("the same event matched by two atoms appears twice in the merged list", () => {
  const evs = matchOracle(o("all", { event: "hit" }, { event: "hit", who: 0 }), run([[1, "hit", 0]]));
  assert.equal(evs?.length, 2);
});

test("an oracle with no atoms: 'any' never fires, 'all' fires on every round (vacuous truth; ai/nl.ts rejects 0 atoms before it gets here)", () => {
  assert.equal(matchOracle(o("any"), run([[1, "hit", 0]])), null);
  assert.deepEqual(matchOracle(o("all"), run([])), []);
});

test("matching does not mutate the run or the oracle", () => {
  const r = run([[9, "hit", 1, "A"], [3, "hit", 0, "B"]]), orc = o("all", { event: "hit" });
  const before = JSON.stringify([r, orc]);
  matchOracle(orc, r);
  assert.equal(JSON.stringify([r, orc]), before);
});

// ------------------------------------------------------------------ against the shipped crowd
const runsPath = new URL("../data/run-main/runs.jsonl", import.meta.url);
test("on the shipped run-main data, atom counts equal an independent count over the raw lines", { skip: existsSync(runsPath) ? false : "no data/run-main" }, () => {
  const { runs } = parseRunsJsonl(readFileSync(runsPath, "utf8"));
  const count = (orc: Oracle) => runs.filter((r) => matchOracle(orc, r)).length;
  const raw = (pred: (r: RunLine) => boolean) => runs.filter(pred).length;
  assert.ok(runs.length > 1000);
  assert.equal(count(o("all", { event: "airborne" })), raw((r) => r.ev.some((e) => e[1] === "airborne")));
  assert.equal(count(o("all", { event: "knockdown", who: 0, minCount: 3 })), raw((r) => r.ev.filter((e) => e[1] === "knockdown" && e[2] === 0).length >= 3));
  assert.equal(count(o("all", { event: "player_ko" })), raw((r) => r.out === "loss" && r.ko !== null && r.hp[0] <= 0));
  assert.equal(count(o("all", { event: "rival_ko" })), raw((r) => r.out === "win" && r.ko !== null && r.hp[1] <= 0));
  assert.equal(count(o("all", { event: "timeout" })), raw((r) => r.ko === null && r.t >= 98));
  assert.equal(count(o("any", { event: "oob" }, { event: "airborne" }, { event: "stuck" }, { event: "softlock" })), raw((r) => r.ev.some((e) => ["oob", "airborne", "stuck", "softlock"].includes(e[1]))));
  assert.equal(count(o("all", { event: "hit", who: 1, arg: "sweep", minCount: 2 })), raw((r) => r.ev.filter((e) => e[1] === "hit" && e[2] === 1 && String(e[3] ?? "").toLowerCase().includes("sweep")).length >= 2));
  assert.equal(count(o("all", { event: "player_ko" }, { event: "rival_ko" })), 0, "a round cannot be both");
});
