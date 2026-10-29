// npx tsx --test app/api/routes.test.ts  (no network: global fetch is replaced by a fake Token Factory)
// The routes import "server-only", which is not resolvable outside Next (Next ships it as next/dist/compiled/server-only).
// A synchronous resolve hook (module.registerHooks, Node >= 22.15) maps it to that package's empty.js before the routes load.
import assert from "node:assert/strict";
import { createRequire, registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, test } from "node:test";

const serverOnlyStub = pathToFileURL(createRequire(import.meta.url).resolve("next/dist/compiled/server-only/empty.js")).href;
registerHooks({ resolve: (spec, ctx, next) => (spec === "server-only" ? { url: serverOnlyStub, shortCircuit: true } : next(spec, ctx)) });

const { aiRoute, rateLimited, MAX_BODY_BYTES } = await import("../../lib/ai-route");
const repro = await import("./repro/route");
const balance = await import("./balance/route");
const eyes = await import("./eyes/route");
const { TUNING_SPECS } = await import("../../ai/nl");

process.env.NEBIUS_API_KEY = "test-key-not-real";
const realFetch = globalThis.fetch;
const realError = console.error;

interface Call { url: string; body: Record<string, any> }
let calls: Call[] = [];
let respond: (c: Call) => Response;
const reply = (content: string) => Response.json({ choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
const fenced = (o: unknown) => "```json\n" + JSON.stringify(o) + "\n```";

beforeEach(() => {
  calls = [];
  console.error = () => {};
  globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    if (!url.startsWith("https://api.tokenfactory.nebius.com/")) throw new Error(`unexpected fetch to ${url}`);
    const c = { url, body: JSON.parse(String(init.body)) };
    calls.push(c);
    return respond(c);
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; console.error = realError; });

// Every request that gets past input validation spends one unit of the shared limiter (10/min per IP, 200/day for everyone).
let ipSeq = 0;
const freshIp = () => `10.0.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`;
let spent = 0;

function req(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/x", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": freshIp(), ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
async function send(handler: (r: Request) => Promise<Response>, r: Request) {
  const res = await handler(r);
  if (![400, 413, 429].includes(res.status)) spent++;
  return { status: res.status, headers: res.headers, json: (await res.json()) as Record<string, any> };
}
const echo = (r: Request) => aiRoute(r, "text", async (t) => ({ got: t }), { route: "echo" });

// ---------- lib/ai-route.ts ----------
test("rate limited: the built-in example gets the recorded real answer marked cached; any other input still gets 429", async () => {
  const sample = { input: "the example text", response: { got: "recorded answer" }, recordedAt: "2026-10-28T00:00:00Z" };
  const withSample = (r: Request) => aiRoute(r, "text", async (t) => ({ got: t }), { route: "sample-test", sample });
  const ip = freshIp();
  for (let i = 0; i < 10; i++) assert.equal((await send(withSample, req({ text: "x" }, { "x-forwarded-for": ip }))).status, 200);
  const cached = await send(withSample, req({ text: "  the example text " }, { "x-forwarded-for": ip }));
  spent--; // a cached answer is served after the limiter refused the call, so it did not use a unit of the daily cap
  assert.equal(cached.status, 200);
  assert.equal(cached.json.got, "recorded answer");
  assert.equal(cached.json.cached, true);
  assert.match(cached.json.cachedNotice, /rate limit/i);
  assert.equal((await send(withSample, req({ text: "something else" }, { "x-forwarded-for": ip }))).status, 429);
});


test("aiRoute: 400 on bad JSON, missing, blank or non-string field; 413 over 4000 chars; input is trimmed", async () => {
  assert.deepEqual(await send(echo, req("{not json")).then((r) => [r.status, r.json.error]), [400, "Body must be JSON."]);
  assert.equal((await send(echo, req({}))).status, 400);
  assert.equal((await send(echo, req({ text: "   " }))).status, 400);
  assert.equal((await send(echo, req({ text: 42 }))).status, 400);
  assert.match((await send(echo, req({ other: "x" }))).json.error, /"text" must be a non-empty string/);
  assert.equal((await send(echo, req("null"))).status, 400, "JSON null body");
  const big = await send(echo, req({ text: "a".repeat(4001) }));
  assert.equal(big.status, 413);
  assert.match(big.json.error, /limited to 4000 characters/);
  assert.equal((await send(echo, req({ text: "a".repeat(4000) }))).status, 200, "exactly 4000 is allowed");
  assert.deepEqual((await send(echo, req({ text: "  hi  " }))).json, { got: "hi" });
});

test("aiRoute: 502 with a generic message when run throws; 501 for a not-implemented stub", async () => {
  const boom = await send((r) => aiRoute(r, "text", async () => { throw new Error("secret upstream detail"); }, { route: "echo" }), req({ text: "x" }));
  assert.equal(boom.status, 502);
  assert.equal(boom.json.error, "The model call failed. Try again in a minute.");
  assert.ok(!JSON.stringify(boom.json).includes("secret"), "internal error text is not leaked");
  const stub = await send((r) => aiRoute(r, "text", async () => { throw new Error("bugReportToOracle: not implemented"); }, { route: "echo" }), req({ text: "x" }));
  assert.equal(stub.status, 501);
  const str = await send((r) => aiRoute(r, "text", async () => { throw "a string"; }, { route: "echo" }), req({ text: "x" }));
  assert.equal(str.status, 502);
});

test("rate limit: 11th call in a minute from one IP is 429 with Retry-After; invalid input does not count; other IPs unaffected", async () => {
  const ip = freshIp();
  for (let i = 0; i < 5; i++) assert.equal((await send(echo, req({}, { "x-forwarded-for": ip }))).status, 400);
  for (let i = 0; i < 10; i++) assert.equal((await send(echo, req({ text: "x" }, { "x-forwarded-for": ip }))).status, 200, `call ${i + 1}`);
  const r = await send(echo, req({ text: "x" }, { "x-forwarded-for": ip }));
  assert.equal(r.status, 429);
  assert.match(r.json.error, /limit is 10 per minute/);
  const retry = Number(r.headers.get("Retry-After"));
  assert.ok(retry >= 1 && retry <= 60, `Retry-After ${retry}`);
  assert.equal((await send(echo, req({ text: "x" }))).status, 200);
});

test("x-forwarded-for: a forged leftmost address does not bypass the limit (the rightmost hop is the key)", async () => {
  const proxyHop = freshIp();
  for (let i = 0; i < 10; i++) assert.equal((await send(echo, req({ text: "x" }, { "x-forwarded-for": `6.6.6.${i}, ${proxyHop}` }))).status, 200);
  assert.equal((await send(echo, req({ text: "x" }, { "x-forwarded-for": `7.7.7.7,${proxyHop}` }))).status, 429);
  assert.equal((await send(echo, req({ text: "x" }, { "x-forwarded-for": ` ${proxyHop} , ` }))).status, 429, "whitespace and empty entries ignored");
});

test("x-vercel-forwarded-for wins over x-forwarded-for and x-real-ip", async () => {
  const client = freshIp();
  for (let i = 0; i < 10; i++) assert.equal((await send(echo, req({ text: "x" }, { "x-vercel-forwarded-for": client, "x-forwarded-for": freshIp() }))).status, 200);
  assert.equal((await send(echo, req({ text: "x" }, { "x-vercel-forwarded-for": client, "x-forwarded-for": freshIp(), "x-real-ip": freshIp() }))).status, 429);
  // Different Vercel client IP behind the same proxy chain is a different caller.
  assert.equal((await send(echo, req({ text: "x" }, { "x-vercel-forwarded-for": freshIp(), "x-forwarded-for": "1.1.1.1" }))).status, 200);
});

test("x-real-ip is the fallback, then one shared 'local' bucket", async () => {
  const real = freshIp();
  const noXff = (h: Record<string, string>) => new Request("http://localhost/api/x", { method: "POST", headers: h, body: JSON.stringify({ text: "x" }) });
  for (let i = 0; i < 10; i++) assert.equal(rateLimited(noXff({ "x-real-ip": real }), "echo"), null);
  spent += 10;
  assert.equal(rateLimited(noXff({ "x-real-ip": real }), "echo")!.status, 429);
  for (let i = 0; i < 10; i++) assert.equal(rateLimited(noXff({}), "echo"), null);
  spent += 10;
  assert.equal(rateLimited(noXff({}), "echo")!.status, 429, "callers with no IP headers share the 'local' bucket");
});

// ---------- app/api/repro ----------

const goodOracle = { description: "player stuck after a knockdown", combine: "all", atoms: [{ event: "knockdown", who: 0 }] };

test("repro: success returns the oracle plus matches over the recorded rounds", async () => {
  respond = () => reply(fenced(goodOracle));
  const r = await send(repro.POST, req({ report: "after a knockdown I stay on the floor" }));
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.oracle, goodOracle);
  assert.equal(typeof r.json.total, "number");
  assert.ok(r.json.total > 0, "recorded rounds are loaded");
  assert.ok(r.json.matched >= 0 && r.json.matched <= r.json.total);
  assert.ok(Array.isArray(r.json.examples) && r.json.examples.length <= 8);
  for (const e of r.json.examples) assert.deepEqual(Object.keys(e).sort(), ["archetype", "events", "href", "name", "out", "p", "round", "seed", "t"]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.model, "nvidia/nemotron-3-super-120b-a12b");
});

test("repro: 400/413 before any model call; 502 when the model fails", async () => {
  assert.equal((await send(repro.POST, req({ text: "wrong field" }))).status, 400);
  assert.equal((await send(repro.POST, req({ report: "x".repeat(4001) }))).status, 413);
  assert.equal(calls.length, 0);
  respond = () => new Response("invalid key", { status: 401 });
  const r = await send(repro.POST, req({ report: "crate clips through the wall" }));
  assert.equal(r.status, 502);
  assert.equal(r.json.error, "The model call failed. Try again in a minute.");
});

test("a model refusal (not a bug report) comes back as 422 with the model's reason, not a 502", async () => {
  respond = () => reply(fenced({ error: "This is a cake recipe, not a report about the game." }));
  const r = await send(repro.POST, req({ report: "how do I bake a cake" }));
  assert.equal(r.status, 422);
  assert.ok(r.json.error.includes("cake recipe"));
  assert.equal(calls.length, 1, "a refusal is not retried");
});

// ---------- app/api/balance ----------

test("balance: success returns clamped tuning + rationale; 400 on missing notes; 502 on model failure", async () => {
  const spec = TUNING_SPECS[0];
  respond = () => reply(fenced({ tuning: { [spec.key]: spec.max * 5 }, rationale: "Jab hits much harder." }));
  const ok = await send(balance.POST, req({ notes: "jab damage x5" }));
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.json, { tuning: { [spec.key]: spec.max }, rationale: "Jab hits much harder." });
  assert.equal((await send(balance.POST, req({ report: "wrong field" }))).status, 400);
  respond = () => reply("never valid");
  const bad = await send(balance.POST, req({ notes: "make it fun" }));
  assert.equal(bad.status, 502, "two invalid answers end in 502");
});

// ---------- app/api/eyes ----------

const JPEG = "/9j/" + "A".repeat(100);
const PNG = "iVBORw0KGgo" + "A".repeat(101);

test("eyes: success returns text and frame count; images sent to Super-VL as data URLs", async () => {
  respond = () => reply("  Frame 2: the rival floats.  ");
  const r = await send(eyes.POST, req({ frames: [JPEG, PNG], question: "anything floating?" }));
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { text: "Frame 2: the rival floats.", frames: 2 });
  const content = calls[0].body.messages[1].content;
  assert.equal(calls[0].body.model, "nvidia/Nemotron-3.5-Super-VL");
  assert.match(content[0].text, /^anything floating\?\n\(2 frames/);
  assert.equal(content[1].image_url.url, `data:image/jpeg;base64,${JPEG}`);
  assert.equal(content[2].image_url.url, `data:image/png;base64,${PNG}`);
});

test("eyes: 400 on bad JSON, no frames, too many frames, non-base64 or non-image; 413 on oversize frame or question; none reach the model", async () => {
  assert.equal((await send(eyes.POST, req("{{"))).status, 400);
  assert.equal((await send(eyes.POST, req({}))).status, 400);
  assert.equal((await send(eyes.POST, req({ frames: [] }))).status, 400);
  assert.equal((await send(eyes.POST, req({ frames: [JPEG, JPEG, JPEG, JPEG] }))).status, 400);
  assert.equal((await send(eyes.POST, req({ frames: [`data:image/png;base64,${PNG}`] }))).status, 400);
  assert.equal((await send(eyes.POST, req({ frames: ["R0lGODlh"] }))).status, 400, "GIF is refused");
  assert.equal((await send(eyes.POST, req({ frames: ["/9j/" + "A".repeat(350_000)] }))).status, 413);
  assert.equal((await send(eyes.POST, req({ frames: [JPEG], question: "q".repeat(301) }))).status, 413);
  assert.equal(calls.length, 0);
});

test("eyes: 502 when the vision model fails; 429 after the per-IP limit", async () => {
  respond = () => new Response("down", { status: 400 });
  const r = await send(eyes.POST, req({ frames: [PNG] }));
  assert.equal(r.status, 502);
  assert.equal(r.json.error, "The vision model call failed. Try again in a minute.");

  respond = () => reply("fine");
  const ip = freshIp();
  for (let i = 0; i < 10; i++) assert.equal((await send(eyes.POST, req({ frames: [PNG] }, { "x-forwarded-for": ip }))).status, 200);
  assert.equal((await send(eyes.POST, req({ frames: [PNG] }, { "x-forwarded-for": ip }))).status, 429);
});

// ---------- request hardening (bug hunt A5, A6, A7, A8, A12) ----------

test("A12: a JSON null, array or number body is refused as 'must be a JSON object', not 'must be JSON'", async () => {
  for (const handler of [echo, repro.POST, balance.POST, eyes.POST]) {
    for (const body of ["null", "[]", "5"]) {
      const r = await send(handler, req(body));
      assert.deepEqual([r.status, r.json.error], [400, "Body must be a JSON object."], body);
    }
  }
  assert.equal(calls.length, 0);
});

test("A8: a body that is not content-type application/json gets 415 before parsing (blocks CORS-simple text/plain posts)", async () => {
  for (const handler of [echo, repro.POST, balance.POST, eyes.POST]) {
    for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x", ""]) {
      const r = await send(handler, req({ text: "x", report: "x", notes: "x", frames: [PNG] }, { "content-type": type }));
      assert.equal(r.status, 415, `${type || "(none)"}`);
    }
  }
  assert.equal((await send(echo, req({ text: "x" }, { "content-type": "application/json; charset=utf-8" }))).status, 200, "charset parameter is fine");
  assert.equal(calls.length, 0);
});

