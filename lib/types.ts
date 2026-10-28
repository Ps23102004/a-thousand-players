// Shared data shapes for A Thousand Players. See docs/design.md.
// The engine (plain JS, engine/) emits these as JSON/JSONL; the web app (app/, components/, lib/) and the AI layer (ai/) consume them.

export const ACTIONS = ["advance", "retreat", "block", "punch", "kick", "low_punch", "sweep", "parry", "grab", "jump", "prop", "wait"] as const;
export type Action = (typeof ACTIONS)[number];

export const ARCHETYPES = ["turtle", "rusher", "masher", "learner", "cheeser", "casual", "speedrunner", "explorer"] as const;
export type Archetype = (typeof ARCHETYPES)[number];

export type DistBucket = "far" | "mid" | "close"; // far > 2.2, mid 1.3-2.2, close < 1.3 world units
export type RivalPhase = "idle" | "startup" | "active" | "recovery" | "down" | "stunned";
export type Weights = Partial<Record<Action, number>>;

/** Sparse override of the archetype's base decision table. Omitted dist/rival means "any". */
export interface PolicyRule { dist?: DistBucket; rival?: RivalPhase; weights: Weights }

export interface Persona {
  id: string;            // "p0412"
  name: string;
  archetype: Archetype;
  skill: number;             // 0..1  (how reliably they react / hit grapple prompts)
  reaction_ticks: number;    // 6..40 game ticks (60 Hz) between decisions
  patience: number;          // 0..1  (low = quits sooner)
  frustration_tolerance: number; // 0..1
  bio: string;
  rules: PolicyRule[];       // 0..6 rules
}

// ---------- engine output ----------
export type Outcome = "win" | "loss" | "draw"; // from the persona's point of view
export type EventCode =
  | "hit" | "block" | "parry" | "knockdown" | "throw" | "prop" | "combo" | "mount"   // gameplay
  | "stuck" | "oob" | "nan" | "clip" | "airborne" | "softlock" | "crash";             // invariant violations (bug oracle); crash arg = "Error in fn (file:line)"
/** who: 0 = the persona-controlled fighter, 1 = the built-in CPU rival */
export type Ev = [t: number, code: EventCode, who: 0 | 1, arg?: string | number];

export interface RunLine {            // one line of runs/<name>.jsonl per ROUND played
  p: string; round: number; seed: number; tuning: string;
  out: Outcome; t: number;            // seconds of game time the round lasted
  hp: [number, number];               // final hp [persona, rival]
  ko: { x: number; t: number } | null; // where/when someone hit 0 hp (x of the loser)
  ev: Ev[];                           // compact event list
  dmg: [number, number];              // damage dealt [by persona, by rival]
  maxCombo: number;
  mood: { frustration: number; boredom: number };
  live?: boolean;                     // true for Nano-driven spotlight players
}
export interface SessionEnd { p: string; quit: { afterRound: number; reason: "frustration" | "boredom" | "satisfied" | "cap" | "crash" } }

/** 10 Hz downsampled trajectory used for the tiles and the 2D scrubber. f rows: [x0, x1, hp0, hp1, state0, state1] (states index TraceFile.states). */
export interface Trace { key: string; dt: number; f: [number, number, number, number, number, number][]; ev: Ev[] }
export interface TraceFile { states: string[]; arenaHalfWidth: number; traces: Record<string, Trace> }

export interface Summary {
  players: number; rounds: number; sessions: number; simHours: number;
  wins: number; losses: number; draws: number; winRate: number;
  byArchetype: Record<string, { players: number; rounds: number; winRate: number; quitRate: number; avgDuration: number }>;
  quitCurve: { round: number; remaining: number }[];       // players still playing at the start of each round (0..1)
  quitReasons: Record<string, number>;
  koHeat: { xBins: number[]; tBins: number[]; grid: number[][] }; // KO counts: grid[tIndex][xIndex]
  durationHist: { bin: number; count: number }[];
}

// ---------- AI output ----------
export interface Claim {
  metric: "winRate" | "quitRate" | "avgDuration" | "koShare" | "meanHpLoss";
  scope: { archetype?: Archetype; round?: number };  // empty scope = everyone
  value: number;                                     // fraction 0..1 for rates/shares, seconds for avgDuration, hp points for meanHpLoss
}
export interface Finding {
  id: string; title: string; severity: "high" | "med" | "low";
  kind: "difficulty" | "exploit" | "boredom" | "bug" | "balance";
  narrative: string;
  claims: Claim[];                                   // machine-checkable numbers the narrative relies on
  seeds: { p: string; round: number; seed: number; why: string }[]; // every seed must exist in the runs
  suggestion: string; confidence: number;
  precedent?: { title: string; url: string; snippet: string }[];   // Tavily
  verified?: { claim: Claim; actual: number; ok: boolean }[];      // recomputed by code, tolerance 0.05 (rates) / 10% (others)
}
export interface Findings { summary: string; findings: Finding[]; model: string; tokensIn: number; tokensOut: number; corpusTokens: number }

// ---------- replay ----------
export type Tuning = Record<string, number>; // keys from data/baseline-tuning.json, absolute values within min..max
export interface TuningSpec { key: string; default: number; min: number; max: number; description: string }
export interface ReplayToken {
  seed: number; tuning: Tuning | null; fighter: "kai" | "rook"; maxT: number;
  persona?: Persona;            // policy-driven players re-simulate from persona + seed
  inputs?: [tick: number, keyMask: number][]; // spotlight/exploit players replay recorded inputs instead
}

// ---------- bug oracle (Repro mode) ----------
export interface OracleAtom {
  event: EventCode | "player_ko" | "rival_ko" | "timeout";
  who?: 0 | 1; minCount?: number; minDuration?: number; withinSeconds?: [number, number]; arg?: string;
}
export interface Oracle { description: string; combine: "all" | "any"; atoms: OracleAtom[] }

// ---------- live Nano player ----------
export interface FighterObs { hp: number; posture: number; x: number; state: string; facing: 1 | -1; guarding: boolean; grappled: boolean; onGround: boolean }
export interface Observation {
  t: number; me: FighterObs; rival: FighterObs; dist: number;
  persona: { archetype: Archetype; aggression: number; skill: number; bio: string };
  recent: string[]; // last few actions taken
}

export interface UsageRow { model: string; calls: number; tokensIn: number; tokensOut: number; usdEstimate: number }
