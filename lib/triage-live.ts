// Live "Triage this" for one recorded round: evidence timeline -> up to TWO Nemotron Ultra calls (the second only after a failed validation) -> patch applied to a scratch copy of
// game/src -> the exact seed replayed before and after. Plain Node (fs, child_process); the model call is injected (`ask`) so the
// apply/replay half is testable without credits. Each replay runs in its own process: see app/api/triage/round.mjs.
import { execFile } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { triageBug, type BugCluster, type Patch, type Triage } from "@/ai";
import { fighterFor } from "./replay-token";
import type { Ev, Outcome, Persona, RunLine, Tuning } from "./types";
import type { TriageLiveResult, TriageLiveSide, TriageVerdict } from "./web-types";

const BUG_ORDER = ["crash", "stuck", "oob", "nan", "clip", "airborne", "softlock"];
export const BUG_CODES = new Set(BUG_ORDER);
export const isBug = (e: Ev) => BUG_CODES.has(e[1]);

/** Cluster signature as engine/bugs.mjs writes it: the round's distinct bug kinds (+ state / crash site), e.g. "stuck:KNOCKDOWN+airborne+softlock". */
export function signatureOf(ev: Ev[]): string {
  const kinds = ev.filter(isBug).map((e) => (e[1] === "stuck" || e[1] === "crash" ? `${e[1]}:${e[3]}` : e[1]));
  return [...new Set(kinds)].sort((a, b) => BUG_ORDER.indexOf(a.split(":")[0]) - BUG_ORDER.indexOf(b.split(":")[0])).join("+");
}

/** Request body check for the route: {p, round} only; the seed, persona and events come from the recorded data, never the client. */
export function validateTriageBody(body: unknown): { p: string; round: number } | { error: string; status: number } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.p !== "string" || !/^p\d{4}$/.test(b.p)) return { error: '"p" must be a persona id like p0537.', status: 400 };
  if (typeof b.round !== "number" || !Number.isInteger(b.round) || b.round < 1 || b.round > 99) return { error: '"round" must be a round number (1-99).', status: 400 };
  return { p: b.p, round: b.round };
}

export class TriageError extends Error {
  /** modelCalled: the error came after an Ultra call was sent, so the call counts against the rate limit. */
  /** free: the error was raised before any replay or model call, so the caller's rate-limit unit may be refunded. Nothing else is refundable. */
  constructor(public status: number, message: string, public modelCalled = false, public free = false) { super(message); }
}

// ---------- concurrency ----------
// ponytail: per process, like the rate limiter. A shared store would be needed to cap across instances.
export const MAX_LIVE_TRIAGES = 2;
let liveTriages = 0;
/** Takes one of this instance's live-triage slots and returns its release function, or null when all are taken. */
export function liveSlot(): (() => void) | null {
  if (liveTriages >= MAX_LIVE_TRIAGES) return null;
  liveTriages++;
  let released = false;
  return () => { if (!released) { released = true; liveTriages--; } };
}

// ---------- replay in a child process ----------
export interface RoundJob { seed: number; fighter: "kai" | "rook"; tuning: Tuning | null; persona: Persona; window?: [number, number] }
export interface RoundResult { out: Outcome; t: number; hp: [number, number]; ev: Ev[]; crash: string | null; timeline: string[] }

const WORKER = join(process.cwd(), "app/api/triage/round.mjs");
const errorLine = (stderr: string) => stderr.split("\n").map((l) => l.trim()).find((l) => /^\w*Error\b/.test(l)) ?? stderr.trim().split("\n")[0];

/** Plays one round in a fresh Node process. engineDir decides which game/src the engine imports: the shipped one or a patched scratch copy. */
// The patched game is model-written code, so its process gets no secrets (minimal env) and runs under Node's permission model:
// it may read only the worker, the engine, the game copy and node_modules; no child processes, workers, addons or file writes.
// Node 22's permission model does not block network; app/api/triage/round.mjs disables sockets, UDP, DNS and fetch before any game
// code loads. The keyword screen in applyPatches is only a first filter (a keyword list can be bypassed), not the boundary.
export function sandboxArgs(engineDir: string): string[] {
  const base = realpathSync(dirname(engineDir)); // permission checks use real paths (/var -> /private/var on macOS)
  const reads = [WORKER, join(base, "engine"), join(base, "game"), join(base, "node_modules")];
  return ["--permission", ...reads.map((r) => `--allow-fs-read=${r}`)];
}

export function playRound(engineDir: string, job: RoundJob, timeoutMs = 30_000): Promise<RoundResult> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [...sandboxArgs(engineDir), WORKER, engineDir, JSON.stringify(job)], { timeout: timeoutMs, maxBuffer: 1e7, env: { PATH: process.env.PATH ?? "", NODE_ENV: "production" } }, (err, stdout, stderr) => {
      if (err?.killed) return reject(Object.assign(new Error(`the replay did not finish within ${timeoutMs} ms`), { timedOut: true }));
      if (err) return reject(new Error(errorLine(stderr) || err.message));
      try { resolve(JSON.parse(stdout.trim().split("\n").pop()!) as RoundResult); } catch { reject(new Error("the replay printed no result")); }
    });
  });
}

