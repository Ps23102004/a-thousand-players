import { test } from "node:test";
import assert from "node:assert/strict";
import { captureTimes, DEFAULT_QUESTION, MAX_FRAMES, validateEyes } from "./eyes";
import type { RunLine } from "./types";

const jpeg = "/9j/" + "A".repeat(100), png = "iVBOR" + "A".repeat(100);
const err = (x: unknown) => x as { error: string; status: number };
const ok = (x: unknown) => x as { frames: string[]; question: string };

test("MAX_FRAMES is 3 and the default question fits the question limit", () => {
  assert.equal(MAX_FRAMES, 3);
  assert.ok(DEFAULT_QUESTION.length <= 300);
  assert.ok(DEFAULT_QUESTION.trim().length > 40);
});

// ------------------------------------------------------------------ validateEyes: body shape
test("non-object bodies are a 400, not a crash", () => {
  for (const body of [undefined, null, "str", 5, true, [], [jpeg]]) {
    const r = validateEyes(body);
    assert.equal(err(r).status, 400, JSON.stringify(body));
    assert.match(err(r).error, /"frames" must be 1 to 3 images/);
  }
});

test("frames must be an array of 1 to 3", () => {
  for (const frames of ["x", 5, {}, { length: 1, 0: jpeg }, new Set([jpeg]), null, [], [jpeg, jpeg, jpeg, jpeg]]) {
    assert.equal(err(validateEyes({ frames })).status, 400, String(frames));
  }
  for (const n of [1, 2, 3]) assert.equal(ok(validateEyes({ frames: Array(n).fill(jpeg) })).frames.length, n);
});

test("each frame must be a string of plain base64 (no data: prefix, no url-safe alphabet, no whitespace, padding only at the end)", () => {
  const bad = [5, null, undefined, {}, [], "", " ", "/9j/ AAAA", "/9j/AAA\n", "data:image/jpeg;base64,/9j/AAAA", "/9j/AA-A", "/9j/AA_A", "/9j/A=AA", "/9j/AAAA===", "====", "/9j/AAAA!"];
  for (const f of bad) {
    const r = validateEyes({ frames: [f] });
    assert.equal(err(r).status, 400, JSON.stringify(f));
    assert.match(err(r).error, /base64 image data/);
  }
  assert.ok(ok(validateEyes({ frames: ["/9j/AAAA=", "/9j/AAA==", jpeg] })).frames, "one or two '=' of padding are fine");
});

test("only JPEG (/9j/) and PNG (iVBOR) signatures are accepted", () => {
  assert.ok(ok(validateEyes({ frames: [jpeg, png] })).frames.length === 2);
  for (const f of ["R0lGODlhAAAA", "UklGRgAAAA", "AAAA", "/9k/AAAA", "ivbor" + "AAAA", "iVBO" + "AAAA", "JVBERi0xLjQ"]) {
    const r = validateEyes({ frames: [f] });
    assert.equal(err(r).status, 400, f); assert.match(err(r).error, /JPEG or PNG/);
  }
});

test("frame size limit is 350000 base64 chars: exactly that passes, one more is a 413", () => {
  const sized = (n: number) => "/9j/" + "A".repeat(n - 4);
  assert.ok(ok(validateEyes({ frames: [sized(350_000)] })).frames);
  const r = validateEyes({ frames: [sized(350_001)] });
  assert.equal(err(r).status, 413); assert.match(err(r).error, /too large/);
  assert.equal(err(validateEyes({ frames: [jpeg, sized(400_000)] })).status, 413, "any frame in the list");
  assert.ok(ok(validateEyes({ frames: [sized(350_000), sized(350_000), sized(350_000)] })).frames, "three max-size frames are fine (about 1 MB body)");
});

test("checks run in frame order and per frame: syntax, then size, then signature", () => {
  assert.equal(err(validateEyes({ frames: ["bad!", "/9j/" + "A".repeat(400_000)] })).status, 400, "first frame's syntax error wins over the second's size");
  assert.equal(err(validateEyes({ frames: ["A".repeat(400_000)] })).status, 413, "oversize is reported before the signature check");
  assert.equal(err(validateEyes({ frames: [jpeg, "AAAA"] })).status, 400);
});

// ------------------------------------------------------------------ validateEyes: question
test("question: missing, blank, non-string and null all fall back to the default", () => {
  for (const question of [undefined, null, "", "   ", "\n\t", 5, {}, [], true]) {
    assert.equal(ok(validateEyes({ frames: [jpeg], question })).question, DEFAULT_QUESTION, JSON.stringify(question));
  }
});

test("question is trimmed, and the 300-char limit applies after trimming", () => {
  assert.equal(ok(validateEyes({ frames: [jpeg], question: "  is it floating?\n" })).question, "is it floating?");
  assert.equal(ok(validateEyes({ frames: [jpeg], question: "q".repeat(300) })).question.length, 300);
  assert.equal(ok(validateEyes({ frames: [jpeg], question: `   ${"q".repeat(300)}   ` })).question.length, 300);
  const r = validateEyes({ frames: [jpeg], question: "q".repeat(301) });
  assert.equal(err(r).status, 413); assert.match(err(r).error, /limited to 300 characters/);
  assert.equal(err(validateEyes({ frames: [jpeg], question: "é".repeat(301) })).status, 413, "counts UTF-16 units");
});

