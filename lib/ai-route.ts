// Shared guard for the API routes that spend model credits: rate limit, input check, readable errors.
import "server-only";
import { createLimiter } from "./rate-limit";
import { RejectedInput } from "../ai/nl";

const MAX_INPUT = 4000;
export const MAX_BODY_BYTES = 64 * 1024;

// Daily caps per route, so one route being hammered cannot lock the others. Model routes add up to the old shared cap of 200;
// triage counts one per request although it may make two Ultra calls. Precedent spends Tavily credits, not model credits.
const DAILY_CAP: Record<string, number> = { repro: 80, balance: 40, eyes: 40, triage: 40, precedent: 100 };
const limiters = new Map<string, ReturnType<typeof createLimiter>>();
function limiterFor(route: string) {
  let l = limiters.get(route);
  if (!l) limiters.set(route, (l = createLimiter(10, DAILY_CAP[route] ?? 200, route)));
  return l;
}

// Client IP from a header the platform sets (Vercel), else the rightmost proxy-appended hop; the leftmost entry is caller-controlled.
function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  return req.headers.get("x-vercel-forwarded-for") || forwarded.at(-1) || req.headers.get("x-real-ip") || "local";
}

/** 429 response when this caller (or everyone, today, on this route) is over the limit; null when the call may go ahead. */
export function rateLimited(req: Request, route: string): Response | null {
  // The per-IP limit only slows one caller down; the route's daily cap is what bounds credit spend.
  const limit = limiterFor(route)(clientIp(req));
  if (limit.ok) return null;
  return Response.json({ error: `Too many requests: ${limit.reason}. These calls cost model credits.` }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
}

/** Gives back the limiter unit of a call that ended before it reached a model, so only real model calls count. */
export function refund(req: Request, route: string) {
  limiterFor(route).refund(clientIp(req));
}

/** 503 when the server has no key for the outside service, checked before the limiter so it costs the caller nothing. */
export function notConfigured(envVar: "NEBIUS_API_KEY" | "TAVILY_API_KEY", what: string): Response | null {
  return process.env[envVar] ? null : Response.json({ error: `${what} is not configured on this server, so nothing was sent.` }, { status: 503 });
}

/**
 * The body as a JSON object, or the error response: 415 unless Content-Type is application/json (a text/plain post is a
 * CORS-simple request any website can make), 413 over maxBytes by Content-Length or by bytes actually read, 400 otherwise.
 */
export async function readJson(req: Request, maxBytes = MAX_BODY_BYTES): Promise<Record<string, unknown> | Response> {
  if (!/^application\/json\s*(;|$)/i.test(req.headers.get("content-type") ?? "")) {
    return Response.json({ error: 'Send the body as JSON with "Content-Type: application/json".' }, { status: 415 });
  }
  const tooBig = () => Response.json({ error: `The request body is limited to ${Math.round(maxBytes / 1024)} KB.` }, { status: 413 });
  if (Number(req.headers.get("content-length")) > maxBytes) return tooBig();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = req.body?.getReader();
  for (let r = await reader?.read(); r && !r.done; r = await reader!.read()) {
    size += r.value.byteLength;
    if (size > maxBytes) { await reader!.cancel(); return tooBig(); }
    chunks.push(r.value);
  }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return Response.json({ error: "Body must be JSON." }, { status: 400 }); }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return Response.json({ error: "Body must be a JSON object." }, { status: 400 });
  return body as Record<string, unknown>;
}

/** A real answer recorded for the page's built-in example, served (marked cached) only when that exact example is refused for rate or load. */
export interface Sample { input: string; response: unknown; recordedAt: string }

/** The recorded answer, marked cached, if `input` is exactly the sample's input; else null. */
export function sampleAnswer(s: Sample | null | undefined, input: string): Record<string, unknown> | null {
  // ponytail: exact-match only, so a cached answer is never presented as the answer to different input.
  if (!s || input.trim() !== s.input.trim() || !s.response || typeof s.response !== "object") return null;
  return { ...(s.response as object), cached: true, cachedNotice: `The rate limit is reached or the server is busy, so this is the real answer recorded for this example on ${s.recordedAt.slice(0, 10)}, not a new model call.` };
}

export async function aiRoute<T>(req: Request, field: string, run: (text: string) => Promise<T>, opts: { route: string; sample?: Sample | null }): Promise<Response> {
  const body = await readJson(req);
  if (body instanceof Response) return body;
  const text = body[field];
  if (typeof text !== "string" || !text.trim()) return Response.json({ error: `"${field}" must be a non-empty string.` }, { status: 400 });
  if (text.length > MAX_INPUT) return Response.json({ error: `"${field}" is limited to ${MAX_INPUT} characters.` }, { status: 413 });
  const off = notConfigured("NEBIUS_API_KEY", "The model");
  if (off) return off;

  const limited = rateLimited(req, opts.route);
  if (limited) {
    const cached = sampleAnswer(opts.sample, text);
    return cached ? Response.json(cached) : limited;
  }

  try {
    return Response.json(await run(text.trim()));
  } catch (e) {
    // The model judged the input off-topic (e.g. not a bug report): a user problem with a reason, not a server failure.
    if (e instanceof RejectedInput) return Response.json({ error: `The model did not accept this input: ${e.message.slice(0, 300)}` }, { status: 422 });
    const message = e instanceof Error ? e.message : String(e);
    if (/not implemented/i.test(message)) {
      refund(req, opts.route);
      return Response.json({ error: "This mode's model call is not wired up yet (the AI layer is still a stub). Nothing was sent to a model." }, { status: 501 });
    }
    console.error("ai route failed:", message);
    return Response.json({ error: "The model call failed. Try again in a minute." }, { status: 502 });
  }
}
