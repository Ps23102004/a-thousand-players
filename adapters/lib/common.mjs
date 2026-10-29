// Shared pieces for non-Market-Brawl adapters. Kept apart from engine/ on purpose: engine/sim.mjs and
// engine/policy.mjs import Rapier and game/src at module load, so reusing them would drag Market Brawl in.
import { readFileSync } from 'node:fs';

// Same mulberry32 / FNV as engine/sim.mjs, so seeds mean the same thing across games.
export function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function hashString(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/** Running 64-bit-ish hash over float64 bit patterns (same mixing as engine/sim.mjs). */
export function floatHasher() {
  const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
  let h1 = 2166136261, h2 = 5381;
  return {
    add(v) { f64[0] = v; h1 = Math.imul(h1 ^ u32[0], 16777619); h1 = Math.imul(h1 ^ u32[1], 16777619); h2 = (Math.imul(h2, 33) ^ u32[0] ^ u32[1]) | 0; },
    addString(s) { this.add(hashString(s)); },
    hex() { return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0'); },
  };
}

/** Weighted pick, same semantics as engine/policy.mjs pick(). */
export function pick(w, rng, fallback = 'wait') {
  let total = 0; for (const k in w) if (w[k] > 0) total += w[k];
  if (total <= 0) return fallback;
  let x = rng() * total;
  for (const k in w) if (w[k] > 0 && (x -= w[k]) < 0) return k;
  return fallback;
}

/** The first n of the 1000 Nemotron-written Market Brawl personas (no model calls; reads the saved file). */
export function loadPersonas(n, file = new URL('../../data/run-main/personas.json', import.meta.url)) {
  return JSON.parse(readFileSync(file, 'utf8')).slice(0, n);
}

/** Persona traits that transfer to any game. `rules` (dist/rival/punch tables) are Market Brawl vocabulary and do not. */
export function traits(p) {
  return { id: p.id, archetype: p.archetype, skill: p.skill, reaction_ticks: p.reaction_ticks, patience: p.patience, frustration_tolerance: p.frustration_tolerance };
}
