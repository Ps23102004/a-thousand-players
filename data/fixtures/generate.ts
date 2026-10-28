// Writes SAMPLE data shaped like a real crowd run (lib/types.ts), so the web app can be built before the engine lands.
// Deterministic: same output every run. Usage: npx tsx data/fixtures/generate.ts
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ARCHETYPES } from "../../lib/types";
import type { Archetype, Claim, Ev, Finding, Findings, Persona, PolicyRule, RunLine, SessionEnd, Trace, TraceFile, UsageRow } from "../../lib/types";
import type { UsageFile } from "../../lib/web-types";

const OUT = join(import.meta.dirname);
const HALF = 10.5;
const STATES = ["idle", "advance", "retreat", "attack", "block", "hitstun", "down"];
const S = Object.fromEntries(STATES.map((s, i) => [s, i])) as Record<string, number>;

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20261030);
const between = (lo: number, hi: number) => lo + rng() * (hi - lo);
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)];
const r2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// ---------- personas ----------
const NAMES = ["Mira", "Tobi", "Ash", "Juno", "Kofi", "Rhea", "Sol", "Ivo", "Noor", "Pax", "Wren", "Dax", "Lumi", "Oren", "Zia", "Bex", "Cato", "Esme", "Finn", "Gus", "Hana", "Ines", "Jax", "Kit", "Lev", "Maya", "Nico", "Opal", "Quin", "Ravi"];
const BIOS: Record<Archetype, string> = {
  turtle: "Holds guard and waits for a mistake.",
  rusher: "Walks forward and swings first.",
  masher: "Presses every button at once and hopes.",
  learner: "Starts clumsy, copies what works.",
  cheeser: "Found one move that works and never stops using it.",
  casual: "Plays a couple of rounds after dinner.",
  speedrunner: "Wants the KO fast, takes risks for it.",
  explorer: "Pokes at walls, props and odd inputs.",
};
const SKILL: Record<Archetype, [number, number]> = {
  turtle: [0.4, 0.8], rusher: [0.3, 0.7], masher: [0.1, 0.4], learner: [0.2, 0.6],
  cheeser: [0.4, 0.7], casual: [0.1, 0.5], speedrunner: [0.6, 0.95], explorer: [0.3, 0.7],
};
const RULES: Record<Archetype, PolicyRule[]> = {
  turtle: [{ dist: "close", weights: { block: 4, parry: 1 } }, { rival: "recovery", weights: { punch: 3 } }],
  rusher: [{ dist: "far", weights: { advance: 5 } }, { dist: "close", weights: { punch: 3, kick: 2 } }],
  masher: [{ weights: { punch: 2, kick: 2, sweep: 1, jump: 1 } }],
  learner: [{ dist: "mid", weights: { advance: 2, block: 1 } }, { rival: "recovery", weights: { kick: 2 } }],
  cheeser: [{ dist: "close", weights: { sweep: 6 } }, { dist: "mid", weights: { advance: 3, sweep: 2 } }],
  casual: [{ weights: { punch: 1, advance: 1, wait: 1 } }],
  speedrunner: [{ dist: "far", weights: { advance: 4 } }, { dist: "close", weights: { kick: 3, grab: 2 } }],
  explorer: [{ weights: { prop: 2, jump: 2, retreat: 1 } }],
};

const personas: Persona[] = [];
for (let i = 0; i < 240; i++) {
  const archetype = ARCHETYPES[i % ARCHETYPES.length];
  const [lo, hi] = SKILL[archetype];
  personas.push({
    id: `p${String(i).padStart(4, "0")}`,
    name: `${NAMES[i % NAMES.length]}${i >= NAMES.length ? ` ${String.fromCharCode(65 + Math.floor(i / NAMES.length))}.` : ""}`,
    archetype,
    skill: r2(between(lo, hi)),
    reaction_ticks: Math.round(between(8, 36)),
    patience: r2(archetype === "casual" ? between(0.05, 0.3) : between(0.3, 0.9)),
    frustration_tolerance: r2(archetype === "rusher" ? between(0.1, 0.4) : between(0.3, 0.9)),
    bio: BIOS[archetype],
    rules: RULES[archetype],
  });
}

