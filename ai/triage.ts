import { existsSync, readFileSync } from "node:fs";
import { chat, extractJson, ULTRA } from "./models";

/** One cluster from engine/bugs.mjs (data/run-main/bugs.json). */
export interface BugCluster {
  id: string; signature: string; count: number;
  rounds: { p: string; round: number; seed: number; label: string; t: number; out: string }[];
  representative: { p: string; round: number; seed: number; label: string };
  timeline: string[];
}
export interface Patch { file: string; find: string; replace: string }
export interface Triage { title: string; isRealBug: boolean; severity: "high" | "med" | "low"; rootCause: string; playerImpact: string; patches: Patch[]; confidence: number; model: string; tokensIn: number; tokensOut: number }

// The gameplay-logic files a physics/state bug can live in (props.js and character.js trimmed to their logic halves).
const FILES: [string, number?, number?][] = [["ground.js"], ["grapple.js"], ["props.js", 260, 466], ["combat.js"], ["character.js", 94, 136], ["player.js"], ["ai.js"], ["movement.js"]];

function sourceBundle(root: string): string {
  return FILES.map(([f, a = 1, b]) => {
    const lines = readFileSync(`${root}/${f}`, "utf8").split("\n");
    const end = Math.min(b ?? lines.length, lines.length);
    return `// FILE ${f} (lines ${a}-${end})\n` + lines.slice(a - 1, end).map((l, i) => `${a + i}| ${l}`).join("\n");
  }).join("\n\n");
}

const INVARIANTS = "airborne: a fighter's body centre stays above y=1.3 (standing height is 0.8) for more than 2.5 s. " +
  "stuck: a fighter stays in the same non-neutral state (attack phase, hit stun, knockdown, grab, mount, downed, get-up) for more than 10 s. " +
  "oob: |x| > 10.45 (walls at x=±10.5; fighters normally stop at ±9.98), y < -0.6 or |z| > 2.3. softlock: neither fighter loses health for 25 s. crash: an exception escaped game code.";

const SCHEMA_EXAMPLE = '```json\n{"title": "Score can go negative", "isRealBug": true, "severity": "low", "rootCause": "hud.js:40 subtracts the penalty without clamping at zero.", ' +
  '"playerImpact": "The score display shows a negative number.", "patches": [{"file": "hud.js", "startLine": 40, "endLine": 40, "replace": "  score = Math.max(0, score - penalty);"}], "confidence": 0.8}\n```';

const SYSTEM = "You are a senior gameplay engineer triaging a bug that automated playtesting found in Market Brawl, a Three.js + Rapier 3D fighting game. " +
  "You get the invariant that fired, a 10 Hz timeline re-simulated from the exact seed, and the relevant source with line numbers. " +
  "Find the root cause in the code and propose the smallest patch that removes it without changing game balance. Answer with ONE fenced json block and nothing else. " +
  "The json MUST have exactly these keys, and patches MUST be line-range objects (not a diff, not prose):\n" + SCHEMA_EXAMPLE;

export const MAX_RANGE_LINES = 12;
const count = (src: string, find: string) => src.split(find).length - 1;

/** The numbered lines around the line sharing the most identifiers with `text`, so a retry can copy from the real file. */
export function closestLines(src: string, text: string): string {
  const words = (t: string) => new Set(t.match(/\w{3,}/g) ?? []);
  const want = words(text), lines = src.split("\n");
  let best = 0, score = -1;
  lines.forEach((l, i) => { const s = [...words(l)].filter((w) => want.has(w)).length; if (s > score) { score = s; best = i; } });
  return lines.slice(Math.max(0, best - 2), best + 3).map((l, i) => `${Math.max(0, best - 2) + i + 1}| ${l}`).join("\n");
}

