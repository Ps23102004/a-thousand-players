// npx tsx --test app/api/precedent.test.ts  (no network: global fetch is replaced by a fake Tavily)
// Same "server-only" resolve hook as routes.test.ts; this file runs in its own process, so it has its own rate limiter.
import assert from "node:assert/strict";
import { createRequire, registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, test } from "node:test";

const serverOnlyStub = pathToFileURL(createRequire(import.meta.url).resolve("next/dist/compiled/server-only/empty.js")).href;
registerHooks({ resolve: (spec, ctx, next) => (spec === "server-only" ? { url: serverOnlyStub, shortCircuit: true } : next(spec, ctx)) });

const precedent = await import("./precedent/route");
const { BUG_DOMAINS } = await import("../../ai/precedent");

const realFetch = globalThis.fetch;
const realError = console.error;
const savedKey = process.env.TAVILY_API_KEY;
let calls: Record<string, any>[] = [];
let respond: () => Response = () => Response.json({ results: [] });
beforeEach(() => {
  calls = [];
  console.error = () => {};
  process.env.TAVILY_API_KEY = "tvly-test-not-real";
  globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    if (String(input) !== "https://api.tavily.com/search") throw new Error(`unexpected fetch to ${input}`);
    calls.push(JSON.parse(String(init.body)));
    return respond();
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; console.error = realError; process.env.TAVILY_API_KEY = savedKey; });

let ipSeq = 0;
const freshIp = () => `10.1.0.${++ipSeq}`;
const req = (body: unknown, ip = freshIp()) => new Request("http://localhost/api/precedent", {
  method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: typeof body === "string" ? body : JSON.stringify(body),
});
const send = async (r: Request) => { const res = await precedent.POST(r); return { status: res.status, json: (await res.json()) as Record<string, any> }; };

test("precedent route: top 3 results with titles and links; the server builds the query and searches developer sites only", async () => {
  respond = () => Response.json({ results: ["A", "B", "C", "D"].map((t) => ({ title: t, url: `https://gamedeveloper.com/${t}`, content: "x" })) });
  const r = await send(req({ description: "  A fighter floats after a wall grab.  " }));
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.results.map((p: any) => [p.title, p.url]), [["A", "https://gamedeveloper.com/A"], ["B", "https://gamedeveloper.com/B"], ["C", "https://gamedeveloper.com/C"]]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].query, "fighting game physics bug fix: A fighter floats after a wall grab. (collision, grounding or hitbox bug, how developers fixed it)");
  assert.deepEqual(calls[0].include_domains, BUG_DOMAINS);
});

test("precedent route: 400 on bad JSON, null, missing, blank or non-string description; 413 over 300 chars; none reach Tavily", async () => {
  for (const body of ["{nope", "null", {}, { description: "   " }, { description: 42 }]) assert.equal((await send(req(body))).status, 400, JSON.stringify(body));
  const big = await send(req({ description: "a".repeat(301) }));
  assert.equal(big.status, 413);
  assert.match(big.json.error, /limited to 300 characters/);
  assert.equal(calls.length, 0);
  assert.equal((await send(req({ description: "a".repeat(300) }))).status, 200, "exactly 300 is allowed");
});

test("precedent route: 502 with a generic message on a Tavily failure; 503 with no key; neither leaks details", async () => {
  respond = () => new Response("secret upstream detail", { status: 500 });
  const failed = await send(req({ description: "bug" }));
  assert.equal(failed.status, 502);
  assert.equal(failed.json.error, "The web search failed. Try again in a minute.");
  delete process.env.TAVILY_API_KEY;
  const noKey = await send(req({ description: "bug" }));
  assert.equal(noKey.status, 503);
  assert.ok(!JSON.stringify(noKey.json).includes("TAVILY"));
});

test("precedent route: rate limited like the model routes (10 per minute per IP), checked after input validation", async () => {
  respond = () => Response.json({ results: [] });
  const ip = freshIp();
  for (let i = 0; i < 10; i++) assert.equal((await send(req({ description: "bug" }, ip))).status, 200);
  assert.equal((await send(req({ description: "a".repeat(301) }, ip))).status, 413, "bad input is refused before the limiter");
  const limited = await send(req({ description: "bug" }, ip));
  assert.equal(limited.status, 429);
  assert.equal(calls.length, 10);
});
