// npx tsx --test ai/flows.test.ts  (no network: global fetch is replaced by a fake Token Factory + Tavily)
// Covers the model-calling flows end to end: retry/repair loops, validators, and the code checks run on model output.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, beforeEach, test } from "node:test";
import { ARCHETYPES, type Archetype, type Finding, type Findings, type Persona, type RunLine, type SessionEnd } from "../lib/types";
import { proposeStrategies, validateStrategy, type Scored } from "./exploit";
import { NANO, SUPER, ULTRA, VL } from "./models";
import { bugReportToOracle, patchNotesToTuning, RejectedInput, TUNING_SPECS, validateOracle, validateTuning } from "./nl";
import { archetypeCounts, generatePersonas, lastPersonaStats, validatePersona } from "./personas";
import { attachPrecedent, precedentQuery } from "./precedent";
import { analyzeCrowd } from "./report";
import { triageBug, validatePatches, type BugCluster } from "./triage";
import { computeMetric } from "./verify";
import { describeFrames } from "./vision";

process.env.NEBIUS_API_KEY = "test-key-not-real";
process.env.TAVILY_API_KEY = "test-key-not-real";
const realFetch = globalThis.fetch;
const realError = console.error;

interface Call { url: string; body: Record<string, any> }
let calls: Call[] = [];
let respond: (c: Call, n: number) => Response | Promise<Response>;

const reply = (content: string) => Response.json({ choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 20 } });
const fenced = (o: unknown) => "```json\n" + JSON.stringify(o) + "\n```";
const userText = (c: Call) => { const m = c.body.messages.at(-1).content; return typeof m === "string" ? m : m[0].text; };

beforeEach(() => {
  calls = [];
  console.error = () => {}; // the flows log progress and failures on stderr
  globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    if (!url.startsWith("https://api.tokenfactory.nebius.com/") && !url.startsWith("https://api.tavily.com/")) throw new Error(`unexpected fetch to ${url}`);
    const c = { url, body: JSON.parse(String(init.body)) };
    calls.push(c);
    return respond(c, calls.length);
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; console.error = realError; });

// ---------- nl.ts ----------

const goodOracle = { description: "Sweep knockdown leaves the player stuck", combine: "all", atoms: [{ event: "knockdown", who: 0 }, { event: "stuck", who: 0, minDuration: 10, arg: "KNOCKDOWN" }] };

test("validateOracle edge cases", () => {
  assert.deepEqual(validateOracle({ ...goodOracle, description: "  padded  " }).description, "padded");
  assert.throws(() => validateOracle(null), /expected a JSON object/);
  assert.throws(() => validateOracle("str"), /expected a JSON object/);
  assert.throws(() => validateOracle({ error: "not about the game" }), RejectedInput);
  assert.throws(() => validateOracle({ ...goodOracle, description: "   " }), /description/);
  assert.throws(() => validateOracle({ ...goodOracle, combine: "some" }), /combine/);
  assert.throws(() => validateOracle({ ...goodOracle, atoms: [] }), /1-6 atoms/);
  assert.throws(() => validateOracle({ ...goodOracle, atoms: Array(7).fill({ event: "hit" }) }), /1-6 atoms/);
  assert.equal(validateOracle({ ...goodOracle, atoms: Array(6).fill({ event: "hit" }) }).atoms.length, 6);
  // Every atom error is reported in one message so the single retry can fix them all.
  const err = (() => { try { validateOracle({ ...goodOracle, atoms: [
    "x", { event: "teleport" }, { event: "hit", who: 2 }, { event: "hit", minCount: 1.5 }, { event: "hit", minCount: 0 },
    { event: "stuck", minDuration: 0 }, { event: "hit", withinSeconds: [5, 5] }, { event: "hit", withinSeconds: [-1, 3] }, ] }); } catch (e) { return (e as Error).message; } })();
  assert.match(String(err), /1-6 atoms/, "8 atoms trips the count check first");
  const many = (() => { try { validateOracle({ ...goodOracle, atoms: [
    "x", { event: "teleport" }, { event: "hit", who: 2, minCount: 0 }, { event: "stuck", minDuration: 0, withinSeconds: [5, 5] }, { event: "hit", arg: 3, color: "red" }] }); } catch (e) { return (e as Error).message; } })()!;
  for (const piece of ["atom 0 is not an object", "atom 1: event must be one of", "atom 2: who must be", "atom 2: minCount", "atom 3: minDuration", "atom 3: withinSeconds", "atom 4: unknown field \"color\"", "atom 4: arg must be a string"]) {
    assert.ok(many.includes(piece), `missing "${piece}" in: ${many}`);
  }
});

