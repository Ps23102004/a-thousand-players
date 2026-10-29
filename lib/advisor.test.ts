// npx tsx --test lib/advisor.test.ts  (pure logic of Design Advisor mode: no network, no model)
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ADVISOR_DOMAINS, ADVISOR_FRAMES, DEFAULT_ROUND, advisorFrameTimes, advisorQueries, buildCrowdTable, extractGameText,
  parseRoundInput, parseRuleDefaults, validateAdvisorBody, validateRecommendations, type CrowdRow, type Source,
} from "./advisor";

const JPEG = "/9j/" + "A".repeat(200);

test("frame times: 4 ascending moments spread across the round", () => {
  const t = advisorFrameTimes(20);
  assert.equal(t.length, ADVISOR_FRAMES);
  assert.deepEqual(t, [...t].sort((a, b) => a - b));
  assert.deepEqual(t, [1.5, 6.7, 11.8, 17]);
  assert.equal(advisorFrameTimes(0).length, 4);            // unknown length falls back to a 10 s round
  assert.ok(advisorFrameTimes(0).every((x) => x >= 0 && x <= 10));
});

test("frame times stop before the first engine-detected bug, so the camera is not following a fighter into the void", () => {
  const ev: [number, string, number][] = [[3, "hit", 0], [13.8, "airborne", 0], [14.3, "oob", 0]];
  assert.deepEqual(advisorFrameTimes(99, ev), [1.5, 5.3, 9, 12.8]);
  assert.deepEqual(advisorFrameTimes(99, [[4, "oob", 0]]), [1.5, 29.1, 56.6, 84.1]);   // a bug at 4 s leaves no room: keep the normal spread
  assert.deepEqual(advisorFrameTimes(99, [[5, "hit", 0], [6, "block", 1]]), advisorFrameTimes(99));
});

test("request body: round key and exactly 4 JPEG/PNG frames", () => {
  const ok = validateAdvisorBody({ key: "p0537:1", frames: [JPEG, JPEG, JPEG, JPEG] });
  assert.ok(!("error" in ok) && ok.key === "p0537:1" && ok.frames.length === 4);
  const bad = (b: unknown, status: number) => { const r = validateAdvisorBody(b); assert.ok("error" in r && r.status === status, JSON.stringify(r)); };
  bad(null, 400);
  bad({ key: "p0537:1", frames: [JPEG] }, 400);                                  // too few
  bad({ key: "p0537:1", frames: [JPEG, JPEG, JPEG, JPEG, JPEG] }, 400);          // too many
  bad({ key: "../etc:1", frames: [JPEG, JPEG, JPEG, JPEG] }, 400);               // not a round key
  bad({ key: "p0537:1", frames: [JPEG, JPEG, JPEG, "data:image/png;base64,AAAA"] }, 400);
  bad({ key: "p0537:1", frames: [JPEG, JPEG, JPEG, "AAAA" + "A".repeat(100)] }, 400);   // not a JPEG/PNG header
  bad({ key: "p0537:1", frames: [JPEG, JPEG, JPEG, "/9j/" + "A".repeat(400_000)] }, 413);
});

const summary = {
  players: 1000, rounds: 2831,
  byArchetype: {
    casual: { players: 200, rounds: 440, winRate: 0.059, quitRate: 0.97, avgDuration: 10.9 },
    cheeser: { players: 100, rounds: 299, winRate: 0.923, quitRate: 0.06, avgDuration: 17.4 },
  },
  quitCurve: [{ round: 1, remaining: 1 }, { round: 2, remaining: 0.92 }, { round: 3, remaining: 0.566 }, { round: 4, remaining: 0.253 }],
};
const nerf = { byArchetype: { casual: { players: 200, rounds: 440, winRate: 0.09, quitRate: 0.9, avgDuration: 11 }, cheeser: { players: 100, rounds: 299, winRate: 0.82, quitRate: 0.1, avgDuration: 17 } } };
const table = () => buildCrowdTable({
  summary, sweepNerf: nerf,
  bugs: [{ id: "bug1", signature: "airborne", count: 21 }, { id: "bug3", signature: "crash:RuntimeError: unreachable in throwProp (props.js:303)", count: 3 }],
  topStrategy: { label: "Mid Grapple Cheese", winRate: 1, hits: { SWEEP: 117, GROUND: 49, JAB: 4 } },
  rules: { cpuLowBlock: 0, guardDamageMultiplier: 0.2 },
  round: { key: "p0537:1", out: "loss", t: 12.34, hp: [0, 40] },
});

