// npx tsx --test app/api/advisor.test.ts  (no network: global fetch is replaced by a fake Token Factory and a fake Tavily)
// "server-only" is not resolvable outside Next; map it to Next's empty module as routes.test.ts does.
import assert from "node:assert/strict";
import { createRequire, registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, test } from "node:test";

const serverOnlyStub = pathToFileURL(createRequire(import.meta.url).resolve("next/dist/compiled/server-only/empty.js")).href;
registerHooks({ resolve: (spec, ctx, next) => (spec === "server-only" ? { url: serverOnlyStub, shortCircuit: true } : next(spec, ctx)) });

const advisor = await import("./advisor/route");
const { advisorContext } = await import("./advisor/context");
const { DEFAULT_ROUND } = await import("../../lib/advisor");
const { getData } = await import("../../lib/data");
import { readFileSync } from "node:fs";

process.env.NEBIUS_API_KEY = "test-key-not-real";
process.env.TAVILY_API_KEY = "test-tavily-not-real";
const realFetch = globalThis.fetch;
const realError = console.error;
const JPEG = "/9j/" + "A".repeat(200);
const KEY = "p0396:1";

let calls: { url: string; body: any }[] = [];
let n = 0;
const freshIp = () => `10.9.${Math.floor(++n / 250)}.${n % 250}`;
const reply = (content: string) => Response.json({ choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1 } });

beforeEach(() => {
  calls = [];
  console.error = () => {};
  globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    const body = JSON.parse(String(init.body));
    calls.push({ url, body });
    if (url.startsWith("https://api.tavily.com/")) return Response.json({ results: [{ title: "Hit feedback", url: "https://www.gamedeveloper.com/design/hit-feedback", content: "Sparks keep trades readable." }] });
    if (body.model.includes("VL")) return reply("Frame 1: fine.");
    return reply(JSON.stringify({ recommendations: [{ area: "readability", suggestion: "Brighten hit sparks.", evidence: [{ type: "frame", index: 1 }, { type: "web", url: "https://www.gamedeveloper.com/design/hit-feedback" }], howToTest: "Human playtesters.", strength: "suggestion" }] }));
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; console.error = realError; });

const post = (body: unknown, ip = freshIp(), ct = "application/json") =>
  advisor.POST(new Request("http://localhost/api/advisor", { method: "POST", headers: { "content-type": ct, "x-forwarded-for": ip }, body: typeof body === "string" ? body : JSON.stringify(body) }));
const good = { key: KEY, frames: [JPEG, JPEG, JPEG, JPEG] };

test("context: the recorded round's crowd table, game text and tuning keys come from disk", () => {
  const c = advisorContext(KEY)!;
  assert.ok(c);
  assert.equal(c.genre, "3D physics brawler");
  assert.equal(c.frameTimes.length, 4);
  const ids = c.crowd.map((r) => r.id);
  for (const id of ["quit.casual", "win.cheeser", "wall.biggestDrop", "sweepNerf.cheeser", "bugs.total", "exploit.top", "rule.cpuLowBlock", "round.result"]) assert.ok(ids.includes(id), id);
  assert.equal(c.crowd.find((r) => r.id === "quit.casual")!.display, "97%");
  assert.match(c.crowd.find((r) => r.id === "sweepNerf.cheeser")!.display, /92% before, 82% after/);
  assert.ok(c.gameText.includes("One last duel under the lanterns. Step into the night market, find your opening, and earn your place in the circuit."));
  assert.ok(c.gameText.includes("DEFEATED."));
  assert.ok(c.tuningKeys.has("rules.cpuLowBlock") && c.tuningKeys.has("anim.SWEEP.recovery") && c.tuningKeys.has("rival.decisionDelayMin"));
  assert.equal(advisorContext("p9999:9"), null);
});

test("bad requests are refused before any model or search call", async () => {
  assert.equal((await post(good, freshIp(), "text/plain")).status, 415);
  assert.equal((await post("{nope")).status, 400);
  assert.equal((await post({ key: KEY, frames: [JPEG] })).status, 400);
  assert.equal((await post({ key: "../x:1", frames: good.frames })).status, 400);
  assert.equal((await post({ key: "p9999:9", frames: good.frames })).status, 404);
  assert.equal(calls.length, 0);
});

test("a full request: model and search calls happen server-side and the answer is validated", async () => {
  const res = await post(good);
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.key, KEY);
  assert.equal(j.game, "Market Brawl");
  assert.equal(j.recommendations.length, 1);
  assert.deepEqual(j.recommendations[0].evidence.map((e: any) => e.type), ["frame", "web"]);
  assert.equal(j.dropped.recommendations, 0);
  assert.ok(j.crowd.length > 10);
  assert.equal(calls.filter((c) => c.url.includes("tavily")).length, 3);
  for (const c of calls.filter((c) => c.url.includes("tavily"))) assert.ok(!c.body.query.includes(KEY), "the client's key never reaches a search query");
});

test("a model failure is a 502 with no model text in it", async () => {
  globalThis.fetch = (async (input: string | URL) => (String(input).includes("tavily") ? Response.json({ results: [] }) : new Response("secret upstream detail", { status: 400 }))) as typeof fetch;
  const res = await post(good);
  assert.equal(res.status, 502);
  assert.ok(!JSON.stringify(await res.json()).includes("secret upstream"));
});

test("rate limited: the built-in round gets the recorded real answer marked cached; another round still gets 429", async () => {
  const ip = freshIp();
  for (let i = 0; i < 10; i++) assert.equal((await post(good, ip)).status, 200);
  const cached = await post(good, ip);
  assert.equal(cached.status, 200);
  const j = await cached.json();
  assert.equal(j.cached, true);
  assert.match(j.cachedNotice, /rate limit/i);
  assert.ok(j.recommendations.length > 0 && j.sources.length > 0 && j.crowd.length > 0);
  assert.equal((await post({ key: "p0001:1", frames: good.frames }, ip)).status, 429);  assert.equal((await post({ key: "p9999:9", frames: good.frames }, ip)).status, 429, "security review: a limited caller is refused before the recorded-data context is built, so an unknown round is 429 not 404");
});

test("the route budget covers the model timeouts: vision + searches + up to two synthesis tries", () => {
  assert.ok(advisor.maxDuration * 1000 >= 60_000 + 30_000 + 2 * 45_000, `maxDuration ${advisor.maxDuration}`);
});

test("the default demo round is a clean one: no engine-detected bug, both fighters landed hits", () => {
  const run = getData().runs.get(DEFAULT_ROUND)!;
  assert.ok(run, DEFAULT_ROUND);
  assert.ok(!run.ev.some((e) => ["stuck", "oob", "nan", "clip", "airborne", "softlock", "crash"].includes(e[1])), "a bug event in the default round");
  const bugs = JSON.parse(readFileSync("data/run-main/bugs.json", "utf8")) as { rounds: { p: string; round: number }[] }[];
  assert.ok(!bugs.some((b) => b.rounds.some((r) => `${r.p}:${r.round}` === DEFAULT_ROUND)), "the default round is in a bug cluster");
  assert.ok(run.t >= 20, `only ${run.t} s long`);
  for (const f of [0, 1]) assert.ok(run.ev.some((e) => e[1] === "hit" && e[2] === f), `fighter ${f} never landed a hit`);
  assert.equal(JSON.parse(readFileSync("data/samples/advisor.json", "utf8")).input, DEFAULT_ROUND, "the recorded sample is for the default round");
});