test("validateTuning edge cases: clamps, rejects unknown keys, non-numbers, empty sets", () => {
  const spec = TUNING_SPECS[0];
  assert.deepEqual(validateTuning({ tuning: { [spec.key]: spec.max * 10 }, rationale: " r " }), { tuning: { [spec.key]: spec.max }, rationale: "r" });
  assert.equal(validateTuning({ tuning: { [spec.key]: -1e9 }, rationale: "r" }).tuning[spec.key], spec.min);
  assert.throws(() => validateTuning({ error: "nothing to change" }), RejectedInput);
  assert.throws(() => validateTuning([]), /tuning must be an object/);
  assert.throws(() => validateTuning({ tuning: { [spec.key]: 1 } }), /rationale/);
  assert.throws(() => validateTuning({ tuning: { "anim.FIREBALL.damage": 1 }, rationale: "r" }), /unknown tuning key "anim.FIREBALL.damage"/);
  assert.throws(() => validateTuning({ tuning: { [spec.key]: "12" }, rationale: "r" }), /absolute number/);
  assert.throws(() => validateTuning({ tuning: { [spec.key]: Number.NaN }, rationale: "r" }), /absolute number/);
  assert.throws(() => validateTuning({ tuning: {}, rationale: "r" }), /no tuning keys changed/);
  const custom = [{ key: "k", default: 1, min: 0, max: 2, description: "" }];
  assert.deepEqual(validateTuning({ tuning: { k: 1.5 }, rationale: "r" }, custom).tuning, { k: 1.5 });
});

test("bugReportToOracle: bad first answer gets one retry with the error fed back, then succeeds", async () => {
  respond = (_, n) => reply(n === 1 ? fenced({ description: "x", combine: "maybe", atoms: [{ event: "hit" }] }) : fenced(goodOracle));
  const o = await bugReportToOracle("after a sweep I can never get up again");
  assert.equal(o.atoms.length, 2);
  assert.equal(calls.length, 2);
  for (const c of calls) {
    assert.equal(c.body.model, SUPER);
    assert.deepEqual(c.body.chat_template_kwargs, { enable_thinking: false });
    assert.equal(c.body.messages[0].role, "system");
  }
  const second = userText(calls[1]);
  assert.match(second, /^Bug report:\nafter a sweep/);
  assert.match(second, /Your previous answer was invalid: combine must be "all" or "any"/);
  assert.match(second, /"combine":"maybe"/, "previous answer is quoted back");
});

test("bugReportToOracle: always-bad answers fail after exactly 2 calls; garbage (non-JSON) also counts", async () => {
  respond = (_, n) => reply(n === 1 ? "I cannot produce JSON today" : fenced({ description: "x", combine: "all", atoms: [] }));
  await assert.rejects(bugReportToOracle("player clips through the crate"), /atoms must be an array of 1-6 atoms/);
  assert.equal(calls.length, 2);
  assert.match(userText(calls[1]), /no JSON found in model output/);
});

test("bugReportToOracle: a model refusal ({error}) is final with no retry; empty input never calls the model", async () => {
  respond = () => reply(fenced({ error: "this is a recipe, not a bug report" }));
  await assert.rejects(bugReportToOracle("how do I bake bread"), (e: unknown) => e instanceof RejectedInput && /recipe/.test((e as Error).message));
  assert.equal(calls.length, 1);
  await assert.rejects(bugReportToOracle("   "), RejectedInput);
  assert.equal(calls.length, 1);
});

test("bugReportToOracle truncates the report to 4000 characters", async () => {
  respond = () => reply(fenced(goodOracle));
  await bugReportToOracle("a".repeat(9000));
  assert.equal(userText(calls[0]), "Bug report:\n" + "a".repeat(4000));
});

