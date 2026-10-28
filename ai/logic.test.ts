// npx tsx --test ai/*.test.ts  (no network)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Finding, Persona, RunLine, SessionEnd } from "../lib/types";
import { buildCorpus, estimateTokens } from "./corpus";
import { extractJson, retryDelayMs } from "./models";
import { RejectedInput, validateOracle, validateTuning } from "./nl";
import { archetypeCounts, ruleKey, validatePersona } from "./personas";
import { parseFindings } from "./report";
import { parseAction } from "./spotlight";
import { computeMetric, verifyFindings } from "./verify";

const personas: Persona[] = JSON.parse(readFileSync("data/fixtures-ai/personas.json", "utf8"));
const lines = readFileSync("data/fixtures-ai/runs.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));
const runs: RunLine[] = lines.filter((l) => !("quit" in l));
const sessions: SessionEnd[] = lines.filter((l) => "quit" in l);

test("archetype quota sums to n and follows the percentages", () => {
  for (const n of [1, 7, 100, 150, 1000]) assert.equal(Object.values(archetypeCounts(n)).reduce((s, c) => s + c, 0), n);
  assert.deepEqual(archetypeCounts(1000), { turtle: 120, rusher: 160, masher: 160, learner: 120, cheeser: 100, casual: 200, speedrunner: 60, explorer: 80 });
});

test("persona validator clamps numbers, drops bad rules, rejects unusable personas", () => {
  const p = validatePersona({
    name: " Mira ", skill: 1.7, reaction_ticks: 2.4, patience: 0.5, frustration_tolerance: -1,
    bio: "Night-shift nurse who blocks everything and panics when cornered",
    rules: [
      { dist: "close", weights: { kick: 12.4, punch: 0 } },   // clamped to 9 and 1
      { dist: "very close", weights: { kick: 3 } },           // bad dist -> dropped
      { weights: { fireball: 5 } },                            // unknown action -> dropped
      { rival: "recovery", weights: {} },                      // empty -> dropped
    ],
  }, "turtle")!;
  assert.equal(p.name, "Mira");
  assert.equal(p.skill, 1);
  assert.equal(p.reaction_ticks, 6);
  assert.equal(p.frustration_tolerance, 0);
  assert.deepEqual(p.rules, [{ dist: "close", weights: { kick: 9, punch: 1 } }]);
  assert.equal(validatePersona({ name: "X", skill: "high", reaction_ticks: 10, patience: 0.5, frustration_tolerance: 0.5, bio: "a b c d e f g h" }, "turtle"), null);
  assert.equal(validatePersona({ name: "X", skill: 0.5, reaction_ticks: 10, patience: 0.5, frustration_tolerance: 0.5, bio: "too short" }, "turtle"), null);
});

test("ruleKey ignores rule order and weight key order", () => {
  assert.equal(ruleKey([{ dist: "far", weights: { a: 1, b: 2 } as never }, { weights: { punch: 3 } }]), ruleKey([{ weights: { punch: 3 } }, { dist: "far", weights: { b: 2, a: 1 } as never }]));
});

test("extractJson takes the LAST fenced block (Ultra leaks drafts)", () => {
  assert.deepEqual(extractJson('thinking... ```json\n{"a":1}\n``` final:\n```json\n{"a":2}\n```'), { a: 2 });
  assert.deepEqual(extractJson('Sure: [1, 2]'), [1, 2]);
  assert.deepEqual(extractJson('```json\n{"a":3}\n```\nNote:\n```text\nnot json\n```'), { a: 3 }, "a trailing non-JSON fence is skipped");
  assert.throws(() => extractJson(""), /no JSON found/);
});

test("retry delay reads the wait hint from a 429 body", () => {
  assert.equal(retryDelayMs(429, "Rate limit exceeded. Please retry in 7 seconds.", 0), 7500);
  assert.ok(retryDelayMs(503, "", 2) >= 4000);
});

test("metrics match hand-checkable definitions on the fixture", () => {
  const rusherR2 = runs.filter((r) => r.round === 2 && personas.find((p) => p.id === r.p)!.archetype === "rusher");
  const wins = rusherR2.filter((r) => r.out === "win").length;
  assert.equal(computeMetric({ metric: "winRate", scope: { archetype: "rusher", round: 2 }, value: 0 }, personas, runs, sessions), wins / rusherR2.length);
  const sweeper = personas.find((p) => p.archetype === "cheeser")!.id;
  assert.ok(runs.filter((r) => r.p === sweeper).every((r) => r.out === "win"));
  assert.equal(computeMetric({ metric: "winRate", scope: { round: 9 }, value: 0 }, personas, runs, sessions), null);
});

test("verification catches a wrong claim and a fake seed, and caps confidence", () => {
  const real = runs.find((r) => r.round === 2)!;
  const other = runs.find((r) => r.round === 1 && r.p !== real.p)!;
  const f: Finding = {
    id: "f1", title: "t", severity: "high", kind: "difficulty", narrative: "n", suggestion: "s", confidence: 0.9,
    claims: [
      { metric: "winRate", scope: { archetype: "rusher", round: 2 }, value: 0.9 },  // wrong: rushers are crushed in round 2
      { metric: "quitRate", scope: { archetype: "rusher", round: 2 }, value: computeMetric({ metric: "quitRate", scope: { archetype: "rusher", round: 2 }, value: 0 }, personas, runs, sessions)! + 0.03 },
    ],
    seeds: [
      { p: real.p, round: real.round, seed: real.seed, why: "real" },
      { p: "p9999", round: 1, seed: 1, why: "fake player" },
      { p: real.p, round: real.round, seed: real.seed, why: "repeat" },
      { p: real.p, round: 99, seed: real.seed, why: "round never played" },
      { p: other.p, round: other.round, seed: other.seed + 1, why: "mistyped seed, real round" },
    ],
  };
  const v = verifyFindings([f], personas, runs, sessions);
  assert.deepEqual(v.findings[0].verified!.map((x) => x.ok), [false, true]);
  assert.equal(v.droppedSeeds, 3, "fake player, repeat and unplayed round are dropped");
  assert.equal(v.repairedSeeds, 1);
  assert.deepEqual(v.findings[0].seeds.map((s) => s.seed), [real.seed, other.seed], "mistyped seed is corrected from (player, round)");
  assert.equal(v.findings[0].confidence, 0.9);
  const noSeeds = verifyFindings([{ ...f, seeds: [{ p: "p9999", round: 1, seed: 1, why: "fake" }] }], personas, runs, sessions);
  assert.equal(noSeeds.findings[0].confidence, 0.3);
});

test("corpus keeps every player and seed under a tight budget, trimming detail first", () => {
  const full = buildCorpus(personas, runs, sessions);
  assert.ok(full.text.includes("!stuck@"));
  const tight = buildCorpus(personas, runs, sessions, { maxTokens: Math.round(full.tokenEstimate * 0.6) });
  assert.ok(tight.tokenEstimate <= Math.round(full.tokenEstimate * 0.6));
  for (const p of personas) assert.ok(tight.text.includes(`\n${p.id} `), `${p.id} missing`);
  for (const r of runs) assert.ok(tight.text.includes(` s${r.seed} `), `seed ${r.seed} missing`);
  assert.ok(tight.text.includes("!stuck@"), "bug events are the last thing trimmed");
  const tiny = buildCorpus(personas, runs, sessions, { maxTokens: 3000 });
  assert.match(tiny.text, /\d+ omitted from per-player lines/);
  assert.equal(tight.seedIndex.size, runs.length);
  assert.equal(estimateTokens("x".repeat(160)), 100);
});

test("parseFindings drops malformed findings and claims", () => {
  const out = parseFindings({ summary: "s", findings: [
    { title: "ok", severity: "high", kind: "exploit", narrative: "n", claims: [{ metric: "winRate", scope: { archetype: "cheeser" }, value: 0.6 }, { metric: "fun", scope: {}, value: 1 }, { metric: "winRate", scope: { archetype: "wizard" }, value: 1 }], seeds: [{ p: "p1", round: 1, seed: 5, why: "w" }, { p: "p1", seed: "x" }], suggestion: "x", confidence: 3 },
    { title: "bad severity", severity: "critical", kind: "bug", narrative: "n" },
  ] });
  assert.equal(out.findings.length, 1);
  assert.equal(out.findings[0].claims.length, 1);
  assert.equal(out.findings[0].seeds.length, 1);
  assert.equal(out.findings[0].confidence, 1);
});

test("oracle validator", () => {
  const o = validateOracle({ description: "player stuck blocking", combine: "all", atoms: [{ event: "stuck", who: 0, arg: "BLOCK", minDuration: 2 }] });
  assert.equal(o.atoms[0].event, "stuck");
  assert.throws(() => validateOracle({ description: "d", combine: "all", atoms: [{ event: "explode" }] }), /event must be one of/);
  assert.throws(() => validateOracle({ description: "d", combine: "both", atoms: [{ event: "hit" }] }), /combine/);
  assert.throws(() => validateOracle({ description: "d", combine: "all", atoms: [{ event: "hit", colour: "red" }] }), /unknown field/);
  assert.throws(() => validateOracle({ description: "d", combine: "all", atoms: [{ event: "hit", withinSeconds: [5, 2] }] }), /withinSeconds/);
  assert.throws(() => validateOracle({ error: "this is a recipe" }), RejectedInput);
});

test("tuning validator clamps to bounds and rejects unknown keys", () => {
  const t = validateTuning({ tuning: { "anim.SWEEP.recovery": 99, "anim.JAB.damage": 12 }, rationale: "r" });
  assert.deepEqual(t.tuning, { "anim.SWEEP.recovery": 1.52, "anim.JAB.damage": 12 });
  assert.throws(() => validateTuning({ tuning: { "anim.SWEEP.speed": 1 }, rationale: "r" }), /unknown tuning key/);
  assert.throws(() => validateTuning({ tuning: { "anim.JAB.damage": "+20%" }, rationale: "r" }), /absolute number/);
  assert.throws(() => validateTuning({ tuning: {}, rationale: "r" }), /no tuning keys/);
});

test("spotlight action parser", () => {
  assert.equal(parseAction("Sweep."), "sweep");
  assert.equal(parseAction(" low punch"), "low_punch");
  assert.equal(parseAction("I think we should kick"), null);
  assert.equal(parseAction(""), null);
});