/** Exact text of `find` in src: the exact match, else the one place it matches with whitespace ignored. Never guesses between places. */
function locate(src: string, find: string, file: string): string {
  const exact = count(src, find);
  if (exact === 1) return find;
  if (exact === 0) {
    const loose = new RegExp([...find.replace(/\s+/g, "")].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*"), "g");
    const hits = src.match(loose) ?? [];
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) throw new Error(`find text occurs ${hits.length} times in ${file} (ignoring spacing); it must match exactly once`);
  }
  throw new Error(`find text occurs ${exact} times in ${file}; it must match exactly once. Use startLine/endLine instead.` +
    (exact === 0 ? ` The closest lines in ${file} are:\n${closestLines(src, find)}` : ""));
}

/** Lines startLine..endLine (1-based, whole lines) as an exact find; widened by neighbouring lines, in both find and replace, until unique. */
function fromRange(src: string, x: Record<string, unknown>, file: string): { find: string; replace: string } {
  const lines = src.split("\n"), a = x.startLine, b = x.endLine;
  if (!Number.isInteger(a) || !Number.isInteger(b)) throw new Error("startLine and endLine must be integers");
  let s = a as number, e = b as number;
  if (s < 1 || e > lines.length) throw new Error(`${file} has lines 1-${lines.length}`);
  if (s > e) throw new Error("startLine must not be after endLine");
  if (e - s + 1 > MAX_RANGE_LINES) throw new Error(`a range covers at most ${MAX_RANGE_LINES} lines; split the patch or narrow it`);
  let replace = String(x.replace);
  const body = replace.split("\n");
  if (body.filter((l) => l.trim()).every((l) => /^\s*\d+\| ?/.test(l)) && body.some((l) => l.trim())) replace = body.map((l) => l.replace(/^\s*\d+\| ?/, "")).join("\n");
  let find = lines.slice(s - 1, e).join("\n");
  while (count(src, find) > 1) {
    if (s > 1) { s--; find = `${lines[s - 1]}\n${find}`; replace = `${lines[s - 1]}\n${replace}`; }
    else if (e < lines.length) { e++; find += `\n${lines[e - 1]}`; replace += `\n${lines[e - 1]}`; }
    else throw new Error(`lines ${a}-${b} of ${file} are not unique`);
  }
  return { find, replace };
}

const balance = (t: string) => [...t].reduce((n, c) => n + ("{([".includes(c) ? 1 : "})]".includes(c) ? -1 : 0), 0);

/** Accepts {file, startLine, endLine, replace} or {file, find, replace}; returns exact find/replace pairs. Throws a message meant to be fed back to the model. */
export function validatePatches(raw: unknown, root = "game/src"): Patch[] {
  if (!Array.isArray(raw) || raw.length > 3) throw new Error("patches must be an array of at most 3 patches");
  const patches = raw.map((p: unknown, i: number) => {
    const x = p as Record<string, unknown>;
    if (typeof x?.file !== "string" || !/^[\w.-]+\.js$/.test(x.file) || !existsSync(`${root}/${x.file}`)) throw new Error(`patch ${i}: file must be one of the source files shown`);
    if (typeof x.replace !== "string") throw new Error(`patch ${i}: find and replace must be strings`);
    const src = readFileSync(`${root}/${x.file}`, "utf8");
    try {
      let patch: Patch;
      if (x.startLine !== undefined || x.endLine !== undefined) patch = { file: x.file, ...fromRange(src, x, x.file) };
      else {
        if (typeof x.find !== "string" || !x.find.trim()) throw new Error("find and replace must be strings");
        if (/^\s*\d+\|/m.test(x.find)) throw new Error(`find still contains "NNN| " line-number prefixes; copy the code without them`);
        patch = { file: x.file, find: locate(src, x.find, x.file), replace: x.replace };
      }
      // Measured failure mode of whole-line replacements: a line (often a closing brace) left out of replace.
      if (balance(patch.find) !== balance(patch.replace)) throw new Error("replace changes the bracket balance of the lines it replaces; include every line of the range, closing brackets too");
      return patch;
    } catch (e) { throw new Error(`patch ${i}: ${(e as Error).message}`); }
  });
  const real = patches.filter((p) => p.find.replace(/\s+/g, "") !== p.replace.replace(/\s+/g, "")); // a re-indent changes nothing; drop it
  if (patches.length && !real.length) throw new Error("the patches change only whitespace, so they change nothing");
  return real;
}