test("A7: bodies over 64 KB are refused with 413, by Content-Length before reading and by actual size when the header is missing or wrong", async () => {
  assert.equal(MAX_BODY_BYTES, 64 * 1024);
  const declared = await send(echo, req({ text: "x" }, { "content-length": String(MAX_BODY_BYTES + 1) }));
  assert.equal(declared.status, 413, "declared length");
  const streamed = (size: number) => new Request("http://localhost/api/x", {
    method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": freshIp() }, duplex: "half",
    body: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(`{"text":"${"a".repeat(size)}"}`)); c.close(); } }),
  } as RequestInit);
  assert.equal((await send(echo, streamed(MAX_BODY_BYTES))).status, 413, "no Content-Length, too big");
  assert.equal((await send(echo, streamed(3000))).status, 200, "no Content-Length, small");
  for (const handler of [repro.POST, balance.POST]) assert.equal((await send(handler, req({ report: "a".repeat(70_000), notes: "a".repeat(70_000) }))).status, 413);
  // Eyes carries up to 3 JPEG frames, so its cap is larger, but still bounded.
  const okFrames = await send(eyes.POST, req({ frames: [JPEG + "A".repeat(300_000), JPEG, JPEG] }));
  assert.notEqual(okFrames.status, 413, "three normal frames fit");
  assert.equal((await send(eyes.POST, req({ frames: ["/9j/" + "A".repeat(2_000_000)] }))).status, 413);
});

