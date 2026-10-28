// Server-only loaders. Raw runs never leave the server: pages get aggregates, traces, findings and tiles.
import "server-only";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { computeSummary, parseRunsJsonl } from "./stats";
import { encodeToken } from "./replay-token";
import type { Findings, Persona, RunLine, SessionEnd, Summary, Trace, TraceFile } from "./types";
import type { BugView, DataSource, ExploitFile, Tile, UsageFile } from "./web-types";

const ROOT = process.cwd();
const RUN_MAIN = join(ROOT, "data/run-main");
const FIXTURES = join(ROOT, "data/fixtures");

export interface Dataset {
  source: DataSource;
  personas: Map<string, Persona>;
  runs: Map<string, RunLine>;        // key "p:round"
  summary: Summary;
  traces: TraceFile;
  traceByRun: Map<string, Trace>;    // key "p:round" (engine keys may carry a ":seed" suffix)
  findings: Findings | null;
  usage: UsageFile | null;
  exploit: ExploitFile | null;
}

let cached: { stamp: string; data: Dataset } | null = null;

export function getSource(): DataSource {
  return existsSync(join(RUN_MAIN, "runs.jsonl")) ? "run-main" : "fixtures";
}

export function getData(): Dataset {
  const source = getSource();
  const dir = source === "run-main" ? RUN_MAIN : FIXTURES;
  // Reload when any file in the run folder changes (the lead drops runs, findings and usage at different times while the server is up).
  const stamp = `${source}:${readdirSync(dir).map((f) => `${f}=${statSync(join(dir, f)).mtimeMs}`).join(",")}`;
  if (cached?.stamp === stamp) return cached.data;

  const read = <T,>(name: string): T | null => {
    const path = join(dir, name);
    return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : null;
  };
  const personaList = read<Persona[]>("personas.json") ?? [];
  const parsed = parseRunsJsonl(readFileSync(join(dir, "runs.jsonl"), "utf8"));
  // Session ends live either inside runs.jsonl (lines with "quit") or in a separate sessions.json.
  const sessions = [...parsed.sessions, ...(read<SessionEnd[]>("sessions.json") ?? [])];
  const traces = read<TraceFile>("traces.json") ?? { states: [], arenaHalfWidth: 10.5, traces: {} };
  const data: Dataset = {
    source,
    personas: new Map(personaList.map((p) => [p.id, p])),
    runs: new Map(parsed.runs.map((r) => [`${r.p}:${r.round}`, r])),
    summary: computeSummary(personaList, parsed.runs, sessions), // ~4 ms for 2,800 rounds; a precomputed file would only go stale
    traces,
    traceByRun: new Map(Object.values(traces.traces).map((t) => [t.key.split(":").slice(0, 2).join(":"), t])),
    findings: read<Findings>("findings.json"),
    usage: read<UsageFile>("usage.json"),
    exploit: read<ExploitFile>("exploit.json"),
  };
  cached = { stamp, data };
  return data;
}

/** Replay link for one recorded round. The token carries the persona so the game can re-simulate the policy. */
export function replayHref(p: string, round: number): string {
  const { runs, personas } = getData();
  const key = `${p}:${round}`;
  const run = runs.get(key);
  const token = encodeToken({
    seed: run?.seed ?? 0, tuning: null, fighter: "kai", maxT: Math.ceil(run?.t ?? 99), persona: personas.get(p),
  });
  return `/replay?key=${encodeURIComponent(key)}&t=${token}`;
}

/** Up to n traces as compact 5 Hz tiles for the crowd grid: live players first, then round-robin across archetypes. */
export function getTiles(n: number): Tile[] {
  const { traceByRun, runs, personas } = getData();
  const groups = new Map<string, [string, Trace][]>();
  for (const entry of traceByRun) {
    const a = runs.get(entry[0])?.live ? "live" : personas.get(entry[0].split(":")[0])?.archetype ?? "unknown";
    if (!groups.has(a)) groups.set(a, []);
    groups.get(a)!.push(entry);
  }
  const queues = [groups.get("live") ?? [], ...[...groups].filter(([a]) => a !== "live").map(([, v]) => v)];
  const picked: [string, Trace][] = [];
  for (let i = 0; picked.length < n && queues.some((q) => i < q.length); i++) {
    for (const q of queues) if (i < q.length && picked.length < n) picked.push(q[i]);
  }
  return picked.map(([runKey, tr]) => {
    const run = runs.get(runKey);
    const persona = run ? personas.get(run.p) : undefined;
    const step = Math.max(1, Math.round(0.2 / tr.dt));
    return {
      key: runKey,
      name: persona?.name ?? tr.key,
      archetype: persona?.archetype ?? "unknown",
      outcome: run?.out ?? "draw",
      live: run?.live === true,
      round: run?.round ?? 0,
      dt: tr.dt * step,
      f: tr.f.filter((_, i) => i % step === 0).map((r) => [Math.round(r[0] * 10), Math.round(r[1] * 10), Math.round(r[2]), Math.round(r[3]), r[4], r[5]]),
      hits: tr.ev.filter((e) => e[1] === "hit").map((e) => [e[0], e[2]] as [number, 0 | 1]),
      href: run ? replayHref(run.p, run.round) : `/replay?key=${encodeURIComponent(runKey)}`,
    };
  });
}

/** Finds the recorded round (and its trace, if one was kept) for a replay: by "p:round" key first, else by the token's seed. */
export function findRound(key: string | undefined, seed: number | undefined): { run: RunLine | undefined; trace: Trace | undefined } {
  const { traceByRun, runs } = getData();
  let k = key && runs.has(key) ? key : undefined;
  if (!k && seed !== undefined) {
    const r = [...runs.values()].find((r) => r.seed === seed);
    if (r) k = `${r.p}:${r.round}`;
  }
  return { run: k ? runs.get(k) : undefined, trace: k ? traceByRun.get(k) : undefined };
}

let triageCache: { stamp: string; data: BugView[] } | null = null;

/** Bug-triage clusters from triage.json (ai/cli/triage.ts), trimmed to what the bugs page shows. Empty when no triage has run. */
export function getTriage(): BugView[] {
  const dir = getSource() === "run-main" ? RUN_MAIN : FIXTURES;
  const path = join(dir, "triage.json");
  if (!existsSync(path)) return [];
  const stamp = `${path}=${statSync(path).mtimeMs}`;
  if (triageCache?.stamp === stamp) return triageCache.data;

  const raw = JSON.parse(readFileSync(path, "utf8")) as any[];
  const { personas } = getData();
  const data = raw.map((b): BugView => {
    const rep = b.representative;
    // Token built from the representative round's own seed; runs.jsonl may not hold it (sweep rounds live elsewhere), so no runs lookup.
    const token = encodeToken({ seed: rep.seed, tuning: null, fighter: "kai", maxT: Math.ceil(rep.t ?? 99), persona: personas.get(rep.p) });
    const t = b.triage, v = b.verify;
    return {
      id: b.id, signature: b.signature, count: b.count, error: b.error,
      title: t?.title, isRealBug: t?.isRealBug, severity: t?.severity, rootCause: t?.rootCause, playerImpact: t?.playerImpact, confidence: t?.confidence,
      patches: t?.patches ?? [],
      verdict: v?.verdict, fixedRounds: v?.fixedRounds, verifyRounds: v?.rounds, attempts: b.attempts, regression: v?.regression,
      replay: `/replay?key=${encodeURIComponent(`${rep.p}:${rep.round}`)}&t=${token}`,
    };
  });
  triageCache = { stamp, data };
  return data;
}
