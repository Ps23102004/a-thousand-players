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
  assert.deepEqual(new Set(one.clean.map((r) => r.matchedTo)), new Set(one.flagged.map((r) => r.key)));
  const available = runs.filter((r) => r.ev.length === 0);
  for (const bug of one.flagged) {
    const match = one.clean.find((r) => r.matchedTo === bug.key)!;
    assert.ok(match);
    const sameArchetype = available.filter((r) => personas.find((p) => p.id === r.p)?.archetype === bug.archetype);
    const candidates = sameArchetype.length ? sameArchetype : available;
    assert.ok(candidates.some((r) => `${r.p}:${r.round}` === match.key));
    assert.equal(Math.abs(match.duration - bug.duration), Math.min(...candidates.map((r) => Math.abs(r.t - bug.duration))));
    available.splice(available.findIndex((r) => `${r.p}:${r.round}` === match.key), 1);
  }
  assert.deepEqual(new Set(one.flagged.flatMap((r) => r.types)), new Set(["airborne", "oob", "clip", "stuck", "nan", "softlock"]));
});

for (const [answer, expected] of [
  ["YES, frame 2 shows a floating fighter", "yes"], ["No, nothing looks wrong", "no"],
  ["yes.", "yes"], ["  YES", "yes"], ["NO", "no"],
  ["NOTICE something", "unparseable"], ["YESterday", "unparseable"],
  ["I think yes", "unparseable"], ["Maybe", "unparseable"],
  ["YES/NO", "unparseable"], ["NO/YES", "unparseable"],
  ["YES-NO", "unparseable"], ["NO-YES", "unparseable"],
  [" yes / no, uncertain", "unparseable"], ["NO - YES", "unparseable"],
  ["YES/nope", "yes"], ["NO-issue", "no"],
  [undefined, "unparseable"], [null, "unparseable"], [42, "unparseable"],
  [{}, "unparseable"], [[], "unparseable"], [true, "unparseable"],
  ["", "unparseable"], ["  ", "unparseable"],
] as const) {
  test(`parsing ${JSON.stringify(answer)} returns ${expected}`, () => {
    assert.equal(parseGlitchAnswer(answer), expected);
  });
}

for (const [yes, total, lower, upper] of [
  [8, 10, .490, .943], [2, 10, .057, .510], [0, 10, 0, .278],
  [10, 10, .722, 1], [1, 2, .095, .905],
] as const) {
  test(`Wilson 95% interval for ${yes}/${total} matches independent reference values`, () => {
    const interval = wilson95(yes, total);
    assert.equal(Number(interval[0].toFixed(3)), lower);
    assert.equal(Number(interval[1].toFixed(3)), upper);
  });
}

test("Wilson intervals stay within [0, 1] with exact endpoints for zero and all successes", () => {
  assert.deepEqual(wilson95(0, 0), [0, 0]);
  for (const total of [1, 2, 3, 10, 100, 1000]) {
    assert.equal(wilson95(0, total)[0], 0);
    assert.equal(wilson95(total, total)[1], 1);
    for (let yes = 0; yes <= total; yes++) {
      const [lower, upper] = wilson95(yes, total);
      assert.ok(lower >= 0 && lower <= upper && upper <= 1, `${yes}/${total}: ${lower}, ${upper}`);
    }
  }
});

test("clean matching prefers archetype before duration, then the nearest duration", () => {
  const result = selectGlitchBatch([
    run("p0537", 1, 20, [10, "airborne", 0]),
    run("p2", 1, 20), run("p3", 1, 50), run("p3", 2, 24), run("p3", 3, 10),
  ], personas, { seed: 17, perTruth: 1 });
  assert.equal(result.clean.length, 1);
  assert.equal(result.clean[0].matchedTo, "p0537:1");
  assert.equal(result.clean[0].archetype, "rusher");
  assert.equal(result.clean[0].key, "p3:2");
});

test("scoring reports aggregate, Wilson intervals, unparseable misses, and bug-type breakdown", () => {
  const score = scoreGlitchBatch([
    { key: "a", seed: 1, truth: "flagged", types: ["airborne"], answer: "YES" },
    { key: "b", seed: 2, truth: "flagged", types: ["oob"], answer: "garbage" },
    { key: "c", seed: 3, truth: "clean", types: [], answer: "YES" },
    { key: "d", seed: 4, truth: "clean", types: [], answer: "NO" },
  ]);
  for (const [rate, unparseable] of [[score.overall.hit, 1], [score.overall.falseAlarm, 0]] as const) {
    assert.equal(rate.yes, 1);
    assert.equal(rate.total, 2);
    assert.equal(rate.rate, .5);
    assert.equal(rate.unparseable, unparseable);
    assert.equal(Number(rate.interval[0].toFixed(3)), .095);
    assert.equal(Number(rate.interval[1].toFixed(3)), .905);
  }
  assert.equal(score.byType.airborne.hit.yes, 1);
  assert.equal(score.byType.oob.hit.yes, 0);
});

test("unparseable answers remain misses and non-alarms and are reported in both groups and matched types", () => {
  const score = scoreGlitchBatch([
    { key: "a", seed: 1, truth: "flagged", types: ["airborne"], answer: "YES" },
    { key: "b", seed: 2, truth: "flagged", types: ["airborne"], answer: undefined },
    { key: "c", seed: 3, truth: "clean", types: [], matchedTo: "a", answer: "YES" },
    { key: "d", seed: 4, truth: "clean", types: [], matchedTo: "b", answer: null },
    { key: "e", seed: 5, truth: "flagged", types: ["oob"], answer: "NO" },
    { key: "f", seed: 6, truth: "clean", types: [], matchedTo: "e", answer: "NO" },
    { key: "g", seed: 7, truth: "flagged", types: ["oob"], answer: "YES/NO" },
    { key: "h", seed: 8, truth: "clean", types: [], matchedTo: "g", answer: "" },
  ]);
  for (const rate of [score.overall.hit, score.overall.falseAlarm]) {
    assert.equal(rate.yes, 1);
    assert.equal(rate.total, 4);
    assert.equal(rate.rate, .25);
    assert.equal(rate.unparseable, 2);
  }
  for (const rate of [score.byType.airborne.hit, score.byType.airborne.falseAlarm]) {
    assert.equal(rate.yes, 1);
    assert.equal(rate.total, 2);
    assert.equal(rate.rate, .5);
    assert.equal(rate.unparseable, 1);
  }
  for (const rate of [score.byType.oob.hit, score.byType.oob.falseAlarm]) {
    assert.equal(rate.yes, 0);
    assert.equal(rate.total, 2);
    assert.equal(rate.rate, 0);
    assert.equal(rate.unparseable, 1);
  }
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
