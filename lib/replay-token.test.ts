import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeToken, encodeToken, fighterFor } from "./replay-token";
import type { Persona, ReplayToken } from "./types";

const persona: Persona = { id: "p0001", name: "Mira", archetype: "turtle", skill: 0.6, reaction_ticks: 14, patience: 0.4, frustration_tolerance: 0.7, bio: "blocks everything", rules: [{ dist: "close", rival: "recovery", weights: { sweep: 4, block: 1 } }] };
const base: ReplayToken = { seed: 8812, tuning: null, fighter: "kai", maxT: 60 };
const b64 = (s: string) => Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const tokenOf = (o: unknown) => b64(JSON.stringify(o));

test("round trip keeps every field: tuning, persona with rules, inputs", () => {
  const t: ReplayToken = { ...base, tuning: { "anim.JAB.damage": 12.5, "rules.mountReleaseFix": 0 }, persona, inputs: [[0, 8], [12, 0], [40, 130]] };
  assert.deepEqual(decodeToken(encodeToken(t)), t);
  assert.deepEqual(decodeToken(encodeToken(base)), base);
});

test("output is url-safe base64 without padding for every payload length, including characters that map to + and /", () => {
  for (let n = 0; n < 60; n++) {
    const t = { ...base, persona: { ...persona, bio: "?>~".repeat(n) + "é✦".slice(0, n % 3) } };
    const s = encodeToken(t);
    assert.match(s, /^[A-Za-z0-9_-]+$/, `n=${n}`);
    assert.deepEqual(decodeToken(s), t, `n=${n}`);
  }
});

test("unicode and emoji survive (UTF-8, not Latin-1)", () => {
  const t = { ...base, persona: { ...persona, name: "Zoë 🥊 山田", bio: "naïve — ✦" } };
  assert.deepEqual(decodeToken(encodeToken(t)), t);
});

test("same bytes as the engine's Buffer base64url encoding", () => {
  const t = { ...base, persona, tuning: { "rules.postureOnBlock": 20 } };
  assert.equal(encodeToken(t), b64(JSON.stringify(t)));
});

test("decodeToken returns null (never throws) for missing, empty and garbage input", () => {
  for (const bad of [null, undefined, "", " ", "not-a-token", "!!!", "####", "a", "ab", "abc", "e30", "bnVsbA", "NQ", "W10", "InN0ciI", "%%%%%"]) {
    assert.equal(decodeToken(bad as string), null, JSON.stringify(bad));
  }
  assert.equal(decodeToken(b64("{not json")), null);
  assert.equal(decodeToken(b64("\xff\xfe\xfd")), null);
});

test("valid JSON that is not a token object is rejected: null, numbers, strings, arrays, empty object", () => {
  for (const v of [null, 5, "str", true, [], [1, 2], {}]) assert.equal(decodeToken(tokenOf(v)), null, JSON.stringify(v));
});

test("required fields: seed and maxT finite numbers, fighter kai|rook, tuning null or object", () => {
  const bad: unknown[] = [
    { ...base, seed: undefined }, { ...base, seed: "8812" }, { ...base, seed: null }, { ...base, seed: Infinity }, { ...base, seed: NaN },
    { ...base, maxT: undefined }, { ...base, maxT: "60" }, { ...base, maxT: null },
    { ...base, fighter: undefined }, { ...base, fighter: "zed" }, { ...base, fighter: "KAI" }, { ...base, fighter: 1 },
    { ...base, tuning: undefined }, { ...base, tuning: "x" }, { ...base, tuning: 5 },
  ];
  for (const b of bad) assert.equal(decodeToken(tokenOf(b)), null, JSON.stringify(b));
  for (const fighter of ["kai", "rook"] as const) assert.ok(decodeToken(tokenOf({ ...base, fighter })));
  assert.ok(decodeToken(tokenOf({ ...base, seed: 0 })), "seed 0 is legal");
});

test("persona must have a string name and a rules array; inputs must be an array; null is not 'absent'", () => {
  for (const p of [null, 5, "x", [], {}, { name: "x" }, { rules: [] }, { name: 5, rules: [] }, { name: "x", rules: "none" }, { name: "x", rules: {} }]) {
    assert.equal(decodeToken(tokenOf({ ...base, persona: p })), null, JSON.stringify(p));
  }
  assert.ok(decodeToken(tokenOf({ ...base, persona: { name: "x", rules: [] } })), "minimal persona");
  for (const i of [null, 5, "x", {}, { length: 1 }]) assert.equal(decodeToken(tokenOf({ ...base, inputs: i })), null, JSON.stringify(i));
  assert.deepEqual(decodeToken(tokenOf({ ...base, inputs: [] }))?.inputs, []);
});

test("unknown extra fields pass through (the engine stamps an `exp` field)", () => {
  const t = decodeToken(tokenOf({ ...base, exp: { hash: "abc", out: "win", t: 9.5 } })) as unknown as { exp: { hash: string } };
  assert.equal(t.exp.hash, "abc");
});