// ---------- rounds ----------
function winChance(p: Persona, round: number): number {
  const base: Record<Archetype, number> = {
    turtle: 0.45, rusher: round === 2 ? 0.2 : 0.6, masher: 0.38, learner: 0.25 + 0.12 * (round - 1),
    cheeser: 0.95, casual: 0.35, speedrunner: 0.55, explorer: 0.3,
  };
  return p.archetype === "cheeser" ? base.cheeser : clamp(base[p.archetype] + (p.skill - 0.5) * 0.2, 0.05, 0.95);
}
function duration(a: Archetype): number {
  if (a === "cheeser") return between(18, 34);
  if (a === "rusher" || a === "speedrunner") return between(20, 48);
  if (a === "turtle") return between(55, 99);
  return between(30, 80);
}
const MOVES = ["JAB", "CROSS", "HOOK", "ROUNDHOUSE_KICK", "BODY_JAB", "UPPERCUT"];

/** Positions at 10 Hz plus the events that happened when the fighters were close. */
function simulate(p: Persona, run: Omit<RunLine, "ev" | "maxCombo">): { frames: Trace["f"]; ev: Ev[]; maxCombo: number } {
  const n = Math.max(2, Math.round(run.t * 10));
  const loserIsPersona = run.out === "loss";
  const endX = run.ko ? run.ko.x : between(-3, 3);
  const phase = rng() * Math.PI * 2;
  const w = between(0.35, 0.7);
  const pos: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    const gap = clamp(2.2 + 1.7 * Math.sin(i * 0.1 * w + phase) + 0.4 * Math.sin(i * 0.37), 0.8, 5);
    const g = k > 0.9 ? 0.9 + (gap - 0.9) * (1 - (k - 0.9) * 10) : gap;
    const mEnd = run.ko ? (loserIsPersona ? endX + g / 2 : endX - g / 2) : endX;
    const m = mEnd * k ** 1.5 + 1.2 * Math.sin(i * 0.05 + phase) * (1 - k);
    pos.push([clamp(m - g / 2, -HALF, HALF), clamp(m + g / 2, -HALF, HALF)]);
  }
  const close = pos.map((xy, i) => [xy[1] - xy[0], i] as const).filter(([g]) => g < 1.5).map(([, i]) => i);
  const hitsFrom = (dealt: number) => Math.max(0, Math.round(dealt / between(11, 17)));
  const cheese = p.archetype === "cheeser";
  const ev: Ev[] = [];
  const addHits = (who: 0 | 1, count: number) => {
    for (let h = 0; h < count && close.length; h++) {
      const move = who === 0 && cheese && rng() < 0.85 ? "SWEEP" : pick(MOVES);
      ev.push([pick(close) / 10, "hit", who, move]);
    }
  };
  addHits(0, hitsFrom(run.dmg[0]));
  addHits(1, hitsFrom(run.dmg[1]));
  for (let b = Math.floor(between(0, 5)); b > 0; b--) ev.push([between(1, run.t), "block", rng() < 0.5 ? 0 : 1]);
  if (rng() < 0.5) ev.push([between(2, run.t), "knockdown", rng() < 0.5 ? 0 : 1]);
  if (p.archetype === "explorer" && rng() < 0.4) ev.push([between(3, run.t), "prop", 0]);
  if ((p.archetype === "turtle" || p.archetype === "explorer") && rng() < 0.08) ev.push([between(5, run.t), "stuck", 0, "BLOCK"]);
  ev.sort((a, b) => a[0] - b[0]);
  for (const e of ev) e[0] = r2(e[0]);

  let maxCombo = 0, combo = 0, lastT = -9;
  for (const e of ev) {
    if (e[1] !== "hit" || e[2] !== 0) continue;
    combo = e[0] - lastT < 1.2 ? combo + 1 : 1;
    lastT = e[0];
    maxCombo = Math.max(maxCombo, combo);
  }

  const hp = [100, 100];
  const perHit = [run.dmg[1] / Math.max(1, ev.filter((e) => e[1] === "hit" && e[2] === 1).length), run.dmg[0] / Math.max(1, ev.filter((e) => e[1] === "hit" && e[2] === 0).length)];
  let next = 0;
  const frames: Trace["f"] = pos.map(([x0, x1], i) => {
    const t = i / 10;
    while (next < ev.length && ev[next][0] <= t) {
      const e = ev[next++];
      if (e[1] === "hit") hp[1 - e[2]] = Math.max(0, hp[1 - e[2]] - perHit[1 - e[2]]);
    }
    const stateFor = (who: 0 | 1) => {
      const near = ev.find((e) => Math.abs(e[0] - t) < 0.35);
      if (near?.[1] === "knockdown" && near[2] !== who) return S.down;
      if (near?.[1] === "hit") return near[2] === who ? S.attack : S.hitstun;
      if (near?.[1] === "block") return S.block;
      const prev = pos[Math.max(0, i - 1)];
      const dx = (who === 0 ? x0 - prev[0] : prev[1] - x1);
      return dx > 0.02 ? S.advance : dx < -0.02 ? S.retreat : S.idle;
    };
    return [r2(x0), r2(x1), Math.round(hp[0]), Math.round(hp[1]), stateFor(0), stateFor(1)];
  });
  const last = frames[frames.length - 1];
  last[2] = run.hp[0];
  last[3] = run.hp[1];
  if (run.ko) last[loserIsPersona ? 4 : 5] = S.down;
  return { frames, ev, maxCombo };
}

