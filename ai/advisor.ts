// Design Advisor: one Super-VL call describes the frames, 3 Tavily searches fetch design writeups, one Super call (thinking off)
// writes the recommendations as JSON (a second Super call only if the first answer is not JSON), and lib/advisor.ts decides which of them survive.
// Selected quotes come from the committed review corpus. Nothing is trained; runtime calls write no files.
import { advisorQueries, ADVISOR_DOMAINS, synthesisPrompt, validateRecommendations, type CrowdRow, type Dropped, type Recommendation, type Source } from "../lib/advisor";
import { chat, extractJson, SUPER, VL } from "./models";
import { searchPrecedent } from "./precedent";
import { reviewSources, selectReviews, type ReviewEntry } from "../lib/reviews";

export interface AdvisorInput {
  frames: string[];          // 4 base64 JPEG/PNG frames, in time order
  frameTimes: number[];
  crowd: CrowdRow[];
  gameText: string[];
  genre: string;
  tuningKeys: Set<string>;
  /** Trusted corpus entries supplied by the caller; omitted means no reviews. Never taken from the API request body. */
  reviews?: ReviewEntry[];
}
export interface AdvisorResult {
  frameNotes: string;
  frameTimes: number[];
  sources: Source[];
  searches: { run: number; failed: number };
  recommendations: Recommendation[];
  proposed: number;          // how many the model wrote before validation
  dropped: Dropped;
  models: { vision: string; synthesis: string };
  generatedAt: string;
}

// Per-call limits, one retry each. app/api/advisor/route.ts maxDuration must cover VISION + searches (30 s, ai/precedent.ts) + two SYNTH tries.
export const VISION_TIMEOUT_MS = 60_000;
export const SYNTH_TIMEOUT_MS = 45_000;

const VISION_SYSTEM = "You review the visual design of a 3D street fighting game from frames of one replayed round. The frames are the 3D canvas only: the health bars and other on-screen HUD are not in them. Describe only what is visible; say when you cannot tell. Do not guess at gameplay you cannot see.";
const visionQuestion = (n: number, times: number[]) =>
  `${n} frames in time order, at ${times.map((t) => `${t} s`).join(", ")}. For each frame, in two or three short sentences: (1) lighting and contrast: can you tell the background from the fighters; (2) are both fighters and any hit feedback (sparks, flashes, impact) easy to read; (3) camera framing: how large are the fighters, is anything cut off; (4) clutter: anything in the scene that competes with the fighters. Start each with "Frame N:".`;

export async function runAdvisor(i: AdvisorInput): Promise<AdvisorResult> {
  const vision = await chat({ model: VL, system: VISION_SYSTEM, user: visionQuestion(i.frames.length, i.frameTimes), images: i.frames, maxTokens: 900, temperature: 0.2, thinking: false, timeoutMs: VISION_TIMEOUT_MS, retries: 1 });
  const frameNotes = vision.content.trim();

  // Searches run side by side; a failed one just leaves its results out (the model is told when nothing came back).
  const queries = advisorQueries(i.genre);
  const settled = await Promise.allSettled(queries.map((q) => searchPrecedent(q, ADVISOR_DOMAINS)));
  const seen = new Set<string>();
  const sources: Source[] = [];
  settled.forEach((s, k) => {
    if (s.status === "rejected") { console.error(`[advisor] search ${k + 1}: ${(s.reason as Error)?.message}`); return; }
    for (const r of s.value) if (!seen.has(r.url)) { seen.add(r.url); sources.push({ ...r, query: queries[k] }); }
  });

  const reviews = selectReviews(i.reviews ?? [], i.crowd);
  sources.push(...reviewSources(reviews));

  const p = synthesisPrompt({ frameNotes, crowd: i.crowd, gameText: i.gameText, sources, tuningKeys: [...i.tuningKeys], frameTimes: i.frameTimes });
  // One retry when the answer is not JSON: the vision call and the searches are the expensive part and are already done.
  let raw: unknown;
  for (let attempt = 1; ; attempt++) {
    const answer = await chat({ model: SUPER, system: p.system, user: p.user, maxTokens: 3000, temperature: 0.2, thinking: false, timeoutMs: SYNTH_TIMEOUT_MS, retries: 1 });
    try { raw = extractJson(answer.content); break; } catch (e) {
      console.error(`[advisor] synthesis attempt ${attempt} was not JSON (finish ${answer.finishReason}, ${answer.content.length} chars): ${answer.content.slice(0, 160).replace(/\s+/g, " ")} | ${(e as Error).message.slice(0, 80)}`);
      if (attempt >= 2) throw new Error("the synthesis model did not return JSON");
    }
  }
  const v = validateRecommendations(raw, { frameCount: i.frames.length, crowd: i.crowd, sources, reviews, tuningKeys: i.tuningKeys, gameText: i.gameText });

  return {
    frameNotes, frameTimes: i.frameTimes, sources,
    searches: { run: queries.length, failed: settled.filter((s) => s.status === "rejected").length },
    recommendations: v.recommendations, proposed: v.proposed, dropped: v.dropped,
    models: { vision: VL, synthesis: SUPER }, generatedAt: new Date().toISOString(),
  };
}
