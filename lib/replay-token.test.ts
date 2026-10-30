import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeToken, encodeToken, fighterFor } from "./replay-token";
import type { Persona, ReplayToken } from "./types";

const persona: Persona = { id: "p0001", name: "Mira", archetype: "turtle", skill: 0.6, reaction_ticks: 14, patience: 0.4, frustration_tolerance: 0.7, bio: "blocks everything", rules: [{ dist: "close", rival: "recovery", weights: { sweep: 4, block: 1 } }] };
const base: ReplayToken = { seed: 8812, tuning: null, fighter: "kai", maxT: 60 };
const b64 = (s: string) => Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const tokenOf = (o: unknown) => b64(JSON.stringify(o));

test("proof replay links pin all recorded flags only on their before side", () => {
  const recorded = JSON.parse(readFileSync("data/run-main/meta.json", "utf8")).recordedWith;
  const links = [...readFileSync("docs/PROOF.md", "utf8").matchAll(/\/replay\?t=([\w-]+)/g)];
  assert.equal(links.length, 8);
  for (let i = 0; i < links.length; i++) {
    const token = decodeToken(links[i][1]);
    assert.ok(token);
    for (const [key, value] of Object.entries(recorded)) {
      assert.equal(token.tuning?.[key], i % 2 === 0 ? value : undefined, key);
    }
  }
});

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
  assert.ok(decodeToken(tokenOf({ ...base, persona: { ...persona, rules: [] } })), "persona with no rules");
  for (const i of [null, 5, "x", {}, { length: 1 }]) assert.equal(decodeToken(tokenOf({ ...base, inputs: i })), null, JSON.stringify(i));
  assert.deepEqual(decodeToken(tokenOf({ ...base, inputs: [] }))?.inputs, []);
});

test("unknown extra fields pass through (the engine stamps an `exp` field)", () => {
  const t = decodeToken(tokenOf({ ...base, exp: { hash: "abc", out: "win", t: 9.5 } })) as unknown as { exp: { hash: string } };
  assert.equal(t.exp.hash, "abc");
});

test("A11: size cap is 8000 characters, below Node's 16 KB header limit, so an oversized link gets the invalid-link page, not a raw 431", () => {
  // 6000 JSON bytes -> exactly 8000 base64 chars. Pad a rule string to hit that (persona text fields are length-capped).
  const make = (bytes: number) => {
    const empty = JSON.stringify({ ...base, persona: { ...persona, rules: [{ dist: "" }] } }).length;
    return encodeToken({ ...base, persona: { ...persona, rules: [{ dist: "x".repeat(bytes - empty) }] } });
  };
  const at = make(6000), over = make(6001), under = make(5999);
  assert.equal(at.length, 8000); assert.equal(under.length, 7999); assert.ok(over.length > 8000);
  assert.ok(decodeToken(at)); assert.ok(decodeToken(under)); assert.equal(decodeToken(over), null);
  assert.equal(decodeToken("A".repeat(8001)), null);
  assert.equal(decodeToken("A".repeat(10_000_000)), null, "huge input is cut off immediately");
});

test("a 300-key-change round of recorded inputs still fits in the cap; every shipped link is under 1000 chars", () => {
  let tick = 0;
  const inputs: [number, number][] = Array.from({ length: 300 }, (_, i) => [tick += 9 + (i % 7), (i * 37) % 4096]);
  const s = encodeToken({ ...base, maxT: 99, persona, inputs });
  assert.ok(s.length < 8000, `${s.length} chars`);
  assert.deepEqual(decodeToken(s)?.inputs, inputs);
});

test("A1: persona fields the page renders must be strings or numbers, never objects or arrays", () => {
  for (const [k, v] of [["skill", { a: 1 }], ["skill", [1]], ["bio", { a: 1 }], ["bio", ["x"]], ["id", { a: 1 }], ["id", []], ["name", ["x"]], ["archetype", {}], ["skill", "0.5"], ["reaction_ticks", null], ["patience", NaN], ["frustration_tolerance", "x"]] as const) {
    assert.equal(decodeToken(tokenOf({ ...base, persona: { ...persona, [k]: v } })), null, `${k}=${JSON.stringify(v)}`);
  }
});

