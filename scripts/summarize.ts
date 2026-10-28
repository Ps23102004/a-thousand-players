// Usage: npx tsx scripts/summarize.ts [dir]   (default data/run-main) -> writes <dir>/summary.json for the README and Devpost text.
// The web app does not read that file; it recomputes the same numbers from runs.jsonl on every data change.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeSummary, parseRunsJsonl } from "../lib/stats";
import type { Persona, SessionEnd } from "../lib/types";

const dir = process.argv[2] ?? "data/run-main";
const personas: Persona[] = JSON.parse(readFileSync(join(dir, "personas.json"), "utf8"));
const parsed = parseRunsJsonl(readFileSync(join(dir, "runs.jsonl"), "utf8"));
const runs = parsed.runs;
// Session ends are either "quit" lines in runs.jsonl or a separate sessions.json.
const sessionsPath = join(dir, "sessions.json");
const sessions: SessionEnd[] = [...parsed.sessions, ...(existsSync(sessionsPath) ? JSON.parse(readFileSync(sessionsPath, "utf8")) : [])];
const summary = computeSummary(personas, runs, sessions);
writeFileSync(join(dir, "summary.json"), JSON.stringify(summary, null, 1) + "\n");
console.log(`${dir}/summary.json: ${summary.players} players, ${summary.rounds} rounds, ${summary.simHours.toFixed(1)} sim hours`);
