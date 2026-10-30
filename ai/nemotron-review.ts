import { readFileSync } from "node:fs";
import { chat, extractJson, SUPER, ULTRA, type ChatOpts, type ChatResult } from "./models";

// ============================================================================
// Types
// ============================================================================

export const DRIFT_VERDICTS = ["REAL_DRIFT", "DOC_VAGUE", "NOT_DRIFT"] as const;
export type DriftVerdict = (typeof DRIFT_VERDICTS)[number];

export interface DriftClaim {
  docClaim: string;
  docFile: string;
  codeSymbol: string;
  codeFile: string;
  codeLine: number;
  whatCodeDoes: string;
  severity: string;
  codeLineText?: string;
}

export interface DriftExcerpt {
  claimIndex: number;
  docFile: string;
  docClaim: string;
  docExcerpt: string;
  codeFile: string;
  codeSymbol: string;
  codeLine: number;
  codeExcerpt: string;
  whatCodeDoes: string;
  severity: string;
}

export interface NemotronDriftVerdict {
  claimIndex: number;
  verdict: DriftVerdict | string;
  reason: string;
  supported?: boolean;
  geminiVerdict?: string;
  agreesWithGemini?: boolean;
  error?: string;
}

export interface GeminiJudgeVerdict {
  verdict: string;
  reason: string;
}

export interface GeminiJudgeData {
  judge?: string;
  note?: string;
  verdicts: Record<string, GeminiJudgeVerdict>;
}

export interface DriftJudgeResult {
  placeholder: boolean;
  source: "model" | "injected";
  model: string;
  generatedAt: string;
  verdicts: NemotronDriftVerdict[];
  agreement: {
    same: number;
    different: number;
    byClaim: Record<string, { nemotron: string; gemini: string; agree: boolean }>;
    cohensKappa: number;
  };
  unsupportedCount: number;
  rejections?: { index: number; reason: string }[];
}

export interface TutorAid {
  title: string;
  playerFacingText: string;
  rationale: string;
  archetype: string;
  tuningOverrides: Record<string, number>;
}

export interface GameControlFacts {
  keyboardHints: string;
  keyboardGuide: string[];
  allowedKeys: Set<string>;
  controlNumbers: number[];
}

export interface ComputedAidFacts {
  aidIndex: number;
  title: string;
  archetype: string;
  overrideKeys: string[];
  overrides: Record<string, number>;
  facts: Record<string, number>;
  allowedNumbers: number[];
}

export interface CodeCheckResult {
  valid: boolean;
  reasons: string[];
}

export interface AidFixItem {
  aidIndex: number;
  title: string;
  originalText: string;
  computedFacts: ComputedAidFacts;
  rewrite: string;
  codeCheck: CodeCheckResult;
  reviewerVerdict: { verdict: "ACCEPT" | "REJECT"; reason: string };
  retries: number;
  initialRewrite?: string;
  initialCodeCheck?: CodeCheckResult;
  initialReviewerVerdict?: { verdict: "ACCEPT" | "REJECT"; reason: string };
}

export interface AidFixResult {
  placeholder: boolean;
  source: "model" | "injected";
  modelSuper: string;
  modelUltra: string;
  generatedAt: string;
  aids: AidFixItem[];
  rejections: {
    codeRejections: number;
    reviewerRejections: number;
    totalRetries: number;
  };
}

export interface FakeAidAnswers {
  rewrites?: { aidIndex: number; rewrite: string }[];
  reviews?: { aidIndex: number; verdict: "ACCEPT" | "REJECT"; reason: string }[];
  retryRewrites?: { aidIndex: number; rewrite: string }[];
  retryReviews?: { aidIndex: number; verdict: "ACCEPT" | "REJECT"; reason: string }[];
}

// ============================================================================
// Cohen's Kappa
// ============================================================================

/**
 * Computes Cohen's kappa for two raters classifying N items.
 * kappa = (Po - Pe) / (1 - Pe)
 */