test("size cap: exactly 20000 characters is accepted, one more is refused before any decoding", () => {
  // 15000 JSON bytes -> exactly 20000 base64 chars. Pad the bio to hit that.
  const make = (bytes: number) => {
    const empty = JSON.stringify({ ...base, persona: { ...persona, bio: "" } }).length;
    return encodeToken({ ...base, persona: { ...persona, bio: "x".repeat(bytes - empty) } });
  };
  const at = make(15000), over = make(15001), under = make(14999);
  assert.equal(at.length, 20000); assert.equal(under.length, 19999); assert.ok(over.length > 20000);
  assert.ok(decodeToken(at)); assert.ok(decodeToken(under)); assert.equal(decodeToken(over), null);
  assert.equal(decodeToken("A".repeat(20001)), null);
  assert.equal(decodeToken("A".repeat(10_000_000)), null, "huge input is cut off immediately");
});

test("a 600-key-change round of recorded inputs still fits in the cap (spotlight / exploit replays)", () => {
  let tick = 0;
  const inputs: [number, number][] = Array.from({ length: 600 }, (_, i) => [tick += 9 + (i % 7), (i * 37) % 4096]);
  const s = encodeToken({ ...base, maxT: 99, persona, inputs });
  assert.ok(s.length < 20000, `${s.length} chars`);
  assert.deepEqual(decodeToken(s)?.inputs, inputs);
});

test("LIMIT: a replay carrying >1300 recorded key changes exceeds the 20000-char cap and silently stops decoding", { todo: "replay-token.ts hard-caps at 20000 chars. Shipped data does not hit it (genomes carry a persona, not inputs), but a long input-recorded replay link would be dead with no error." }, () => {
  let tick = 0;
  const inputs: [number, number][] = Array.from({ length: 1400 }, (_, i) => [tick += 4, (i * 37) % 4096]);
  assert.ok(decodeToken(encodeToken({ ...base, maxT: 99, inputs })));
});

test("BUG: shallow validation lets nonsense through to the simulator (tuning array / non-numeric tuning values / negative maxT / bad inputs)", { todo: "replay-token.ts validates types one level deep; the URL value is untrusted and feeds applyTuning()/createSim()" }, () => {
  assert.equal(decodeToken(tokenOf({ ...base, tuning: [] })), null, "tuning must be a plain object, not an array");
  assert.equal(decodeToken(tokenOf({ ...base, tuning: { "anim.JAB.damage": "lots" } })), null, "tuning values must be finite numbers");
  assert.equal(decodeToken(tokenOf({ ...base, maxT: -5 })), null, "maxT must be positive");
  assert.equal(decodeToken(tokenOf({ ...base, inputs: ["x", [1]] })), null, "inputs must be [tick, mask] number pairs");
});

// ------------------------------------------------------------------ fighterFor and the engine contract
test("fighterFor: FNV-1a parity with engine/crowd-worker-lib.mjs, including empty and non-ASCII ids", async () => {
  const engine = await import("../engine/crowd-worker-lib.mjs");
  const ids = ["", "a", "p0001", "p9999", "Zoë", "山田", "🥊", "x".repeat(300), ...Array.from({ length: 2000 }, (_, i) => `p${String(i).padStart(4, "0")}`)];
  for (const id of ids) assert.equal(fighterFor(id), engine.fighterFor(id), JSON.stringify(id));
  const rook = ids.filter((id) => fighterFor(id) === "rook").length;
  assert.ok(rook > 0.4 * ids.length && rook < 0.6 * ids.length, `${rook}/${ids.length} rook`);
});

test("engine/token.mjs output is accepted by decodeToken and re-encodes to the identical string", () => {
  const dir = mkdtempSync(join(tmpdir(), "token-"));
  const p = { id: "p0007", name: "Synth7", archetype: "explorer", skill: 0.55, reaction_ticks: 14, patience: 0.5, frustration_tolerance: 0.5, bio: "t", rules: [{ dist: "mid", weights: { prop: 3 } }] };
  writeFileSync(join(dir, "personas.json"), JSON.stringify([p]));
  writeFileSync(join(dir, "runs.jsonl"), JSON.stringify({ p: "p0007", round: 1, seed: 424242, out: "win", t: 10 }) + "\n");
  const r = spawnSync(process.execPath, ["engine/token.mjs", "p0007", "1", "--dir", dir, "--base", "http://x.test"], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const url = new URL(r.stdout.trim());
  const raw = url.searchParams.get("t")!;
  const tok = decodeToken(raw) as (ReplayToken & { exp: { hash: string; out: string; t: number } }) | null;
  assert.ok(tok, "decodeToken accepts what the engine emits");
  assert.equal(tok.seed, 424242); assert.equal(tok.fighter, fighterFor("p0007")); assert.equal(tok.maxT, 99); assert.equal(tok.tuning, null);
  assert.deepEqual(tok.persona, p);
  assert.match(tok.exp.hash, /^[0-9a-f]{17,}$/);
  assert.equal(encodeToken(tok), raw, "encode(decode(x)) === x, so web-created and engine-created links are interchangeable");
});
