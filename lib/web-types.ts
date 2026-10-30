// Web-only shapes (lib/types.ts is read-only for the web agent).
import type { Archetype, Ev, Oracle, Outcome, ReplayToken, Tuning, UsageRow } from "./types";

export interface ExploitGenome { rank: number; winRate: number; avgHpLoss: number; label: string; hits?: Record<string, number>; replay: ReplayToken }
export interface ExploitFile { explanation: string; genomes: ExploitGenome[] }

export interface UsageFile { usage: UsageRow[]; notes: string }

export type DataSource = "run-main" | "fixtures";

/** One tile of the crowd grid. Frames are 5 Hz ints: [x0*10, x1*10, hp0, hp1, state0, state1]. */
export interface Tile {
  key: string; name: string; archetype: Archetype | "unknown"; outcome: Outcome; live: boolean; round: number;
  dt: number; f: number[][]; hits: [t: number, who: 0 | 1][]; href: string;
}

/** One triaged bug cluster, trimmed for the page: no raw rounds or timelines. `error` set means triage failed for this cluster. */
export interface BugView {
  id: string; signature: string; count: number; error?: string;
  title?: string; isRealBug?: boolean; severity?: "high" | "med" | "low"; rootCause?: string; playerImpact?: string; confidence?: number;
  patches: { file: string; find: string; replace: string }[];
  verdict?: string; fixedRounds?: number; verifyRounds?: number; attempts?: number;
  regression?: { personas: number; shipped: RegressionSide; patched: RegressionSide };
  regressionNote?: string;
  replay: string;
}
export interface RegressionSide { rounds: number; winRate: number; avgT: number; bugRounds: number }

export interface ReproMatch { p: string; name: string; archetype: string; round: number; seed: number; t: number; out: Outcome; events: Ev[]; href: string }
export interface ReproResult { total: number; matched: number; examples: ReproMatch[] }
export interface ReproResponse extends ReproResult { oracle: Oracle }

// ---------- live triage (one Ultra call from the Repro page) ----------
export type TriageVerdict = "fixed" | "not-fixed" | "patch-did-not-apply" | "not-a-bug" | "reused-shipped-fix";
/** One replay of the exact seed: shipped game (before) or patched scratch copy (after). */
export interface TriageLiveSide { out: Outcome; t: number; bugs: string[]; bugEvents: number; crash: string | null }
export interface TriageLiveResult {
  p: string; round: number; seed: number; signature: string; sameSignature: number; tuning: Tuning | null;
  verdict: TriageVerdict;
  triage: {
    title: string; isRealBug: boolean; severity: "high" | "med" | "low"; rootCause: string; playerImpact: string; confidence: number;
    patches: { file: string; find: string; replace: string }[]; model: string; tokensIn: number; tokensOut: number;
  };
  applied: { file: string; ok: boolean; why?: string }[];
  before: TriageLiveSide; after: TriageLiveSide | null; afterError?: string;
  timeline: string[];
  ms: { replayBefore: number; model: number; replayAfter: number; total: number };
}
export interface TriageLiveResponse extends TriageLiveResult { href: string }
