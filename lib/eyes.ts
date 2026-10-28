// Input checks and frame timing for Eyes mode (Super-VL looks at replay frames). Pure code so it is testable.
import type { RunLine } from "./types";

export const MAX_FRAMES = 3;
const MAX_FRAME_CHARS = 350_000;   // base64 chars per frame; a 640x360 JPEG is about 40-80k
const MAX_QUESTION = 300;
export const DEFAULT_QUESTION = "Does anything look physically wrong in these frames: a fighter floating in the air, sunk into the floor, clipped into a wall or crate, outside the arena, or frozen in a pose? Say which frame.";

/** Returns the cleaned input, or {error,status} for a request that should be refused before any model call. */
export function validateEyes(body: unknown): { frames: string[]; question: string } | { error: string; status: number } {
  const b = (body ?? {}) as Record<string, unknown>;
  const frames = b.frames;
  if (!Array.isArray(frames) || frames.length < 1 || frames.length > MAX_FRAMES) return { error: `"frames" must be 1 to ${MAX_FRAMES} images.`, status: 400 };
  for (const f of frames) {
    if (typeof f !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(f)) return { error: "Each frame must be base64 image data without a data: prefix.", status: 400 };
    if (f.length > MAX_FRAME_CHARS) return { error: "A frame is too large. Frames are limited to about 260 KB each.", status: 413 };
    if (!f.startsWith("/9j/") && !f.startsWith("iVBOR")) return { error: "Frames must be JPEG or PNG.", status: 400 };
  }
  const q = typeof b.question === "string" && b.question.trim() ? b.question.trim() : DEFAULT_QUESTION;
  if (q.length > MAX_QUESTION) return { error: `"question" is limited to ${MAX_QUESTION} characters.`, status: 413 };
  return { frames: frames as string[], question: q };
}

const BUG = new Set(["stuck", "oob", "nan", "clip", "airborne", "softlock", "crash"]);
/** Three times (seconds) worth looking at: around the first bug event of the round if it has one, else evenly spaced. */
export function captureTimes(run: Pick<RunLine, "ev" | "t"> | undefined, maxT: number): number[] {
  const end = Math.max(1, Math.min(run?.t ?? maxT, maxT));
  const bug = run?.ev.find((e) => BUG.has(e[1]));
  const raw = bug ? [bug[0] - 2.5, bug[0], bug[0] + 1.5] : [0.25, 0.5, 0.75].map((f) => f * end);
  return raw.map((t) => Math.round(Math.min(end, Math.max(0, t)) * 10) / 10);
}
