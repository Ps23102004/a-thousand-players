import { ACTIONS, ARCHETYPES, type Archetype, type Persona, type PolicyRule, type Weights } from "../lib/types";
import { chat, extractJson, NANO, pool } from "./models";

export const QUOTA: Record<Archetype, number> = {
  turtle: 0.12, rusher: 0.16, masher: 0.16, learner: 0.12, cheeser: 0.10, casual: 0.20, speedrunner: 0.06, explorer: 0.08,
};

const ARCHETYPE_HINT: Record<Archetype, string> = {
  turtle: "blocks and waits for the rival to make a mistake, very defensive, patient",
  rusher: "runs straight in and attacks nonstop, hates waiting, low patience",
  masher: "presses attack buttons almost at random, low skill, enjoys the chaos",
  learner: "starts clumsy but pays attention, tries to punish the rival's recovery, medium patience",
  cheeser: "finds one move that works (sweep, grab or thrown props) and repeats it",
  casual: "plays for fun a few minutes, low to medium skill, quits when frustrated or bored",
  speedrunner: "skilled, wants the fastest possible win, gets bored by long rounds",
  explorer: "tries every move, jumps around, grabs props, curious more than competitive",
};

// Rotating backgrounds so batches of the same archetype do not converge on the same people.
const THEMES = [
  "college students", "parents playing after the kids are asleep", "retired arcade veterans", "esports hopefuls",
  "teenagers", "streamers", "people new to fighting games", "office workers on a lunch break", "nurses after night shift",
  "a mix of countries and ages",
];

/** Exact per-archetype counts summing to n (largest remainder). */
export function archetypeCounts(n: number): Record<Archetype, number> {
  const raw = ARCHETYPES.map((a) => ({ a, exact: n * QUOTA[a] }));
  const counts = Object.fromEntries(raw.map(({ a, exact }) => [a, Math.floor(exact)])) as Record<Archetype, number>;
  let left = n - Object.values(counts).reduce((s, c) => s + c, 0);
  for (const { a } of [...raw].sort((x, y) => (y.exact % 1) - (x.exact % 1))) {
    if (left-- <= 0) break;
    counts[a] += 1;
  }
  return counts;
}

const DISTS = new Set(["far", "mid", "close"]);
const RIVALS = new Set(["idle", "startup", "active", "recovery", "down", "stunned"]);
const ACTION_SET = new Set<string>(ACTIONS);

const num = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null;

function validRule(r: unknown): PolicyRule | null {
  if (!r || typeof r !== "object") return null;
  const { dist, rival, weights } = r as Record<string, unknown>;
  if (dist !== undefined && !DISTS.has(dist as string)) return null;
  if (rival !== undefined && !RIVALS.has(rival as string)) return null;
  if (!weights || typeof weights !== "object") return null;
  const entries = Object.entries(weights as Record<string, unknown>);
  if (!entries.length) return null;
  const w: Weights = {};
  for (const [k, v] of entries) {
    const n = num(v, 1, 9);
    if (!ACTION_SET.has(k) || n === null) return null; // a hallucinated action means the rule is unreliable
    w[k as keyof Weights] = Math.round(n);
  }
  return { ...(dist ? { dist: dist as PolicyRule["dist"] } : {}), ...(rival ? { rival: rival as PolicyRule["rival"] } : {}), weights: w };
}

/** Clamps numbers, drops bad rules; returns null when the persona itself is unusable. id is assigned later. */
export function validatePersona(raw: unknown, archetype: Archetype): Omit<Persona, "id"> | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name.trim().slice(0, 40) : "";
  const bio = typeof o.bio === "string" ? o.bio.trim().replace(/\s+/g, " ") : "";
  const words = bio.split(" ").filter(Boolean).length;
  const skill = num(o.skill, 0, 1), patience = num(o.patience, 0, 1), ft = num(o.frustration_tolerance, 0, 1);
  const rt = num(o.reaction_ticks, 6, 40);
  if (!name || words < 5 || words > 22 || skill === null || patience === null || ft === null || rt === null) return null;
  const rules = (Array.isArray(o.rules) ? o.rules : []).map(validRule).filter((r): r is PolicyRule => r !== null).slice(0, 5);
  return { name, archetype, skill: round2(skill), reaction_ticks: Math.round(rt), patience: round2(patience), frustration_tolerance: round2(ft), bio, rules };
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/** Canonical key for de-duplication: same rules in any order and key order are the same rule set. */
export function ruleKey(rules: PolicyRule[]): string {
  return rules
    .map((r) => `${r.dist ?? "*"}/${r.rival ?? "*"}:${Object.entries(r.weights).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join(",")}`)
    .sort()
    .join("|");
}

