// npx tsx --test ai/triage.test.ts  (no network: global fetch is replaced by a fake Token Factory)
// Patch anchoring for Ultra's triage: line-range patches, tolerant `find` matching (unique / ambiguous / absent), and the
// closest-lines hint a rejected answer gets back. Every accepted patch is mapped to an exact find/replace for applyPatches.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, beforeEach, test } from "node:test";
import { triageBug, validatePatches, type BugCluster } from "./triage";

process.env.NEBIUS_API_KEY = "test-key-not-real";
const realFetch = globalThis.fetch;
const realError = console.error;

const SRC = mkdtempSync(join(tmpdir(), "triage-anchor-"));
after(() => rmSync(SRC, { recursive: true, force: true }));
const GROUND = [
  "// ground.js",                                   // 1
  "export function tick(s) {",                      // 2
  "  s.y += s.vy;",                                 // 3
  "  if (prop.rigidBody && !prop.isBroken) {",      // 4
  "    prop.rigidBody.setLinvel(v, true);",         // 5
  "  }",                                            // 6
  "  s.y += s.vy;",                                 // 7
  "  }",                                            // 8
  "}",                                              // 9
].join("\n") + "\n";
for (const f of ["ground.js", "grapple.js", "props.js", "combat.js", "character.js", "player.js", "ai.js", "movement.js"]) writeFileSync(join(SRC, f), f === "ground.js" ? GROUND : `// ${f}\n`);

test("line range: whole lines become an exact find; the replace is taken as given", () => {
  assert.deepEqual(validatePatches([{ file: "ground.js", startLine: 4, endLine: 6, replace: "  if (prop.rigidBody) {}" }], SRC),
    [{ file: "ground.js", find: "  if (prop.rigidBody && !prop.isBroken) {\n    prop.rigidBody.setLinvel(v, true);\n  }", replace: "  if (prop.rigidBody) {}" }]);
});

test("line range: a range whose text repeats elsewhere grows by neighbouring lines until it is unique", () => {
  // line 3 "  s.y += s.vy;" also appears at line 7, so the previous line is taken into find and replace
  const [p] = validatePatches([{ file: "ground.js", startLine: 3, endLine: 3, replace: "  s.y += s.vy * dt;" }], SRC);
  assert.equal(p.find, "export function tick(s) {\n  s.y += s.vy;");
  assert.equal(p.replace, "export function tick(s) {\n  s.y += s.vy * dt;");
});

test("line range: copied 'NNN| ' prefixes in replace are stripped when every line has one", () => {
  const [p] = validatePatches([{ file: "ground.js", startLine: 5, endLine: 5, replace: "5|     prop.rigidBody.setLinvel(w, true);" }], SRC);
  assert.equal(p.replace, "    prop.rigidBody.setLinvel(w, true);");
});

test("line range: out of bounds, reversed, non-integer or over 12 lines is rejected with the reason", () => {
  const r = (startLine: unknown, endLine: unknown) => () => validatePatches([{ file: "ground.js", startLine, endLine, replace: "" }], SRC);
  assert.throws(r(0, 2), /lines 1-10/, "the trailing newline counts as line 10, as in the numbered bundle");
  assert.throws(r(9, 11), /lines 1-10/);
  assert.throws(r(5, 4), /startLine/);
  assert.throws(r(1.5, 2), /integers/);
  writeFileSync(join(SRC, "props.js"), Array.from({ length: 40 }, (_, i) => `const p${i} = ${i};`).join("\n"));
  assert.throws(() => validatePatches([{ file: "props.js", startLine: 1, endLine: 13, replace: "" }], SRC), /at most 12 lines/);
  assert.equal(validatePatches([{ file: "props.js", startLine: 1, endLine: 12, replace: "" }], SRC).length, 1);
});

test("tolerant find: unique whitespace-insensitive match maps to the file's exact text", () => {
  // spacing and indentation differ from the file
  const [p] = validatePatches([{ file: "ground.js", find: "if(prop.rigidBody&&!prop.isBroken){\nprop.rigidBody.setLinvel(v,true);", replace: "if (x) {" }], SRC);
  assert.equal(p.find, "if (prop.rigidBody && !prop.isBroken) {\n    prop.rigidBody.setLinvel(v, true);");
});