test("patchNotesToTuning: retry on unknown key, then clamped success", async () => {
  const spec = TUNING_SPECS[0];
  respond = (_, n) => reply(n === 1 ? fenced({ tuning: { "sweep.power": 3 }, rationale: "r" }) : fenced({ tuning: { [spec.key]: spec.max + 100 }, rationale: "Jab hits harder." }));
  const t = await patchNotesToTuning("jab damage way up");
  assert.deepEqual(t, { tuning: { [spec.key]: spec.max }, rationale: "Jab hits harder." });
  assert.match(userText(calls[1]), /unknown tuning key "sweep.power"/);
  assert.match(calls[0].body.messages[0].content, new RegExp(spec.key.replace(/\./g, "\\.")), "prompt lists the tuning keys");
  await assert.rejects(patchNotesToTuning(""), RejectedInput);
});

// ---------- personas.ts ----------

const persona = (name: string, extra: Record<string, unknown> = {}) => ({
  name, skill: 0.5, reaction_ticks: 12, patience: 0.5, frustration_tolerance: 0.5, bio: "Retired arcade veteran who waits for openings then punishes hard", rules: [], ...extra,
});

test("validatePersona: bio word bounds, name trimming, rule cap at 5, non-object input", () => {
  assert.equal(validatePersona(null, "turtle"), null);
  assert.equal(validatePersona(persona("A", { bio: "one two three four" }), "turtle"), null, "4 words is too short");
  assert.ok(validatePersona(persona("A", { bio: "one two three four five" }), "turtle"));
  assert.equal(validatePersona(persona("A", { bio: Array(23).fill("w").join(" ") }), "turtle"), null, "23 words is too long");
  assert.equal(validatePersona(persona("   "), "turtle"), null);
  assert.equal(validatePersona(persona("N".repeat(60)), "turtle")!.name.length, 40);
  assert.equal(validatePersona(persona("A", { reaction_ticks: Infinity }), "turtle"), null);
  const rules = Array.from({ length: 8 }, (_, i) => ({ weights: { punch: i + 1 } }));
  assert.equal(validatePersona(persona("A", { rules }), "rusher")!.rules.length, 5);
  assert.equal(validatePersona(persona("A", { rules: "nope" }), "rusher")!.rules.length, 0);
});

/** Fake Nano for persona batches: reads the archetype and count from the prompt. */
function personaNano(bad: (a: Archetype, call: number) => boolean) {
  const perArch = new Map<string, number>();
  let uniq = 0; // every valid persona gets a distinct rule set, so dedupe never drops one
  return (c: Call) => {
    const m = /Write (\d+) DIFFERENT players of archetype "(\w+)"/.exec(userText(c))!;
    const count = Number(m[1]), a = m[2] as Archetype;
    const call = (perArch.get(a) ?? 0) + 1;
    perArch.set(a, call);
    const out = Array.from({ length: count }, (_, i) =>
      bad(a, call) && i % 2 === 0 ? { name: "", skill: "x" } : persona(`${a}${call}_${i}`, { rules: [{ weights: { punch: 1 + (uniq % 9), kick: 1 + (Math.floor(uniq++ / 9) % 9) } }] }));
    return reply(JSON.stringify(out));
  };
}

test("generatePersonas: exact archetype counts, ids, Nano request shape", async () => {
  respond = personaNano(() => false);
  const ps = await generatePersonas(25, { batch: 10, seed: 3 });
  assert.equal(ps.length, 25);
  assert.deepEqual(ps.map((p) => p.id).sort(), Array.from({ length: 25 }, (_, i) => `p${String(i + 1).padStart(4, "0")}`));
  const counts = archetypeCounts(25);
  for (const a of ARCHETYPES) assert.equal(ps.filter((p) => p.archetype === a).length, counts[a], a);
  assert.equal(lastPersonaStats!.repairRounds, 0);
  assert.equal(lastPersonaStats!.firstPassValid, 25);
  for (const c of calls) {
    assert.equal(c.body.model, NANO);
    assert.equal(c.body.temperature, 0.9);
    assert.deepEqual(c.body.chat_template_kwargs, { enable_thinking: false });
  }
});

test("generatePersonas repair loop: invalid personas in round 0 are re-asked for (+2 extra) in round 1", async () => {
  respond = personaNano((a, call) => a === "casual" && call === 1);
  const ps = await generatePersonas(20, { batch: 20 });
  assert.equal(ps.length, 20);
  assert.equal(ps.filter((p) => p.archetype === "casual").length, archetypeCounts(20).casual);
  assert.equal(lastPersonaStats!.repairRounds, 1);
  assert.equal(lastPersonaStats!.firstPassValid, 20 - 2, "casual(4): 2 of 4 invalid in round 0");
  const repair = calls.filter((c) => /archetype "casual"/.test(userText(c)));
  assert.equal(repair.length, 2);
  assert.match(userText(repair[1]), /Write 4 DIFFERENT/, "need 2 + 2 extra");
  assert.match(userText(repair[1]), /avoid: casual1_1, casual1_3/, "accepted names are passed as names to avoid");
});

