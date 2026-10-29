import { readJson } from "@/lib/ai-route";
import { createProphetService, validateProphetTuning } from "@/lib/prophet";

export const runtime = "nodejs";
export const maxDuration = 120;
const compare = createProphetService();

export async function POST(req: Request) {
  const body = await readJson(req);
  if (body instanceof Response) return body;
  let tuning;
  try { tuning = validateProphetTuning(body.tuning); }
  catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
  // Same trusted-proxy convention as ai-route; no credentials or model calls are needed for numeric simulation.
  const forwarded = req.headers.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  const ip = req.headers.get("x-vercel-forwarded-for") || forwarded.at(-1) || req.headers.get("x-real-ip") || "local";
  const { status, body: result } = await compare(tuning, ip);
  return Response.json(result, { status, headers: { "Cache-Control": "no-store", ...(status === 429 || status === 503 ? { "Retry-After": "60" } : {}) } });
}
