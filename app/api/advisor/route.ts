import { runAdvisor } from "@/ai/advisor";
import { notConfigured, rateLimited, readJson, sampleAnswer } from "@/lib/ai-route";
import { validateAdvisorBody } from "@/lib/advisor";
import { loadSample } from "@/lib/samples";
import corpus from "@/data/reviews/corpus.json";
import { parseReviewCorpus } from "@/lib/reviews";
import { advisorContext } from "./context";

// vision 60 s + searches 30 s + up to two synthesis tries of 45 s (VISION_TIMEOUT_MS / SYNTH_TIMEOUT_MS in ai/advisor.ts) = 180 s.
export const maxDuration = 180;
const MAX_BODY = 1_500_000; // 4 frames of up to 350,000 base64 chars each (lib/advisor.ts) plus the key

// One Super-VL call (the 4 frames), three Tavily searches the server words itself, one Super call (a second only if the first answer is not JSON). Nothing is stored.
export async function POST(req: Request) {
  const body = await readJson(req, MAX_BODY);
  if (body instanceof Response) return body;
  const v = validateAdvisorBody(body);
  if ("error" in v) return Response.json({ error: v.error }, { status: v.status });
  const ctx = advisorContext(v.key);
  if (!ctx) return Response.json({ error: "That round is not in the recorded data." }, { status: 404 });
  const off = notConfigured("NEBIUS_API_KEY", "The models");
  if (off) return off;
  const limited = rateLimited(req, "advisor");
  if (limited) {
    // A round is a deterministic re-simulation, so the recorded answer describes the same frames the page just captured.
    const cached = sampleAnswer(loadSample("advisor"), v.key);
    return cached ? Response.json(cached) : limited;
  }
  try {
    const result = await runAdvisor({ frames: v.frames, frameTimes: ctx.frameTimes, crowd: ctx.crowd, gameText: ctx.gameText, genre: ctx.genre, tuningKeys: ctx.tuningKeys, reviews: parseReviewCorpus(corpus).entries });
    return Response.json({ ...result, key: ctx.key, game: ctx.game, crowd: ctx.crowd, gameTextLines: ctx.gameText.length });
  } catch (e) {
    console.error("advisor route failed:", e instanceof Error ? e.message : String(e));
    return Response.json({ error: "The advisor failed. Try again in a minute." }, { status: 502 });
  }
}
