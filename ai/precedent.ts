import type { Finding, Findings } from "../lib/types";
import { pool } from "./models";

export interface Precedent { title: string; url: string; snippet: string }

// Browser-game portals, MMA news and market-report sites that a "fighting game" query pulls in. None of them is design precedent.
export const EXCLUDE_DOMAINS = [
  "poki.com", "crazygames.com", "snokido.com", "miniclip.com", "y8.com", "friv.com", "kizi.com",
  "mmafighting.com", "sherdog.com", "ufc.com", "espn.com",
  "marketreportsworld.com", "marketresearchfuture.com", "businessresearchinsights.com", "researchandmarkets.com",
];

// The topic phrase leads the query and steers Tavily far more than the suffix does (tuned on 2026-10-28 with live calls).
// ponytail: keyword overrides fit the vocabulary of today's Ultra findings; a finding outside it falls back to its kind.
const TOPICS: [RegExp, string][] = [
  [/tutorial|practice|progression|unlock|learn/i, "player progression and learning"],
  [/telemetry|metric|cohort|win rate/i, "balance and player data"],
];
const KIND_TOPIC: Record<Finding["kind"], string> = {
  difficulty: "difficulty curve and new player onboarding",
  exploit: "dominant strategy nerf and counterplay",
  boredom: "player retention and engagement",
  bug: "physics bug fix",
  balance: "character balance patch",
};

export function precedentQuery(f: Finding): string {
  const topic = TOPICS.find(([re]) => re.test(f.suggestion))?.[1] ?? KIND_TOPIC[f.kind];
  return `fighting game ${topic}: ${f.suggestion} (developer postmortem, GDC talk, design article or patch notes)`.replace(/\s+/g, " ").slice(0, 380);
}

export const MAX_BUG_DESCRIPTION = 300;
/** Runtime query for Repro mode. The caller checks the length; the wording around the description is fixed here. */
export function bugPrecedentQuery(description: string): string {
  return `fighting game physics bug fix: ${description.replace(/\s+/g, " ").trim().slice(0, MAX_BUG_DESCRIPTION)} (collision, grounding or hitbox bug, how developers fixed it)`;
}
// Open-web bug searches returned scraped copies of one patch-notes article, so the runtime search only reads developer sites.
// An empty answer is better than spam on stage.
export const BUG_DOMAINS = [
  "gamedeveloper.com", "gdcvault.com", "youtube.com", "reddit.com", "gamedev.stackexchange.com", "gamedev.net", "stackoverflow.com",
  "medium.com", "gafferongames.com", "github.com", "streetfighter.com", "supercombo.gg", "dustloop.com", "critpoints.net",
];

export async function searchPrecedent(query: string, includeDomains?: string[]): Promise<Precedent[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error("TAVILY_API_KEY is not set");
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, max_results: 4, search_depth: "basic", ...(includeDomains ? { include_domains: includeDomains } : { exclude_domains: EXCLUDE_DOMAINS }) }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
  const json = (await res.json()) as { results?: { title: string; url: string; content: string }[] };
  const seen = new Set<string>();   // scraper sites repost one article under many domains with the same title
  return (json.results ?? []).filter((r) => !seen.has(r.title) && seen.add(r.title)).slice(0, 3)
    .map((r) => ({ title: r.title, url: r.url, snippet: r.content.slice(0, 300) }));
}

/** One Tavily search per finding; a failed search leaves that finding without precedent. */
export async function attachPrecedent(findings: Findings): Promise<Findings> {
  const withPrecedent = await pool(findings.findings, 4, async (f) => {
    try {
      return { ...f, precedent: await searchPrecedent(precedentQuery(f)) };
    } catch (err) {
      console.error(`[precedent] ${f.id}: ${(err as Error).message}`);
      return f;
    }
  });
  return { ...findings, findings: withPrecedent };
}