test("generatePersonas: duplicate rule sets are dropped; a dead API gives up after 5 rounds with what it has", async () => {
  respond = (c) => {
    const m = /Write (\d+) DIFFERENT players of archetype "(\w+)"/.exec(userText(c))!;
    return reply(JSON.stringify(Array.from({ length: Number(m[1]) }, (_, i) => persona(`n${i}`, { rules: [{ weights: { kick: 3 } }] }))));
  };
  const ps = await generatePersonas(8, { batch: 8 });
  assert.equal(ps.length, 1, "every persona has the same rule set, so only the first survives");
  assert.ok(lastPersonaStats!.duplicatesDropped > 0);
  assert.equal(lastPersonaStats!.repairRounds, 4);

  respond = () => new Response("unauthorized", { status: 401 });
  const none = await generatePersonas(8, { batch: 8 });
  assert.equal(none.length, 0);
  const jobs = Object.values(archetypeCounts(8)).filter((c) => c > 0).length;
  assert.equal(jobs, 7, "speedrunner gets 0 of 8");
  assert.equal(lastPersonaStats!.calls, jobs * 5, "one job per non-empty archetype per round, 5 rounds");
});

// ---------- report.ts + verify.ts ----------

const personas: Persona[] = JSON.parse(readFileSync("data/fixtures-ai/personas.json", "utf8"));
const lines = readFileSync("data/fixtures-ai/runs.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));
const runs: RunLine[] = lines.filter((l) => !("quit" in l));
const sessions: SessionEnd[] = lines.filter((l) => "quit" in l);

test("analyzeCrowd: Ultra's claims are recomputed (wrong value flagged), a made-up seed removed, a mistyped one repaired", async () => {
  const real = runs[0], other = runs.find((r) => r.p !== real.p)!;
  const turtleWin = computeMetric({ metric: "winRate", scope: { archetype: "turtle" }, value: 0 }, personas, runs, sessions)!;
  const ultra = {
    summary: "Turtles struggle.",
    findings: [
      { title: "Turtle win rate", severity: "high", kind: "difficulty", narrative: "n", suggestion: "s", confidence: 0.8,
        claims: [{ metric: "winRate", scope: { archetype: "turtle" }, value: turtleWin }, { metric: "avgDuration", scope: {}, value: 99999 }],
        seeds: [{ p: real.p, round: real.round, seed: real.seed, why: "real" }, { p: "p9999", round: 1, seed: 424242, why: "invented" }, { p: other.p, round: other.round, seed: other.seed + 7, why: "typo" }] },
      { title: "Only fake seeds", severity: "low", kind: "bug", narrative: "n", suggestion: "s", confidence: 0.9,
        claims: [], seeds: [{ p: "p0001", round: 77, seed: 1, why: "never played" }] },
      { title: "malformed: no severity", kind: "bug", narrative: "n" },
    ],
  };
  respond = () => reply("thinking out loud ```json\n{\"draft\":true}\n``` final:\n" + fenced(ultra));
  const f = await analyzeCrowd(personas, runs, sessions);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.model, ULTRA);
  assert.deepEqual(calls[0].body.chat_template_kwargs, { enable_thinking: false });
  assert.equal(f.model, ULTRA);
  assert.equal(f.findings.length, 2, "malformed finding dropped");
  const [a, b] = f.findings;
  assert.deepEqual(a.verified!.map((v) => v.ok), [true, false]);
  assert.ok(a.verified![1].actual > 0 && a.verified![1].actual < 200, "actual mean duration is reported");
  assert.deepEqual(a.seeds.map((s) => s.seed), [real.seed, other.seed]);
  assert.ok(!a.seeds.some((s) => s.p === "p9999"), "made-up seed is removed");
  assert.equal(a.confidence, 0.8);
  assert.equal(b.seeds.length, 0);
  assert.equal(b.confidence, 0.3, "no surviving seed caps confidence");
  assert.match(f.summary, /^Turtles struggle\. \(Verification: 1 of 2 claims did not match/);
  assert.match(f.summary, /1 cited seeds were mistyped and corrected/);
  assert.match(f.summary, /2 cited seeds did not exist in the runs and were removed/);
  assert.equal(f.tokensIn, 100);
});

test("analyzeCrowd: non-JSON Ultra output and missing findings array are errors; no rounds means no call", async () => {
  respond = () => reply('{"findings": [{"title": "cut off');
  await assert.rejects(analyzeCrowd(personas, runs, sessions), /Ultra output is not JSON \(finish_reason stop, 20 tokens out\)/);
  respond = () => reply(fenced({ summary: "no findings key" }));
  await assert.rejects(analyzeCrowd(personas, runs, sessions), /no findings array/);
  const before = calls.length;
  await assert.rejects(analyzeCrowd(personas, [], sessions), /no rounds to analyze/);
  assert.equal(calls.length, before);
});

// ---------- triage.ts ----------

const SRC = mkdtempSync(join(tmpdir(), "triage-src-"));
after(() => rmSync(SRC, { recursive: true, force: true }));
for (const f of ["ground.js", "grapple.js", "props.js", "combat.js", "character.js", "player.js", "ai.js", "movement.js"]) {
  writeFileSync(join(SRC, f), `// ${f}\nexport function tick(s) {\n  s.y += s.vy;\n  s.y += s.vy;\n  if (s.y < 0) s.y = 0;\n}\n`);
}

test("validatePatches: exactly-one match passes; 0 or 2 matches, line prefixes, bad files and >3 patches throw", () => {
  const ok = { file: "ground.js", find: "if (s.y < 0) s.y = 0;", replace: "if (s.y < 0) { s.y = 0; s.vy = 0; }" };
  assert.deepEqual(validatePatches([ok], SRC), [ok]);
  assert.deepEqual(validatePatches([], SRC), []);
  assert.throws(() => validatePatches([{ ...ok, find: "s.y += s.vy;" }], SRC), /occurs 2 times in ground.js/);
  assert.throws(() => validatePatches([{ ...ok, find: "s.y -= 1;" }], SRC), /occurs 0 times/);
  assert.throws(() => validatePatches([{ ...ok, find: "5| if (s.y < 0) s.y = 0;" }], SRC), /line-number prefixes/);
  assert.throws(() => validatePatches([{ ...ok, find: "x\n  12| y" }], SRC), /line-number prefixes/, "prefix on a later line");
  assert.throws(() => validatePatches([ok, ok, ok, ok], SRC), /at most 3/);
  assert.throws(() => validatePatches({ file: "ground.js" }, SRC), /must be an array/);
  assert.throws(() => validatePatches([{ ...ok, file: "../ground.js" }], SRC), /file must be one of the source files/);
  assert.throws(() => validatePatches([{ ...ok, file: "hud.js" }], SRC), /file must be one of/, "file that does not exist");
  assert.throws(() => validatePatches([{ ...ok, file: "ground.ts" }], SRC), /file must be one of/);
  assert.throws(() => validatePatches([{ ...ok, find: "   " }], SRC), /find and replace must be strings/);
  assert.throws(() => validatePatches([{ ...ok, replace: 3 }], SRC), /find and replace must be strings/);
  assert.throws(() => validatePatches([null], SRC), /patch 0: file must be one of/);
  assert.throws(() => validatePatches([ok, { ...ok, find: "nope" }], SRC), /^Error: patch 1:/);
});

const bug: BugCluster = {
  id: "b1", signature: "airborne p0 FALL", count: 3,
  rounds: [{ p: "p0001", round: 1, seed: 80000, label: "airborne", t: 12, out: "loss" }],
  representative: { p: "p0001", round: 1, seed: 80000, label: "airborne" },
  timeline: ["t=1.0 y=2.1 keys=jump"],
};
const triageAnswer = (o: Record<string, unknown>) => reply(fenced({ title: "Floating", isRealBug: true, severity: "high", rootCause: "ground.js:5", playerImpact: "floats", confidence: 0.7, ...o }));

test("triageBug: source bundle sent with line numbers; bad patch rejected twice, third answer accepted", async () => {
  respond = (_, n) => n === 1 ? triageAnswer({ patches: [{ file: "ground.js", find: "s.y += s.vy;", replace: "" }] })
    : n === 2 ? reply("```diff\n- s.y\n```")
    : triageAnswer({ patches: [{ file: "ground.js", find: "if (s.y < 0) s.y = 0;", replace: "if (s.y < 0) { s.y = 0; s.vy = 0; }" }], severity: "weird", confidence: 7 });
  const t = await triageBug(bug, SRC, "attempt 1: clamped vy, still floated");
  assert.equal(calls.length, 3);
  assert.equal(t.patches.length, 1);
  assert.equal(t.severity, "med", "unknown severity falls back to med");
  assert.equal(t.confidence, 1, "confidence clamped");
  assert.equal(t.model, ULTRA);
  const first = userText(calls[0]);
  assert.match(first, /\/\/ FILE ground\.js \(lines 1-7\)\n1\| \/\/ ground\.js/);
  assert.match(first, /Earlier attempts.*\nattempt 1: clamped vy/);
  assert.match(userText(calls[1]), /rejected: patch 0: find text occurs 2 times in ground\.js/);
  assert.match(userText(calls[2]), /rejected: no JSON found in model output/);
});

test("triageBug: not-a-real-bug answers skip patch validation; 3 bad answers throw with the last error", async () => {
  respond = () => triageAnswer({ isRealBug: false, patches: [{ file: "nope.js", find: "x", replace: "y" }] });
  const t = await triageBug(bug, SRC);
  assert.equal(t.isRealBug, false);
  assert.deepEqual(t.patches, []);

  calls = [];
  respond = () => triageAnswer({ isRealBug: "yes" });
  await assert.rejects(triageBug(bug, SRC), /failed validation 3 times; last: title, rootCause and isRealBug are required/);
  assert.equal(calls.length, 3);
});

// ---------- exploit.ts ----------

const strat = (name: string, extra: Record<string, unknown> = {}) => ({ name, idea: "sweep spam at close range", archetype: "cheeser", rules: [{ dist: "close", weights: { sweep: 9 } }], ...extra });

test("validateStrategy: weights 0-10, 1-6 rules, valid buckets; unknown archetype becomes masher", () => {
  const s = validateStrategy(strat("Sweep Spam"), "x1-01")!;
  assert.equal(s.id, "x1-01");
  assert.equal(s.archetype, "cheeser");
  assert.equal(s.bio, s.idea);
  assert.deepEqual(s.rules, [{ dist: "close", weights: { sweep: 9 } }]);
  assert.equal(validateStrategy(strat("A", { archetype: "wizard" }), "x")!.archetype, "masher");
  assert.equal(validateStrategy(strat("A", { rules: [{ weights: { sweep: 0 } }] }), "x")!.rules[0].weights.sweep, 0);
  assert.equal(validateStrategy(strat("A", { rules: [{ weights: { sweep: 10.5 } }] }), "x"), null);
  assert.equal(validateStrategy(strat("A", { rules: [{ weights: { sweep: -1 } }] }), "x"), null);
  assert.equal(validateStrategy(strat("A", { rules: [{ weights: { fireball: 3 } }] }), "x"), null);
  assert.equal(validateStrategy(strat("A", { rules: [{ dist: "touching", weights: { kick: 3 } }] }), "x"), null);
  assert.equal(validateStrategy(strat("A", { rules: [{ rival: "asleep", weights: { kick: 3 } }] }), "x"), null);
  assert.equal(validateStrategy(strat("A", { rules: [{ weights: null }] }), "x"), null);
  assert.equal(validateStrategy(strat("A", { rules: [] }), "x"), null);
  assert.equal(validateStrategy(strat("A", { rules: Array(7).fill({ weights: { kick: 1 } }) }), "x"), null);
  assert.equal(validateStrategy(strat("A", { idea: 3 }), "x"), null);
  assert.equal(validateStrategy(null, "x"), null);
  assert.equal(validateStrategy(strat("N".repeat(99), { idea: "i".repeat(999) }), "x")!.name.length, 40);
});

test("proposeStrategies: skips garbage and duplicates, retries until k, numbers ids by generation", async () => {
  respond = (_, n) => n === 1 ? reply("no idea")
    : n === 2 ? reply(fenced({ not: "an array" }))
    : n === 3 ? reply(fenced([strat("Sweep Spam"), strat("Sweep Spam"), strat("Bad", { rules: [] })]))
    : reply(fenced([strat("Grab Loop", { rules: [{ weights: { grab: 8 } }] }), strat("Parry Wall"), strat("Extra")]));
  const s = await proposeStrategies(2, 4);
  assert.deepEqual(s.map((x) => [x.id, x.name]), [["x4-01", "Sweep Spam"]], "only 3 attempts: garbage, non-array, one valid");
  assert.equal(calls.length, 3);
  assert.equal(calls[0].body.model, NANO);

  calls = [];
  respond = () => reply(fenced([strat("A"), strat("B"), strat("C")]));
  const parents: Scored[] = [{ s: validateStrategy(strat("Old"), "x0-01")!, rounds: 10, winRate: 0.81, avgHpLoss: 12.4, avgT: 30, bestSeed: 1, hits: {} }];
  const evolved = await proposeStrategies(2, 1, parents);
  assert.deepEqual(evolved.map((x) => x.id), ["x1-01", "x1-02"]);
  assert.equal(calls.length, 1, "stops as soon as k are collected");
  assert.match(userText(calls[0]), /- Old: win 81%, avg hp lost 12, rules \[/);
});

// ---------- precedent.ts ----------

const finding = (id: string, suggestion: string): Finding => ({ id, title: "t", severity: "high", kind: "exploit", narrative: "n", claims: [], seeds: [], suggestion, confidence: 0.5 });

test("attachPrecedent: one Tavily search per finding, top 3 results, snippets cut to 300; a failed search leaves that finding alone", async () => {
  respond = (c) => {
    assert.equal(c.url, "https://api.tavily.com/search");
    if (c.body.query.includes("FAIL")) return new Response("boom", { status: 500 });
    return Response.json({ results: Array.from({ length: 5 }, (_, i) => ({ title: `T${i}`, url: `https://example.com/${i}`, content: "c".repeat(500) })) });
  };
  const fs: Findings = { summary: "s", findings: [finding("f1", "nerf sweep"), finding("f2", "FAIL this one"), finding("f3", "add   whitespace\n here")], model: ULTRA, tokensIn: 0, tokensOut: 0, corpusTokens: 0 };
  const out = await attachPrecedent(fs);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].body.max_results, 4);
  assert.equal(calls[0].body.search_depth, "basic");
  assert.equal(out.findings[0].precedent!.length, 3);
  assert.equal(out.findings[0].precedent![0].snippet.length, 300);
  assert.equal(out.findings[1].precedent, undefined);
  assert.equal(out.summary, "s");
  assert.equal(precedentQuery(fs.findings[2]), "fighting game dominant strategy nerf and counterplay: add whitespace here (developer postmortem, GDC talk, design article or patch notes)");
  assert.ok(precedentQuery(finding("x", "y".repeat(1000))).length <= 380);
});