const runs: RunLine[] = [];
const sessions: SessionEnd[] = [];
const allFrames = new Map<string, Trace["f"]>();
const usedSeeds = new Set<number>();
for (const p of personas) {
  let frustration = 0, boredom = 0;
  for (let round = 1; round <= 4; round++) {
    let seed: number;
    do seed = Math.floor(between(10000, 99999)); while (usedSeeds.has(seed));
    usedSeeds.add(seed);
    const roll = rng();
    const out: RunLine["out"] = roll < (p.archetype === "cheeser" ? 0.01 : 0.04) ? "draw" : rng() < winChance(p, round) ? "win" : "loss";
    const timeout = out === "draw" || (p.archetype !== "cheeser" && rng() < 0.12);
    const t = r2(timeout ? 99 : duration(p.archetype));
    const loserHp = timeout ? Math.round(between(5, 45)) : 0;
    const winnerHp = Math.round(between(Math.max(loserHp + 5, 15), 100));
    const hp: [number, number] = out === "draw" ? [loserHp, loserHp] : out === "win" ? [winnerHp, loserHp] : [loserHp, winnerHp];
    let koX = 0;
    if (!timeout) {
      const cornered = p.archetype === "rusher" && round === 2 && out === "loss";
      koX = out === "loss" ? (cornered ? -between(8.6, 10.4) : -between(2, 10)) : between(2, 10);
    }
    const base = {
      p: p.id, round, seed, tuning: "base", out, t, hp,
      ko: timeout ? null : { x: r2(koX), t },
      dmg: [100 - hp[1], 100 - hp[0]] as [number, number],
      mood: { frustration: 0, boredom: 0 },
    };
    const { frames, ev, maxCombo } = simulate(p, base);
    frustration = clamp(frustration + (out === "loss" ? 0.45 - 0.25 * p.frustration_tolerance : -0.1), 0, 1);
    boredom = clamp(boredom + (out === "win" && t < 35 ? 0.22 : 0.08) + (p.archetype === "casual" ? 0.15 : 0), 0, 1);
    base.mood = { frustration: r2(frustration), boredom: r2(boredom) };
    runs.push({ ...base, ev, maxCombo });
    allFrames.set(`${p.id}:${round}`, frames);

    let reason: SessionEnd["quit"]["reason"] | null = null;
    if (frustration > 0.5 + 0.35 * p.frustration_tolerance) reason = "frustration";
    else if (boredom > 0.35 + 0.4 * p.patience) reason = "boredom";
    else if (out === "win" && rng() < 0.12) reason = "satisfied";
    else if (round === 4) reason = "cap";
    if (reason) { sessions.push({ p: p.id, quit: { afterRound: round, reason } }); break; }
  }
}