test("tolerant find: ambiguous (exact or loose match in 2 places) is rejected, never guessed", () => {
  assert.throws(() => validatePatches([{ file: "ground.js", find: "s.y += s.vy;", replace: "" }], SRC), /occurs 2 times/);
  assert.throws(() => validatePatches([{ file: "ground.js", find: "s.y+=s.vy;", replace: "" }], SRC), /occurs 2 times/);
});

test("tolerant find: absent text is rejected and the error quotes the closest real lines with numbers", () => {
  assert.throws(() => validatePatches([{ file: "ground.js", find: "prop.rigidBody.setAngvel(v, true);", replace: "" }], SRC),
    (e: Error) => /occurs 0 times/.test(e.message) && /5\|     prop\.rigidBody\.setLinvel\(v, true\);/.test(e.message));
});

test("a patch set that changes only whitespace, or changes the bracket balance (a dropped line), is rejected", () => {
  writeFileSync(join(SRC, "ground.js"), GROUND);
  assert.throws(() => validatePatches([{ file: "ground.js", startLine: 5, endLine: 5, replace: "     prop.rigidBody.setLinvel(v, true);" }], SRC), /only whitespace/);
  const reindent = { file: "ground.js", startLine: 5, endLine: 5, replace: "     prop.rigidBody.setLinvel(v, true);" };
  assert.deepEqual(validatePatches([reindent, { file: "ground.js", startLine: 9, endLine: 9, replace: "} // end" }], SRC).map((p) => p.replace), ["  }\n} // end"], "a re-indent next to a real patch is dropped, not fatal (line 9 grew by line 8 to be unique)");
  assert.throws(() => validatePatches([{ file: "ground.js", startLine: 4, endLine: 6, replace: "  if (prop.rigidBody) {\n    prop.rigidBody.setLinvel(v, true);" }], SRC), /bracket balance/);
  assert.equal(validatePatches([{ file: "ground.js", startLine: 4, endLine: 6, replace: "  if (prop.rigidBody) { prop.rigidBody.setLinvel(v, true); }" }], SRC).length, 1, "joining lines keeps the balance");
});

// ---------- triageBug with a fake model ----------

let calls: string[] = [];
let answers: string[] = [];
beforeEach(() => {
  calls = [];
  console.error = () => {};
  globalThis.fetch = (async (_: unknown, init: RequestInit = {}) => {
    const body = JSON.parse(String(init.body));
    calls.push(body.messages.at(-1).content);
    return Response.json({ choices: [{ message: { content: answers[calls.length - 1] }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 20 } });
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; console.error = realError; });

const bug: BugCluster = {
  id: "b1", signature: "airborne", count: 1, rounds: [{ p: "p0001", round: 1, seed: 1, label: "airborne", t: 12, out: "loss" }],
  representative: { p: "p0001", round: 1, seed: 1, label: "airborne" }, timeline: ["t=1.0 y=2.1"],
};
const fenced = (patches: unknown) => "```json\n" + JSON.stringify({ title: "t", isRealBug: true, severity: "high", rootCause: "ground.js:5", playerImpact: "p", patches, confidence: 0.9 }) + "\n```";

test("triageBug asks for line ranges and maps them; a rejected answer gets the closest lines back", async () => {
  writeFileSync(join(SRC, "ground.js"), GROUND);
  answers = [fenced([{ file: "ground.js", find: "prop.rigidBody.setAngvel(v, true);", replace: "" }]), fenced([{ file: "ground.js", startLine: 5, endLine: 5, replace: "    prop.rigidBody.setLinvel(w, true);" }])];
  const t = await triageBug(bug, SRC, "", { attempts: 2 });
  assert.equal(calls.length, 2);
  assert.match(calls[0], /"startLine"/);
  assert.match(calls[1], /rejected: patch 0: find text occurs 0 times[\s\S]*5\|     prop\.rigidBody\.setLinvel/);
  assert.deepEqual(t.patches, [{ file: "ground.js", find: "    prop.rigidBody.setLinvel(v, true);", replace: "    prop.rigidBody.setLinvel(w, true);" }]);
});