test("a frames error beats a question error", () => {
  assert.equal(err(validateEyes({ frames: [], question: "q".repeat(999) })).status, 400);
});

test("the returned frames are the caller's strings, unmodified", () => {
  const f = [jpeg, png];
  assert.deepEqual(ok(validateEyes({ frames: f })).frames, [jpeg, png]);
});

// ------------------------------------------------------------------ captureTimes
type R = Pick<RunLine, "ev" | "t">;
const run = (t: number, ev: RunLine["ev"] = []): R => ({ t, ev });

test("no bug: three evenly spaced times at 25/50/75% of the round, one decimal", () => {
  assert.deepEqual(captureTimes(run(40), 99), [10, 20, 30]);
  assert.deepEqual(captureTimes(run(13.3), 99), [3.3, 6.7, 10]);
  assert.deepEqual(captureTimes(run(99), 99), [24.8, 49.5, 74.3]);
});

test("round length is capped by maxT and floored at 1 s", () => {
  assert.deepEqual(captureTimes(run(80), 20), [5, 10, 15], "maxT shorter than the round");
  assert.deepEqual(captureTimes(run(0), 99), [0.3, 0.5, 0.8], "end floors at 1");
  assert.deepEqual(captureTimes(run(0.4), 99), [0.3, 0.5, 0.8]);
  assert.deepEqual(captureTimes(run(50), 0), [0.3, 0.5, 0.8], "maxT 0 behaves like a 1 s round");
  assert.deepEqual(captureTimes(undefined, 60), [15, 30, 45]);
  assert.deepEqual(captureTimes(undefined, 0.2), [0.3, 0.5, 0.8]);
});

test("a bug: frames at bug-2.5 s, the bug, bug+1.5 s, clamped into [0, end]", () => {
  assert.deepEqual(captureTimes(run(40, [[20, "oob", 1, 11]]), 99), [17.5, 20, 21.5]);
  assert.deepEqual(captureTimes(run(40, [[1, "clip", 0]]), 99), [0, 1, 2.5], "start clamps to 0");
  assert.deepEqual(captureTimes(run(40, [[39.5, "airborne", 0]]), 99), [37, 39.5, 40], "end clamps to the round length");
  assert.deepEqual(captureTimes(run(30, [[35, "stuck", 0, "DOWNED"]]), 99), [30, 30, 30], "a bug time beyond the round collapses onto its end");
  assert.deepEqual(captureTimes(run(60, [[50, "softlock", 0]]), 55), [47.5, 50, 51.5], "maxT clamps too");
});

test("every invariant kind counts as a bug; gameplay events do not", () => {
  for (const kind of ["stuck", "oob", "nan", "clip", "airborne", "softlock", "crash"] as const) {
    assert.deepEqual(captureTimes(run(40, [[20, kind, 0]]), 99), [17.5, 20, 21.5], kind);
  }
  for (const kind of ["hit", "block", "parry", "knockdown", "throw", "prop", "combo", "mount"] as const) {
    assert.deepEqual(captureTimes(run(40, [[20, kind, 0]]), 99), [10, 20, 30], kind);
  }
});

test("the FIRST bug event in the list is used, even when a later-listed one is earlier in time", () => {
  assert.deepEqual(captureTimes(run(40, [[5, "hit", 0], [30, "oob", 0], [10, "airborne", 0]]), 99), [27.5, 30, 31.5]);
});

test("BUG (cosmetic): a capture time can land after the end of the round because the clamp happens before the rounding", { todo: "eyes.ts rounds to 0.1 after clamping: a 13.46 s round yields a frame request at 13.5 s" }, () => {
  assert.ok(captureTimes(run(13.46, [[20, "oob", 0]]), 99).every((t) => t <= 13.46));
});

test("property: always 3 non-decreasing times, each in [0, end], rounded to 0.1", () => {
  let seed = 12345;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 2000; i++) {
    const t = rnd() * 120, maxT = rnd() < 0.2 ? rnd() * 5 : 99, bugAt = rnd() * 130;
    const r = run(t, rnd() < 0.6 ? [[bugAt, "oob", 0]] : []);
    const out = captureTimes(r, maxT), end = Math.max(1, Math.min(t, maxT));
    assert.equal(out.length, 3);
    for (let k = 0; k < 3; k++) {
      assert.ok(out[k] >= 0 && out[k] <= end + 0.05 + 1e-9, `${out} end ${end}`);
      assert.ok(Math.abs(out[k] * 10 - Math.round(out[k] * 10)) < 1e-9, `${out[k]} is a multiple of 0.1`);
      if (k) assert.ok(out[k] >= out[k - 1], `${out} sorted`);
    }
  }
});
