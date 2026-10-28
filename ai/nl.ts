import baseline from "../data/baseline-tuning.json";
import type { Oracle, OracleAtom, Tuning, TuningSpec } from "../lib/types";
import { chat, extractJson, SUPER } from "./models";

const ORACLE_EVENTS = ["stuck", "oob", "nan", "clip", "airborne", "softlock", "crash","player_ko", "rival_ko", "timeout", "hit", "block", "parry", "knockdown", "throw", "prop", "combo", "mount"] as const;
const ATOM_KEYS = new Set(["event", "who", "minCount", "minDuration", "withinSeconds", "arg"]);

/** Throws a message meant to be fed back to the model. */
export function validateOracle(raw: unknown): Oracle {
  if (!raw || typeof raw !== "object") throw new Error("expected a JSON object");
  const o = raw as Record<string, unknown>;
  if (typeof o.error === "string") throw new RejectedInput(o.error);
  if (typeof o.description !== "string" || !o.description.trim()) throw new Error("description must be a non-empty string");
  if (o.combine !== "all" && o.combine !== "any") throw new Error('combine must be "all" or "any"');
  if (!Array.isArray(o.atoms) || o.atoms.length < 1 || o.atoms.length > 6) throw new Error("atoms must be an array of 1-6 atoms");
  // All atom errors are collected into one message: the model gets exactly one retry, so it must see everything at once.
  const errors: string[] = [];
  const atoms = o.atoms.map((a: unknown, i: number): OracleAtom => {
    if (!a || typeof a !== "object") { errors.push(`atom ${i} is not an object`); return { event: "hit" }; }
    const x = a as Record<string, unknown>;
    for (const k of Object.keys(x)) if (!ATOM_KEYS.has(k)) errors.push(`atom ${i}: unknown field "${k}"`);
    if (!(ORACLE_EVENTS as readonly string[]).includes(x.event as string)) errors.push(`atom ${i}: event must be one of ${ORACLE_EVENTS.join(", ")}`);
    if (x.who !== undefined && x.who !== 0 && x.who !== 1) errors.push(`atom ${i}: who must be 0 (player) or 1 (rival), or omitted`);
    if (x.minCount !== undefined && !(Number.isInteger(x.minCount) && (x.minCount as number) >= 1)) errors.push(`atom ${i}: minCount must be an integer >= 1`);
    if (x.minDuration !== undefined && !(typeof x.minDuration === "number" && x.minDuration > 0)) errors.push(`atom ${i}: minDuration must be seconds > 0, or omitted`);
    if (x.withinSeconds !== undefined) {
      const w = x.withinSeconds;
      if (!Array.isArray(w) || w.length !== 2 || typeof w[0] !== "number" || typeof w[1] !== "number" || w[0] < 0 || w[1] <= w[0]) errors.push(`atom ${i}: withinSeconds must be [start, end] with 0 <= start < end`);
    }
    if (x.arg !== undefined && typeof x.arg !== "string") errors.push(`atom ${i}: arg must be a string`);
    return x as unknown as OracleAtom;
  });
  if (errors.length) throw new Error(errors.join("; "));
  return { description: o.description.trim(), combine: o.combine, atoms };
}

export class RejectedInput extends Error {}

const ORACLE_PROMPT = `Turn a player's bug report about a 1v1 fighting game into an executable oracle: a predicate over the events the headless engine logs for a round.
Events: invariant violations stuck (a fighter frozen in one state or animation on the ground), oob (out of bounds), nan, clip (through geometry), airborne (stuck in the air), softlock (nobody can act); outcomes player_ko, rival_ko, timeout; gameplay hit, block, parry, knockdown, throw, prop, combo, mount.
Atom fields: event (required), who (0 = the player, 1 = the CPU rival), minCount (integer >= 1), minDuration (seconds the condition lasts, > 0), withinSeconds ([start, end] of round time; rounds last 5-100 s), arg (only a move or fighter state name in CAPS that the report names, e.g. "SWEEP", "BLOCK"; never a position).
Include only the fields the report supports; omit a field instead of writing a default such as 0, -1 or [0, 300].
Answer with ONE fenced json block: {"description": "one sentence", "combine": "all"|"any", "atoms": [ ... ]}.
If the text is not a report about this game's behavior, answer {"error": "why"} instead.`;

async function structured<T>(prompt: string, input: string, validate: (raw: unknown) => T): Promise<T> {
  let feedback = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await chat({ model: SUPER, system: prompt, user: input + feedback, maxTokens: 1500, temperature: 0.1, thinking: false });
    try {
      return validate(extractJson(r.content));
    } catch (err) {
      if (err instanceof RejectedInput || attempt === 1) throw err;
      feedback = `\n\nYour previous answer was invalid: ${(err as Error).message}. Previous answer:\n${r.content.slice(0, 2000)}\nFix it.`;
    }
  }
  throw new Error("unreachable");
}

export function bugReportToOracle(report: string): Promise<Oracle> {
  if (!report.trim()) return Promise.reject(new RejectedInput("empty bug report"));
  return structured(ORACLE_PROMPT, `Bug report:\n${report.slice(0, 4000)}`, validateOracle);
}

export const TUNING_SPECS: TuningSpec[] = baseline;

/** Unknown keys and non-numbers are errors (fed back to the model); out-of-range numbers are clamped. */
export function validateTuning(raw: unknown, specs: TuningSpec[] = TUNING_SPECS): { tuning: Tuning; rationale: string } {
  if (!raw || typeof raw !== "object") throw new Error("expected a JSON object");
  const o = raw as Record<string, unknown>;
  if (typeof o.error === "string") throw new RejectedInput(o.error);
  if (!o.tuning || typeof o.tuning !== "object") throw new Error("tuning must be an object of key -> absolute number");
  if (typeof o.rationale !== "string" || !o.rationale.trim()) throw new Error("rationale must be a non-empty string");
  const byKey = new Map(specs.map((s) => [s.key, s]));
  const tuning: Tuning = {};
  for (const [k, v] of Object.entries(o.tuning as Record<string, unknown>)) {
    const spec = byKey.get(k);
    if (!spec) throw new Error(`unknown tuning key "${k}"`);
    if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`value for "${k}" must be an absolute number`);
    tuning[k] = Math.min(spec.max, Math.max(spec.min, v));
  }
  if (!Object.keys(tuning).length) throw new Error("no tuning keys changed");
  return { tuning, rationale: o.rationale.trim() };
}

const TUNING_PROMPT = `Turn a fighting game's patch notes into numeric tuning overrides.
Available keys (key: default [min..max] description):
${TUNING_SPECS.map((s) => `${s.key}: ${s.default} [${s.min}..${s.max}] ${s.description}`).join("\n")}
Use only these keys, give ABSOLUTE new values (e.g. "+20% sweep recovery" = 0.38 * 1.2 = 0.456), include only keys the notes change.
Answer with ONE fenced json block: {"tuning": {"key": number}, "rationale": "one paragraph: what each change does to play"}.
If the notes describe nothing these keys can express, answer {"error": "why"} instead.`;

export function patchNotesToTuning(notes: string): Promise<{ tuning: Tuning; rationale: string }> {
  if (!notes.trim()) return Promise.reject(new RejectedInput("empty patch notes"));
  return structured(TUNING_PROMPT, `Patch notes:\n${notes.slice(0, 4000)}`, (raw) => validateTuning(raw));
}
