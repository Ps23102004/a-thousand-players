// Numeric-only crowd comparison. No model calls, shell interpolation, or client-controlled paths.
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import baseline from "../data/baseline-tuning.json";
import { createLimiter } from "./rate-limit";
import type { Persona, RunLine, Tuning } from "./types";

export const PROPHET_PERSONAS = 200;
export const PROPHET_SEED = 1;
export const PROPHET_TIMEOUT_MS = 100_000;
const BUGS = new Set(["stuck", "oob", "nan", "clip", "airborne", "softlock", "crash"]);

/** Unlike the model translation's clamp, the public CPU endpoint rejects values outside the allowlist's ranges. */
export function validateProphetTuning(raw: unknown): Tuning {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("tuning must be an object");
  const entries = Object.entries(raw);
  if (!entries.length) throw new Error("no tuning keys changed");
  const tuning: Tuning = {};
  for (const [key, value] of entries.sort(([a], [b]) => a.localeCompare(b))) {
    const spec = baseline.find((s) => s.key === key);
    if (!spec) throw new Error(`unknown tuning key: ${key}`);
    if (typeof value !== "number" || !Number.isFinite(value) || value < spec.min || value > spec.max) throw new Error(`invalid absolute value for ${key}: allowed ${spec.min} to ${spec.max}`);
    tuning[key] = value;
  }
  return tuning;
}

export interface ProphetCount { rounds: number; wins: number; winRate: number; bugRounds: number }
export interface ProphetSide extends ProphetCount { byArchetype: (ProphetCount & { archetype: string })[] }
export interface ProphetResult {
  tuning: Tuning; baselineTuning: Tuning; personas: number; roundsEach: 1; seed: number;
  before: ProphetSide; after: ProphetSide; wallMs: number;
}

export function aggregateProphet(runs: Pick<RunLine, "p" | "out" | "ev">[], personas: Persona[]): ProphetSide {
  const byId = new Map(personas.map((p) => [p.id, p.archetype]));
  const counts = new Map<string, ProphetCount>();
  const total: ProphetCount = { rounds: 0, wins: 0, winRate: 0, bugRounds: 0 };
  for (const r of runs) {
    const archetype = byId.get(r.p);
    if (!archetype) throw new Error("crowd returned an unknown persona");
    const row = counts.get(archetype) ?? { rounds: 0, wins: 0, winRate: 0, bugRounds: 0 };
    for (const c of [row, total]) {
      c.rounds++; c.wins += Number(r.out === "win");
      c.bugRounds += Number(r.ev.some((e) => BUGS.has(e[1])));
      c.winRate = c.wins / c.rounds;
    }
    counts.set(archetype, row);
  }
  return { ...total, byArchetype: [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([archetype, row]) => ({ archetype, ...row })) };
}

/** Two sequential, single-worker child crowds, paired by persona, fighter and round seed. Temp files are always removed. */
export async function runProphet(raw: Tuning, { limit = PROPHET_PERSONAS, seed = PROPHET_SEED, timeoutMs = PROPHET_TIMEOUT_MS, root = process.cwd() } = {}): Promise<ProphetResult> {
  const tuning = validateProphetTuning(raw);
  const t0 = Date.now();
  const personas: Persona[] = JSON.parse(readFileSync(join(root, "data/run-main/personas.json"), "utf8")).slice(0, limit);
  const baselineTuning: Tuning = JSON.parse(readFileSync(join(root, "data/run-main/meta.json"), "utf8")).recordedWith;
  const scratch = mkdtempSync(join(tmpdir(), "prophet-"));
  try {
    // Both sides preserve every recorded-build rule unless the validated patch explicitly changes an allowed key.
    const run = async (label: string, values: Tuning) => {
      const file = join(scratch, `${label}.json`);
      writeFileSync(file, JSON.stringify(values));
      const remaining = timeoutMs - (Date.now() - t0);
      if (remaining <= 0) throw Object.assign(new Error("crowd timed out"), { timedOut: true });
      await new Promise<void>((resolve, reject) => {
        execFile(process.execPath, [join(root, "engine/crowd.mjs"), "--personas", join(root, "data/run-main/personas.json"), "--out", scratch,
          "--tuning", file, "--label", label, "--seed", String(seed), "--limit", String(limit), "--rounds", "1", "--workers", "1", "--traces", "0"],
        { cwd: root, timeout: remaining, killSignal: "SIGKILL", maxBuffer: 1e7, env: { PATH: process.env.PATH ?? "", NODE_ENV: "production" } }, (err) => {
          if (err?.killed) reject(Object.assign(new Error("crowd timed out"), { timedOut: true }));
          else if (err) reject(new Error("crowd child failed"));
          else resolve();
        });
      });
      const runs = readFileSync(join(scratch, `runs-${label}.jsonl`), "utf8").trim().split("\n").map((line) => JSON.parse(line) as RunLine);
      if (runs.length !== personas.length || new Set(runs.map((r) => r.p)).size !== personas.length || runs.some((r) => r.round !== 1)) throw new Error("incomplete crowd result");
      return aggregateProphet(runs, personas);
    };
    const before = await run("before", baselineTuning);
    const after = await run("after", { ...baselineTuning, ...tuning });
    return { tuning, baselineTuning, personas: personas.length, roundsEach: 1, seed, before, after, wallMs: Date.now() - t0 };
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

function loadCache(): ProphetResult | null {
  try { return JSON.parse(readFileSync(join(process.cwd(), "data/prophet/example.json"), "utf8")); }
  catch { return null; }
}

type Reply = { status: number; body: Record<string, unknown> };
/** Per-instance concurrency and rate limits, like live triage. A distributed cap needs shared storage. */
export function createProphetService({ run = runProphet, cache = loadCache, limited }: {
  run?: (tuning: Tuning) => Promise<ProphetResult>; cache?: () => ProphetResult | null; limited?: (ip: string) => boolean;
} = {}) {
  const limiter = createLimiter(10, 40, "prophet");
  let live = false;
  const fallback = (tuning: Tuning, status: number, reason: string): Reply => {
    const saved = cache();
    if (saved && JSON.stringify(validateProphetTuning(saved.tuning)) === JSON.stringify(tuning)) {
      return { status: 200, body: { ...saved, cached: true, cachedNotice: `${reason} Showing the cached offline crowd result for this exact tuning.` } };
    }
    return { status, body: { error: `${reason} No cached result matches this tuning. Try again later.` } };
  };
  return async (raw: Tuning, ip: string): Promise<Reply> => {
    const tuning = validateProphetTuning(raw);
    if (limited ? limited(ip) : !limiter(ip).ok) return fallback(tuning, 429, "Prophet rate limit reached.");
    if (live) { if (!limited) limiter.refund(ip); return fallback(tuning, 503, "Prophet is busy."); }
    live = true;
    try { return { status: 200, body: { ...await run(tuning), cached: false } }; }
    catch (e) {
      if ((e as { timedOut?: boolean }).timedOut) return fallback(tuning, 504, "Prophet crowd timed out.");
      return { status: 500, body: { error: "Prophet stopped before a comparison. Try again later." } };
    } finally { live = false; }
  };
}
