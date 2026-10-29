import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { aggregateProphet, createProphetService, runProphet, validateProphetTuning } from "./prophet";
import type { ProphetResult } from "./prophet";
import type { Persona, RunLine, Tuning } from "./types";

const example: Tuning = JSON.parse(readFileSync("data/samples/balance.json", "utf8")).response.tuning;

test("Prophet accepts only allowlisted, finite, in-range absolute tuning values", () => {
  assert.deepEqual(validateProphetTuning(example), example);
  for (const bad of [null, [], {}, { "../escape": 1 }, { "rules.mountReleaseFix": 1 }, { "rules.getupCrateFix": 1 }, { "anim.SWEEP.damage": "11" }, { "anim.SWEEP.damage": NaN }, { "anim.SWEEP.damage": Infinity }, { "anim.SWEEP.damage": -1 }, JSON.parse('{"__proto__":1}')]) {
    assert.throws(() => validateProphetTuning(bad));
  }
});

test("aggregation counts wins and bug rounds once per round, including draws and crashes in the denominator", () => {
  const personas = [{ id: "p0001", archetype: "casual" }, { id: "p0002", archetype: "casual" }, { id: "p0003", archetype: "cheeser" }] as Persona[];
  const rows = [
    { p: "p0001", out: "win", ev: [[1, "hit", 0]] },
    { p: "p0002", out: "draw", ev: [[1, "stuck", 0], [2, "softlock", 0]] },
    { p: "p0003", out: "loss", ev: [[1, "crash", 1]] },
  ] as Pick<RunLine, "p" | "out" | "ev">[];
  assert.deepEqual(aggregateProphet(rows, personas), {
    rounds: 3, wins: 1, winRate: 1 / 3, bugRounds: 2,
    byArchetype: [
      { archetype: "casual", rounds: 2, wins: 1, winRate: 0.5, bugRounds: 1 },
      { archetype: "cheeser", rounds: 1, wins: 0, winRate: 0, bugRounds: 1 },
    ],
  });
  assert.throws(() => aggregateProphet([{ ...rows[0], p: "missing" }], personas));
});

test("same tuning and seed produce the same measured before/after numbers in real child crowds", async () => {
  const a = await runProphet(example, { limit: 8 });
  const b = await runProphet(Object.fromEntries(Object.entries(example).reverse()), { limit: 8 });
  assert.deepEqual(a.before, b.before);
  assert.deepEqual(a.after, b.after);
  assert.equal(a.personas, 8);
  assert.equal(a.before.rounds, 8);
  assert.equal(a.after.rounds, 8);
  assert.equal(a.roundsEach, 1);
  assert.equal(a.baselineTuning["rules.mountReleaseFix"], 0);
  assert.equal(a.baselineTuning["rules.getupCrateFix"], 0);
});

test("limit, busy slot and timeout use only a matching example cache; slots release after errors", async () => {
  const cached: ProphetResult = JSON.parse(readFileSync("data/prophet/example.json", "utf8"));
  const limit = createProphetService({ cache: () => cached, limited: () => true, run: async () => { throw new Error("must not run"); } });
  const hit = await limit(example, "test");
  assert.equal(hit.status, 200);
  assert.equal(hit.body.cached, true);
  assert.equal((await limit({ "anim.SWEEP.damage": 11 }, "test")).status, 429);
  let finish!: (r: ProphetResult) => void;
  const busy = createProphetService({ cache: () => cached, run: () => new Promise((resolve) => { finish = resolve; }) });
  const pending = busy(example, "one");
  assert.equal((await busy(example, "two")).body.cached, true);
  assert.equal((await busy({ "anim.SWEEP.damage": 11 }, "three")).status, 503);
  finish(cached); await pending;
  const timeout = createProphetService({ cache: () => cached, run: async () => { throw Object.assign(new Error("timeout"), { timedOut: true }); } });
  assert.equal((await timeout(example, "a")).body.cached, true);
  assert.equal((await timeout({ "anim.SWEEP.damage": 11 }, "b")).status, 504);
  const failed = createProphetService({ run: async () => { throw new Error("failure"); } });
  assert.equal((await failed(example, "a")).status, 500);
  assert.equal((await failed(example, "b")).status, 500);
});

test("real child timeout is classified for fallback", async () => {
  await assert.rejects(runProphet(example, { limit: 8, timeoutMs: 1 }), (e: unknown) => (e as { timedOut?: boolean }).timedOut === true);
});

test("HTTP handler validates JSON before work and returns real paired counts or an honestly labelled busy cache", async () => {
  const stub = pathToFileURL(createRequire(import.meta.url).resolve("next/dist/compiled/server-only/empty.js")).href;
  registerHooks({ resolve: (spec, ctx, next) => spec === "server-only" ? { url: stub, shortCircuit: true } : next(spec, ctx) });
  const { POST } = await import("../app/api/prophet/route");
  const request = (body: unknown, type = "application/json") => new Request("http://localhost:3141/api/prophet", {
    method: "POST", headers: { "content-type": type }, body: JSON.stringify(body),
  });
  assert.equal((await POST(request({ tuning: example }, "text/plain"))).status, 415);
  assert.equal((await POST(request({ tuning: [] }))).status, 400);
  assert.equal((await POST(request({ tuning: { "anim.SWEEP.damage": "11" } }))).status, 400);
  assert.equal((await POST(new Request("http://localhost:3141/api/prophet", { method: "POST", headers: { "content-type": "application/json" }, body: "{bad" }))).status, 400);
  assert.equal((await POST(request({ padding: "x".repeat(65537) }))).status, 413);
  const pending = POST(request({ tuning: example }));
  // readJson consumes a stream asynchronously; wait for the first request to acquire the slot.
  await new Promise((resolve) => setImmediate(resolve));
  const busy = await POST(request({ tuning: example }));
  assert.equal(busy.status, 200);
  assert.equal((await busy.json()).cached, true);
  assert.equal((await POST(request({ tuning: { "anim.SWEEP.damage": 11 } }))).status, 503);
  const result = await pending;
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.cached, false);
  const cached = JSON.parse(readFileSync("data/prophet/example.json", "utf8"));
  assert.deepEqual(body.before, cached.before);
  assert.deepEqual(body.after, cached.after);
});
