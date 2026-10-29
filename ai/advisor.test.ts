// npx tsx --test ai/advisor.test.ts  (no network: global fetch is replaced by a fake Token Factory and a fake Tavily)
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { runAdvisor } from "./advisor";
import type { CrowdRow } from "../lib/advisor";
import corpus from "../data/reviews/corpus.json";
import { parseReviewCorpus, selectReviews, type ReviewEntry } from "../lib/reviews";

process.env.NEBIUS_API_KEY = "test-key-not-real";
process.env.TAVILY_API_KEY = "test-tavily-not-real";
const realFetch = globalThis.fetch;
const realError = console.error;

interface Call { url: string; body: Record<string, any>; signal?: AbortSignal | null }
let calls: Call[] = [];
let tavily: (c: Call) => Response;
let superAnswer: string;

const reply = (content: string) => Response.json({ choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
const search = (...r: [string, string][]) => Response.json({ results: r.map(([title, url]) => ({ title, url, content: `${title} excerpt` })) });

beforeEach(() => {
  calls = [];
  console.error = () => {};
  tavily = (c) => search([`Hit feedback ${c.body.query.length}`, "https://www.gamedeveloper.com/design/hit-feedback"], [`Onboarding ${c.body.query.length}`, "https://gdcvault.com/play/1/onboarding"]);
  superAnswer = "{}";
  globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    const c = { url, body: JSON.parse(String(init.body)), signal: init.signal };
    calls.push(c);
    if (url.startsWith("https://api.tavily.com/")) return tavily(c);
    if (url.startsWith("https://api.tokenfactory.nebius.com/")) return c.body.model.includes("VL") ? reply("Frame 1: dark stage, fighters readable. Frame 2: sparks tiny.") : reply(superAnswer);
    throw new Error(`unexpected fetch to ${url}`);
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; console.error = realError; });

const crowd: CrowdRow[] = [{ id: "quit.casual", label: "Quit rate, casual", value: 0.97, display: "97%" }];
const input = { frames: ["/9j/AAAA", "/9j/BBBB", "/9j/CCCC", "/9j/DDDD"], frameTimes: [1, 3, 5, 7], crowd, gameText: ["THE MARKET CLOSES."], genre: "3D physics brawler", tuningKeys: new Set(["rules.cpuLowBlock"]), reviews: [] as ReviewEntry[] };
const rec = (over = {}) => ({ area: "readability", suggestion: "Brighten hit sparks.", evidence: [{ type: "frame", index: 2 }], howToTest: "Human playtesters.", strength: "suggestion", ...over });

test("omitting reviews does not load a corpus into the advisor", async () => {
  const { reviews, ...withoutReviews } = input;
  const result = await runAdvisor(withoutReviews);
  assert.equal(result.sources.filter((source) => source.kind === "review").length, 0);
});

test("explicit committed reviews reach synthesis as review sources; an absent review drops its whole recommendation", async () => {
  const reviews = parseReviewCorpus(corpus).entries;
  assert.ok(reviews.length > 0, "the production corpus contains real quotes");
  const selected = selectReviews(reviews, crowd);
  const review = selected[0];
  const missingUrl = "https://www.pcgamer.com/absent-advisor-test-review/";
  assert.ok(!reviews.some((entry) => entry.url === missingUrl));
  superAnswer = JSON.stringify({ recommendations: [
    rec({ evidence: [{ type: "review", url: review.url, quote: review.text }] }),
    rec({ evidence: [{ type: "review", url: missingUrl, quote: review.text }, { type: "frame", index: 1 }] }),
  ] });
  const result = await runAdvisor({ ...input, reviews });
  const sources = result.sources.filter((source) => source.kind === "review");
  assert.deepEqual(sources.map((source) => source.review), selected);
  const prompt = calls.filter((call) => call.url.includes("nebius"))[1].body.messages[1].content;
  for (const entry of selected) assert.ok(prompt.includes(JSON.stringify({ kind: "review", ...entry })));
  assert.equal(result.recommendations.length, 1);
  assert.equal(result.recommendations[0].evidence[0].type, "review");
  assert.equal(result.proposed, 2);
  assert.equal(result.dropped.recommendations, 1);
  assert.ok(result.dropped.reasons.includes("review citation must match a supplied corpus quote exactly"));
});

test("one vision call with 4 images, 3 domain-limited searches, one Super call with thinking off", async () => {
  superAnswer = "```json\n" + JSON.stringify({ recommendations: [rec({ area: "difficulty", howToTest: "Set rules.cpuLowBlock to 0.5 and replay the crowd.", evidence: [{ type: "web", url: "https://gdcvault.com/play/1/onboarding" }, { type: "crowd", row: "quit.casual" }], strength: "supported by crowd data" })] }) + "\n```";
  const r = await runAdvisor(input);

  const model = calls.filter((c) => c.url.includes("nebius"));
  assert.equal(model.length, 2);
  const [vl, sup] = model;
  assert.match(vl.body.model, /VL/);
  assert.equal(vl.body.messages[1].content.filter((p: any) => p.type === "image_url").length, 4);
  assert.match(sup.body.model, /super-120b/);
  assert.deepEqual(sup.body.chat_template_kwargs, { enable_thinking: false });
  assert.ok(!JSON.stringify(sup.body.messages).includes("data:image"), "frames go to the vision model only");
  assert.match(sup.body.messages[1].content, /Frame 1: dark stage/);            // the vision model's notes reach the synthesis call
  assert.match(sup.body.messages[1].content, /quit\.casual \| Quit rate, casual \| 97%/);
  assert.match(sup.body.messages[1].content, /THE MARKET CLOSES\./);

  const searches = calls.filter((c) => c.url.includes("tavily"));
  assert.equal(searches.length, 3);
  for (const s of searches) {
    assert.ok(s.body.include_domains.includes("gamedeveloper.com") && s.body.include_domains.includes("gdcvault.com"));
    assert.ok(!s.body.exclude_domains);
    assert.match(s.body.query, /^fighting game /);
  }
  assert.equal(r.sources.length, 2);                                              // the same two URLs came back for every query
  assert.equal(r.recommendations.length, 1);
  assert.equal(r.recommendations[0].strength, "supported by crowd data");
  assert.equal(r.proposed, 1);
});

test("an invented URL and an unsupported claim are dropped, and counted", async () => {
  superAnswer = JSON.stringify({ recommendations: [
    rec(),
    rec({ evidence: [{ type: "web", url: "https://www.gamedeveloper.com/design/made-up" }] }),
    rec({ suggestion: "Copy the viral look.", evidence: [{ type: "frame", index: 1 }] }),
  ] });
  const r = await runAdvisor(input);
  assert.equal(r.proposed, 3);
  assert.equal(r.recommendations.length, 1);
  assert.equal(r.dropped.recommendations, 2);
  assert.equal(r.dropped.evidence, 1);
});

test("a failed search leaves sources out; all failed means the model is told there is nothing to cite", async () => {
  tavily = () => new Response("nope", { status: 500 });
  superAnswer = JSON.stringify({ recommendations: [rec({ evidence: [{ type: "web", url: "https://gdcvault.com/play/1/onboarding" }] })] });
  const r = await runAdvisor(input);
  assert.deepEqual(r.searches, { run: 3, failed: 3 });
  assert.equal(r.sources.length, 0);
  assert.equal(r.recommendations.length, 0);                                      // no search results, so no web evidence can be valid
  assert.match(calls.filter((c) => c.url.includes("nebius"))[1].body.messages[1].content, /no results; do not cite any web source/);
});

test("a synthesis answer that is not JSON is retried once, then it is an error, not an empty success", async () => {
  superAnswer = "Here are my thoughts, no JSON.";
  await assert.rejects(() => runAdvisor(input), /did not return JSON/);
  assert.equal(calls.filter((c) => c.url.includes("nebius") && !c.body.model.includes("VL")).length, 2);
  assert.equal(calls.filter((c) => c.url.includes("tavily")).length, 3, "the retry does not search again");
});

test("a first answer that is not JSON and a second that is: success after one retry", async () => {
  let n = 0;
  const inner = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (String(input).includes("nebius") && !String(body.model).includes("VL") && ++n === 1) return reply("Sure! Let me think about that first.");
    return inner(input, init);
  }) as typeof fetch;
  superAnswer = JSON.stringify({ recommendations: [rec()] });
  const r = await runAdvisor(input);
  assert.equal(r.recommendations.length, 1);
  assert.equal(calls.filter((c) => c.url.includes("nebius") && !c.body.model.includes("VL")).length, 1, "the fake records only the call that reached it");
});