// ---------- scratch copy + patch ----------
// The only files the engine loads from node_modules. They are copied, not symlinked: under Node's permission model, resolving a
// symlink stats every parent folder (/private, /private/var, ...), which would need read access to the whole disk.
const ENGINE_DEPS = ["three/package.json", "three/build/three.module.js", "three/build/three.core.js", "@dimforge/rapier3d-compat/package.json", "@dimforge/rapier3d-compat/dist/rapier.mjs"];

/** Temp copy of game/src beside a copy of engine/*.mjs (its '../game/src' imports then pick up the patch), plus copies of the engine's two dependencies. */
export function makeScratch(root: string): string {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), "triage-")) // real path: /var is a symlink on macOS, and the sandbox cannot resolve through it;
  cpSync(join(root, "game/src"), join(dir, "game/src"), { recursive: true });
  mkdirSync(join(dir, "engine"));
  for (const f of readdirSync(join(root, "engine")).filter((f) => f.endsWith(".mjs"))) cpSync(join(root, "engine", f), join(dir, "engine", f));
  for (const f of ENGINE_DEPS) { mkdirSync(dirname(join(dir, "node_modules", f)), { recursive: true }); cpSync(join(root, "node_modules", f), join(dir, "node_modules", f)); }
  return dir;
}

export interface Applied { file: string; ok: boolean; why?: string }
// A gameplay fix never needs these. A patch may keep ones already in the text it replaces, but not add new ones.
const UNSAFE = /\b(process|require|import|fetch|eval|Function|globalThis|child_process|XMLHttpRequest|WebSocket|Deno|Bun|setTimeout|setInterval)\b/g;
export const addsUnsafe = (find: string, replace: string) => (replace.match(UNSAFE)?.length ?? 0) > (find.match(UNSAFE)?.length ?? 0);
/** Same rules as engine/verify-fix.mjs: a patch applies only to a game/src/*.js file and only if `find` matches exactly once. */
export function applyPatches(srcDir: string, patches: Patch[]): Applied[] {
  return patches.map((p) => {
    if (!/^[\w.-]+\.js$/.test(p.file) || !existsSync(join(srcDir, p.file))) return { file: p.file, ok: false, why: "not a game/src/*.js file" };
    const path = join(srcDir, p.file), src = readFileSync(path, "utf8"), n = src.split(p.find).length - 1;
    if (n !== 1) return { file: p.file, ok: false, why: n === 0 ? "find text not found" : `find text matches ${n} times` };
    if (addsUnsafe(p.find, p.replace)) return { file: p.file, ok: false, why: "patch adds process, module, network or eval access; refused" };
    writeFileSync(path, src.replace(p.find, () => p.replace));
    return { file: p.file, ok: true };
  });
}

// ---------- the flow ----------
export interface TriageInput { run: RunLine; persona: Persona; tuning: Tuning | null; sameSignature: RunLine[] }
export interface TriageDeps { root?: string; ask?: typeof triageBug; timeoutMs?: number; replayTimeoutMs?: number }

const side = (r: RoundResult): TriageLiveSide => {
  const bugs = r.ev.filter(isBug);
  return { out: r.out, t: r.t, bugs: [...new Set(bugs.map((e) => e[1] as string))], bugEvents: bugs.length, crash: r.crash };
};

/** Turns a failed model call into a status + sentence a judge can act on. */
function modelError(e: unknown, timeoutMs: number): TriageError {
  const err = e as { name?: string; status?: number; message?: string };
  const msg = err?.message ?? String(e);
  if (err?.name === "TimeoutError") return new TriageError(504, `Nemotron Ultra did not answer within ${Math.round(timeoutMs / 1000)} s. Each of its ${LIVE_ATTEMPTS} tries has that limit; press the button again.`, true);
  if (err?.status === 429) return new TriageError(503, "Token Factory is rate-limiting Nemotron Ultra (HTTP 429). Try again in a minute.", true);
  if (typeof err?.status === "number") return new TriageError(502, `Token Factory returned HTTP ${err.status} for the Ultra call.`, true);
  if (/NEBIUS_API_KEY/.test(msg)) return new TriageError(503, "NEBIUS_API_KEY is not set on the server, so no model can be called.");
  if (/failed validation/.test(msg)) return new TriageError(502, `Ultra answered, but the answer failed validation: ${msg.replace(/^.*last: /, "")}. It failed on both of its ${LIVE_ATTEMPTS} tries; press the button again for a new answer.`, true);
  console.error("live triage: Ultra call failed:", msg);
  return new TriageError(502, "The Ultra call failed. Try again in a minute.", true);
}

/**
 * The whole flow for one recorded round. Throws TriageError (with an HTTP status) when the model call fails; replay or
 * patch problems are reported inside the result instead, because the root cause Ultra wrote is still worth showing.
 */
