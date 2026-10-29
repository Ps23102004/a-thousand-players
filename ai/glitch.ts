import type { Persona, RunLine } from "../lib/types";

export const GLITCH_TYPES = ["airborne", "oob", "clip", "stuck", "nan", "softlock"] as const;
export type GlitchType = (typeof GLITCH_TYPES)[number];
export type Truth = "flagged" | "clean";

export interface GlitchRound {
  key: string;
  seed: number;
  truth: Truth;
  types: GlitchType[];
  archetype?: string;
  duration: number;
  matchedTo?: string;
}

export interface Rate {
  yes: number;
  total: number;
  rate: number;
  interval: [number, number];
  unparseable: number;
}

function rng(seed: number) {
  let state = seed >>> 0;
  return () => ((state = (state + 0x6d2b79f5) >>> 0), ((state ^ state >>> 15) * (1 | state) ^ (((state ^ state >>> 15) * (1 | state)) + Math.imul(state ^ state >>> 7, 61 | state))) >>> 0) / 4294967296;
}
function shuffled<T>(items: T[], random: () => number) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
function types(run: RunLine): GlitchType[] {
  return [...new Set(run.ev.map((e) => e[1]).filter((code): code is GlitchType => (GLITCH_TYPES as readonly string[]).includes(code)))];
}

/** Deterministic 20/20 selection: round-robin invariant types, then closest clean archetype/duration peers. */
export function selectGlitchBatch(runs: RunLine[], personas: Persona[], options: { seed: number; perTruth?: number } = { seed: 1 }): { flagged: GlitchRound[]; clean: GlitchRound[] } {
  const perTruth = options.perTruth ?? 20;
  const archetype = new Map(personas.map((p) => [p.id, p.archetype]));
  const toRound = (run: RunLine, truth: Truth): GlitchRound => ({ key: `${run.p}:${run.round}`, seed: run.seed, truth, types: types(run), archetype: archetype.get(run.p), duration: run.t });
  const flagged = runs.filter((r) => types(r).length).map((r) => toRound(r, "flagged"));
  const cleanPool = runs.filter((r) => !types(r).length && !r.ev.some((e) => e[1] === "crash")).map((r) => toRound(r, "clean"));
  const random = rng(options.seed);
  const selected: GlitchRound[] = [];
  const included = flagged.find((r) => r.key === "p0537:1");
  if (included) selected.push(included);
  const buckets = new Map(GLITCH_TYPES.map((type) => [type, shuffled(flagged.filter((r) => r.types.includes(type) && r.key !== included?.key), random)]));
  let cursor = 0;
  while (selected.length < Math.min(perTruth, flagged.length)) {
    const type = GLITCH_TYPES[cursor++ % GLITCH_TYPES.length];
    const next = buckets.get(type)!.find((r) => !selected.some((picked) => picked.key === r.key));
    if (next) selected.push(next);
    if (cursor > GLITCH_TYPES.length * Math.max(1, flagged.length)) break;
  }
  for (const extra of shuffled(flagged, random)) if (selected.length < Math.min(perTruth, flagged.length) && !selected.some((r) => r.key === extra.key)) selected.push(extra);

  const available = new Map(cleanPool.map((r) => [r.key, r]));
  const clean: GlitchRound[] = [];
  for (const bug of selected) {
    const candidates = [...available.values()].sort((a, b) => {
      const sameA = Number(a.archetype !== bug.archetype), sameB = Number(b.archetype !== bug.archetype);
      return sameA - sameB || Math.abs(a.duration - bug.duration) - Math.abs(b.duration - bug.duration) || a.key.localeCompare(b.key);
    });
    const match = candidates[0];
    if (match) { clean.push({ ...match, matchedTo: bug.key }); available.delete(match.key); }
  }
  for (const extra of shuffled([...available.values()], random)) if (clean.length < Math.min(perTruth, cleanPool.length)) clean.push(extra);
  return { flagged: selected, clean };
}

export function parseGlitchAnswer(text: unknown): "yes" | "no" | "unparseable" {
  if (typeof text !== "string") return "unparseable";
  // Reject answer pairs such as YES/NO or NO - YES, while allowing explanatory prose.
  const match = text.trim().match(/^(YES|NO)(?![a-z])(?!\s*[/-]\s*(?:YES|NO)(?![a-z]))/i);
  return match ? match[1].toLowerCase() as "yes" | "no" : "unparseable";
}

/** Wilson score interval, two-sided 95%, bounded for empty samples. */
export function wilson95(yes: number, total: number): [number, number] {
  if (!total) return [0, 0];
  const z = 1.959963984540054, z2 = z * z, p = yes / total;
  const center = (p + z2 / (2 * total)) / (1 + z2 / total);
  const half = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total) / (1 + z2 / total);
  return [yes === 0 ? 0 : Math.max(0, Math.min(1, center - half)), yes === total ? 1 : Math.max(0, Math.min(1, center + half))];
}

export interface ScoredRound { key: string; seed: number; truth: Truth; types: GlitchType[]; answer: unknown; matchedTo?: string }
export function scoreGlitchBatch(rows: ScoredRound[]) {
  const rate = (group: ScoredRound[]): Rate => {
    const parsed = group.map((row) => parseGlitchAnswer(row.answer));
    const yes = parsed.filter((answer) => answer === "yes").length;
    return { yes, total: group.length, rate: group.length ? yes / group.length : 0, interval: wilson95(yes, group.length), unparseable: parsed.filter((answer) => answer === "unparseable").length };
  };
  const flagged = rows.filter((row) => row.truth === "flagged");
  return {
    overall: { hit: rate(flagged), falseAlarm: rate(rows.filter((row) => row.truth === "clean")) },
    byType: Object.fromEntries(GLITCH_TYPES.map((type) => {
      const subset = flagged.filter((row) => row.types.includes(type));
      const keys = new Set(subset.map((row) => row.key));
      return [type, { hit: rate(subset), falseAlarm: rate(rows.filter((row) => row.truth === "clean" && row.matchedTo && keys.has(row.matchedTo))) }];
    })) as Record<GlitchType, { hit: Rate; falseAlarm: Rate }>,
  };
}
