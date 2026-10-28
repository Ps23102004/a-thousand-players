// npx tsx --test ai/models.test.ts  (no network: global fetch is replaced by a fake Token Factory)
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { chat, extractJson, HttpError, NANO, pool, retryDelayMs, SUPER, ULTRA, VL } from "./models";
import { getUsage } from "./usage";

process.env.NEBIUS_API_KEY = "test-key-not-real";
const realFetch = globalThis.fetch;

interface Call { url: string; init: RequestInit; body: Record<string, any> }
let calls: Call[] = [];
let respond: (c: Call, n: number) => Response | Promise<Response>;

const reply = (content: string | null, usage = { prompt_tokens: 10, completion_tokens: 5 }, extra: Record<string, unknown> = {}) =>
  Response.json({ choices: [{ message: { content, ...extra }, finish_reason: "stop" }], usage });

beforeEach(() => {
  calls = [];
  globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    if (!url.startsWith("https://api.tokenfactory.nebius.com/")) throw new Error(`unexpected fetch to ${url}`);
    const c = { url, init, body: JSON.parse(String(init.body)) };
    calls.push(c);
    return respond(c, calls.length);
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; });

const usageOf = (model: string) => getUsage().find((r) => r.model === model) ?? { calls: 0, tokensIn: 0, tokensOut: 0, usdEstimate: 0 };

test("request shape: endpoint, auth, model id, system + user messages, defaults", async () => {
  respond = () => reply("hello");
  const r = await chat({ model: SUPER, system: "sys", user: "hi", maxTokens: 50 });
  assert.equal(r.content, "hello");
  assert.equal(calls.length, 1);
  const { url, init, body } = calls[0];
  assert.equal(url, "https://api.tokenfactory.nebius.com/v1/chat/completions");
  assert.equal(init.method, "POST");
  assert.equal((init.headers as Record<string, string>).Authorization, "Bearer test-key-not-real");
  assert.equal(body.model, "nvidia/nemotron-3-super-120b-a12b");
  assert.deepEqual(body.messages, [{ role: "system", content: "sys" }, { role: "user", content: "hi" }]);
  assert.equal(body.max_tokens, 50);
  assert.equal(body.temperature, 0.2);
  assert.equal("chat_template_kwargs" in body, false, "thinking left on unless explicitly false");
  assert.equal(init.signal, undefined, "no timeout signal unless timeoutMs is set");
});

test("thinking:false sends enable_thinking=false; no system message when none given; explicit temperature 0 kept", async () => {
  respond = () => reply("x");
  await chat({ model: NANO, user: "u", maxTokens: 5, thinking: false, temperature: 0, timeoutMs: 5000 });
  const { body, init } = calls[0];
  assert.deepEqual(body.chat_template_kwargs, { enable_thinking: false });
  assert.deepEqual(body.messages, [{ role: "user", content: "u" }]);
  assert.equal(body.temperature, 0);
  assert.ok(init.signal instanceof AbortSignal);
  await chat({ model: NANO, user: "u", maxTokens: 5, thinking: true });
  assert.equal("chat_template_kwargs" in calls[1].body, false);
});

