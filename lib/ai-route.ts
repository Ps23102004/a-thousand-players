// Shared guard for the API routes that spend model credits: rate limit, input check, readable errors.
import "server-only";
import { createLimiter } from "./rate-limit";
import { RejectedInput } from "../ai/nl";

const check = createLimiter(10, 200);
const MAX_INPUT = 4000;

/** 429 response when this caller (or everyone, today) is over the limit; null when the call may go ahead. */
export function rateLimited(req: Request): Response | null {
  // Client IP from a header the platform sets (Vercel), else the rightmost proxy-appended hop; the leftmost entry is caller-controlled.
  // The per-IP limit only slows one caller down; the global daily cap in the limiter is what bounds credit spend.
  const forwarded = req.headers.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  const ip = req.headers.get("x-vercel-forwarded-for") || forwarded.at(-1) || req.headers.get("x-real-ip") || "local";
  const limit = check(ip);
  if (limit.ok) return null;
  return Response.json({ error: `Too many requests: ${limit.reason}. These calls cost model credits.` }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
}

/** A real answer recorded for the page's built-in example, served (marked cached) only when that exact example hits the rate limit. */
export interface Sample { input: string; response: unknown; recordedAt: string }

export async function aiRoute<T>(req: Request, field: string, run: (text: string) => Promise<T>, opts: { sample?: Sample | null } = {}): Promise<Response> {
  let text: unknown;
  try {
    text = ((await req.json()) as Record<string, unknown>)[field];
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (typeof text !== "string" || !text.trim()) return Response.json({ error: `"${field}" must be a non-empty string.` }, { status: 400 });
  if (text.length > MAX_INPUT) return Response.json({ error: `"${field}" is limited to ${MAX_INPUT} characters.` }, { status: 413 });

  const limited = rateLimited(req);
  if (limited) {
    // ponytail: exact-match only, so a cached answer is never presented as the answer to different input.
    const s = opts.sample;
    if (s && text.trim() === s.input.trim() && s.response && typeof s.response === "object") {
      return Response.json({ ...(s.response as object), cached: true, cachedNotice: `The rate limit is reached, so this is the real answer recorded for this example on ${s.recordedAt.slice(0, 10)}, not a new model call.` });
    }
    return limited;
  }

  try {
    return Response.json(await run(text.trim()));
  } catch (e) {
    // The model judged the input off-topic (e.g. not a bug report): a user problem with a reason, not a server failure.
    if (e instanceof RejectedInput) return Response.json({ error: `The model did not accept this input: ${e.message.slice(0, 300)}` }, { status: 422 });
    const message = e instanceof Error ? e.message : String(e);
    if (/not implemented/i.test(message)) {
      return Response.json({ error: "This mode's model call is not wired up yet (the AI layer is still a stub). Nothing was sent to a model." }, { status: 501 });
    }
    console.error("ai route failed:", message);
    return Response.json({ error: "The model call failed. Try again in a minute." }, { status: 502 });
  }
}
