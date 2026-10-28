import { BUG_DOMAINS, bugPrecedentQuery, MAX_BUG_DESCRIPTION, searchPrecedent } from "@/ai/precedent";
import { rateLimited } from "@/lib/ai-route";

// Tavily (the only outside call) looks for developer writeups of a bug like the Repro oracle's. The query is built here, never taken from the client.
export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: "Body must be JSON." }, { status: 400 }); }
  const description = (body as Record<string, unknown> | null)?.description;
  if (typeof description !== "string" || !description.trim()) return Response.json({ error: '"description" must be a non-empty string.' }, { status: 400 });
  if (description.length > MAX_BUG_DESCRIPTION) return Response.json({ error: `"description" is limited to ${MAX_BUG_DESCRIPTION} characters.` }, { status: 413 });
  const limited = rateLimited(req);
  if (limited) return limited;
  try {
    return Response.json({ results: await searchPrecedent(bugPrecedentQuery(description), BUG_DOMAINS) });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/TAVILY_API_KEY/.test(message)) return Response.json({ error: "Web search is not configured on this server." }, { status: 503 });
    console.error("precedent route failed:", message);
    return Response.json({ error: "The web search failed. Try again in a minute." }, { status: 502 });
  }
}
