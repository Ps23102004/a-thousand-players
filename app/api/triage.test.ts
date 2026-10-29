// npx tsx --test app/api/triage.test.ts  (no network, no model: every request here ends before the Ultra call)
// Same "server-only" resolve hook as routes.test.ts; this file runs in its own process, so it has its own rate limiter.
import assert from "node:assert/strict";
import { createRequire, registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, test } from "node:test";

const serverOnlyStub = pathToFileURL(createRequire(import.meta.url).resolve("next/dist/compiled/server-only/empty.js")).href;
registerHooks({ resolve: (spec, ctx, next) => (spec === "server-only" ? { url: serverOnlyStub, shortCircuit: true } : next(spec, ctx)) });

const triage = await import("./triage/route");
const { rateLimited } = await import("../../lib/ai-route");
const { liveSlot, MAX_LIVE_TRIAGES } = await import("../../lib/triage-live");

const realFetch = globalThis.fetch;
const realError = console.error;
const savedKey = process.env.NEBIUS_API_KEY;
let fetches = 0;
beforeEach(() => {
  fetches = 0;
  console.error = () => {};
  process.env.NEBIUS_API_KEY = "test-key-not-real";
  globalThis.fetch = (async () => { fetches++; throw new Error("no network in tests"); }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; console.error = realError; process.env.NEBIUS_API_KEY = savedKey; });

let ipSeq = 0;
const freshIp = () => `10.2.0.${++ipSeq}`;
const req = (body: unknown, headers: Record<string, string> = {}) => new Request("http://localhost/api/triage", {
  method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": freshIp(), ...headers }, body: typeof body === "string" ? body : JSON.stringify(body),
});
const send = async (r: Request) => { const res = await triage.POST(r); return { status: res.status, headers: res.headers, json: (await res.json()) as Record<string, any> }; };
const SAMPLE = { p: "p0537", round: 1 };

test("warm-up: unknown round is 404 (loads the recorded data once so timings below are fair)", async () => {
  assert.equal((await send(req({ p: "p9999", round: 1 }))).status, 404);
});

test("A3: with no NEBIUS_API_KEY the route answers 503 'not configured' at once, without running the replay", async () => {
  delete process.env.NEBIUS_API_KEY;
  const t0 = Date.now();
  const r = await send(req(SAMPLE));
  const ms = Date.now() - t0;
  assert.equal(r.status, 503);
  assert.match(r.json.error, /not configured/);
  assert.ok(ms < 1500, `took ${ms} ms; a replay takes 2 s or more`);
});

test("A4: at most 2 live triages run at once per instance; the next gets 503 with Retry-After and no replay", async () => {
  assert.equal(MAX_LIVE_TRIAGES, 2);
  const a = liveSlot(), b = liveSlot();
  assert.ok(a && b);
  assert.equal(liveSlot(), null, "a third slot is refused");
  try {
    const t0 = Date.now();
    const r = await send(req({ p: "p0653", round: 2 }));
    assert.equal(r.status, 503);
    assert.match(r.json.error, /busy/i);
    assert.ok(Number(r.headers.get("Retry-After")) > 0);
    assert.ok(Date.now() - t0 < 1500, "refused before any replay");
  } finally { a!(); b!(); }
  const c = liveSlot();
  assert.ok(c, "slots are released");
  c!();
});

test("A7, A8, A12: triage refuses non-JSON content types (415), bodies over 64 KB (413) and non-object JSON (400)", async () => {
  assert.equal((await send(req(SAMPLE, { "content-type": "text/plain" }))).status, 415);
  assert.equal((await send(req({ ...SAMPLE, pad: "a".repeat(70_000) }))).status, 413);
  for (const body of ["null", "[]", "{nope"]) assert.equal((await send(req(body))).status, 400, body);
  assert.equal((await send(req("null"))).json.error, "Body must be a JSON object.");
});

test("roast 7: the sample round (p0537 round 1) gets its recorded verdict, marked cached, when rate limited or busy", async () => {
  const ip = freshIp();
  while (rateLimited(req(SAMPLE, { "x-forwarded-for": ip }), "triage") === null);
  const cached = await send(req(SAMPLE, { "x-forwarded-for": ip }));
  assert.equal(cached.status, 200);
  assert.equal(cached.json.cached, true);
  assert.equal(cached.json.p, "p0537");
  assert.equal(cached.json.round, 1);
  assert.match(cached.json.cachedNotice, /recorded/);
  assert.equal((await send(req({ p: "p0653", round: 2 }, { "x-forwarded-for": ip }))).status, 429, "other rounds still get 429");

  const a = liveSlot()!, b = liveSlot()!;
  try { assert.equal((await send(req(SAMPLE))).json.cached, true, "busy: the sample still answers"); } finally { a(); b(); }
  assert.equal(fetches, 0);
});