test("images become data URLs: /9j/ is JPEG, anything else PNG, text part first", async () => {
  respond = () => reply("seen");
  await chat({ model: VL, user: "what?", images: ["/9j/AAAA", "iVBORw0KGgo="], maxTokens: 10 });
  const content = calls[0].body.messages[0].content;
  assert.deepEqual(content, [
    { type: "text", text: "what?" },
    { type: "image_url", image_url: { url: "data:image/jpeg;base64,/9j/AAAA" } },
    { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgo=" } },
  ]);
  await chat({ model: VL, user: "plain", images: [], maxTokens: 10 });
  assert.equal(calls[1].body.messages[0].content, "plain", "empty image list sends a plain string");
});

test("result fields: reasoning_content, then reasoning, else null; null content becomes empty string", async () => {
  respond = (_, n) => n === 1 ? reply(null, undefined, { reasoning_content: "rc" }) : n === 2 ? reply("a", undefined, { reasoning: "r" }) : reply("b");
  const a = await chat({ model: NANO, user: "1", maxTokens: 1 });
  assert.equal(a.content, "");
  assert.equal(a.reasoning, "rc");
  assert.equal(a.finishReason, "stop");
  assert.equal((await chat({ model: NANO, user: "2", maxTokens: 1 })).reasoning, "r");
  assert.equal((await chat({ model: NANO, user: "3", maxTokens: 1 })).reasoning, null);
});

test("usage is accumulated per model; only Ultra gets a dollar estimate; missing usage counts as 0 tokens", async () => {
  const before = usageOf(ULTRA), vlBefore = usageOf(VL);
  respond = () => reply("ok", { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 });
  const r = await chat({ model: ULTRA, user: "x", maxTokens: 1 });
  assert.equal(r.tokensIn, 1_000_000);
  await chat({ model: ULTRA, user: "x", maxTokens: 1 });
  const after = usageOf(ULTRA);
  assert.equal(after.calls - before.calls, 2);
  assert.equal(after.tokensIn - before.tokensIn, 2_000_000);
  assert.equal(after.tokensOut - before.tokensOut, 2_000_000);
  assert.equal(after.usdEstimate - before.usdEstimate, 8, "$1/M in + $3/M out, twice");

  respond = () => Response.json({ choices: [{ message: { content: "no usage" }, finish_reason: null }] });
  const v = await chat({ model: VL, user: "x", maxTokens: 1 });
  assert.equal(v.tokensIn, 0);
  assert.equal(v.finishReason, null);
  const vl = usageOf(VL);
  assert.equal(vl.calls - vlBefore.calls, 1);
  assert.equal(vl.usdEstimate, 0);
});

test("missing API key throws before any request", async () => {
  const saved = process.env.NEBIUS_API_KEY;
  delete process.env.NEBIUS_API_KEY;
  respond = () => reply("never");
  try {
    await assert.rejects(chat({ model: NANO, user: "x", maxTokens: 1 }), /NEBIUS_API_KEY is not set/);
    assert.equal(calls.length, 0);
  } finally { process.env.NEBIUS_API_KEY = saved; }
});

test("429 with a wait hint is retried, then succeeds", async () => {
  respond = (_, n) => n === 1 ? new Response("rate limited, try again in 1 ms", { status: 429 }) : reply("second time");
  const r = await chat({ model: NANO, user: "x", maxTokens: 1, retries: 2 });
  assert.equal(r.content, "second time");
  assert.equal(calls.length, 2);
});

test("5xx is retried up to `retries` then throws HttpError with status and body", async () => {
  respond = () => new Response("upstream exploded", { status: 503 });
  const err = await chat({ model: NANO, user: "x", maxTokens: 1, retries: 1 }).then(() => null, (e) => e);
  assert.ok(err instanceof HttpError);
  assert.equal(err.status, 503);
  assert.match(err.message, /HTTP 503: upstream exploded/);
  assert.equal(calls.length, 2, "first try + 1 retry");
});

test("4xx other than 429 is not retried", async () => {
  respond = () => new Response("bad key", { status: 401 });
  await assert.rejects(chat({ model: NANO, user: "x", maxTokens: 1, retries: 4 }), (e: unknown) => e instanceof HttpError && e.status === 401);
  assert.equal(calls.length, 1);
});

test("retries:0 makes a 429 final", async () => {
  respond = () => new Response("slow down, 1 ms", { status: 429 });
  await assert.rejects(chat({ model: NANO, user: "x", maxTokens: 1, retries: 0 }), (e: unknown) => e instanceof HttpError && e.status === 429);
  assert.equal(calls.length, 1);
});

test("a network error is retried; a TimeoutError is final", async () => {
  respond = (_, n) => { if (n === 1) throw new TypeError("fetch failed"); return reply("recovered"); };
  assert.equal((await chat({ model: NANO, user: "x", maxTokens: 1, retries: 1 })).content, "recovered");

  calls = [];
  respond = () => { throw new DOMException("The operation timed out.", "TimeoutError"); };
  await assert.rejects(chat({ model: NANO, user: "x", maxTokens: 1, retries: 3 }), { name: "TimeoutError" });
  assert.equal(calls.length, 1);

  calls = [];
  respond = () => { throw new TypeError("fetch failed"); };
  await assert.rejects(chat({ model: NANO, user: "x", maxTokens: 1, retries: 0 }), /fetch failed/);
  assert.equal(calls.length, 1);
});

test("retryDelayMs: ms/seconds hints only on 429, capped at 120 s; exponential backoff capped at 60 s otherwise", () => {
  assert.equal(retryDelayMs(429, "try again in 250ms", 0), 750);
  assert.equal(retryDelayMs(429, "retry after 2.5 seconds", 0), 3000);
  assert.equal(retryDelayMs(429, "wait 9999 s", 0), 120_000);
  for (let i = 0; i < 20; i++) {
    const d = retryDelayMs(503, "try again in 1 s", 2);
    assert.ok(d >= 4000 && d < 4500, `503 ignores the hint: ${d}`);
    const big = retryDelayMs(500, "", 10);
    assert.ok(big >= 60_000 && big < 60_500, `capped: ${big}`);
  }
});

test("extractJson: fenced, last JSON fence wins, bare, arrays, prose around it", () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('draft ```json\n{"a":1}\n``` final ```json\n{"a":2}\n```'), { a: 2 });
  assert.deepEqual(extractJson('```\n[1,2]\n```'), [1, 2]);
  assert.deepEqual(extractJson('```python\nprint(1)\n``` then ```json\n{"ok":true}\n```'), { ok: true }, "non-JSON fences are skipped");
  assert.deepEqual(extractJson('Sure! {"x": {"y": 2}} hope that helps'), { x: { y: 2 } });
  assert.deepEqual(extractJson('Here: [{"n":1},{"n":2}] done'), [{ n: 1 }, { n: 2 }]);
});

test("extractJson: truncated output and garbage throw", () => {
  assert.throws(() => extractJson('```json\n{"a": [1, 2'), SyntaxError, "unterminated fence falls back to the bare span, which is cut");
  assert.throws(() => extractJson('{"findings": [{"title": "cut off mid'), SyntaxError);
  assert.throws(() => extractJson("no json here at all"), /no JSON found/);
  assert.throws(() => extractJson(""), /no JSON found/);
  assert.throws(() => extractJson("{not: json}"), SyntaxError);
});

test("pool keeps input order and never exceeds the concurrency limit", async () => {
  let inFlight = 0, peak = 0;
  const out = await pool([5, 1, 4, 2, 3], 2, async (x, i) => {
    inFlight++; peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, x));
    inFlight--;
    return `${i}:${x}`;
  });
  assert.deepEqual(out, ["0:5", "1:1", "2:4", "3:2", "4:3"]);
  assert.equal(peak, 2);
  assert.deepEqual(await pool([], 4, async () => 1), []);
});
