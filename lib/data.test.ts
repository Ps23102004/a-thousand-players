// npx tsx --test lib/data.test.ts (replay key/token reconciliation; no network)
import assert from "node:assert/strict";
import { createRequire, registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const stub = pathToFileURL(createRequire(import.meta.url).resolve("next/dist/compiled/server-only/empty.js")).href;
registerHooks({ resolve: (spec, ctx, next) => (spec === "server-only" ? { url: stub, shortCircuit: true } : next(spec, ctx)) });

const { findRound, getData } = await import("./data");

// Recorded fixtures: p0537:1 seed 634310, p0653:2 seed 529060 (data/run-main/runs.jsonl).
test("findRound: a key whose seed differs from the token is a mismatch, not the key's round", () => {
  const data = getData();
  const keyRun = data.runs.get("p0537:1")!;
  assert.ok(keyRun, "fixture key exists");
  const other = data.runs.get("p0653:2")!;
  assert.ok(other && other.seed !== keyRun.seed, "fixture seeds differ");
  const r = findRound("p0537:1", other.seed, other.p);
  assert.equal(r.mismatch, true, "seed/persona mismatch must be flagged");
  assert.equal(r.run, undefined, "mismatched key must not select a round to display beside the token");
  assert.equal(r.trace, undefined);
});

test("findRound: same seed but different persona is also a mismatch", () => {
  const data = getData();
  const keyRun = data.runs.get("p0537:1")!;
  const r = findRound("p0537:1", keyRun.seed, "p9999");
  assert.equal(r.mismatch, true);
  assert.equal(r.run, undefined);
});

test("findRound: matching key + token still resolves; no key falls back to seed", () => {
  const data = getData();
  const keyRun = data.runs.get("p0537:1")!;
  const ok = findRound("p0537:1", keyRun.seed, keyRun.p);
  assert.equal(ok.mismatch ?? false, false);
  assert.equal(ok.run?.seed, keyRun.seed);
  const bySeed = findRound(undefined, keyRun.seed);
  assert.equal(bySeed.mismatch ?? false, false);
  assert.ok(bySeed.run, "seed fallback works when no key is given");
  const keyOnly = findRound("p0537:1", undefined);
  assert.equal(keyOnly.mismatch ?? false, false, "key without a token is not a mismatch");
  assert.equal(keyOnly.run?.seed, keyRun.seed);
});

test("bug1 on /bugs matches PROOF.md: fixed by hand, all 21 flagged rounds replay clean on the shipped build", async () => {
  const { getTriage } = await import("./data");
  const b1 = getTriage().find((b) => b.id === "bug1")!;
  assert.equal(b1.verdict, "fixed-by-hand");
  assert.equal(b1.fixedRounds, 21);
  assert.equal(b1.verifyRounds, 21);
});

test("review: bug1's regression table says which fix it measured", async () => {
  const { getTriage } = await import("./data");
  const b1 = getTriage().find((b) => b.id === "bug1")!;
  assert.match(b1.regressionNote ?? "", /bug2 hand fix only/);
});