/** attempts: answers that fail validation are sent back with the error up to this many times (3 offline, 1 live). timeoutMs/retries go to chat(). */
export interface TriageOpts { attempts?: number; timeoutMs?: number; retries?: number }

/** Ultra reads the evidence + source and proposes a root cause and a minimal patch; code checks the patch applies. */
export async function triageBug(bug: BugCluster, root = "game/src", history = "", opts: TriageOpts = {}): Promise<Triage> {
  const attempts = opts.attempts ?? 3;
  const rep = bug.representative;
  const user = `Bug signature: ${bug.signature}\nSeen in ${bug.count} recorded rounds, e.g. ${bug.rounds.slice(0, 4).map((r) => `${r.p} round ${r.round} seed ${r.seed}`).join("; ")}.\n` +
    `Invariant definitions: ${INVARIANTS}\n\nEvidence timeline (re-simulated from ${rep.p} round ${rep.round} seed ${rep.seed}; "keys" is the player's current intent):\n${bug.timeline.join("\n")}\n\n` +
    `Source:\n${sourceBundle(root)}\n\n` +
    `Return: {"title": "short bug title", "isRealBug": true|false (false if the invariant fired on legitimate gameplay), "severity": "high"|"med"|"low", ` +
    `"rootCause": "2-4 sentences citing file:line", "playerImpact": "one sentence: what a player sees", ` +
    `"patches": [{"file": "ground.js", "startLine": N, "endLine": M, "replace": "the complete new text of lines N-M, with indentation and WITHOUT 'NNN| ' prefixes"}], ` +
    `"confidence": 0.0-1.0}. startLine/endLine are the numbers in the 'NNN| ' prefixes of the source above; a patch replaces whole lines, at most ${MAX_RANGE_LINES} of them. ` +
    `Use [] for patches when isRealBug is false. At most 3 patches.` +
    (history ? `\n\nEarlier attempts, each verified by applying the patch and replaying the exact seeds (find a DIFFERENT root cause):\n${history}` : "");
  let feedback = "", lastError = "";
  for (let attempt = 0; attempt < attempts; attempt++) {
    const r = await chat({ model: ULTRA, system: SYSTEM, user: user + feedback, maxTokens: 6000, thinking: false, temperature: 0.1, timeoutMs: opts.timeoutMs, retries: opts.retries });
    try {
      const o = extractJson(r.content) as Record<string, unknown>;
      if (typeof o?.title !== "string" || typeof o.rootCause !== "string" || typeof o.isRealBug !== "boolean") throw new Error("title, rootCause and isRealBug are required");
      const patches = o.isRealBug ? validatePatches(o.patches, root) : [];
      const sev = o.severity === "high" || o.severity === "low" ? o.severity : "med";
      return { title: o.title, isRealBug: o.isRealBug, severity: sev, rootCause: o.rootCause, playerImpact: String(o.playerImpact ?? ""), patches,
        confidence: Math.max(0, Math.min(1, Number(o.confidence) || 0.5)), model: ULTRA, tokensIn: r.tokensIn, tokensOut: r.tokensOut };
    } catch (e) {
      lastError = (e as Error).message;
      if (process.env.TRIAGE_DEBUG) console.error(`[triage-debug] attempt ${attempt} rejected: ${lastError}\n${r.content.slice(0, 1800)}\n---`);
      feedback = `\n\nYour previous answer was rejected: ${lastError}. Answer again with one fenced json block with exactly the keys title, isRealBug, severity, rootCause, playerImpact, patches, confidence. ` +
        `Each patch is {"file","startLine","endLine","replace"}: replace is the full new text of those whole lines (no line-number prefixes, no diff markers). Example:\n${SCHEMA_EXAMPLE}`;
    }
  }
  throw new Error(`triage answer failed validation ${attempts} time${attempts === 1 ? "" : "s"}; last: ${lastError}`);
}
