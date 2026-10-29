import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { buildReviewCorpus, parseReviewCorpus, reviewSources, selectReviews, type ReviewEntry } from "./reviews";
import { buildFromSearches, tagWithLocal } from "../ai/cli/review-corpus";
import { synthesisPrompt, validateRecommendations } from "./advisor";
import { runAdvisor } from "../ai/advisor";
import { createElement } from "react";
import { createRequire } from "node:module";
import ReviewEvidence from "../app/modes/advisor/ReviewEvidence";

// This repo has react-dom but no @types/react-dom; keep the narrow test-only signature local.
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup: (node: ReturnType<typeof createElement>) => string;
};

// Invented test text, not public review evidence. Never committed to the production corpus.
const quote = "The camera is frustrating and hides the action.";
const entry: ReviewEntry = { text: quote, url: "https://www.pcgamer.com/fixture-review/", domain: "pcgamer.com", query: "fixture camera review", retrievedAt: "2026-10-29T00:00:00.000Z", theme: "camera", sentiment: "missed" };
const corpus = { version: 1, placeholder: false, entries: [entry] };
const crowd = [{ id: "camera", label: "Camera readability", value: 1, display: "fixture" }];
const context = { frameCount: 4, crowd, sources: reviewSources([entry]), reviews: [entry], tuningKeys: new Set<string>(), gameText: [] };
const rec = (evidence: unknown[] = [{ type: "review", url: entry.url, quote }], suggestion = "Players dislike the camera; try clearer framing.") => ({ area: "camera", suggestion, evidence, howToTest: "Human playtesters.", strength: "suggestion" });
const validate = (item = rec(), ctx = context) => validateRecommendations({ recommendations: [item] }, ctx);

test("corpus accepts only short attributed quotes and an explicitly empty placeholder", () => {
  assert.deepEqual(parseReviewCorpus(corpus), corpus);
  assert.deepEqual(parseReviewCorpus({ version: 1, placeholder: true, entries: [] }).entries, []);
  for (const bad of [
    { ...entry, text: "x".repeat(301) }, { ...entry, text: "" }, { ...entry, domain: "ign.com" },
    { ...entry, url: "https://pcgamer.com.evil.test/x" }, { ...entry, url: "javascript:alert(1)" },
    { ...entry, retrievedAt: "yesterday" }, { ...entry, theme: "invented" }, { ...entry, query: "" },
  ]) assert.throws(() => parseReviewCorpus({ ...corpus, entries: [bad] }));
  assert.throws(() => parseReviewCorpus({ ...corpus, placeholder: true }));
  const committed = JSON.parse(readFileSync(new URL("../data/reviews/corpus.json", import.meta.url), "utf8"));
  assert.doesNotThrow(() => parseReviewCorpus(committed));
});

test("builder preserves exact substrings, deduplicates url+text and applies keyword tags deterministically", () => {
  const content = `${quote} ${"extra ".repeat(90)}`;
  const responses = [{ query: entry.query, retrievedAt: entry.retrievedAt, results: [
    { url: entry.url, content }, { url: entry.url, content },
    { url: "https://evil.test/review", content: quote },
    { url: "https://ign.com/neutral", content: "This is an ambiguous sentence." },
    { url: "https://ign.com/good", content: "I love the responsive controls." },
  ] }];
  const a = buildReviewCorpus(responses);
  assert.deepEqual(a, buildReviewCorpus(responses));
  assert.equal(a.entries.length, 2);
  assert.equal(a.entries[0].text.length <= 300, true);
  assert.ok(content.includes(a.entries[0].text));
  assert.equal(a.entries[0].theme, "camera");
  assert.equal(a.entries[0].sentiment, "missed");
  assert.equal(a.entries[1].sentiment, "liked");
});

test("search builder caps even injected searches at twelve calls and does not retry", async () => {
  let n = 0;
  const built = await buildFromSearches(async () => { n++; return [{ title: "fixture", url: entry.url, snippet: quote }]; }, entry.retrievedAt);
  assert.equal(n, 12);
  assert.equal(built.entries.length, 1);
});

