// npx tsx --test ai/precedent.test.ts  (no network: global fetch is replaced by a fake Tavily)
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import type { Finding } from "../lib/types";
import { BUG_DOMAINS, bugPrecedentQuery, EXCLUDE_DOMAINS, MAX_BUG_DESCRIPTION, precedentQuery, searchPrecedent } from "./precedent";

const realFetch = globalThis.fetch;
const savedKey = process.env.TAVILY_API_KEY;
let calls: { url: string; auth: string | null; body: Record<string, any> }[] = [];
let respond: () => Response;
beforeEach(() => {
  calls = [];
  process.env.TAVILY_API_KEY = "tvly-test-not-real";
  globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(input), auth: new Headers(init.headers).get("authorization"), body: JSON.parse(String(init.body)) });
    return respond();
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; process.env.TAVILY_API_KEY = savedKey; });

const finding = (kind: Finding["kind"], suggestion: string): Finding => ({ id: "f", title: "t", severity: "high", kind, narrative: "n", claims: [], seeds: [], suggestion, confidence: 0.5 });
const hit = (title: string, url: string) => ({ title, url, content: "c".repeat(400) });

test("precedentQuery: leads with a design topic (keyword match first, else the finding's kind) and asks for developer writeups", () => {
  assert.equal(precedentQuery(finding("difficulty", "Add a difficulty ramp")),
    "fighting game difficulty curve and new player onboarding: Add a difficulty ramp (developer postmortem, GDC talk, design article or patch notes)");
  assert.match(precedentQuery(finding("balance", "add a practice mode with move tutorials")), /^fighting game player progression and learning: /);
  assert.match(precedentQuery(finding("balance", "Report cohort-based win rates")), /^fighting game balance and player data: /);
  assert.match(precedentQuery(finding("balance", "Increase HP pools")), /^fighting game character balance patch: /);
  assert.equal(precedentQuery(finding("bug", "fix   the\n grounding")).includes("fix the grounding"), true, "whitespace collapsed");
  assert.ok(precedentQuery(finding("exploit", "y".repeat(1000))).length <= 380);
});

test("bugPrecedentQuery: wraps the description in fixed wording and never passes more than the limit through", () => {
  assert.equal(bugPrecedentQuery("  fighter  floats\nafter a grab "),
    "fighting game physics bug fix: fighter floats after a grab (collision, grounding or hitbox bug, how developers fixed it)");
  const q = bugPrecedentQuery("z".repeat(5000));
  assert.equal(q.split("z").length - 1, MAX_BUG_DESCRIPTION);
});

test("searchPrecedent: posts to Tavily with the key, excludes portals by default, keeps 3, drops same-title reposts, cuts snippets", async () => {
  respond = () => Response.json({ results: [hit("A", "https://a.com"), hit("A", "https://spam.com/a"), hit("B", "https://b.com"), hit("C", "https://c.com"), hit("D", "https://d.com")] });
  const out = await searchPrecedent("q");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.tavily.com/search");
  assert.equal(calls[0].auth, "Bearer tvly-test-not-real");
  assert.deepEqual(calls[0].body.exclude_domains, EXCLUDE_DOMAINS);
  assert.ok(EXCLUDE_DOMAINS.includes("poki.com") && EXCLUDE_DOMAINS.includes("mmafighting.com") && EXCLUDE_DOMAINS.includes("marketreportsworld.com"));
  assert.equal(calls[0].body.include_domains, undefined);
  assert.deepEqual(out.map((r) => r.url), ["https://a.com", "https://b.com", "https://c.com"]);
  assert.equal(out[0].snippet.length, 300);
});

test("searchPrecedent: an include list replaces the exclude list; HTTP errors throw; no key means no call", async () => {
  respond = () => Response.json({});
  assert.deepEqual(await searchPrecedent("q", BUG_DOMAINS), []);
  assert.deepEqual(calls[0].body.include_domains, BUG_DOMAINS);
  assert.equal(calls[0].body.exclude_domains, undefined);

  respond = () => new Response("nope", { status: 432 });
  await assert.rejects(searchPrecedent("q"), /Tavily HTTP 432/);

  calls = [];
  delete process.env.TAVILY_API_KEY;
  await assert.rejects(searchPrecedent("q"), /TAVILY_API_KEY is not set/);
  assert.equal(calls.length, 0);
});