test("A5: repro, balance and eyes return 503 'not configured' with no NEBIUS_API_KEY, before the limiter, and send nothing", async () => {
  const key = process.env.NEBIUS_API_KEY;
  delete process.env.NEBIUS_API_KEY;
  try {
    const ip = freshIp();
    for (let i = 0; i < 12; i++) {
      for (const [handler, body] of [[repro.POST, { report: "crate clips" }], [balance.POST, { notes: "jab x2" }], [eyes.POST, { frames: [PNG] }]] as const) {
        const r = await send(handler as (r: Request) => Promise<Response>, req(body, { "x-forwarded-for": ip }));
        assert.equal(r.status, 503, `call ${i + 1}`);
        assert.match(r.json.error, /not configured/);
      }
    }
    assert.equal(calls.length, 0);
  } finally { process.env.NEBIUS_API_KEY = key; }
});

test("A6: calls that never reach a model (503 no key, 501 stub) do not use the caller's limit", async () => {
  const ip = freshIp();
  const key = process.env.NEBIUS_API_KEY;
  delete process.env.NEBIUS_API_KEY;
  try { for (let i = 0; i < 15; i++) assert.equal((await send(echo, req({ text: "x" }, { "x-forwarded-for": ip }))).status, 503); }
  finally { process.env.NEBIUS_API_KEY = key; }
  const stub = (r: Request) => aiRoute(r, "text", async () => { throw new Error("not implemented"); }, { route: "echo" });
  for (let i = 0; i < 15; i++) assert.equal((await send(stub, req({ text: "x" }, { "x-forwarded-for": ip }))).status, 501);
  for (let i = 0; i < 10; i++) assert.equal((await send(echo, req({ text: "x" }, { "x-forwarded-for": ip }))).status, 200, `real call ${i + 1}`);
  assert.equal((await send(echo, req({ text: "x" }, { "x-forwarded-for": ip }))).status, 429);
});

