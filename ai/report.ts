import { ARCHETYPES, type Claim, type Finding, type Findings, type Persona, type RunLine, type SessionEnd } from "../lib/types";
import { buildCorpus } from "./corpus";
import { chat, extractJson, ULTRA } from "./models";
import { verifyFindings } from "./verify";

const SYSTEM = `You are the lead playtest analyst for an indie fighting game. You receive the complete play logs of a crowd of SYNTHETIC players (policy-driven bots with personas, not humans).
Find the 4-8 most important, decision-relevant findings for the developer: where players struggle, quit, get bored, which strategy breaks the game (exploit), balance problems, and bugs (lines marked "!" are engine invariant violations).
Look across players: patterns only visible by comparing many players are the point. Prefer findings backed by many players; say so when a finding rests on few.

Rules for every finding:
- "claims": 1-4 machine-checkable numbers your narrative relies on. Each: {"metric": "winRate"|"quitRate"|"avgDuration"|"koShare"|"meanHpLoss", "scope": {"archetype"?: one of ${ARCHETYPES.join("|")}, "round"?: integer}, "value": number}.
  winRate = wins / rounds in scope. quitRate with a round = among players who played that round, fraction who quit (frustration or boredom) right after it; without a round = fraction of players in scope who quit at all. koShare = fraction of rounds in scope the player lost by KO. avgDuration = mean round length in seconds. meanHpLoss = mean of (100 - player's final hp). Fractions are 0..1. Copy numbers from the aggregates header when they exist; the code will recompute every claim and flag wrong ones.
- "seeds": 1-4 concrete rounds that show it, copied exactly from the corpus: {"p": "p0042", "round": 2, "seed": 88123, "why": "short reason"}. The seed is the number after "s" in that round's block. Never invent seeds.
- "severity": "high"|"med"|"low"; "kind": "difficulty"|"exploit"|"boredom"|"bug"|"balance"; "confidence": 0..1; "suggestion": one concrete design change.

Answer with ONE fenced json block and nothing after it:
\`\`\`json
{"summary": "2-3 sentences for the developer", "findings": [{"title": "...", "severity": "...", "kind": "...", "narrative": "2-4 sentences", "claims": [...], "seeds": [...], "suggestion": "...", "confidence": 0.7}]}
\`\`\``;

const SEVERITIES = new Set(["high", "med", "low"]);
const KINDS = new Set(["difficulty", "exploit", "boredom", "bug", "balance"]);
const METRICS = new Set(["winRate", "quitRate", "avgDuration", "koShare", "meanHpLoss"]);
const ARCH = new Set<string>(ARCHETYPES);

function parseClaim(c: unknown): Claim | null {
  if (!c || typeof c !== "object") return null;
  const { metric, scope, value } = c as Record<string, unknown>;
  if (!METRICS.has(metric as string) || typeof value !== "number" || !Number.isFinite(value)) return null;
  const s = (scope && typeof scope === "object" ? scope : {}) as Record<string, unknown>;
  if (s.archetype !== undefined && !ARCH.has(s.archetype as string)) return null;
  if (s.round !== undefined && !Number.isInteger(s.round)) return null;
  return { metric: metric as Claim["metric"], scope: { ...(s.archetype ? { archetype: s.archetype as Claim["scope"]["archetype"] } : {}), ...(s.round !== undefined ? { round: s.round as number } : {}) }, value };
}

/** Shape-checks Ultra's output. Malformed findings are dropped; malformed claims and seeds inside a finding are dropped. */
export function parseFindings(raw: unknown): { summary: string; findings: Finding[] } {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (!Array.isArray(o.findings)) throw new Error("Ultra output has no findings array");
  const findings: Finding[] = [];
  for (const f of o.findings as Record<string, unknown>[]) {
    if (!f || typeof f.title !== "string" || typeof f.narrative !== "string" || !SEVERITIES.has(f.severity as string) || !KINDS.has(f.kind as string)) continue;
    const seeds = (Array.isArray(f.seeds) ? f.seeds : [])
      .filter((s): s is Record<string, unknown> => !!s && typeof s.p === "string" && Number.isInteger(s.round) && Number.isInteger(s.seed))
      .map((s) => ({ p: s.p as string, round: s.round as number, seed: s.seed as number, why: typeof s.why === "string" ? s.why : "" }));
    findings.push({
      id: `f${findings.length + 1}`,
      title: f.title, severity: f.severity as Finding["severity"], kind: f.kind as Finding["kind"], narrative: f.narrative,
      claims: (Array.isArray(f.claims) ? f.claims : []).map(parseClaim).filter((c): c is Claim => c !== null),
      seeds,
      suggestion: typeof f.suggestion === "string" ? f.suggestion : "",
      confidence: typeof f.confidence === "number" ? Math.min(1, Math.max(0, f.confidence)) : 0.5,
    });
  }
  return { summary: typeof o.summary === "string" ? o.summary : "", findings };
}

export async function analyzeCrowd(personas: Persona[], runs: RunLine[], sessions: SessionEnd[], opts: { maxCorpusTokens?: number } = {}): Promise<Findings> {
  if (!runs.length) throw new Error("analyzeCrowd: no rounds to analyze");
  const corpus = buildCorpus(personas, runs, sessions, { maxTokens: opts.maxCorpusTokens });
  console.error(`[report] corpus ~${corpus.tokenEstimate} tokens (estimate), ${runs.length} rounds, ${personas.length} personas`);
  // Thinking off: with thinking on Ultra writes its reasoning into content and can run out of budget before the JSON.
  const r = await chat({ model: ULTRA, system: SYSTEM, user: corpus.text, maxTokens: 12000, temperature: 0.2, thinking: false, retries: 6 });
  console.error(`[report] Ultra: ${r.tokensIn} in, ${r.tokensOut} out, ${(r.ms / 1000).toFixed(1)} s, finish ${r.finishReason}`);
  let raw: unknown;
  try {
    raw = extractJson(r.content);
  } catch (err) {
    throw new Error(`Ultra output is not JSON (finish_reason ${r.finishReason}, ${r.tokensOut} tokens out): ${(err as Error).message}`);
  }
  const parsed = parseFindings(raw);
  const v = verifyFindings(parsed.findings, personas, runs, sessions);
  const notes = [`Verification: ${v.failedClaims} of ${parsed.findings.reduce((s, f) => s + f.claims.length, 0)} claims did not match the recomputed value`];
  if (v.repairedSeeds) notes.push(`${v.repairedSeeds} cited seeds were mistyped and corrected from their (player, round)`);
  if (v.droppedSeeds) notes.push(`${v.droppedSeeds} cited seeds did not exist in the runs and were removed`);
  console.error(`[report] ${notes.join("; ")}`);
  return { summary: `${parsed.summary} (${notes.join("; ")}.)`, findings: v.findings, model: ULTRA, tokensIn: r.tokensIn, tokensOut: r.tokensOut, corpusTokens: corpus.tokenEstimate };
}
