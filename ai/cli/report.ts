// npx tsx --env-file=.env ai/cli/report.ts --dir data/run-main
// Reads personas.json + runs.jsonl (+ sessions.json when the engine writes session ends there instead of as "quit" lines)
// from --dir, writes findings.json (Ultra + verification + Tavily precedent) and usage.json.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { Persona, RunLine, SessionEnd } from "../../lib/types";
import { analyzeCrowd, attachPrecedent, getUsage } from "../index";
import { USAGE_NOTES } from "../usage";

const { values } = parseArgs({ options: { dir: { type: "string", default: "data/run-main" }, "max-tokens": { type: "string", default: "220000" } } });
const dir = values.dir!;
const personas: Persona[] = JSON.parse(readFileSync(join(dir, "personas.json"), "utf8"));
const runs: RunLine[] = [];
const sessions: SessionEnd[] = [];
for (const line of readFileSync(join(dir, "runs.jsonl"), "utf8").split("\n")) {
  if (!line.trim()) continue;
  const o = JSON.parse(line);
  if ("quit" in o) sessions.push(o); else runs.push(o);
}
if (existsSync(join(dir, "sessions.json"))) sessions.push(...(JSON.parse(readFileSync(join(dir, "sessions.json"), "utf8")) as SessionEnd[]));
if (!sessions.length) console.error("[report] no session ends found (no \"quit\" lines in runs.jsonl and no sessions.json): quit rates will be missing");
const t0 = Date.now();
const findings = await attachPrecedent(await analyzeCrowd(personas, runs, sessions, { maxCorpusTokens: Number(values["max-tokens"]) }));
writeFileSync(join(dir, "findings.json"), JSON.stringify(findings, null, 1));
writeFileSync(join(dir, "usage.json"), JSON.stringify({ usage: getUsage(), notes: USAGE_NOTES }, null, 1));
console.error(`[report] wrote ${findings.findings.length} findings to ${join(dir, "findings.json")} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