export function cohensKappa(rater1: string[], rater2: string[], categories?: string[]): number {
  if (rater1.length !== rater2.length) {
    throw new Error(`Rater arrays must have equal length: ${rater1.length} vs ${rater2.length}`);
  }
  const n = rater1.length;
  if (n === 0) return 1.0;

  const cats = categories && categories.length > 0
    ? Array.from(new Set(categories))
    : Array.from(new Set([...rater1, ...rater2]));

  // Observed agreement
  let matches = 0;
  for (let i = 0; i < n; i++) {
    if (rater1[i] === rater2[i]) matches++;
  }
  const po = matches / n;

  // Expected agreement by chance
  let pe = 0;
  for (const c of cats) {
    const p1 = rater1.filter((v) => v === c).length / n;
    const p2 = rater2.filter((v) => v === c).length / n;
    pe += p1 * p2;
  }

  if (Math.abs(1 - pe) < 1e-12) {
    return Math.abs(1 - po) < 1e-12 ? 1.0 : 0.0;
  }

  return (po - pe) / (1 - pe);
}

// ============================================================================
// MODE drift-judge: Excerpts, Prompt, Validation, Runner
// ============================================================================

function splitLines(text: string): string[] {
  if (!text) return [];
  const res = text.split(/\r?\n/);
  if (res.at(-1) === "") res.pop();
  return res;
}

export function extractExcerpts(
  claims: DriftClaim[],
  readDoc: (file: string) => string,
  readCode: (file: string) => string
): DriftExcerpt[] {
  return claims.map((c, i) => {
    const claimIndex = i + 1;
    // Extract code excerpt: +-12 lines around c.codeLine
    const codeText = readCode(c.codeFile);
    const codeLines = splitLines(codeText);
    const codeTarget = Math.min(Math.max(0, c.codeLine - 1), Math.max(0, codeLines.length - 1));
    const codeStart = Math.max(0, codeTarget - 12);
    const codeEnd = Math.min(codeLines.length - 1, codeTarget + 12);
    const codeExcerpt = codeLines
      .slice(codeStart, codeEnd + 1)
      .map((line, idx) => `${codeStart + idx + 1}: ${line}`)
      .join("\n");

    // Extract doc excerpt: find line of c.docClaim, then +-12 lines
    const docText = readDoc(c.docFile);
    const docLines = splitLines(docText);
    let docTarget = docLines.findIndex((line) => line.includes(c.docClaim));
    if (docTarget < 0) {
      // If docClaim is multiline or spans, locate substring
      const charIdx = docText.indexOf(c.docClaim);
      if (charIdx >= 0) {
        docTarget = splitLines(docText.slice(0, charIdx)).length - 1;
      } else {
        docTarget = 0;
      }
    }
    const docStart = Math.max(0, docTarget - 12);
    const docEnd = Math.min(docLines.length - 1, docTarget + 12);
    const docExcerpt = docLines
      .slice(docStart, docEnd + 1)
      .map((line, idx) => `${docStart + idx + 1}: ${line}`)
      .join("\n");

    return {
      claimIndex,
      docFile: c.docFile,
      docClaim: c.docClaim,
      docExcerpt,
      codeFile: c.codeFile,
      codeSymbol: c.codeSymbol,
      codeLine: c.codeLine,
      codeExcerpt,
      whatCodeDoes: c.whatCodeDoes,
      severity: c.severity,
    };
  });
}

/**
 * Checks whether a reason contains a substring that really occurs in the cited code or doc excerpt.
 */
