// npx tsx --env-file=.env ai/cli/calibrate-triage.ts --out <file.json> [--max-calls 12] [--rounds p0537:1,p0233:2:sweep,...]
// Calibration run for Ultra's triage confidence: the live "Triage this" flow (lib/triage-live.ts) over several recorded bug rounds,
// ONE Ultra call per round (no validation retry, so every call is one data point), verdict decided by replaying the seed.
// Rounds tagged ":sweep" come from runs-sweep-nerf.jsonl and replay with data/patches/sweep-nerf.json on top of the recorded rules.
// A hard cap stops the run after --max-calls model calls. Rounds whose replay shows no bug cost no call (TriageError 409).
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { triageBug } from "../triage";
import { getUsage } from "../usage";
import { signatureOf, triageRound, TriageError } from "../../lib/triage-live";
import type { Persona, RunLine, Tuning } from "../../lib/types";

const DEFAULT = "p0537:1,p0731:2,p0653:2,p0233:2:sweep,p0611:1:sweep,p0754:2:sweep,p0009:3,p0069:1,p0111:3,p0129:3,p0306:4,p0355:2,p0744:3";
const { values } = parseArgs({ options: { out: { type: "string" }, "max-calls": { type: "string", default: "12" }, rounds: { type: "string", default: DEFAULT } } });
if (!values.out) throw new Error("--out is required");
const maxCalls = Number(values["max-calls"]);

const dir = "data/run-main";
const lines = (f: string) => readFileSync(`${dir}/${f}`, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)).filter((o) => !("quit" in o)) as RunLine[];
const main = lines("runs.jsonl"), sweep = lines("runs-sweep-nerf.jsonl");
const personas = new Map((JSON.parse(readFileSync(`${dir}/personas.json`, "utf8")) as Persona[]).map((p) => [p.id, p]));
const recorded: Tuning = JSON.parse(readFileSync(`${dir}/meta.json`, "utf8")).recordedWith ?? {};
const sweepTuning: Tuning = JSON.parse(readFileSync("data/patches/sweep-nerf.json", "utf8"));

let calls = 0;
const ask: typeof triageBug = (bug, root, history, opts) => {
  if (calls >= maxCalls) throw new Error(`call cap ${maxCalls} reached`);
  calls++;
  return triageBug(bug, root, history, { ...opts, attempts: 1, timeoutMs: 90_000, retries: 0 });
};

const out: unknown[] = [];
for (const spec of values.rounds!.split(",")) {
  if (calls >= maxCalls) break;
  const [p, r, tag] = spec.split(":");
  const pool = tag === "sweep" ? sweep : main;
  const run = pool.find((x) => x.p === p && x.round === Number(r));
  const persona = personas.get(p);
  if (!run || !persona) { console.error(`[calib] ${spec}: no such round`); continue; }
  const tuning = tag === "sweep" ? { ...sweepTuning, ...recorded } : recorded;
  const sig = signatureOf(run.ev);
  const sameSignature = pool.filter((x) => signatureOf(x.ev) === sig);
  const t0 = Date.now();
  try {
    const res = await triageRound({ run, persona, tuning, sameSignature }, { ask, timeoutMs: 90_000 });
    out.push({ spec, signature: sig, verdict: res.verdict, confidence: res.triage.confidence, severity: res.triage.severity, isRealBug: res.triage.isRealBug,
      title: res.triage.title, rootCause: res.triage.rootCause, patches: res.triage.patches, applied: res.applied, before: res.before, after: res.after, afterError: res.afterError, ms: res.ms });
    console.error(`[calib] ${spec} ${sig} conf ${res.triage.confidence} -> ${res.verdict} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  } catch (e) {
    const status = e instanceof TriageError ? e.status : 0;
    out.push({ spec, signature: sig, error: (e as Error).message, status });
    console.error(`[calib] ${spec} failed (${status}): ${(e as Error).message}`);
  }
  writeFileSync(values.out, JSON.stringify({ calls, usage: getUsage(), results: out }, null, 1)); // after each round: a crash keeps what was paid for
}
console.error(`[calib] done: ${calls} Ultra calls, ${out.length} rounds; usage ${JSON.stringify(getUsage())}`);
