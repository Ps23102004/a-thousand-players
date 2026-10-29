import { BUG_DOMAINS, bugPrecedentQuery, MAX_BUG_DESCRIPTION, searchPrecedent } from "@/ai/precedent";
import { notConfigured, rateLimited, readJson, sampleAnswer } from "@/lib/ai-route";
import { loadSample } from "@/lib/samples";

// Tavily (the only outside call) looks for developer writeups of a bug like the Repro oracle's. The query is built here, never taken from the client.
export async function POST(req: Request) {
  const body = await readJson(req);
  if (body instanceof Response) return body;
  const description = body.description;
  if (typeof description !== "string" || !description.trim()) return Response.json({ error: '"description" must be a non-empty string.' }, { status: 400 });
  if (description.length > MAX_BUG_DESCRIPTION) return Response.json({ error: `"description" is limited to ${MAX_BUG_DESCRIPTION} characters.` }, { status: 413 });
  const off = notConfigured("TAVILY_API_KEY", "Web search");
  if (off) return off;
  const limited = rateLimited(req, "precedent");
  if (limited) {
    const cached = sampleAnswer(loadSample("precedent"), description);
    return cached ? Response.json(cached) : limited;
  }
  try {
    return Response.json({ results: await searchPrecedent(bugPrecedentQuery(description), BUG_DOMAINS) });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("precedent route failed:", message);
    return Response.json({ error: "The web search failed. Try again in a minute." }, { status: 502 });
  }
}
