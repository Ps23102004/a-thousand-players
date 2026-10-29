// Everything the Design Advisor knows about the game, read from disk and computed here. The client sends a round key and frames, nothing else.
import "server-only";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { advisorFrameTimes, buildCrowdTable, extractGameText, knownTuningKeys, parseRuleDefaults, type CrowdRow } from "@/lib/advisor";
import { getData, getSource } from "@/lib/data";
import { computeSummary, parseRunsJsonl } from "@/lib/stats";
import type { SessionEnd } from "@/lib/types";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const readJson = <T,>(p: string): T | null => (existsSync(join(ROOT, p)) ? (JSON.parse(read(p)) as T) : null);

export const GAME_NAME = "Market Brawl";
export interface AdvisorContext { key: string; game: string; genre: string; frameTimes: number[]; crowd: CrowdRow[]; gameText: string[]; tuningKeys: Set<string> }

/** The context for one recorded round, or null when the key is not in the data. */
export function advisorContext(key: string): AdvisorContext | null {
  const d = getData();
  const run = d.runs.get(key);
  if (!run) return null;
  const real = getSource() === "run-main";

  // The same crowd replayed with the sweep nerfed: only the shipped run has it.
  let sweepNerf: ReturnType<typeof computeSummary> | null = null;
  if (real && existsSync(join(ROOT, "data/run-main/runs-sweep-nerf.jsonl"))) {
    const parsed = parseRunsJsonl(read("data/run-main/runs-sweep-nerf.jsonl"));
    const sessions = [...parsed.sessions, ...(readJson<SessionEnd[]>("data/run-main/sessions-sweep-nerf.json") ?? [])];
    sweepNerf = computeSummary([...d.personas.values()], parsed.runs, sessions);
  }
  const rules = parseRuleDefaults(read("game/src/tuning.js"));
  const top = d.exploit?.genomes[0];
  const crowd = buildCrowdTable({
    summary: d.summary, sweepNerf,
    bugs: real ? (readJson<{ id: string; signature: string; count: number }[]>("data/run-main/bugs.json") ?? []) : [],
    topStrategy: top?.hits ? { label: top.label, winRate: top.winRate, hits: top.hits } : null,
    rules, round: { key, out: run.out, t: run.t, hp: run.hp },
  });
  let gameText: string[] = [];
  try { gameText = extractGameText(read("game/index.html"), read("game/src/hud.js")); } catch { /* game source not shipped with this build: the dialogue review has nothing to read */ }
  const baseline = readJson<{ key: string }[]>("data/baseline-tuning.json") ?? [];
  const genre = (readJson<{ genre?: string }>("data/games/market-brawl.json")?.genre ?? "3D brawler").replace(/\s*\(.*\)/, "");
  return { key, game: GAME_NAME, genre, frameTimes: advisorFrameTimes(run.t, run.ev), crowd, gameText, tuningKeys: knownTuningKeys(baseline.map((s) => s.key), rules) };
}
