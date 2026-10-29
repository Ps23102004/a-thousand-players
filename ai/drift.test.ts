import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDriftPrompt, runDrift, verifyDrift, type DriftSources } from "./drift";
import { ULTRA } from "./models";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const sources: DriftSources = {
  docs: { "docs/design.md": "Design: guard stops attacks.", "game/README.md": "Sweeps defeat standing guard." },
  code: { "game/src/combat.js": "// combat\nfunction applyHit() { return 1; }\nconst $guard = false;\n" },
};
const claim = (over = {}) => ({ docClaim: "guard stops attacks.", docFile: "docs/design.md", codeSymbol: "applyHit", codeFile: "game/src/combat.js", codeLine: 2, whatCodeDoes: "Illustrative fake contradiction, not a finding.", severity: "high", ...over });

test("keeps exact quote substrings, identifier matches and existing lines; counts every rejected item", () => {
  const invalid = [
    claim({ docClaim: "Guard stops attacks." }), claim({ docClaim: " " }),
    claim({ docFile: "game/README.md" }), claim({ docFile: "../../.env" }),
    claim({ codeSymbol: "apply" }), claim({ codeSymbol: "applyHit()" }),
    claim({ codeFile: "game/src/unknown.js" }), claim({ codeFile: "../../.env" }),
    ...[0, -1, 4, 1.5, "2"].map(codeLine => claim({ codeLine })),
    claim({ severity: "critical" }), claim({ whatCodeDoes: "" }), null,
  ];
  const result = verifyDrift(JSON.stringify({ claims: [claim(), ...invalid] }), sources);
  assert.equal(result.error, undefined);
  assert.equal(result.proposed, invalid.length + 1);
  assert.equal(result.verified, 1);
  assert.equal(result.dropped, invalid.length);
  assert.equal(result.claims.length, 1);
  assert.equal(result.claims[0].codeLineText, "function applyHit() { return 1; }");
  assert.equal(result.rejections.length, invalid.length);
});

test("literal dollar identifiers work, partial identifiers and inherited file names do not", () => {
  assert.equal(verifyDrift(JSON.stringify([claim({ codeSymbol: "$guard", codeLine: 3 })]), sources).verified, 1);
  assert.equal(verifyDrift(JSON.stringify([claim({ codeSymbol: "guard" }), claim({ codeFile: "toString" }), claim({ docFile: "toString" })]), sources).dropped, 3);
});

test("malformed JSON and wrong envelopes return a graceful error, never guessed findings", () => {
  for (const text of ["not JSON", "{broken", '{"claims":null}', '{}', 'null']) {
    const result = verifyDrift(text, sources);
    assert.match(result.error!, /JSON|claims/i);
    assert.deepEqual(result.claims, []);
    assert.equal(result.verified, 0);
  }
  assert.equal(verifyDrift('```json\n{"claims":[]}\n```', sources).error, undefined);
});

test("one fake Ultra call uses thinking off, no retries, and all source names with line numbers", async () => {
  let calls = 0;
  const result = await runDrift(sources, async options => {
    calls++;
    assert.equal(options.model, ULTRA);
    assert.equal(options.thinking, false);
    assert.equal(options.retries, 0);
    assert.match(options.user, /docs\/design.md/);
    assert.match(options.user, /game\/README.md/);
    assert.match(options.user, /game\/src\/combat.js/);
    assert.match(options.user, /2: function applyHit/);
    return { content: JSON.stringify([claim()]), reasoning: null, tokensIn: 12, tokensOut: 3, ms: 1, finishReason: "stop" };
  });
  assert.equal(calls, 1);
  assert.equal(result.verified, 1);
});

test("prompt stays within its character budget, preserves document text and marks omitted code", () => {
  const large = { ...sources, code: { "game/src/large.js": "const value = 1;\n".repeat(1000), "game/src/last.js": "function last() {}" } };
  const prompt = buildDriftPrompt(large, 4000);
  assert.ok(prompt.characters <= 4000);
  assert.equal(prompt.characters, prompt.text.length);
  assert.equal(prompt.estimatedTokens, Math.ceil(prompt.characters / 4));
  assert.ok(prompt.text.includes(sources.docs["docs/design.md"]));
  assert.match(prompt.text, /omitted/);
  assert.match(prompt.text, /game\/src\/last.js/);
  assert.throws(() => buildDriftPrompt(sources, 10), /budget/i);
});

test("CLI dry run and injected answers work offline, malformed answers preserve existing results", () => {
  mkdirSync("data/drift", { recursive: true });
  const scratch = mkdtempSync(resolve("data/drift/test-"));
  const output = join(scratch, "results.json");
  const answer = join(scratch, "answer.txt");
  const cli = (...args: string[]) => spawnSync(process.execPath, ["--import", "tsx", "ai/cli/drift.ts", ...args], { encoding: "utf8", timeout: 15_000, env: { ...process.env, NEBIUS_API_KEY: "" } });
  try {
    const dry = cli("--dry-run");
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /characters=\d+ estimatedTokens=\d+/);
    const valid = claim({ docFile: "game/README.md", docClaim: "Market Brawl", codeFile: "game/src/ai.js", codeSymbol: "updateRivalAI", codeLine: 1 });
    writeFileSync(answer, JSON.stringify({ claims: [valid, claim({ docClaim: "invented quote" })] }));
    const injected = cli("--results-from", answer, "--out", output);
    assert.equal(injected.status, 0, injected.stderr);
    assert.match(injected.stdout, /1 of 2 claims verified by code; 1 dropped/);
    const saved = readFileSync(output, "utf8");
    const data = JSON.parse(saved);
    assert.equal(data.placeholder, false);
    assert.equal(data.source, "injected");
    assert.equal(data.claims.length, 1);
    assert.equal(data.sourceHashes["game/src/ai.js"].length, 64);
    writeFileSync(answer, "broken JSON");
    const bad = cli("--results-from", answer, "--out", output);
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /Invalid JSON/);
    assert.equal(readFileSync(output, "utf8"), saved);
    assert.equal(cli("--dry-run", "--results-from", answer).status, 1);
    assert.equal(cli("--results-from", answer, "--out", "data/run-main/drift.json").status, 1);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});

test("static page renders placeholder, verified results, empty results and imported-answer caveat", async () => {
  const React = await import("react");
  const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server");
  const { default: Page } = await import("../app/modes/drift/page");
  const { default: stored } = await import("../data/drift/results.json");
  const data = stored as Record<string, unknown>;
  const original = structuredClone(data);
  const render = () => renderToStaticMarkup(React.createElement(Page));
  try {
    Object.assign(data, { placeholder: true });
    assert.match(render(), /not run yet/i);
    Object.assign(data, { placeholder: false, source: "injected", ...verifyDrift(JSON.stringify([claim(), claim({ docClaim: "invented" })]), sources) });
    const html = render();
    assert.match(html, /1 of 2 claims verified by code; 1 dropped/);
    assert.match(html, /Ultra proposed, code verified existence of the quote and symbol; whether the code really contradicts the doc is for a human to judge/);
    assert.match(html, /Imported answer/);
    assert.match(html, /guard stops attacks/);
    assert.match(html, /game\/src\/combat.js:2/);
    assert.doesNotMatch(html, /invented/);
    Object.assign(data, verifyDrift("[]", sources));
    assert.match(render(), /No claims passed/);
    assert.match(render(), /0 of 0 claims verified by code; 0 dropped/);
  } finally { for (const key of Object.keys(data)) delete data[key]; Object.assign(data, original); }
});