test("optional local tagging cannot rewrite the quote, invent a tag or execute source text", async () => {
  const candidate = { text: "A neutral camera sentence.", url: entry.url, domain: entry.domain, query: entry.query, retrievedAt: entry.retrievedAt };
  const fake = async () => JSON.stringify({ text: candidate.text, theme: "camera", sentiment: "liked" });
  assert.equal((await tagWithLocal(candidate, fake))?.text, candidate.text);
  assert.equal(await tagWithLocal(candidate, async () => JSON.stringify({ text: "rewritten", theme: "camera", sentiment: "liked" })), null);
  assert.equal(await tagWithLocal(candidate, async () => "not JSON"), null);
  assert.equal(await tagWithLocal(candidate, async () => JSON.stringify({ text: candidate.text, theme: "music", sentiment: "liked" })), null);
});

test("saved Tavily CLI is offline, deterministic and dry-run leaves output untouched", () => {
  const dir = mkdtempSync(join(tmpdir(), "reviews-test-"));
  try {
    const input = join(dir, "saved.json"), out = join(dir, "corpus.json");
    writeFileSync(input, JSON.stringify({ query: entry.query, retrievedAt: entry.retrievedAt, results: [{ url: entry.url, content: quote }] }));
    const args = ["--import", "tsx", "ai/cli/review-corpus.ts", "--results-from", input, "--out", out];
    const run = spawnSync(process.execPath, args, { encoding: "utf8", env: { ...process.env, TAVILY_API_KEY: "", NEBIUS_API_KEY: "" } });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(parseReviewCorpus(JSON.parse(readFileSync(out, "utf8"))).entries, [entry]);
    const before = readFileSync(out, "utf8");
    const dry = spawnSync(process.execPath, [...args, "--dry-run"], { encoding: "utf8" });
    assert.equal(dry.status, 0, dry.stderr);
    assert.equal(readFileSync(out, "utf8"), before);
    assert.match(dry.stdout, /dry-run.*1 quotes/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("CLI dry-run plans searches without credentials or input and normal mode requires an explicit input", () => {
  const args = ["--import", "tsx", "ai/cli/review-corpus.ts"];
  const dry = spawnSync(process.execPath, [...args, "--dry-run"], { encoding: "utf8", env: { ...process.env, TAVILY_API_KEY: "", NEBIUS_API_KEY: "" } });
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /12 Tavily calls; no network/);
  const normal = spawnSync(process.execPath, args, { encoding: "utf8" });
  assert.equal(normal.status, 1);
  assert.match(normal.stderr, /Offline by default/);
});

test("retrieval ranks by crowd theme and caps at eight without mutating the corpus", () => {
  const entries = Array.from({ length: 10 }, (_, n) => ({ ...entry, url: `https://ign.com/${n}`, domain: "ign.com", theme: n === 9 ? "camera" as const : "visuals" as const }));
  const selected = selectReviews(entries, crowd);
  assert.equal(selected.length, 8);
  assert.equal(selected[0].url, "https://ign.com/9");
  assert.equal(entries[0].url, "https://ign.com/0");
});

test("review citations require a supplied source, corpus membership and an exact quote", () => {
  const result = validate();
  assert.equal(result.recommendations.length, 1);
  assert.deepEqual(result.recommendations[0].evidence[0], { type: "review", url: entry.url, quote, domain: entry.domain, retrievedAt: entry.retrievedAt, theme: entry.theme, sentiment: entry.sentiment });
  for (const bad of [
    { type: "review", url: entry.url }, { type: "review", url: entry.url, quote: "invented quote" },
    { type: "review", url: "https://ign.com/invented", quote }, { type: "review", url: entry.url, quote: "x".repeat(301) },
  ]) assert.equal(validate(rec([bad, { type: "frame", index: 1 }])).recommendations.length, 0);
  assert.equal(validate(rec(), { ...context, reviews: [] }).recommendations.length, 0);
  assert.equal(validate(rec(), { ...context, sources: [] }).recommendations.length, 0);
  assert.equal(validate(rec([{ type: "web", url: entry.url }])).recommendations.length, 0, "web cannot bypass review quote verification");
});

test("player opinion claims in suggestions, test instructions and frame notes need a review on that recommendation", () => {
  for (const claim of ["Players say the camera hides action.", "Players like clear framing.", "Players dislike the camera.", "Reviewers praised the camera.", "Player reviews complain about clutter.", "Fans love the visuals."]) {
    assert.equal(validate(rec([{ type: "frame", index: 1 }], claim)).recommendations.length, 0, claim);
    assert.equal(validate(rec(undefined, claim)).recommendations.length, 1, claim);
  }
  assert.equal(validate({ ...rec([{ type: "frame", index: 1 }], "Brighten the view."), howToTest: "Human playtesters; players prefer this." }).recommendations.length, 0);
  assert.equal(validate(rec([{ type: "frame", index: 1, note: "Players say it is bad." }], "Brighten the view.")).recommendations.length, 0);
  assert.equal(validate(rec([{ type: "frame", index: 1 }], "Try clearer framing.")).recommendations.length, 1);
});

test("passive opinion and review attribution cannot bypass the review requirement", () => {
  for (const claim of ["The camera is hated by players.", "The controls are praised in player reviews.", "This is a fan favorite.", "Player feedback calls the camera frustrating."]) {
    assert.equal(validate(rec([{ type: "frame", index: 1 }], claim)).recommendations.length, 0, claim);
  }
  assert.equal(validate(rec(), { ...context, reviews: [{ ...entry, text: "x".repeat(301) }] }).recommendations.length, 0);
});

test("prompt identifies public reviews as quoted retrieval, with explicit quote citation format", () => {
  const p = synthesisPrompt({ frameNotes: "", frameTimes: [], crowd, gameText: [], sources: context.sources, tuningKeys: [] });
  assert.match(p.user, /Player opinion \(public reviews\)/);
  assert.ok(p.user.includes(quote));
  assert.match(p.system, /"type":"review"/);
  assert.match(p.system, /not training/i);
});

test("review UI labels public opinion and renders the stored quote, domain, date and safe source link", () => {
  const html = renderToStaticMarkup(createElement(ReviewEvidence, { review: entry }));
  assert.match(html, /Player opinion \(public reviews\)/);
  assert.ok(html.includes(quote));
  assert.ok(html.includes(`href="${entry.url}"`));
  assert.ok(html.includes(entry.domain));
  assert.ok(html.includes(entry.retrievedAt));
  assert.match(html, /<blockquote/);
  assert.match(html, /rel="noreferrer noopener"/);
});

test("fake advisor model receives the selected corpus and cannot invent review quotes", async () => {
  const realFetch = globalThis.fetch;
  const oldKey = process.env.NEBIUS_API_KEY, oldTavily = process.env.TAVILY_API_KEY;
  process.env.NEBIUS_API_KEY = "fake"; process.env.TAVILY_API_KEY = "fake";
  let prompt = "";
  globalThis.fetch = (async (url, init) => {
    const body = JSON.parse(String(init?.body));
    if (String(url).includes("tavily")) return Response.json({ results: [] });
    const vision = body.model.includes("VL");
    if (!vision) prompt = body.messages[1].content;
    return Response.json({ choices: [{ message: { content: vision ? "Frame 1: fixture" : JSON.stringify({ recommendations: [rec(), rec([{ type: "review", url: entry.url, quote: "invented" }])] }) }, finish_reason: "stop" }] });
  }) as typeof fetch;
  try {
    const result = await runAdvisor({ frames: ["/9j/AAAA"], frameTimes: [1], crowd, gameText: [], genre: "brawler", tuningKeys: new Set(), reviews: corpus.entries });
    assert.ok(prompt.includes(quote));
    assert.equal(result.sources[0].kind, "review");
    assert.equal(result.recommendations.length, 1);
    assert.equal(result.dropped.recommendations, 1);
  } finally {
    globalThis.fetch = realFetch;
    if (oldKey === undefined) delete process.env.NEBIUS_API_KEY; else process.env.NEBIUS_API_KEY = oldKey;
    if (oldTavily === undefined) delete process.env.TAVILY_API_KEY; else process.env.TAVILY_API_KEY = oldTavily;
  }
});