test("crowd table: computed numbers, unique ids", () => {
  const rows = table();
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
  assert.equal(by["quit.casual"].display, "97%");
  assert.equal(by["win.cheeser"].display, "92%");
  assert.equal(by["quit.casual"].value, 0.97);
  // biggest drop is round 3 -> 4? 0.92->0.566 = 0.354, 0.566->0.253 = 0.313, 1->0.92 = 0.08
  assert.equal(by["wall.biggestDrop"].value, 0.354);
  assert.match(by["wall.biggestDrop"].label, /round 2 to 3/);
  assert.equal(by["remain.r3"].display, "57%");
  assert.match(by["sweepNerf.cheeser"].display, /92% before.*82% after/);
  assert.match(by["sweepNerf.casual"].display, /6% before.*9% after/);
  assert.equal(by["bugs.total"].value, 24);
  assert.equal(by["bug.bug1"].value, 21);
  assert.match(by["bug.bug3"].label, /throwProp/);
  assert.equal(by["exploit.top"].display, "69% of landed hits were SWEEP (win rate 100%)");   // 117 of 170
  assert.equal(by["rule.cpuLowBlock"].value, 0);
  assert.match(by["round.result"].display, /loss in 12\.3 s, hp 0 vs 40/);
});

test("crowd table: missing optional data leaves those rows out instead of inventing them", () => {
  const rows = buildCrowdTable({ summary, sweepNerf: null, bugs: [], topStrategy: null, rules: {}, round: null });
  const ids = rows.map((r) => r.id);
  assert.ok(ids.includes("quit.casual"));
  for (const gone of ["sweepNerf.cheeser", "bugs.total", "exploit.top", "rule.cpuLowBlock", "round.result"]) assert.ok(!ids.includes(gone), gone);
});

