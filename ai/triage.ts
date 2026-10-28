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
  '"playerImpact": "The score display shows a negative number.", "patches": [{"file": "hud.js", "find": "score -= penalty;", "replace": "score = Math.max(0, score - penalty);"}], "confidence": 0.8}\n```';

const SYSTEM = "You are a senior gameplay engineer triaging a bug that automated playtesting found in Market Brawl, a Three.js + Rapier 3D fighting game. " +
  "You get the invariant that fired, a 10 Hz timeline re-simulated from the exact seed, and the relevant source with line numbers. " +
  "Find the root cause in the code and propose the smallest patch that removes it without changing game balance. Answer with ONE fenced json block and nothing else. " +
  "The json MUST have exactly these keys, and patches MUST be find/replace objects (not a diff, not prose):\n" + SCHEMA_EXAMPLE;

/** Throws a message meant to be fed back to the model. */
export function validatePatches(raw: unknown, root = "game/src"): Patch[] {
  if (!Array.isArray(raw) || raw.length > 3) throw new Error("patches must be an array of at most 3 patches");
  return raw.map((p: unknown, i: number) => {
    const x = p as Record<string, unknown>;
    if (typeof x?.file !== "string" || !/^[\w.-]+\.js$/.test(x.file) || !existsSync(`${root}/${x.file}`)) throw new Error(`patch ${i}: file must be one of the source files shown`);
    if (typeof x.find !== "string" || !x.find.trim() || typeof x.replace !== "string") throw new Error(`patch ${i}: find and replace must be strings`);
    if (/^\s*\d+\|/m.test(x.find)) throw new Error(`patch ${i}: find still contains "NNN| " line-number prefixes; copy the code without them`);
    const n = readFileSync(`${root}/${x.file}`, "utf8").split(x.find).length - 1;
    if (n !== 1) throw new Error(`patch ${i}: find text occurs ${n} times in ${x.file}; it must match exactly once (copy it exactly, including spacing)`);
    return { file: x.file, find: x.find, replace: x.replace };
  });
}

/** Ultra reads the evidence + source and proposes a root cause and a minimal patch; code checks the patch applies. */
export async function triageBug(bug: BugCluster, root = "game/src", history = ""): Promise<Triage> {
  const rep = bug.representative;
  const user = `Bug signature: ${bug.signature}\nSeen in ${bug.count} recorded rounds, e.g. ${bug.rounds.slice(0, 4).map((r) => `${r.p} round ${r.round} seed ${r.seed}`).join("; ")}.\n` +
    `Invariant definitions: ${INVARIANTS}\n\nEvidence timeline (re-simulated from ${rep.p} round ${rep.round} seed ${rep.seed}; "keys" is the player's current intent):\n${bug.timeline.join("\n")}\n\n` +
    `Source:\n${sourceBundle(root)}\n\n` +
    `Return: {"title": "short bug title", "isRealBug": true|false (false if the invariant fired on legitimate gameplay), "severity": "high"|"med"|"low", ` +
    `"rootCause": "2-4 sentences citing file:line", "playerImpact": "one sentence: what a player sees", ` +
    `"patches": [{"file": "ground.js", "find": "exact text copied from the source above WITHOUT the 'NNN| ' line prefixes, unique in that file, at most 6 lines", "replace": "replacement text"}], ` +
    `"confidence": 0.0-1.0}. Use [] for patches when isRealBug is false. At most 3 patches.` +
    (history ? `\n\nEarlier attempts, each verified by applying the patch and replaying the exact seeds (find a DIFFERENT root cause):\n${history}` : "");
  let feedback = "", lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await chat({ model: ULTRA, system: SYSTEM, user: user + feedback, maxTokens: 6000, thinking: false, temperature: 0.1 });
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
        `Each patch is {"file","find","replace"} where find is a short exact excerpt of the source (no line-number prefixes, no diff markers) that appears once in that file. Example:\n${SCHEMA_EXAMPLE}`;
    }
  }
  throw new Error(`triage answer failed validation 3 times; last: ${lastError}`);
}
