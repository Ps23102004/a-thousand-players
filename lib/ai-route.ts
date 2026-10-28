// Shared guard for the API routes that spend model credits: rate limit, input check, and a clear 501 while ai/ is a stub.
import "server-only";
import { createLimiter } from "./rate-limit";

const check = createLimiter(10, 200);
const MAX_INPUT = 4000;

export async function aiRoute<T>(req: Request, field: string, run: (text: string) => Promise<T>): Promise<Response> {
  let text: unknown;
  try {
    text = ((await req.json()) as Record<string, unknown>)[field];
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (typeof text !== "string" || !text.trim()) return Response.json({ error: `"${field}" must be a non-empty string.` }, { status: 400 });
  if (text.length > MAX_INPUT) return Response.json({ error: `"${field}" is limited to ${MAX_INPUT} characters.` }, { status: 413 });

  // Client IP from a header the platform sets (Vercel), else the rightmost proxy-appended hop; the leftmost entry is caller-controlled.
  // The per-IP limit only slows one caller down; the global daily cap in the limiter is what bounds credit spend.
  const forwarded = req.headers.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  const ip = req.headers.get("x-vercel-forwarded-for") || forwarded.at(-1) || req.headers.get("x-real-ip") || "local";
  const limit = check(ip);
  if (!limit.ok) {
    return Response.json({ error: `Too many requests: ${limit.reason}. These calls cost model credits.` }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }

  try {
    return Response.json(await run(text.trim()));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/not implemented/i.test(message)) {
      return Response.json({ error: "This mode's model call is not wired up yet (the AI layer is still a stub). Nothing was sent to a model." }, { status: 501 });
    }
    console.error("ai route failed:", message);
    return Response.json({ error: "The model call failed. Try again in a minute." }, { status: 502 });
  }
}