test("game text: story, help and ending strings from the HTML and hud.js, markup and code stripped", () => {
  const html = `<div id="story-modal"><h1>THE MARKET<br>CLOSES.<br><span>THE FIGHT<br>BEGINS.</span></h1>
    <p class="intro-copy">One last duel under the lanterns.</p><script>var x = "not shown";</script></div>
    <div id="help-modal"><h2 id="help-title">THE BASICS.</h2><p>Defeat your rival before the 99-second timer expires.</p>
    <div class="controls-grid"><span><kbd>J</kbd> Tap four times: jab</span></div><p class="tip">FIGHT SMART. Release between taps.</p></div>`;
  const hud = `title.textContent = draw ? 'DEAD HEAT.' : isVictory ? 'VICTORY.' : 'DEFEATED.';
    summary.textContent = draw ? 'The lanterns witnessed an even match. Settle it in a rematch.' : 'Every fighter starts somewhere.';
    el.style.width = 'px'; const x = 'player-health-bar'; stats.innerHTML = \`<span>\${a}</span>\`;`;
  const lines = extractGameText(html, hud);
  assert.ok(lines.includes("THE MARKET CLOSES. THE FIGHT BEGINS."), JSON.stringify(lines));
  assert.ok(lines.includes("One last duel under the lanterns."));
  assert.ok(lines.includes("J Tap four times: jab"));
  assert.ok(lines.includes("FIGHT SMART. Release between taps."));
  assert.ok(lines.includes("VICTORY.") && lines.includes("DEFEATED.") && lines.includes("DEAD HEAT."));
  assert.ok(lines.includes("The lanterns witnessed an even match. Settle it in a rematch."));
  assert.ok(!lines.some((l) => /not shown|player-health-bar|<|\$\{/.test(l)), JSON.stringify(lines));
});

test("rule defaults parsed from tuning.js ignore comments", () => {
  const js = `export const RULES = { guardDamageMultiplier: 0.2, postureOnBlock: 15,\n  // 1 = fix on; 0 = original (bug hunt H2: crouch)\n  mountReleaseFix: 1,\n  cpuLowBlock: 0 };\nexport const RULE_DEFAULTS = Object.freeze({ ...RULES });`;
  assert.deepEqual(parseRuleDefaults(js), { guardDamageMultiplier: 0.2, postureOnBlock: 15, mountReleaseFix: 1, cpuLowBlock: 0 });
});

test("search queries: server-built from the genre only, domains limited to developer and design sources", () => {
  const q = advisorQueries("3D physics brawler");
  assert.equal(q.length, 3);
  for (const x of q) { assert.ok(x.length <= 300); assert.ok(x.startsWith("fighting game ")); assert.ok(!/\d{4}|p0\d+/.test(x)); }
  assert.equal(new Set(q).size, q.length);
  assert.ok(advisorQueries("longboard downhill physics").every((x) => x.startsWith("longboard downhill physics ")));   // other genres search as themselves
  assert.ok(ADVISOR_DOMAINS.includes("gamedeveloper.com") && ADVISOR_DOMAINS.includes("gdcvault.com"));
  assert.ok(!ADVISOR_DOMAINS.some((d) => /reddit|youtube|medium|poki|ign\.com/.test(d)));
});

// ---- recommendation validation ----
const crowd: CrowdRow[] = [
  { id: "quit.casual", label: "Quit rate, casual", value: 0.97, display: "97%" },
  { id: "bug.bug1", label: "airborne", value: 21, display: "21 rounds" },
];
const sources: Source[] = [
  { title: "Readable hit feedback in fighting games", url: "https://www.gamedeveloper.com/design/hit-feedback", snippet: "Hit sparks and screen shake keep trades readable.", query: "q1" },
  { title: "Onboarding", url: "https://gdcvault.com/play/123/Onboarding", snippet: "Teach one verb at a time.", query: "q2" },
];
const keys = new Set(["rules.cpuLowBlock", "rules.postureOnBlock", "anim.SWEEP.recovery", "rival.decisionDelayMin"]);
const gameText = ["THE MARKET CLOSES. THE FIGHT BEGINS.", "Defeat your rival before the 99-second timer expires."];
const ctx = { frameCount: 4, crowd, sources, tuningKeys: keys, gameText };
const rec = (over: Record<string, unknown> = {}) => ({
  area: "readability", suggestion: "Make hit sparks brighter so trades stay readable.",
  evidence: [{ type: "frame", index: 2 }], howToTest: "Needs human playtesters.", strength: "suggestion", ...over,
});
const run = (recs: unknown[]) => validateRecommendations({ recommendations: recs }, ctx);

test("a well-formed recommendation passes, with evidence resolved by code", () => {
  const r = run([rec({ area: "difficulty", howToTest: "Set rules.cpuLowBlock to 0.5 and replay the crowd.", evidence: [{ type: "frame", index: 2, note: "sparks tiny" }, { type: "crowd", row: "quit.casual", value: "99%" }, { type: "web", url: "https://gdcvault.com/play/123/Onboarding", title: "made up title" }], strength: "supported by crowd data" })]);
  assert.equal(r.recommendations.length, 1);
  const ev = r.recommendations[0].evidence;
  assert.deepEqual(ev[0], { type: "frame", index: 2, note: "sparks tiny" });
  assert.deepEqual(ev[1], { type: "crowd", row: "quit.casual", label: "Quit rate, casual", display: "97%" });   // the model's "99%" is ignored
  assert.deepEqual(ev[2], { type: "web", url: "https://gdcvault.com/play/123/Onboarding", title: "Onboarding" });   // title comes from the search result
  assert.equal(r.recommendations[0].strength, "supported by crowd data");
  assert.equal(r.dropped.recommendations, 0);
});

test("no evidence: dropped", () => {
  const r = run([rec({ evidence: [] }), rec({ evidence: undefined }), rec({ evidence: "see frame 2" })]);
  assert.equal(r.recommendations.length, 0);
  assert.equal(r.dropped.recommendations, 3);
});

test("citing a URL that was not a search result drops the WHOLE recommendation, even with other valid evidence", () => {
  const invented = { type: "web", url: "https://www.gamedeveloper.com/design/invented-article" };
  const only = run([rec({ evidence: [invented] })]);
  assert.equal(only.recommendations.length, 0);
  assert.equal(only.dropped.evidence, 1);
  const mixed = run([rec({ evidence: [invented, { type: "frame", index: 1 }, { type: "web", url: "https://gdcvault.com/play/123/Onboarding" }] })]);
  assert.equal(mixed.recommendations.length, 0);
  assert.equal(mixed.dropped.recommendations, 1);
  assert.deepEqual(mixed.dropped.reasons, ["cites a web URL that was not a search result"]);
  assert.equal(mixed.dropped.evidence, 1);
  // a bad frame or crowd id still only removes that one item
  assert.equal(run([rec({ evidence: [{ type: "frame", index: 9 }, { type: "frame", index: 1 }] })]).recommendations.length, 1);
});

test("URL allow-list ignores case of the host, a trailing slash and a #fragment, but not a different path", () => {
  const ok = (url: string) => run([rec({ evidence: [{ type: "web", url }] })]).recommendations.length;
  assert.equal(ok("https://WWW.GameDeveloper.com/design/hit-feedback/"), 1);
  assert.equal(ok("https://www.gamedeveloper.com/design/hit-feedback#comments"), 1);
  assert.equal(ok("https://www.gamedeveloper.com/design/hit-feedback-2"), 0);
  assert.equal(ok("javascript:alert(1)"), 0);
  assert.equal(ok("not a url"), 0);
});

test("frame index must exist (1-based), crowd row must exist", () => {
  const r = run([
    rec({ evidence: [{ type: "frame", index: 0 }] }), rec({ evidence: [{ type: "frame", index: 5 }] }), rec({ evidence: [{ type: "frame", index: 1.5 }] }),
    rec({ evidence: [{ type: "crowd", row: "quit.nobody" }] }), rec({ evidence: [{ type: "frame", index: 4 }] }),
  ]);
  assert.equal(r.recommendations.length, 1);
  assert.equal(r.dropped.recommendations, 4);
});

test("'supported by crowd data' needs crowd evidence, a real tuning key in howToTest, and a difficulty or onboarding area", () => {
  const diff = { area: "difficulty", howToTest: "Set rules.cpuLowBlock to 0.5 and replay the crowd.", strength: "supported by crowd data" };
  const bug = [{ type: "crowd", row: "bug.bug1" }];
  const r = run([
    rec({ strength: "supported by crowd data" }),                                    // no crowd row
    rec({ strength: "proven", evidence: bug }),                                      // unknown strength word
    rec({ ...diff, evidence: bug }),                                                 // all three hold
    rec({ ...diff, area: "onboarding", suggestion: 'Reword "THE FIGHT BEGINS." so the first move is clear.', evidence: bug }),
    rec({ strength: "supported by crowd data", evidence: bug }),                     // readability, no key: forced down
    rec({ ...diff, area: "feedback", evidence: bug }),                               // a key, but the wrong area
  ]);
  assert.deepEqual(r.recommendations.map((x) => x.strength), ["suggestion", "suggestion", "supported by crowd data", "supported by crowd data", "suggestion", "suggestion"]);
  const noKey = run([rec({ ...diff, area: "onboarding", suggestion: 'Reword "THE FIGHT BEGINS."', howToTest: "Human playtesters.", evidence: bug })]);   // right area, no key
  assert.equal(noKey.recommendations[0].strength, "suggestion");
});

test("howToTest: must name a known tuning key or ask for human playtesters; an invented key drops the recommendation", () => {
  const r = run([
    rec({ area: "difficulty", howToTest: "Set rules.cpuLowBlock to 0.5 and replay the crowd." }),
    rec({ howToTest: "Run it with human playtesters." }),
    rec({ area: "difficulty", howToTest: "Set rules.cpuSmartness to 3." }),                       // invented key
    rec({ area: "difficulty", howToTest: "Set rules.cpuLowBlock to 0.5 and rules.madeUp to 1." }), // one real, one invented
    rec({ area: "difficulty", howToTest: "Just ship it." }),                                       // neither
    rec({ area: "difficulty", howToTest: "Human playtesters." }),                                  // a difficulty change must be testable with the crowd
  ]);
  assert.equal(r.recommendations.length, 2);
  assert.equal(r.dropped.recommendations, 4);
});

test("'viral', 'trending' and 'popular' claims survive only when a source THIS recommendation cites says the word", () => {
  const viralSrc: Source = { title: "Why this clip went viral", url: "https://gdcvault.com/x", snippet: "", query: "q3" };
  const c2 = { ...ctx, sources: [...sources, viralSrc] };
  const viral = rec({ suggestion: "Copy the viral hit-stop look so players keep playing." });
  assert.equal(run([viral]).recommendations.length, 0);
  assert.equal(run([rec({ suggestion: "Add the trending screen shake." })]).recommendations.length, 0);
  assert.equal(run([rec({ suggestion: "Use the popular red-flash hit effect." })]).recommendations.length, 0);
  assert.equal(validateRecommendations({ recommendations: [viral] }, c2).recommendations.length, 0);   // the source exists but is not cited by this recommendation
  const cited = rec({ suggestion: viral.suggestion, evidence: [{ type: "frame", index: 1 }, { type: "web", url: "https://gdcvault.com/x" }] });
  assert.equal(validateRecommendations({ recommendations: [cited] }, c2).recommendations.length, 1);
  const other = rec({ suggestion: viral.suggestion, evidence: [{ type: "web", url: "https://gdcvault.com/play/123/Onboarding" }] });   // cites a source that does not say it
  assert.equal(validateRecommendations({ recommendations: [other] }, c2).recommendations.length, 0);
  const stem = rec({ suggestion: "Follow the trending hit-stop look.", evidence: [{ type: "web", url: "https://gdcvault.com/x" }] });
  assert.equal(validateRecommendations({ recommendations: [stem] }, c2).recommendations.length, 0);   // the source says "viral", not "trending": the same word must appear
  assert.equal(run([rec({ suggestion: "Make hit sparks brighter." })]).recommendations.length, 1);   // control
});

test("a frame note the model writes cannot smuggle in 'viral' either", () => {
  assert.equal(run([rec({ evidence: [{ type: "frame", index: 1, note: "this look went viral" }] })]).recommendations.length, 0);
  assert.equal(run([rec({ evidence: [{ type: "frame", index: 1, note: "sparks are tiny" }] })]).recommendations.length, 1);
});

test("onboarding and dialogue suggestions must quote a line that appears verbatim in the game text the model was given", () => {
  const q = (area: string, suggestion: string) => run([rec({ area, suggestion })]).recommendations.length;
  assert.equal(q("dialogue", 'Shorten "THE MARKET CLOSES. THE FIGHT BEGINS." to one line.'), 1);
  assert.equal(q("onboarding", "Say what to press first, e.g. \u201CDefeat your rival before the 99-second timer expires.\u201D is not a teaching line."), 1);
  assert.equal(q("onboarding", 'Shorten "Defeat the rival in under a minute" so it teaches a move.'), 0);   // not in the game text
  assert.equal(q("dialogue", "Rewrite the intro story so it is shorter."), 0);                                // no quote at all
  assert.equal(q("dialogue", 'Cut the "a" part.'), 0);                                                         // a quote too short to mean anything
  assert.equal(q("readability", "Brighten hit sparks."), 1);                                                  // other areas need no quote
  assert.deepEqual(run([rec({ area: "dialogue" })]).dropped.reasons, ["onboarding and dialogue suggestions must quote a line of the game text"]);
  // a line past the 3500 characters the prompt shows the model was never given
  const long = { ...ctx, gameText: ["x".repeat(3600), "NEVER SHOWN TO THE MODEL."] };
  assert.equal(validateRecommendations({ recommendations: [rec({ area: "dialogue", suggestion: 'Cut "NEVER SHOWN TO THE MODEL."' })] }, long).recommendations.length, 0);
});

test("area must be one of the seven; at most 6 kept; garbage in gives nothing out", () => {
  assert.equal(run([rec({ area: "music" })]).recommendations.length, 0);
  assert.equal(run([rec({ suggestion: "" })]).recommendations.length, 0);
  assert.equal(run([rec({ suggestion: "x".repeat(601) })]).recommendations.length, 0);
  const seven = run(Array.from({ length: 8 }, (_, i) => rec({ suggestion: `Suggestion number ${i}` })));
  assert.equal(seven.recommendations.length, 6);
  assert.equal(seven.dropped.recommendations, 2);
  for (const junk of [null, "text", 5, [], {}, { recommendations: "x" }]) {
    const r = validateRecommendations(junk, ctx);
    assert.equal(r.recommendations.length, 0);
  }
  assert.equal(run([null, 3, "x", rec()]).recommendations.length, 1);
});

test("evidence is de-duplicated", () => {
  const r = run([rec({ evidence: [{ type: "frame", index: 2 }, { type: "frame", index: 2 }, { type: "crowd", row: "bug.bug1" }, { type: "crowd", row: "bug.bug1" }] })]);
  assert.equal(r.recommendations[0].evidence.length, 2);
});

test("round box: a key, a replay link with key=, a link with only a token, nothing, or junk", () => {
  assert.deepEqual(parseRoundInput(undefined), { key: DEFAULT_ROUND });
  assert.deepEqual(parseRoundInput("  "), { key: DEFAULT_ROUND });
  assert.deepEqual(parseRoundInput("p0009:3"), { key: "p0009:3" });
  assert.deepEqual(parseRoundInput("https://example.com/replay?key=p0009%3A3&t=abc"), { key: "p0009:3" });
  assert.deepEqual(parseRoundInput("/replay?key=p0009%3A3&t=abc"), { key: "p0009:3" });
  assert.deepEqual(parseRoundInput("/replay?t=abc123"), { token: "abc123" });
  assert.deepEqual(parseRoundInput("/replay?key=../../x:1&t=abc"), { token: "abc" });   // a bad key= falls back to the token
  assert.deepEqual(parseRoundInput("hello world"), {});
});
