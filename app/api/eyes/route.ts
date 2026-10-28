import { describeFrames } from "@/ai";
import { rateLimited } from "@/lib/ai-route";
import { validateEyes } from "@/lib/eyes";

// Super-VL (the only model call) describes up to 3 frames captured from a replay. Nothing is stored.
export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: "Body must be JSON." }, { status: 400 }); }
  const v = validateEyes(body);
  if ("error" in v) return Response.json({ error: v.error }, { status: v.status });
  const limited = rateLimited(req);
  if (limited) return limited;
  try {
    return Response.json({ text: await describeFrames(v.frames, v.question), frames: v.frames.length });
  } catch (e) {
    console.error("eyes route failed:", e instanceof Error ? e.message : String(e));
    return Response.json({ error: "The vision model call failed. Try again in a minute." }, { status: 502 });
  }
}
