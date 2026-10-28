import { rateLimited } from "@/lib/ai-route";
import { getData, recordedTuning, replayHref } from "@/lib/data";
import { isBug, signatureOf, TriageError, triageRound, validateTriageBody } from "@/lib/triage-live";

// Live triage of one recorded round: ONE Nemotron Ultra call (the only model call). The round is looked up server-side from
// {p, round}; evidence, the patch and both replays are computed here, in child processes. Nothing is stored; game/src is never modified.
export const maxDuration = 60; // evidence replay + a 40 s model budget + two replays
const TIMEOUT_MS = Number(process.env.TRIAGE_TIMEOUT_MS) || 40_000;

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: "Body must be JSON." }, { status: 400 }); }
  const v = validateTriageBody(body);
  if ("error" in v) return Response.json({ error: v.error }, { status: v.status });
  const { runs, personas } = getData();
  const run = runs.get(`${v.p}:${v.round}`), persona = personas.get(v.p);
  if (!run || !persona) return Response.json({ error: `No recorded round ${v.p} round ${v.round}.` }, { status: 404 });
  if (!run.ev.some(isBug)) return Response.json({ error: "This round has no invariant violation (airborne, oob, stuck, clip, softlock, nan, crash) to triage; its events are ordinary gameplay." }, { status: 422 });
  const limited = rateLimited(req);
  if (limited) return limited;

  const signature = signatureOf(run.ev);
  const sameSignature = [...runs.values()].filter((r) => signatureOf(r.ev) === signature);
  try {
    const result = await triageRound({ run, persona, tuning: recordedTuning(), sameSignature }, { timeoutMs: TIMEOUT_MS });
    return Response.json({ ...result, href: replayHref(v.p, v.round) });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("triage route failed:", message);
    if (e instanceof TriageError) return Response.json({ error: message }, { status: e.status });
    return Response.json({ error: "Triage stopped before a verdict. Try again in a minute." }, { status: 500 });
  }
}