test("A9: a persona with no id, null or non-object rules, bad rule weights, or malformed inputs is refused", () => {
  const { id: _id, ...noId } = persona;
  const bad: unknown[] = [
    { ...base, persona: noId }, { ...base, persona: { ...persona, id: "" } },
    { ...base, persona: { ...persona, rules: [null] } }, { ...base, persona: { ...persona, rules: [5] } }, { ...base, persona: { ...persona, rules: [[]] } },
    { ...base, persona: { ...persona, rules: [{ weights: null }] } }, { ...base, persona: { ...persona, rules: [{ weights: { sweep: "4" } }] } },
    { ...base, persona: { ...persona, rules: [{ dist: 5, weights: {} }] } },
    { ...base, inputs: [null] }, { ...base, inputs: ["x", [1]] }, { ...base, inputs: [[1]] }, { ...base, inputs: [[1, 2, 3]] }, { ...base, inputs: [[1, "2"]] }, { ...base, inputs: [[Infinity, 2]] },
    { ...base, tuning: [] }, { ...base, maxT: -5 }, { ...base, maxT: 0 },
  ];
  for (const b of bad) assert.equal(decodeToken(tokenOf(b)), null, JSON.stringify(b));
  assert.ok(decodeToken(tokenOf({ ...base, inputs: [[0, 8], [12, 0]] })));
});

test("A10: tuning keys must be in data/baseline-tuning.json or rules.<name>, with finite number values", () => {
  for (const tuning of [{ "rules.__proto__": 1 }, { "rules.constructor": 1 }, { "rules.": 1 }, { "nope.key": 1 }, { "anim.JAB.damage": "lots" }, { "anim.JAB.damage": null }, { "rules.mountReleaseFix": {} }]) {
    assert.equal(decodeToken(tokenOf({ ...base, tuning })), null, JSON.stringify(tuning));
  }
  assert.equal(decodeToken(b64(`{"seed":1,"maxT":60,"fighter":"kai","tuning":{"rules.__proto__":{"x":1}}}`)), null, "raw JSON rules.__proto__ key");
  assert.equal(decodeToken(b64(`{"seed":1,"maxT":60,"fighter":"kai","tuning":{"__proto__":{"x":1}}}`)), null, "raw JSON __proto__ key");
  assert.ok(decodeToken(tokenOf({ ...base, tuning: { "anim.JAB.damage": 12.5, "rules.mountReleaseFix": 0, "rules.someNewRule": 1 } })));
  assert.ok(decodeToken(tokenOf({ ...base, tuning: {} })));
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

test("security review: a replay link cannot put long arbitrary text on the page (persona name <= 40, archetype <= 40, bio <= 300 chars)", async () => {
  const { decodeToken, encodeToken } = await import("./replay-token");
  const persona = { id: "x", name: "Ada", archetype: "casual", bio: "plays a little", skill: 0.5, reaction_ticks: 10, patience: 1, frustration_tolerance: 1, rules: [] };
  const base = { seed: 1, tuning: null, fighter: "kai" as const, maxT: 10 };
  assert.ok(decodeToken(encodeToken({ ...base, persona } as never)), "a normal persona still decodes");
  for (const [field, n] of [["name", 41], ["archetype", 41], ["bio", 301]] as const) {
    assert.equal(decodeToken(encodeToken({ ...base, persona: { ...persona, [field]: "x".repeat(n) } } as never)), null, `${field} of ${n} chars is refused`);
  }
  const { readFileSync: rf } = await import("node:fs");
  const personas = JSON.parse(rf("data/run-main/personas.json", "utf8")) as { name: string; archetype: string; bio: string }[];
  assert.ok(personas.every((p) => p.name.length <= 40 && p.archetype.length <= 40 && p.bio.length <= 300), "every recorded persona fits");
});