export function isReasonSupported(reason: string, codeExcerpt: string, docExcerpt: string): boolean {
  if (!reason || typeof reason !== "string") return false;

  // 1. Check explicit quotes in backticks, double quotes, single quotes, or curly quotes
  const quoteMatches = [
    ...reason.matchAll(/`([^`]{2,})`/g),
    ...reason.matchAll(/"([^"]{2,})"/g),
    ...reason.matchAll(/'([^']{2,})'/g),
    ...reason.matchAll(/[“"]([^”"]{2,})[”"]/g),
  ].map((m) => m[1].trim());

  for (const q of quoteMatches) {
    if (q.length >= 2) {
      if (codeExcerpt.includes(q) || docExcerpt.includes(q)) return true;
      // Also try normalizing spaces
      const qNorm = q.replace(/\s+/g, "");
      if (codeExcerpt.replace(/\s+/g, "").includes(qNorm) || docExcerpt.replace(/\s+/g, "").includes(qNorm)) {
        return true;
      }
    }
  }

  // 2. Check if any line or substantial statement (>= 8 chars) from codeExcerpt or docExcerpt appears in reason
  const checkLines = (excerpt: string) => {
    const rawLines = excerpt.split("\n");
    for (const l of rawLines) {
      // Strip line number prefix e.g. "35: "
      const trimmed = l.replace(/^\s*\d+:\s*/, "").trim();
      if (trimmed.length >= 8 && reason.includes(trimmed)) return true;
    }
    return false;
  };

  if (checkLines(codeExcerpt) || checkLines(docExcerpt)) return true;

  // 3. Check for specific code patterns (e.g. identifiers or expressions like `dist>1.62`)
  const codePatterns = codeExcerpt.match(/[A-Za-z_$][\w$]*(?:\s*[><=!.]+\s*[\w$'.]+)?/g) || [];
  for (const pat of codePatterns) {
    if (pat.length >= 8 && reason.includes(pat)) return true;
  }

  return false;
}

export function buildDriftJudgePrompt(excerpts: DriftExcerpt[]): {
  system: string;
  user: string;
  characters: number;
  estimatedTokens: number;
} {
  const system = `You are an expert game engine code auditor and design judge.
You will evaluate claims of architectural or behavioral drift between game design documents and game source code.
For each claim, decide on one of three verdicts:
- REAL_DRIFT: The source code directly contradicts an explicit specification or contract in the design document.
- DOC_VAGUE: The document is high-level, informal, or ambiguous, and the implementation is a reasonable interpretation or natural elaboration rather than a bug or contradiction.
- NOT_DRIFT: There is no contradiction. The claim misinterprets the code, misreads the document, or conflates separate systems (e.g., rival CPU logic vs player input handling).

CRITICAL REQUIREMENT:
For each claim, provide a one-sentence reason that quotes a code line from the code excerpt (in backticks or quotes).
Return ONLY a valid JSON object of the form:
{
  "verdicts": [
    {
      "claimIndex": 1,
      "verdict": "REAL_DRIFT",
      "reason": "The code at game/src/ai.js:35 advances at \`dist>1.62\` which contradicts the specified distance bands."
    }
  ]
}
Exactly 8 verdicts must be returned (claimIndex 1 through 8). Do not output markdown text outside the JSON block.`;

  const user = excerpts
    .map(
      (e) => `=== CLAIM ${e.claimIndex} ===
Document: ${e.docFile}
Cited Doc Claim: "${e.docClaim}"
Doc Excerpt (+-12 lines):
${e.docExcerpt}

Code File: ${e.codeFile} (Line ${e.codeLine}, Symbol: ${e.codeSymbol})
What Code Does: ${e.whatCodeDoes}
Code Excerpt (+-12 lines):
${e.codeExcerpt}
`
    )
    .join("\n\n");

  const fullText = system + "\n\n" + user;
  return {
    system,
    user,
    characters: fullText.length,
    estimatedTokens: Math.ceil(fullText.length / 4),
  };
}

export function validateDriftVerdicts(
  rawVerdicts: unknown,
  excerpts: DriftExcerpt[],
  geminiJudge: GeminiJudgeData
): DriftJudgeResult {
  let list: any[];
  if (Array.isArray(rawVerdicts)) {
    list = rawVerdicts;
  } else if (rawVerdicts && typeof rawVerdicts === "object") {
    const obj = rawVerdicts as Record<string, unknown>;
    if (Array.isArray(obj.verdicts)) {
      list = obj.verdicts;
    } else {
      // Keyed by string index "1".."8"
      list = Object.entries(obj)
        .filter(([k]) => /^\d+$/.test(k))
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([k, v]) => ({ claimIndex: Number(k), ...(v as object) }));
    }
  } else {
    throw new Error("Invalid drift verdicts format: expected array or object");
  }

  if (list.length !== 8) {
    throw new Error(`Expected exactly 8 verdicts, received ${list.length}`);
  }

  const verdicts: NemotronDriftVerdict[] = [];
  const rejections: { index: number; reason: string }[] = [];
  let unsupportedCount = 0;

  const nemoVerdictsForKappa: string[] = [];
  const geminiVerdictsForKappa: string[] = [];

  const agreementByClaim: Record<string, { nemotron: string; gemini: string; agree: boolean }> = {};
  let sameCount = 0;
  let diffCount = 0;

  for (let i = 0; i < 8; i++) {
    const item = list[i] ?? {};
    const claimIndex = i + 1;
    const excerpt = excerpts[i];
    const rawVerdict = String(item.verdict ?? "").trim().toUpperCase();
    const reason = String(item.reason ?? "").trim();

    const isEnumValid = (DRIFT_VERDICTS as readonly string[]).includes(rawVerdict);
    let error: string | undefined;
    if (!isEnumValid) {
      error = `Invalid verdict enum: "${item.verdict}". Must be REAL_DRIFT, DOC_VAGUE, or NOT_DRIFT.`;
      rejections.push({ index: claimIndex, reason: error });
    }

    const supported = isReasonSupported(reason, excerpt.codeExcerpt, excerpt.docExcerpt);
    if (!supported) {
      unsupportedCount++;
    }

    const geminiEntry = geminiJudge.verdicts[String(claimIndex)];
    const geminiVerdict = geminiEntry?.verdict ?? "UNKNOWN";
    const agrees = isEnumValid && rawVerdict === geminiVerdict;

    if (agrees) {
      sameCount++;
    } else {
      diffCount++;
    }

    agreementByClaim[String(claimIndex)] = {
      nemotron: isEnumValid ? rawVerdict : "INVALID",
      gemini: geminiVerdict,
      agree: agrees,
    };

    nemoVerdictsForKappa.push(isEnumValid ? rawVerdict : "INVALID");
    geminiVerdictsForKappa.push(geminiVerdict);

    verdicts.push({
      claimIndex,
      verdict: isEnumValid ? (rawVerdict as DriftVerdict) : item.verdict,
      reason,
      supported,
      geminiVerdict,
      agreesWithGemini: agrees,
      ...(error ? { error } : {}),
    });
  }

  const kappa = cohensKappa(nemoVerdictsForKappa, geminiVerdictsForKappa, [...DRIFT_VERDICTS]);

  return {
    placeholder: false,
    source: "model",
    model: ULTRA,
    generatedAt: new Date().toISOString(),
    verdicts,
    agreement: {
      same: sameCount,
      different: diffCount,
      byClaim: agreementByClaim,
      cohensKappa: Math.round(kappa * 10000) / 10000,
    },
    unsupportedCount,
    ...(rejections.length > 0 ? { rejections } : {}),
  };
}

export async function runDriftJudge(
  claims: DriftClaim[],
  geminiJudge: GeminiJudgeData,
  readDoc: (file: string) => string,
  readCode: (file: string) => string,
  modelChat: typeof chat = chat
): Promise<DriftJudgeResult> {
  const excerpts = extractExcerpts(claims, readDoc, readCode);
  const prompt = buildDriftJudgePrompt(excerpts);

  // Exactly ONE Ultra call, thinking off, 10 min timeout, retries=0
  const response = await modelChat({
    model: ULTRA,
    system: prompt.system,
    user: prompt.user,
    maxTokens: 4000,
    temperature: 0.2,
    thinking: false,
    retries: 0,
    timeoutMs: 10 * 60_000,
  });

  const parsed = extractJson(response.content);
  return validateDriftVerdicts(parsed, excerpts, geminiJudge);
}

// ============================================================================
// MODE aid-fix: Control Facts, Computed Facts, Rewrite Checks, Runner
// ============================================================================

export function extractGameControlFacts(indexHtml: string): GameControlFacts {
  // Extract keyboard hints
  const hintsMatch = /<div class="control-hints keyboard-hints">([\s\S]*?)<\/div>/i.exec(indexHtml);
  const keyboardHints = hintsMatch ? hintsMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";

  // Extract keyboard guide lines
  const guideMatch = /<div class="controls-grid keyboard-guide">([\s\S]*?)<\/div>/i.exec(indexHtml);
  const guideHtml = guideMatch ? guideMatch[1] : "";
  const keyboardGuide = [...guideHtml.matchAll(/<span>([\s\S]*?)<\/span>/gi)].map((m) =>
    m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  );

  // Extract all <kbd> text inside keyboard hints and guide
  const kbdMatches = [...(guideHtml + (hintsMatch ? hintsMatch[1] : "")).matchAll(/<kbd>([^<]+)<\/kbd>/gi)].map((m) =>
    m[1].trim()
  );

  // Allowed keys: all standard keyboard keys from game controls
  const allowedKeys = new Set<string>([
    ...kbdMatches,
    "A", "D", "E", "F", "G", "H", "J", "K", "L", "Q", "R", "S", "V", "W", "ESC", "ENTER",
  ]);

  // Numbers present in control text
  const controlText = keyboardHints + "\n" + keyboardGuide.join("\n") + "\n" + indexHtml;
  const numMatches = [...controlText.matchAll(/\b\d+(?:\.\d+)?\b/g)].map((m) => Number(m[0]));
  const controlNumbers = Array.from(new Set([1, 2, 3, 4, 99, 0.45, 0.40, 0.12, 1.6, 1.25, 0.8, 2.4, ...numMatches])).filter(
    (n) => Number.isFinite(n)
  );

  return {
    keyboardHints,
    keyboardGuide,
    allowedKeys,
    controlNumbers,
  };
}

export function computeAidFacts(
  aid: TutorAid,
  aidIndex: number,
  controlFacts: GameControlFacts
): ComputedAidFacts {
  const overrides = aid.tuningOverrides || {};
  const overrideKeys = Object.keys(overrides);
  const facts: Record<string, number> = {};
  const allowedNumbers = [...controlFacts.controlNumbers];

  for (const [key, value] of Object.entries(overrides)) {
    facts[key] = value;
    allowedNumbers.push(value);

    // Percentages only make sense for multipliers (a startup time of 0.05 s is not "5%")
    if (key.includes("Multiplier")) {
      const pct = Math.round(value * 100 * 1000) / 1000;
      const compPct = Math.round((1 - value) * 100 * 1000) / 1000;
      const compVal = Math.round((1 - value) * 1000) / 1000;

      facts[`${key}.percentage`] = pct;
      facts[`${key}.damageTakenPct`] = pct;
      facts[`${key}.damageReductionPct`] = compPct;
      facts[`${key}.complementPct`] = compPct;

      allowedNumbers.push(pct);
      allowedNumbers.push(compPct);
      allowedNumbers.push(compVal);
    }
  }

  return {
    aidIndex,
    title: aid.title,
    archetype: aid.archetype,
    overrideKeys,
    overrides,
    facts,
    allowedNumbers: Array.from(new Set(allowedNumbers)),
  };
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

export function checkAidRewrite(
  rewrite: string,
  facts: ComputedAidFacts,
  controlFacts: GameControlFacts
): CodeCheckResult {
  const reasons: string[] = [];

  if (!rewrite || typeof rewrite !== "string" || !rewrite.trim()) {
    return { valid: false, reasons: ["Rewrite text is empty"] };
  }

  // 1. Check numbers and percentages
  // Extract percentages e.g. 85%, 80%
  const pctMatches = [...rewrite.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => Number(m[1]));
  // Extract standalone numbers e.g. 4, 15, 0.15
  const numMatches = [...rewrite.matchAll(/\b\d+(?:\.\d+)?\b/g)].map((m) => Number(m[0]));
  // Extract number words e.g. "four times"
  const wordMatches = [...rewrite.matchAll(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/gi)].map(
    (m) => NUMBER_WORDS[m[1].toLowerCase()]
  );

  const foundNumbers = [...pctMatches, ...numMatches, ...wordMatches];

  for (const n of foundNumbers) {
    const matchesAny = facts.allowedNumbers.some((allowed) => Math.abs(allowed - n) < 1e-4);
    if (!matchesAny) {
      reasons.push(
        `Number mismatch: number/percentage ${n} is not consistent with computed facts (${JSON.stringify(
          facts.facts
        )}) or game controls`
      );
    }
  }

  // 2. Check key names mentioned in text
  // Reject invented control keys (e.g. X, Z, Shift, Ctrl, Alt, Space, Tab)
  const forbiddenControlWords = [
    "Shift", "Ctrl", "Control", "Alt", "Space", "Tab", "Backspace", "Delete",
  ];
  for (const word of forbiddenControlWords) {
    const reg = new RegExp(`\\b${word}\\b`, "i");
    if (reg.test(rewrite)) {
      reasons.push(`Unknown key mentioned: ${word} is not a valid control`);
    }
  }

  // Detect standalone single uppercase letters that may be keys
  const singleLetters = [...rewrite.matchAll(/\b([A-Z])\b/g)].map((m) => m[1]);
  for (const letter of singleLetters) {
    if (letter === "I") continue; // Pronoun 'I'
    if (!controlFacts.allowedKeys.has(letter)) {
      reasons.push(`Unknown key mentioned: "${letter}" does not exist in game controls`);
    }
  }

  // Detect explicit "key <X>" or "button <X>" or "press <X>"
  const actionKeys = [...rewrite.matchAll(/\b(?:press|tap|hold|hit|key|button)\s+([A-Za-z0-9+/_]+)/gi)].map(
    (m) => m[1]
  );
  for (const k of actionKeys) {
    const normalized = k.replace(/[,.;:]$/, "");
    if (/^[A-Za-z]$/.test(normalized)) {
      const up = normalized.toUpperCase();
      if (!controlFacts.allowedKeys.has(up)) {
        reasons.push(`Unknown key mentioned: "${normalized}" is not a valid control`);
      }
    }
  }

  return {
    valid: reasons.length === 0,
    reasons,
  };
}

export function buildAidFixPrompt(
  aid: TutorAid,
  facts: ComputedAidFacts,
  controlFacts: GameControlFacts,
  previousObjection?: string
): { system: string; user: string } {
  const system = `You are a precision technical copywriter for a fighting game.
Your task is to rewrite the player-facing text for a tutorial aid so that:
1. Every percentage and number mentioned is 100% consistent with the computed facts for the tuning overrides.
2. Every key name and control mentioned exists in the game's official controls (e.g., J for punch, K for kick, A/D for move/guard, Q/V for sidestep, L for parry, F for clinch/mount). Do NOT invent keys (such as X, Z, Shift, Space).
3. The sentence is clear, punchy, and helpful to the player.

Return ONLY a JSON object:
{
  "rewrite": "Rewritten player-facing sentence."
}`;

  let user = `Title: ${aid.title}
Archetype: ${aid.archetype}
Original Player-Facing Text: "${aid.playerFacingText}"
Rationale: ${aid.rationale}

Tuning Overrides:
${JSON.stringify(aid.tuningOverrides, null, 2)}

Computed Facts:
${JSON.stringify(facts.facts, null, 2)}

Official Game Control Hints:
${controlFacts.keyboardHints}
${controlFacts.keyboardGuide.slice(0, 8).join("\n")}`;

  if (previousObjection) {
    user += `\n\nPREVIOUS ATTEMPT OBJECTION (FIX THIS):
${previousObjection}
Please correct the text to satisfy all code checks and reviewer constraints.`;
  }

  return { system, user };
}

export function buildAidReviewPrompt(
  items: { aid: TutorAid; facts: ComputedAidFacts; rewrite: string }[],
  controlFacts: GameControlFacts
): { system: string; user: string } {
  const system = `You are a senior reviewer inspecting proposed rewrites for fighting game tutorial aids.
Review each proposed rewrite against the original text, tuning overrides, computed facts, and official controls.
Verify:
1. Accuracy: Does the text state correct facts matching the overrides?
2. Controls: Does it only use official game controls (${Array.from(controlFacts.allowedKeys).join(", ")}) without inventing keys?
3. Numbers: Is there any number or percentage mismatch?

For each aid, return an ACCEPT or REJECT verdict with a concise reason.
Return ONLY valid JSON:
{
  "reviews": [
    {
      "aidIndex": 0,
      "verdict": "ACCEPT",
      "reason": "Accurate, uses official controls and correct numbers."
    }
  ]
}`;

  const user = items
    .map(
      (item) => `=== AID ${item.facts.aidIndex}: ${item.aid.title} ===
Original Text: "${item.aid.playerFacingText}"
Proposed Rewrite: "${item.rewrite}"
Tuning Overrides: ${JSON.stringify(item.aid.tuningOverrides)}
Computed Facts: ${JSON.stringify(item.facts.facts)}`
    )
    .join("\n\n");

  return { system, user };
}

export async function runAidFix(
  aids: TutorAid[],
  indexHtml: string,
  modelChat: typeof chat = chat,
  fakeAnswers?: FakeAidAnswers
): Promise<AidFixResult> {
  const controlFacts = extractGameControlFacts(indexHtml);
  const computedFactsList = aids.map((aid, idx) => computeAidFacts(aid, idx, controlFacts));

  let codeRejectionsCount = 0;
  let reviewerRejectionsCount = 0;
  let totalRetriesCount = 0;

  // Round 1: Propose rewrites with Super (or fake answers)
  const initialItems: {
    aid: TutorAid;
    facts: ComputedAidFacts;
    rewrite: string;
    codeCheck: CodeCheckResult;
  }[] = [];

  for (let i = 0; i < aids.length; i++) {
    const aid = aids[i];
    const facts = computedFactsList[i];
    let rewrite = "";

    if (fakeAnswers?.rewrites) {
      const match = fakeAnswers.rewrites.find((r) => r.aidIndex === i);
      rewrite = match ? match.rewrite : aid.playerFacingText;
    } else {
      const prompt = buildAidFixPrompt(aid, facts, controlFacts);
      const res = await modelChat({
        model: SUPER,
        system: prompt.system,
        user: prompt.user,
        maxTokens: 1000,
        temperature: 0.2,
        thinking: false,
        retries: 0,
        timeoutMs: 3 * 60_000,
      });
      const parsed = extractJson(res.content) as { rewrite?: string; playerFacingText?: string };
      rewrite = parsed.rewrite || parsed.playerFacingText || aid.playerFacingText;
    }

    const codeCheck = checkAidRewrite(rewrite, facts, controlFacts);
    if (!codeCheck.valid) {
      codeRejectionsCount++;
    }

    initialItems.push({ aid, facts, rewrite, codeCheck });
  }

  // Round 1: Review proposed rewrites with Ultra (or fake answers)
  let initialReviews: { aidIndex: number; verdict: "ACCEPT" | "REJECT"; reason: string }[] = [];
  if (fakeAnswers?.reviews) {
    initialReviews = fakeAnswers.reviews;
  } else {
    const reviewPrompt = buildAidReviewPrompt(initialItems, controlFacts);
    const reviewRes = await modelChat({
      model: ULTRA,
      system: reviewPrompt.system,
      user: reviewPrompt.user,
      maxTokens: 2000,
      temperature: 0.1,
      thinking: false,
      retries: 0,
      timeoutMs: 10 * 60_000,
    });
    const parsed = extractJson(reviewRes.content) as {
      reviews?: { aidIndex: number; verdict: "ACCEPT" | "REJECT"; reason: string }[];
    };
    initialReviews = parsed.reviews || [];
  }

  // Check if any aid needs retry (code rejected OR reviewer rejected)
  const finalItems: AidFixItem[] = [];

  for (let i = 0; i < aids.length; i++) {
    const { aid, facts, rewrite: firstRewrite, codeCheck: firstCodeCheck } = initialItems[i];
    const firstReview =
      initialReviews.find((r) => r.aidIndex === i) || {
        verdict: firstCodeCheck.valid ? ("ACCEPT" as const) : ("REJECT" as const),
        reason: firstCodeCheck.valid ? "Accepted" : firstCodeCheck.reasons.join("; "),
      };

    if (firstReview.verdict === "REJECT") {
      reviewerRejectionsCount++;
    }

    const needsRetry = !firstCodeCheck.valid || firstReview.verdict === "REJECT";

    if (needsRetry) {
      totalRetriesCount++;
      const objection = !firstCodeCheck.valid
        ? firstCodeCheck.reasons.join("; ")
        : firstReview.reason;

      // Exactly ONE retry
      let retriedRewrite = "";
      if (fakeAnswers?.retryRewrites) {
        const match = fakeAnswers.retryRewrites.find((r) => r.aidIndex === i);
        retriedRewrite = match ? match.rewrite : firstRewrite;
      } else {
        const retryPrompt = buildAidFixPrompt(aid, facts, controlFacts, objection);
        const retryRes = await modelChat({
          model: SUPER,
          system: retryPrompt.system,
          user: retryPrompt.user,
          maxTokens: 1000,
          temperature: 0.2,
          thinking: false,
          retries: 0,
          timeoutMs: 3 * 60_000,
        });
        const parsed = extractJson(retryRes.content) as { rewrite?: string; playerFacingText?: string };
        retriedRewrite = parsed.rewrite || parsed.playerFacingText || firstRewrite;
      }

      const secondCodeCheck = checkAidRewrite(retriedRewrite, facts, controlFacts);

      // Review second rewrite
      let secondReview: { verdict: "ACCEPT" | "REJECT"; reason: string };
      if (fakeAnswers?.retryReviews) {
        const match = fakeAnswers.retryReviews.find((r) => r.aidIndex === i);
        secondReview = match ? { verdict: match.verdict, reason: match.reason } : { verdict: secondCodeCheck.valid ? "ACCEPT" : "REJECT", reason: "Retry review" };
      } else {
        const singleReviewPrompt = buildAidReviewPrompt(
          [{ aid, facts, rewrite: retriedRewrite }],
          controlFacts
        );
        const reviewRes = await modelChat({
          model: ULTRA,
          system: singleReviewPrompt.system,
          user: singleReviewPrompt.user,
          maxTokens: 1000,
          temperature: 0.1,
          thinking: false,
          retries: 0,
          timeoutMs: 5 * 60_000,
        });
        const parsed = extractJson(reviewRes.content) as {
          reviews?: { aidIndex: number; verdict: "ACCEPT" | "REJECT"; reason: string }[];
        };
        secondReview = parsed.reviews?.[0] || {
          verdict: secondCodeCheck.valid ? "ACCEPT" : "REJECT",
          reason: secondCodeCheck.valid ? "Accepted retry" : secondCodeCheck.reasons.join("; "),
        };
      }

      finalItems.push({
        aidIndex: i,
        title: aid.title,
        originalText: aid.playerFacingText,
        computedFacts: facts,
        rewrite: retriedRewrite,
        codeCheck: secondCodeCheck,
        reviewerVerdict: secondReview,
        retries: 1,
        initialRewrite: firstRewrite,
        initialCodeCheck: firstCodeCheck,
        initialReviewerVerdict: firstReview,
      });
    } else {
      finalItems.push({
        aidIndex: i,
        title: aid.title,
        originalText: aid.playerFacingText,
        computedFacts: facts,
        rewrite: firstRewrite,
        codeCheck: firstCodeCheck,
        reviewerVerdict: firstReview,
        retries: 0,
      });
    }
  }

  return {
    placeholder: false,
    source: fakeAnswers ? "injected" : "model",
    modelSuper: SUPER,
    modelUltra: ULTRA,
    generatedAt: new Date().toISOString(),
    aids: finalItems,
    rejections: {
      codeRejections: codeRejectionsCount,
      reviewerRejections: reviewerRejectionsCount,
      totalRetries: totalRetriesCount,
    },
  };
}
