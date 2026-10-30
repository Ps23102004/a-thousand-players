import baseline from "../data/baseline-tuning.json";
import type { ReplayToken } from "./types";

// base64url(JSON) so a replay link survives copy-paste; works in Node and the browser.
export function encodeToken(token: ReplayToken): string {
  const bytes = new TextEncoder().encode(JSON.stringify(token));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Under Node's 16 KB header limit (a longer URL gets a raw 431 before the page runs). Shipped links are under 1,000 chars.
export const MAX_TOKEN_CHARS = 8000;
const TUNING_KEYS = new Set((baseline as { key: string }[]).map((s) => s.key));

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const str = (v: unknown) => typeof v === "string";
const okRule = (r: unknown) => isObj(r) && (r.dist === undefined || str(r.dist)) && (r.rival === undefined || str(r.rival))
  && (r.weights === undefined || (isObj(r.weights) && Object.values(r.weights).every(num)));
// Length caps: a shared link must not be able to put long arbitrary text on the page (recorded personas: name 11, bio 93 chars).
const short = (v: unknown, n: number) => str(v) && (v as string).length <= n;
const okPersona = (p: unknown) => isObj(p) && str(p.id) && p.id !== "" && short(p.name, 40) && short(p.archetype, 40) && short(p.bio, 300)
  && num(p.skill) && num(p.reaction_ticks) && num(p.patience) && num(p.frustration_tolerance) && Array.isArray(p.rules) && p.rules.every(okRule);
// Tuning keys feed applyTuning(), which writes RULES[name]: only known keys or rules.<identifier> that is not an Object.prototype name.
const okTuningKey = (k: string) => TUNING_KEYS.has(k) || (/^rules\.[A-Za-z]\w*$/.test(k) && !(k.slice(6) in Object.prototype));

/** Every field the replay page and game/replay.html read, type-checked. The value comes from a URL, so nothing is trusted. */
export function isReplayToken(o: unknown): o is ReplayToken {
  return isObj(o) && num(o.seed) && num(o.maxT) && (o.maxT as number) > 0 && (o.fighter === "kai" || o.fighter === "rook")
    && (o.tuning === null || (isObj(o.tuning) && Object.entries(o.tuning).every(([k, v]) => okTuningKey(k) && num(v))))
    && (o.persona === undefined || okPersona(o.persona))
    && (o.inputs === undefined || (Array.isArray(o.inputs) && o.inputs.every((i) => Array.isArray(i) && i.length === 2 && num(i[0]) && num(i[1]))));
}

/** Returns null for anything that is not a well-formed token (the value comes from a URL). */
export function decodeToken(s: string | null | undefined): ReplayToken | null {
  if (!s || s.length > MAX_TOKEN_CHARS) return null;
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    const obj: unknown = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
    return isReplayToken(obj) ? obj : null;
  } catch {
    return null;
  }
}

/** Which fighter a persona plays. Same FNV-1a rule as engine/crowd-worker-lib.mjs, so a link replays the round that was recorded. */
export function fighterFor(personaId: string): "kai" | "rook" {
  let h = 2166136261;
  for (let i = 0; i < personaId.length; i++) { h ^= personaId.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 2 ? "rook" : "kai";
}
