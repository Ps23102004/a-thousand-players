import type { Finding, Findings } from "../lib/types";
import { pool } from "./models";

export function precedentQuery(f: Finding): string {
  return `fighting game ${f.kind} ${f.suggestion} design fix postmortem`.replace(/\s+/g, " ").slice(0, 380);
}

async function search(query: string): Promise<{ title: string; url: string; snippet: string }[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error("TAVILY_API_KEY is not set");
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, max_results: 4, search_depth: "basic" }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
  const json = (await res.json()) as { results?: { title: string; url: string; content: string }[] };
  return (json.results ?? []).slice(0, 3).map((r) => ({ title: r.title, url: r.url, snippet: r.content.slice(0, 300) }));
}

/** One Tavily search per finding; a failed search leaves that finding without precedent. */
export async function attachPrecedent(findings: Findings): Promise<Findings> {
  const withPrecedent = await pool(findings.findings, 4, async (f) => {
    try {
      return { ...f, precedent: await search(precedentQuery(f)) };
    } catch (err) {
      console.error(`[precedent] ${f.id}: ${(err as Error).message}`);
      return f;
    }
  });
  return { ...findings, findings: withPrecedent };
}