// ---------- traces: 96 rounds, 12 per archetype, 8 of them Nano-driven "live" ----------
const archetypeOf = new Map(personas.map((p) => [p.id, p.archetype]));
const shuffled = [...runs].sort(() => rng() - 0.5);
const traced: RunLine[] = [];
for (const a of ARCHETYPES) traced.push(...shuffled.filter((r) => archetypeOf.get(r.p) === a).slice(0, 12));
for (let i = 0; i < traced.length; i += 12) traced[i].live = true;
const traces: TraceFile = { states: STATES, arenaHalfWidth: HALF, traces: {} };
for (const r of traced) {
  const key = `${r.p}:${r.round}`;
  traces.traces[key] = { key, dt: 0.1, f: allFrames.get(key)!, ev: r.ev };
}

// ---------- findings: claims are recomputed here so the sample stays internally consistent ----------
const tracedSet = new Set(traced);
function actual(c: Claim): number {
  const inScope = (r: RunLine) => (!c.scope.archetype || archetypeOf.get(r.p) === c.scope.archetype) && (!c.scope.round || r.round === c.scope.round);
  const rs = runs.filter(inScope);
  if (c.metric === "winRate") return rs.filter((r) => r.out === "win").length / rs.length;
  if (c.metric === "avgDuration") return rs.reduce((s, r) => s + r.t, 0) / rs.length;
  const ids = personas.filter((p) => !c.scope.archetype || p.archetype === c.scope.archetype).map((p) => p.id);
  return ids.filter((id) => ["frustration", "boredom"].includes(sessions.find((s) => s.p === id)?.quit.reason ?? "")).length / ids.length;
}
const claim = (metric: Claim["metric"], scope: Claim["scope"]): Claim => {
  const c: Claim = { metric, scope, value: 0 };
  c.value = Number(actual(c).toFixed(2));
  return c;
};
const verify = (cs: Claim[]) => cs.map((c) => ({ claim: c, actual: Number(actual(c).toFixed(3)), ok: true }));
const seedsWhere = (f: (r: RunLine) => boolean, why: string, n = 3) =>
  [...traced.filter(f), ...runs.filter((r) => f(r) && !tracedSet.has(r))].slice(0, n).map((r) => ({ p: r.p, round: r.round, seed: r.seed, why }));

const pct = (c: Claim) => `${Math.round(c.value * 100)}%`;
const rusherR2 = claim("winRate", { archetype: "rusher", round: 2 });
const rusherR1 = claim("winRate", { archetype: "rusher", round: 1 });
const rusherQuit = claim("quitRate", { archetype: "rusher" });
const cheeseWin = claim("winRate", { archetype: "cheeser" });
const cheeseDur = claim("avgDuration", { archetype: "cheeser" });
const casualQuit = claim("quitRate", { archetype: "casual" });
const stuckRounds = runs.filter((r) => r.ev.some((e) => e[1] === "stuck"));
const turtleDur = claim("avgDuration", { archetype: "turtle" });

