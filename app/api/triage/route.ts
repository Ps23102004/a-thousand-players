import { notConfigured, rateLimited, readJson, refund, sampleAnswer } from "@/lib/ai-route";
import { getData, recordedTuning, replayHref } from "@/lib/data";
import { loadSample } from "@/lib/samples";
import { isBug, liveSlot, MAX_LIVE_TRIAGES, signatureOf, TriageError, triageRound, validateTriageBody } from "@/lib/triage-live";

// Live triage of one recorded round: up to TWO Nemotron Ultra calls (the only model calls; the second only if the first patch fails validation). The round is looked up server-side from
// {p, round}; evidence, the patch and both replays are computed here, in child processes. Nothing is stored; game/src is never modified.
export const maxDuration = 120; // evidence replay + up to 2 Ultra tries of 40 s each + two replays
const TIMEOUT_MS = Number(process.env.TRIAGE_TIMEOUT_MS) || 40_000;

export async function POST(req: Request) {
  const body = await readJson(req);
  if (body instanceof Response) return body;
  const v = validateTriageBody(body);
  if ("error" in v) return Response.json({ error: v.error }, { status: v.status });
  // Before any replay: a missing key would otherwise cost 2 to 7 s of CPU to end in the same 503.
  const off = notConfigured("NEBIUS_API_KEY", "Live triage (Nemotron Ultra)");
  if (off) return off;
  const { runs, personas } = getData();
  const run = runs.get(`${v.p}:${v.round}`), persona = personas.get(v.p);
  if (!run || !persona) return Response.json({ error: `No recorded round ${v.p} round ${v.round}.` }, { status: 404 });
  if (!run.ev.some(isBug)) return Response.json({ error: "This round has no invariant violation (airborne, oob, stuck, clip, softlock, nan, crash) to triage; its events are ordinary gameplay." }, { status: 422 });
  const sample = () => sampleAnswer(loadSample("triage"), `${v.p}:${v.round}`);
  const limited = rateLimited(req, "triage");
  if (limited) { const cached = sample(); return cached ? Response.json(cached) : limited; }
  // Each triage runs up to three replay processes; more than a couple at once only makes every one of them time out.
  const release = liveSlot();
  if (!release) {
    refund(req, "triage");
    const cached = sample();
    return cached ? Response.json(cached) : Response.json({ error: `Live triage is busy: ${MAX_LIVE_TRIAGES} rounds are already being replayed on this server. Try again in about 30 seconds.` }, { status: 503, headers: { "Retry-After": "30" } });
  }

  const signature = signatureOf(run.ev);
  const sameSignature = [...runs.values()].filter((r) => signatureOf(r.ev) === signature);
  try {
    const result = await triageRound({ run, persona, tuning: recordedTuning(), sameSignature }, { timeoutMs: TIMEOUT_MS });
    return Response.json({ ...result, href: replayHref(v.p, v.round) });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("triage route failed:", message);
    if (e instanceof TriageError) {
      if (!e.modelCalled) refund(req, "triage");
      return Response.json({ error: message }, { status: e.status });
    }
    return Response.json({ error: "Triage stopped before a verdict. Try again in a minute." }, { status: 500 });
  } finally { release(); }
}
