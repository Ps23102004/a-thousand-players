import { describeFrames } from "@/ai";
import { notConfigured, rateLimited, readJson, sampleAnswer } from "@/lib/ai-route";
import { DEFAULT_QUESTION, validateEyes } from "@/lib/eyes";
import { loadSample } from "@/lib/samples";

const MAX_BODY = 1_100_000; // 3 frames of up to 350,000 base64 chars each (lib/eyes.ts) plus the question

/** The replay round the request came from (the Eyes panel lives on /replay?key=p0537:1); "" when unknown. */
function refererKey(req: Request): string {
  try { return new URL(req.headers.get("referer") ?? "").searchParams.get("key") ?? ""; } catch { return ""; }
}

// Super-VL (the only model call) describes up to 3 frames captured from a replay. Nothing is stored.
export async function POST(req: Request) {
  const body = await readJson(req, MAX_BODY);
  if (body instanceof Response) return body;
  const v = validateEyes(body);
  if ("error" in v) return Response.json({ error: v.error }, { status: v.status });
  const off = notConfigured("NEBIUS_API_KEY", "The vision model");
  if (off) return off;
  const limited = rateLimited(req, "eyes");
  if (limited) {
    // The sample round's frames are a deterministic re-simulation, so the recorded answer describes the same round.
    const cached = v.question === DEFAULT_QUESTION ? sampleAnswer(loadSample("eyes"), refererKey(req)) : null;
    // The Eyes panel shows only `text`, so the notice goes in it too. Frames are not compared, so say they were not analysed.
    const notice = `${cached?.cachedNotice} It describes the recorded frames of this round, not the frames you just sent.`;
    return cached ? Response.json({ ...cached, cachedNotice: notice, text: `${notice}\n\n${cached.text}` }) : limited;
  }
  try {
    return Response.json({ text: await describeFrames(v.frames, v.question), frames: v.frames.length });
  } catch (e) {
    console.error("eyes route failed:", e instanceof Error ? e.message : String(e));
    return Response.json({ error: "The vision model call failed. Try again in a minute." }, { status: 502 });
  }
}