const list: Finding[] = [
  {
    id: "f1", title: "Round 2 is a wall for aggressive players", severity: "high", kind: "difficulty",
    narrative: `Rushers win ${pct(rusherR1)} of round 1 and only ${pct(rusherR2)} of round 2, and most of those losses end pinned against the left wall. ${pct(rusherQuit)} of rushers quit from frustration or boredom.`,
    claims: [rusherR1, rusherR2, rusherQuit],
    seeds: seedsWhere((r) => archetypeOf.get(r.p) === "rusher" && r.round === 2 && r.out === "loss" && (r.ko?.x ?? 0) < -8.5, "cornered and KO'd at the left wall in round 2"),
    suggestion: "Soften the round 2 rival: add a short wall-bounce or push-back so a cornered player can escape.",
    confidence: 0.72,
    precedent: [{ title: "Corner pressure and wall breaks in fighting game design", url: "https://www.gamedeveloper.com/design", snippet: "Sample precedent link: corner escapes keep losing players engaged." }],
  },
  {
    id: "f2", title: `Sweep spam wins ${pct(cheeseWin)} of rounds`, severity: "high", kind: "exploit",
    narrative: `Cheesers who repeat the low sweep win ${pct(cheeseWin)} of their rounds in ${Math.round(cheeseDur.value)} s on average. The rival never learns to block low.`,
    claims: [cheeseWin, cheeseDur],
    seeds: seedsWhere((r) => archetypeOf.get(r.p) === "cheeser" && r.out === "win", "wins with mostly SWEEP hits"),
    suggestion: "Make SWEEP punishable on block (longer recovery) and let the CPU rival switch to low guard after two sweeps.",
    confidence: 0.81,
    precedent: [{ title: "Sweep recovery and low-guard adaptation", url: "https://www.gamedeveloper.com/design", snippet: "Sample precedent link: long recovery on low attacks is the usual fix." }],
  },
  {
    id: "f3", title: "Casual players leave after two rounds", severity: "med", kind: "boredom",
    narrative: `${pct(casualQuit)} of casual players stop because of boredom or frustration, most after round 2 or 3. Nothing new appears between rounds.`,
    claims: [casualQuit],
    seeds: seedsWhere((r) => archetypeOf.get(r.p) === "casual" && r.round === 2, "last round before quitting"),
    suggestion: "Introduce a new move or arena prop in round 2 to give casual players a reason to stay.",
    confidence: 0.55,
  },
  {
    id: "f4", title: "Fighter can get stuck in the block state", severity: "low", kind: "bug",
    narrative: `${stuckRounds.length} rounds report the persona fighter frozen in BLOCK for more than two seconds. It shows up mostly in long turtle rounds (about ${Math.round(turtleDur.value)} s).`,
    claims: [turtleDur],
    seeds: seedsWhere((r) => r.ev.some((e) => e[1] === "stuck"), "stuck event fired"),
    suggestion: "Release guard when the block input is held through a knockdown recovery.",
    confidence: 0.4,
  },
];
for (const f of list.slice(0, 3)) f.verified = verify(f.claims);
// f4 is deliberately left unverified so the UI shows both chip states.

const findings: Findings = {
  summary: "SAMPLE: the round 2 rival corners aggressive players, a single sweep beats the CPU, and casual players drift away after round 2.",
  findings: list, model: "nvidia/Nemotron-3-Ultra-550b-a55b", tokensIn: 61_200, tokensOut: 8_900, corpusTokens: 58_400,
};

const usageRows: UsageRow[] = [
  { model: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B", calls: 1230, tokensIn: 1_104_000, tokensOut: 52_300, usdEstimate: 0 },
  { model: "nvidia/nemotron-3-super-120b-a12b", calls: 6, tokensIn: 9_100, tokensOut: 2_200, usdEstimate: 0 },
  { model: "nvidia/Nemotron-3.5-Super-VL", calls: 4, tokensIn: 6_400, tokensOut: 900, usdEstimate: 0 },
  { model: "nvidia/Nemotron-3-Ultra-550b-a55b", calls: 1, tokensIn: 61_200, tokensOut: 8_900, usdEstimate: r2(61_200 / 1e6 + (8_900 / 1e6) * 3) },
  { model: "tavily", calls: 4, tokensIn: 0, tokensOut: 0, usdEstimate: 0 },
];
const usage: UsageFile = { usage: usageRows, notes: "SAMPLE numbers from the fixture generator, not measured. Ultra estimate uses an unverified aggregator price ($1 in / $3 out per 1M tokens)." };

const write = (name: string, data: unknown) => writeFileSync(join(OUT, name), JSON.stringify(data) + "\n");
write("personas.json", personas);
write("traces.json", traces);
write("findings.json", findings);
write("usage.json", usage);
writeFileSync(join(OUT, "runs.jsonl"), [...runs, ...sessions].map((l) => JSON.stringify(l)).join("\n") + "\n");
console.log(`personas ${personas.length}, rounds ${runs.length}, sessions ${sessions.length}, traces ${traced.length}`);
