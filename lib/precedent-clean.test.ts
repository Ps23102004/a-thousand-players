import test from "node:test";
import assert from "node:assert/strict";
import { cleanPrecedent } from "./precedent-clean";

const ok = { title: "Difficulty curves", url: "https://x.test/a", snippet: "If you fail to understand the skill curve add difficulty." };

test("keeps ordinary snippets", () => assert.deepEqual(cleanPrecedent([ok]), [ok]));

test("drops scraped news, shortcodes, maintenance and sponsored pages", () => {
  const junk = [
    { ...ok, title: "R6 patch notes", snippet: "### Tammy Duckworth Says Trump Is Still Blocking Energy Funding" },
    { ...ok, title: "Retention", snippet: "can become significant.[caption id=\"attachment_" },
    { ...ok, title: "GDC Vault", snippet: "Sorry for the inconvenience. We're performing scheduled maintenance" },
    { ...ok, title: "GDC Festival", snippet: "Apr 20, 2026 Sponsored Contentplay_arrow Beyond Outsourcing" },
  ];
  assert.deepEqual(cleanPrecedent([...junk, ok]), [ok]);
});

test("strips leading 'Title: ...' markdown and heading hashes from a kept snippet", () => {
  const r = cleanPrecedent([{ ...ok, snippet: "Title: Street Fighter 6 Balance Patch # Street Fighter 6 Alex nerfs jab damage." }]);
  assert.equal(r[0].snippet.includes("Title:"), false);
  assert.equal(r[0].snippet.includes("#"), false);
});

test("the committed Ultra findings show no scraped news or shortcodes after cleaning", async () => {
  const { readFileSync } = await import("node:fs");
  const data = JSON.parse(readFileSync("data/run-main/findings.json", "utf8")) as { findings: { precedent?: { title: string; url: string; snippet: string }[] }[] };
  const shown = data.findings.flatMap((f) => cleanPrecedent(f.precedent ?? []));
  assert.ok(shown.length >= 10, `expected most precedent links to survive, got ${shown.length}`);
  for (const p of shown) assert.doesNotMatch(p.snippet, /Trump|Duckworth|\[caption|maintenance|Sponsored|^Title:/i);
});

test("review: a relevant patch-notes snippet with a heading in the middle is kept", () => {
  const notes = { ...ok, title: "Patch Notes v1.13", snippet: "Developer Comments: the goal is to make Full Block less dominant. ### Fighters. Jab recovery +2 frames." };
  assert.equal(cleanPrecedent([notes]).length, 1);
});

test("security review: only http(s) links survive (no javascript: or data: URLs from a search provider)", () => {
  const bad = [{ ...ok, url: "javascript:alert(1)" }, { ...ok, url: "data:text/html,x" }, { ...ok, url: "not a url" }];
  assert.deepEqual(cleanPrecedent([...bad, ok]), [ok]);
});

test("audit round 2: channel boilerplate, spam hosts and off-topic guides are dropped from the committed findings", async () => {
  const { readFileSync } = await import("node:fs");
  const data = JSON.parse(readFileSync("data/run-main/findings.json", "utf8")) as { findings: { precedent?: { title: string; url: string; snippet: string }[] }[] };
  const shown = data.findings.flatMap((f) => cleanPrecedent(f.precedent ?? []));
  for (const p of shown) {
    assert.doesNotMatch(p.snippet, /GDC talks cover|fresh GDC video|Subscribe to the channel/i);
    assert.doesNotMatch(p.url, /halloween-game-guide|realestatewebsites360/);
  }
  assert.ok(shown.length >= 8, `kept ${shown.length}`);
});

test("audit round 3: raw timestamped video transcripts are not shown as related reading", () => {
  const t = { ...ok, title: "Metagame Balance For eSports & Fighting Games", url: "https://www.youtube.com/watch?v=x", snippet: "[22:24] game in which that wasn't the case which would require essentially [22:32] us out of this dominant position" };
  assert.deepEqual(cleanPrecedent([t, ok]), [ok]);
});
