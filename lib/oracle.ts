// Evaluates a Repro oracle (written by Nemotron Super from a bug report) against a recorded round. Pure code, no model.
import type { Ev, Oracle, OracleAtom, RunLine } from "./types";

const OUTCOME_ATOMS = new Set(["player_ko", "rival_ko", "timeout"]);
// Invariant events fire only after the engine's own threshold (airborne 2.5 s, clip 2 s, stuck 10 s, softlock 25 s), so a duration is already built in.
// Only these events carry an arg (move name, state, message); an arg on any other atom cannot be tested, so it is ignored.
const ARG_EVENTS = new Set(["hit", "throw", "stuck", "softlock", "crash"]);
const INVARIANT = new Set(["stuck", "oob", "nan", "clip", "airborne", "softlock", "crash"]);

/** The events of this round that satisfy one atom. Empty array = the atom does not hold. */
export function atomMatches(a: OracleAtom, run: RunLine): Ev[] {
  if (OUTCOME_ATOMS.has(a.event)) {
    const [from, to] = a.withinSeconds ?? [0, Infinity];
    const when = run.ko?.t ?? run.t;
    if (when < from || when > to) return [];
    const holds = a.event === "player_ko" ? run.out === "loss" && run.ko !== null && run.hp[0] <= 0
      : a.event === "rival_ko" ? run.out === "win" && run.ko !== null && run.hp[1] <= 0
      : run.ko === null && run.t >= 98;
    return holds ? [[when, "hit", 0] as unknown as Ev] : [];
  }
  const arg = ARG_EVENTS.has(a.event) ? a.arg?.toLowerCase() : undefined;
  const hits = run.ev.filter((e) =>
    e[1] === a.event
    && (a.who === undefined || e[2] === a.who)
    && (arg === undefined || String(e[3] ?? "").toLowerCase().includes(arg))
    && (!a.withinSeconds || (e[0] >= a.withinSeconds[0] && e[0] <= a.withinSeconds[1])));
  if (hits.length < (a.minCount ?? 1)) return [];
  // For gameplay events "lasting N s" means the matching events span at least N s; invariants already include their threshold.
  if (a.minDuration && !INVARIANT.has(a.event) && hits[hits.length - 1][0] - hits[0][0] < a.minDuration) return [];
  return hits;
}

/** Events that make the oracle fire for this round, or null when it does not. */
export function matchOracle(o: Oracle, run: RunLine): Ev[] | null {
  const per = o.atoms.map((a) => atomMatches(a, run));
  const ok = o.combine === "all" ? per.every((x) => x.length > 0) : per.some((x) => x.length > 0);
  return ok ? per.flat().sort((x, y) => x[0] - y[0]) : null;
}

/** What the oracle cannot see: the engine caps the stored event list per round. */
export const EVENT_CAP = 220;