// A patch that fails validation (find text not in the source, missing fields) goes back to Ultra once with the error, as the offline
// triage does with 3. Each attempt has its own timeout, so the worst case is about 2 x timeoutMs.
export const LIVE_ATTEMPTS = 2;

export async function triageRound({ run, persona, tuning, sameSignature }: TriageInput, { root = process.cwd(), ask = triageBug, timeoutMs = 40_000, replayTimeoutMs = 30_000 }: TriageDeps = {}): Promise<TriageLiveResult> {
  const t0 = Date.now();
  const firstBug = run.ev.find(isBug);
  if (!firstBug) throw new TriageError(422, "This round has no invariant violation to triage.", false, true);
  const job: RoundJob = { seed: run.seed, fighter: fighterFor(run.p), tuning, persona };

  // 1. Shipped game, recorded tuning: the baseline bug count plus the 10 Hz window around the first bug event (as engine/bugs.mjs).
  let baseline: RoundResult;
  try { baseline = await playRound(join(root, "engine"), { ...job, window: [Math.max(0, firstBug[0] - 4), firstBug[0] + 2] }, replayTimeoutMs); }
  catch (e) {
    // A loaded server, not a bad request and not a crash: 504, and no model was called.
    if ((e as { timedOut?: boolean }).timedOut) throw new TriageError(504, `The replay did not finish within ${Math.round(replayTimeoutMs / 1000)} s because the server is busy. No model was called; try again in a minute.`);
    throw e;
  }
  // No Ultra call when the replay does not show the bug: any patch would then be credited as a fix it is not.
  if (!baseline.ev.some(isBug)) throw new TriageError(409, "This round did not reproduce its bug on replay, so there is nothing to triage and no model was called.");
  // Ultra sees the source, not the tuning. A rule the replay forces to 0 (rules.mountReleaseFix for rounds recorded before that fix) makes any
  // patch inside that guard a no-op, so the override is the first line of evidence.
  const overrides = Object.entries(tuning ?? {});
  const timeline = overrides.length
    ? [`TUNING ${overrides.map(([k, v]) => `${k}=${v}`).join(" ")} (this replay forces these values; code guarded by a rule that is 0 here does not run, so a fix must not depend on it)`, ...baseline.timeline]
    : baseline.timeline;
  const t1 = Date.now();

  // 2. Up to two Ultra calls (LIVE_ATTEMPTS) with the same prompt as the offline triage.
  const signature = signatureOf(run.ev);
  const cluster: BugCluster = {
    id: `${run.p}-r${run.round}`, signature, count: Math.max(1, sameSignature.length),
    rounds: (sameSignature.length ? sameSignature : [run]).slice(0, 4).map((r) => ({ p: r.p, round: r.round, seed: r.seed, label: "recorded", t: r.t, out: r.out })),
    representative: { p: run.p, round: run.round, seed: run.seed, label: "recorded" }, timeline,
  };
  let triage: Triage;
  try { triage = await ask(cluster, join(root, "game/src"), "", { attempts: LIVE_ATTEMPTS, timeoutMs, retries: 0 }); }
  catch (e) { throw modelError(e, timeoutMs); }
  const t2 = Date.now();

  // 3 + 4. Patch a scratch copy, replay the same seed with the same tuning. The repo's game/src is never touched.
  let applied: Applied[] = [], after: TriageLiveSide | null = null, afterError: string | undefined, verdict: TriageVerdict;
  // The replay forces some rules off so recorded rounds show their bugs. A patch that edits one of those guards only switches on a
  // fix the game already ships: it would "fix" the round, but Ultra found nothing, so it is not credited.
  const forcedOff = Object.entries(tuning ?? {}).filter(([k, v]) => k.startsWith("rules.") && v === 0).map(([k]) => k.slice(6));
  const reusesFix = triage.patches.some((p) => forcedOff.some((r) => p.find.includes(r) || p.replace.includes(r)));
  if (!triage.isRealBug) verdict = "not-a-bug";
  else if (reusesFix) verdict = "reused-shipped-fix";
  else {
    const scratch = makeScratch(root);
    try {
      applied = applyPatches(join(scratch, "game/src"), triage.patches);
      if (!applied.length || !applied.every((a) => a.ok)) verdict = "patch-did-not-apply";
      else {
        try {
          after = side(await playRound(join(scratch, "engine"), job, replayTimeoutMs));
          verdict = after.bugEvents === 0 ? "fixed" : "not-fixed";
        } catch (e) {
          console.error("live triage: patched replay failed:", (e as Error).message);
          afterError = "The patched game did not run (it threw or timed out), so the patch does not fix the bug.";
          verdict = "not-fixed";
        }
      }
    } finally { rmSync(scratch, { recursive: true, force: true }); }
  }
  const t3 = Date.now();
  return {
    p: run.p, round: run.round, seed: run.seed, signature, sameSignature: cluster.count, tuning, verdict,
    triage, applied, before: side(baseline), after, afterError, timeline,
    ms: { replayBefore: t1 - t0, model: t2 - t1, replayAfter: t3 - t2, total: t3 - t0 },
  };
}