test("attachPrecedent: missing Tavily key or empty results never throw", async () => {
  respond = () => Response.json({});
  const fs: Findings = { summary: "s", findings: [finding("f1", "a")], model: ULTRA, tokensIn: 0, tokensOut: 0, corpusTokens: 0 };
  assert.deepEqual((await attachPrecedent(fs)).findings[0].precedent, []);
  const saved = process.env.TAVILY_API_KEY;
  delete process.env.TAVILY_API_KEY;
  try {
    calls = [];
    assert.equal((await attachPrecedent(fs)).findings[0].precedent, undefined);
    assert.equal(calls.length, 0);
  } finally { process.env.TAVILY_API_KEY = saved; }
});

// ---------- vision.ts ----------

test("describeFrames: 1-6 frames, VL model, frame count in the prompt, trimmed answer", async () => {
  respond = () => reply("  The rival floats in frame 2.  ");
  await assert.rejects(describeFrames([], "q"), /1-6 PNG frames/);
  await assert.rejects(describeFrames(Array(7).fill("iVBOR"), "q"), /1-6 PNG frames/);
  assert.equal(calls.length, 0);
  assert.equal(await describeFrames(["/9j/A"], "Anything odd?"), "The rival floats in frame 2.");
  assert.equal(userText(calls[0]), "Anything odd?\n(1 frame, in time order.)");
  await describeFrames(Array(6).fill("iVBOR"), "q");
  const c = calls[1];
  assert.equal(c.body.model, VL);
  assert.equal(c.body.messages[1].content.length, 7, "text + 6 images");
  assert.equal(userText(c), "q\n(6 frames, in time order.)");
});