test("both model calls have a timeout, so a hung model cannot hold the route open", async () => {
  superAnswer = JSON.stringify({ recommendations: [rec()] });
  await runAdvisor(input);
  const model = calls.filter((c) => c.url.includes("nebius"));
  assert.equal(model.length, 2);
  for (const c of model) assert.ok(c.signal, `${c.body.model} was called without a timeout signal`);
});

test("a failing model call is retried once, not four times", async () => {
  for (const failing of ["VL", "super"]) {
    calls = [];
    const inner = globalThis.fetch;
    globalThis.fetch = (async (u: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (String(u).includes("nebius") && String(body.model).includes(failing)) { calls.push({ url: String(u), body }); return new Response("busy", { status: 503 }); }
      return inner(u, init);
    }) as typeof fetch;
    superAnswer = JSON.stringify({ recommendations: [rec()] });
    await assert.rejects(() => runAdvisor(input), /HTTP 503/);
    assert.equal(calls.filter((c) => c.url.includes("nebius") && c.body.model.includes(failing) ).length, 2, `${failing}: one try plus one retry`);
    globalThis.fetch = inner;
  }
});

test("the game text given to the model is what a dialogue quote is checked against", async () => {
  superAnswer = JSON.stringify({ recommendations: [rec({ area: "dialogue", suggestion: 'Shorten "THE MARKET CLOSES." to one beat.' }), rec({ area: "dialogue", suggestion: 'Shorten "THE MARKET OPENS." to one beat.' })] });
  const r = await runAdvisor(input);
  assert.equal(r.recommendations.length, 1);
  assert.match(r.recommendations[0].suggestion, /MARKET CLOSES/);
});