function prompt(archetype: Archetype, count: number, theme: string, avoidNames: string[]): string {
  return `You write synthetic player personas for a 1v1 3D street fighting game ("Market Brawl"): the player fights a CPU rival in a market square.
Write ${count} DIFFERENT players of archetype "${archetype}": ${ARCHETYPE_HINT[archetype]}. This batch: ${theme}.

Return ONLY a JSON array of ${count} objects with exactly these fields:
- "name": first name (avoid: ${avoidNames.slice(-60).join(", ") || "none"})
- "skill": 0..1, "reaction_ticks": integer 6..40 (60 Hz ticks between decisions; lower = faster), "patience": 0..1 (low quits sooner), "frustration_tolerance": 0..1
- "bio": 8-14 words, specific and human (who they are and how they play)
- "rules": 0-5 sparse behavior rules that make THIS player different. Each rule: {"dist"?: "far"|"mid"|"close", "rival"?: "idle"|"startup"|"active"|"recovery"|"down"|"stunned", "weights": {action: integer 1-9}}. Omitted dist/rival means "any". Actions: ${ACTIONS.join(", ")}.
Think like real players: "never uses the sweep" = few rules without sweep; "panics when cornered" = {"dist":"close","rival":"active","weights":{"jump":6,"retreat":5}}; "mashes punch when hurt" = {"weights":{"punch":8}}.
Traits and rules must fit the archetype but vary between players.`;
}

async function generateBatch(archetype: Archetype, count: number, theme: string, avoidNames: string[]): Promise<{ ok: Omit<Persona, "id">[]; asked: number; tokensOut: number }> {
  try {
    const r = await chat({ model: NANO, user: prompt(archetype, count, theme, avoidNames), maxTokens: 6000, temperature: 0.9, thinking: false });
    const arr = extractJson(r.content);
    if (!Array.isArray(arr)) return { ok: [], asked: count, tokensOut: r.tokensOut };
    return { ok: arr.map((x) => validatePersona(x, archetype)).filter((p): p is Omit<Persona, "id"> => p !== null), asked: count, tokensOut: r.tokensOut };
  } catch (err) {
    console.error(`[personas] ${archetype} batch failed: ${(err as Error).message.slice(0, 200)}`);
    return { ok: [], asked: count, tokensOut: 0 };
  }
}

export interface PersonaStats { requested: number; firstPassValid: number; duplicatesDropped: number; repairRounds: number; calls: number }
export let lastPersonaStats: PersonaStats | null = null;

export async function generatePersonas(n: number, opts: { concurrency?: number; batch?: number; seed?: number; onProgress?: (done: number, total: number) => void } = {}): Promise<Persona[]> {
  const batchSize = opts.batch ?? 20;
  const counts = archetypeCounts(n);
  const accepted: Record<Archetype, Omit<Persona, "id">[]> = Object.fromEntries(ARCHETYPES.map((a) => [a, []])) as never;
  const seenRules = new Set<string>();
  const stats: PersonaStats = { requested: n, firstPassValid: 0, duplicatesDropped: 0, repairRounds: 0, calls: 0 };
  let themeIdx = opts.seed ?? 0;

  for (let round = 0; round < 5; round++) {
    const jobs: { a: Archetype; count: number; theme: string }[] = [];
    for (const a of ARCHETYPES) {
      // Ask for a little extra on repair rounds: some of the answer will be dropped again.
      let need = counts[a] - accepted[a].length;
      if (round > 0 && need > 0) need = Math.min(batchSize, need + 2);
      for (; need > 0; need -= batchSize) jobs.push({ a, count: Math.min(batchSize, need), theme: THEMES[themeIdx++ % THEMES.length] });
    }
    if (!jobs.length) break;
    if (round > 0) stats.repairRounds++;
    stats.calls += jobs.length;
    await pool(jobs, opts.concurrency ?? 16, async (job) => {
      const res = await generateBatch(job.a, job.count, job.theme, accepted[job.a].map((p) => p.name));
      let valid = 0;
      for (const p of res.ok) {
        const key = ruleKey(p.rules);
        if (p.rules.length && seenRules.has(key)) { stats.duplicatesDropped++; continue; }
        if (accepted[job.a].length >= counts[job.a]) break;
        seenRules.add(key);
        accepted[job.a].push(p);
        valid++;
      }
      if (round === 0) stats.firstPassValid += valid;
      opts.onProgress?.(ARCHETYPES.reduce((s, a) => s + accepted[a].length, 0), n);
    });
  }
  lastPersonaStats = stats;
  const all = shuffle(ARCHETYPES.flatMap((a) => accepted[a]), opts.seed ?? 1);
  if (all.length < n) console.error(`[personas] only ${all.length}/${n} personas after repair; the API may be failing`);
  return all.map((p, i) => ({ id: `p${String(i + 1).padStart(4, "0")}`, ...p }));
}

// Seeded so the same Nano output always gets the same ids; mixes archetypes so the UI grid is not grouped.
function shuffle<T>(xs: T[], seed: number): T[] {
  let s = seed >>> 0;
  const rand = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