test("roast 7: Eyes on the sample round (p0537 round 1, default question) gets the recorded answer when rate limited", async () => {
  respond = () => reply("fresh answer");
  const ip = freshIp(), referer = "http://localhost/replay?key=p0537%3A1";
  for (let i = 0; i < 10; i++) assert.equal((await send(eyes.POST, req({ frames: [PNG] }, { "x-forwarded-for": ip }))).status, 200);
  const before = calls.length;
  const cached = await send(eyes.POST, req({ frames: [PNG] }, { "x-forwarded-for": ip, referer }));
  assert.equal(cached.status, 200);
  assert.equal(cached.json.cached, true);
  assert.match(cached.json.text, /cardboard box/);
  assert.match(cached.json.text, /recorded/i, "the visible text says it is a recorded answer");
  assert.equal(calls.length, before, "no model call");
  assert.equal((await send(eyes.POST, req({ frames: [PNG], question: "other?" }, { "x-forwarded-for": ip, referer }))).status, 429, "a different question is not the example");
  assert.equal((await send(eyes.POST, req({ frames: [PNG] }, { "x-forwarded-for": ip, referer: "http://localhost/replay?key=p0653%3A2" }))).status, 429);
});

// Must run last among the repro tests: it exhausts repro's daily cap.
test("A6 / roast 7: each route has its own daily cap, so exhausting repro leaves balance and eyes working", async () => {
  respond = () => reply(fenced(goodOracle));
  let n = 0;
  for (;;) {
    const r = await send(repro.POST, req({ report: "anything" }));
    if (r.status === 429) { assert.match(r.json.error, /daily cap of \d+ repro requests reached/); assert.equal(r.headers.get("Retry-After"), "3600"); break; }
    assert.equal(r.status, 200, `call ${++n}`);
    assert.ok(n <= 200, "repro has a daily cap");
  }
  const before = calls.length;
  assert.equal((await send(repro.POST, req({ report: "anything" }))).status, 429);
  assert.equal(calls.length, before, "no model call once capped");
  const sample = JSON.parse((await import("node:fs")).readFileSync("data/samples/repro.json", "utf8"));
  const cached = await send(repro.POST, req({ report: sample.input }));
  assert.deepEqual([cached.status, cached.json.cached], [200, true], "the built-in example still answers from the recording");
  respond = () => reply(fenced({ tuning: { [TUNING_SPECS[0].key]: TUNING_SPECS[0].default }, rationale: "ok" }));
  assert.equal((await send(balance.POST, req({ notes: "anything" }))).status, 200, "balance has its own cap");
  respond = () => reply("fine");
  assert.equal((await send(eyes.POST, req({ frames: [PNG] }))).status, 200, "eyes has its own cap");
});
