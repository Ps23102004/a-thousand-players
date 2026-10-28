import type { ReplayToken } from "./types";

// base64url(JSON) so a replay link survives copy-paste; works in Node and the browser.
export function encodeToken(token: ReplayToken): string {
  const bytes = new TextEncoder().encode(JSON.stringify(token));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Returns null for anything that is not a well-formed token (the value comes from a URL). */
export function decodeToken(s: string | null | undefined): ReplayToken | null {
  if (!s || s.length > 20000) return null;
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    const obj = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
    const ok = obj && Number.isFinite(obj.seed) && Number.isFinite(obj.maxT) && (obj.fighter === "kai" || obj.fighter === "rook")
      && (obj.tuning === null || typeof obj.tuning === "object")
      && (obj.persona === undefined || (typeof obj.persona?.name === "string" && Array.isArray(obj.persona.rules)))
      && (obj.inputs === undefined || Array.isArray(obj.inputs));
    return ok ? (obj as ReplayToken) : null;
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
