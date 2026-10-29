import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { parseGlitchAnswer, scoreGlitchBatch, selectGlitchBatch, wilson95 } from "./glitch";
import type { Persona, RunLine } from "../lib/types";

const personas: Persona[] = [
  { id: "p0537", name: "Float", archetype: "rusher", skill: .5, reaction_ticks: 12, patience: .5, frustration_tolerance: .5, bio: "", rules: [] },
  { id: "p2", name: "Two", archetype: "turtle", skill: .5, reaction_ticks: 12, patience: .5, frustration_tolerance: .5, bio: "", rules: [] },
  { id: "p3", name: "Three", archetype: "rusher", skill: .5, reaction_ticks: 12, patience: .5, frustration_tolerance: .5, bio: "", rules: [] },
];
const run = (p: string, round: number, t: number, event?: RunLine["ev"][number]): RunLine => ({
  p, round, seed: round * 100, tuning: "base", out: "loss", t, hp: [0, 0], ko: null,
  ev: event ? [event] : [], dmg: [0, 0], maxCombo: 0, mood: { frustration: 0, boredom: 0 },
});
const runs = [
  run("p0537", 1, 20, [10, "airborne", 0]), run("p2", 1, 25, [10, "oob", 0]),
  run("p3", 1, 30, [10, "clip", 0]), run("p2", 2, 35, [10, "stuck", 0]),
  run("p3", 2, 40, [10, "nan", 0]), run("p2", 3, 45, [10, "softlock", 0]),
  run("p0537", 2, 21), run("p2", 4, 26), run("p3", 3, 31), run("p2", 5, 36), run("p3", 4, 41), run("p2", 6, 46),
];

test("selection is seeded, stratified, includes p0537:1, and pairs clean rounds", () => {
  const one = selectGlitchBatch(runs, personas, { seed: 17, perTruth: 6 });
  const two = selectGlitchBatch(runs, personas, { seed: 17, perTruth: 6 });
  assert.deepEqual(one, two);
  assert.equal(one.flagged.length, 6);
  assert.equal(one.clean.length, 6);
  assert.ok(one.flagged.some((r) => r.key === "p0537:1"));
  assert.equal(new Set(one.clean.map((r) => r.key)).size, 6);
  assert.ok(one.clean.every((r) => r.types.length === 0));
  assert.deepEqual(new Set(one.flagged.flatMap((r) => r.types)), new Set(["airborne", "oob", "clip", "stuck", "nan", "softlock"]));
});

test("strict YES/NO parsing rejects prose and treats a first-word answer as decisive", () => {
  assert.equal(parseGlitchAnswer("YES, frame 2 shows a floating fighter"), "yes");
  assert.equal(parseGlitchAnswer(" no, nothing looks wrong"), "no");
  assert.equal(parseGlitchAnswer("I think yes"), "unparseable");
  assert.equal(parseGlitchAnswer("Maybe"), "unparseable");
});

test("scoring reports aggregate, Wilson intervals, unparseable misses, and bug-type breakdown", () => {
  const score = scoreGlitchBatch([
    { key: "a", seed: 1, truth: "flagged", types: ["airborne"], answer: "YES" },
    { key: "b", seed: 2, truth: "flagged", types: ["oob"], answer: "garbage" },
    { key: "c", seed: 3, truth: "clean", types: [], answer: "YES" },
    { key: "d", seed: 4, truth: "clean", types: [], answer: "NO" },
  ]);
  assert.deepEqual(score.overall.hit, { yes: 1, total: 2, rate: .5, interval: wilson95(1, 2), unparseable: 1 });
  assert.deepEqual(score.overall.falseAlarm, { yes: 1, total: 2, rate: .5, interval: wilson95(1, 2), unparseable: 0 });
  assert.equal(score.byType.airborne.hit.yes, 1);
  assert.equal(score.byType.oob.hit.yes, 0);
});

test("crash events cannot enter the clean control pool", () => {
  const result = selectGlitchBatch([...runs, run("p0537", 7, 20, [5, "crash", 0])], personas, { seed: 17, perTruth: 6 });
  assert.ok(!result.clean.some((r) => r.key === "p0537:7"));
});

test("per-type false alarms use clean controls matched to flagged rounds", () => {
  const score = scoreGlitchBatch([
    { key: "a", seed: 1, truth: "flagged", types: ["airborne"], answer: "NO" },
    { key: "c", seed: 2, truth: "clean", types: [], matchedTo: "a", answer: "YES" },
  ]);
  assert.equal(score.byType.airborne.falseAlarm.yes, 1);
  assert.equal(score.byType.airborne.hit.total, 1);
});

test("score block renders both placeholder and measured results", async () => {
  const React = await import("react");
  const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as { renderToStaticMarkup: (element: React.ReactElement) => string };
  const { default: GlitchScore } = await import("../app/bugs/GlitchScore");
  const placeholder = renderToStaticMarkup(React.createElement(GlitchScore, { data: { placeholder: true, results: [] } }));
  assert.match(placeholder, /not run yet/);
  const measured = renderToStaticMarkup(React.createElement(GlitchScore, { data: { placeholder: false, results: [
    { key: "a", seed: 1, truth: "flagged", types: ["airborne"], answer: "YES" },
    { key: "b", seed: 2, truth: "clean", types: [], answer: "NO" },
  ] } }));
  assert.match(measured, /Hit rate: 1\/1/);
  assert.match(measured, /False-alarm rate: 0\/1/);
});


test("fake results are labeled in the score block", async () => {
  const React = await import("react");
  const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as { renderToStaticMarkup: (element: React.ReactElement) => string };
  const { default: GlitchScore } = await import("../app/bugs/GlitchScore");
  const html = renderToStaticMarkup(React.createElement(GlitchScore, { data: { placeholder: false, source: "fake", results: [] } }));
  assert.match(html, /fake/i);
});
