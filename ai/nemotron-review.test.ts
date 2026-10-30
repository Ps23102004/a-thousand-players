import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  cohensKappa,
  extractExcerpts,
  isReasonSupported,
  validateDriftVerdicts,
  buildDriftJudgePrompt,
  runDriftJudge,
  extractGameControlFacts,
  computeAidFacts,
  checkAidRewrite,
  buildAidFixPrompt,
  buildAidReviewPrompt,
  runAidFix,
  type DriftExcerpt,
  type TutorAid,
} from "./nemotron-review";
import { ULTRA, SUPER } from "./models";

// ---------------- Cohen's Kappa Unit Tests ----------------

test("cohensKappa: matches textbook hard-coded 2-category example", () => {
  // 10 items rated by Rater 1 and Rater 2:
  // R1: 4 A, 6 B
  // R2: 4 A, 6 B
  // Agreements: 8 out of 10.
  // po = 8/10 = 0.8
  // pe = (0.4 * 0.4) + (0.6 * 0.6) = 0.16 + 0.36 = 0.52
  // kappa = (0.8 - 0.52) / (1 - 0.52) = 0.28 / 0.48 = 7/12 = 0.5833333333333334
  const r1 = ["A", "A", "A", "A", "B", "B", "B", "B", "B", "B"];
  const r2 = ["A", "A", "A", "B", "A", "B", "B", "B", "B", "B"];
  const k = cohensKappa(r1, r2, ["A", "B"]);
  assert.ok(Math.abs(k - 7 / 12) < 1e-6, `Expected ~0.5833, got ${k}`);
});

test("cohensKappa: perfect agreement returns 1.0", () => {
  const r1 = ["REAL_DRIFT", "REAL_DRIFT", "NOT_DRIFT", "DOC_VAGUE"];
  const r2 = ["REAL_DRIFT", "REAL_DRIFT", "NOT_DRIFT", "DOC_VAGUE"];
  assert.equal(cohensKappa(r1, r2), 1.0);
});

test("cohensKappa: complete disagreement returns <= 0", () => {
  const r1 = ["REAL_DRIFT", "REAL_DRIFT", "REAL_DRIFT", "REAL_DRIFT"];
  const r2 = ["NOT_DRIFT", "NOT_DRIFT", "NOT_DRIFT", "NOT_DRIFT"];
  const k = cohensKappa(r1, r2, ["REAL_DRIFT", "DOC_VAGUE", "NOT_DRIFT"]);
  assert.ok(k <= 0, `Expected <= 0, got ${k}`);
});

test("cohensKappa: 3-category calculation matches hard-coded numbers", () => {
  // 8 claims, categories REAL_DRIFT, DOC_VAGUE, NOT_DRIFT
  // Gemini: 3 REAL, 1 VAGUE, 4 NOT
  // Nemotron: 3 REAL, 0 VAGUE, 5 NOT (differ on claim 7: DOC_VAGUE vs NOT_DRIFT)
  const gemini = ["REAL_DRIFT", "REAL_DRIFT", "REAL_DRIFT", "NOT_DRIFT", "NOT_DRIFT", "NOT_DRIFT", "DOC_VAGUE", "NOT_DRIFT"];
  const nemo   = ["REAL_DRIFT", "REAL_DRIFT", "REAL_DRIFT", "NOT_DRIFT", "NOT_DRIFT", "NOT_DRIFT", "NOT_DRIFT", "NOT_DRIFT"];
  // po = 7/8 = 0.875
  // pe = (3/8)*(3/8) + (1/8)*(0/8) + (4/8)*(5/8) = 9/64 + 20/64 = 29/64 = 0.453125
  // kappa = (0.875 - 0.453125) / (1 - 0.453125) = 0.421875 / 0.546875 = 27/35 = 0.7714285714285715
  const k = cohensKappa(gemini, nemo, ["REAL_DRIFT", "DOC_VAGUE", "NOT_DRIFT"]);
  assert.ok(Math.abs(k - 27 / 35) < 1e-6, `Expected ~0.7714, got ${k}`);
});

// ---------------- Drift Judge Unit Tests ----------------

const fakeExcerpt: DriftExcerpt = {
  claimIndex: 1,
  docFile: "docs/design.md",
  docClaim: "dist: far(>2.2) | mid(1.3-2.2) | close(<1.3).",
  docExcerpt: "54: // rules\n55: // dist: far(>2.2) | mid(1.3-2.2) | close(<1.3).\n56: // actions",
  codeFile: "game/src/ai.js",
  codeSymbol: "decideRivalAction",
  codeLine: 35,
  codeExcerpt: "34:   const dist = Math.hypot(dx, dz);\n35:   if(dist>1.62) return {type:'ADVANCE'};\n36:   if(dist<=1.25 && grabReady)",
  whatCodeDoes: "The AI decision logic uses a distance threshold of 1.62 to decide between advancing and close-range combat.",
  severity: "high",
};

const fakeExcerpts: DriftExcerpt[] = Array.from({ length: 8 }, (_, i) => ({
  ...fakeExcerpt,
  claimIndex: i + 1,
}));

const fakeGeminiJudge = {
  judge: "gemini",
  verdicts: Object.fromEntries(
    Array.from({ length: 8 }, (_, i) => [
      String(i + 1),
      { verdict: i < 3 ? "REAL_DRIFT" : i === 6 ? "DOC_VAGUE" : "NOT_DRIFT", reason: "gemini reason" },
    ])
  ),
};

test("isReasonSupported: accepts quoted substrings from code or doc excerpts", () => {
  assert.ok(isReasonSupported("Code has `dist>1.62` which contradicts doc.", fakeExcerpt.codeExcerpt, fakeExcerpt.docExcerpt));
  assert.ok(isReasonSupported("The doc specifies `mid(1.3-2.2)` clearly.", fakeExcerpt.codeExcerpt, fakeExcerpt.docExcerpt));
  assert.ok(isReasonSupported("Code line: if(dist>1.62) return {type:'ADVANCE'};", fakeExcerpt.codeExcerpt, fakeExcerpt.docExcerpt));
});

test("isReasonSupported: rejects reason without any substring from excerpt (marked unsupported)", () => {
  assert.equal(isReasonSupported("This is a hallucinated claim without evidence.", fakeExcerpt.codeExcerpt, fakeExcerpt.docExcerpt), false);
  assert.equal(isReasonSupported("The implementation works as expected completely.", fakeExcerpt.codeExcerpt, fakeExcerpt.docExcerpt), false);
});

test("validateDriftVerdicts: enum rule rejects invalid verdicts", () => {
  const invalidEnumVerdicts = [
    { claimIndex: 1, verdict: "INVALID_ENUM", reason: "The code has `dist>1.62`." },
    ...Array.from({ length: 7 }, (_, i) => ({
      claimIndex: i + 2,
      verdict: "NOT_DRIFT",
      reason: "The code has `dist>1.62`.",
    })),
  ];
  const validated = validateDriftVerdicts(invalidEnumVerdicts, fakeExcerpts, fakeGeminiJudge);
  assert.equal(validated.verdicts[0].verdict, "INVALID_ENUM");
  assert.match(validated.verdicts[0].error!, /enum/i);
  assert.ok(validated.rejections && validated.rejections.length > 0);
});

test("validateDriftVerdicts: unsupported reason is marked unsupported and counted", () => {
  const verdicts = [
    { claimIndex: 1, verdict: "REAL_DRIFT", reason: "Code says `dist>1.62` which does not match." }, // supported
    { claimIndex: 2, verdict: "REAL_DRIFT", reason: "Completely unsupported statement with no quotes." }, // unsupported
    ...Array.from({ length: 6 }, (_, i) => ({
      claimIndex: i + 3,
      verdict: "NOT_DRIFT",
      reason: "Uses `dist>1.62` in decision logic.", // supported
    })),
  ];
  const validated = validateDriftVerdicts(verdicts, fakeExcerpts, fakeGeminiJudge);
  assert.equal(validated.verdicts[0].supported, true);
  assert.equal(validated.verdicts[1].supported, false);
  assert.equal(validated.unsupportedCount, 1);
});

test("validateDriftVerdicts: enforces exactly 8 verdicts", () => {
  const shortVerdicts = [
    { claimIndex: 1, verdict: "REAL_DRIFT", reason: "The code has `dist>1.62`." },
  ];
  assert.throws(() => validateDriftVerdicts(shortVerdicts, fakeExcerpts, fakeGeminiJudge), /exactly 8/i);
});

test("runDriftJudge: ONE Ultra call with thinking off, timeout, no retries", async () => {
  let callCount = 0;
  const mockChat = async (opts: any) => {
    callCount++;
    assert.equal(opts.model, ULTRA);
    assert.equal(opts.thinking, false);
    assert.equal(opts.retries, 0);
    assert.ok(opts.timeoutMs && opts.timeoutMs >= 600_000);
    return {
      content: JSON.stringify({
        verdicts: Array.from({ length: 8 }, (_, i) => ({
          claimIndex: i + 1,
          verdict: i < 3 ? "REAL_DRIFT" : i === 6 ? "DOC_VAGUE" : "NOT_DRIFT",
          reason: "Code line 35 has `dist>1.62` here.",
        })),
      }),
      reasoning: null,
      tokensIn: 500,
      tokensOut: 200,
      ms: 100,
      finishReason: "stop",
    };
  };

  const result = await runDriftJudge(
    Array.from({ length: 8 }, (_, i) => ({
      docClaim: "dist: far(>2.2) | mid(1.3-2.2) | close(<1.3).",
      docFile: "docs/design.md",
      codeSymbol: "decideRivalAction",
      codeFile: "game/src/ai.js",
      codeLine: 35,
      whatCodeDoes: "distance threshold 1.62",
      severity: "high",
    })),
    fakeGeminiJudge,
    () => fakeExcerpt.docExcerpt,
    () => fakeExcerpt.codeExcerpt,
    mockChat as any
  );

  assert.equal(callCount, 1);
  assert.equal(result.verdicts.length, 8);
  assert.equal(result.agreement.same, 8);
  assert.equal(result.agreement.cohensKappa, 1.0);
  assert.equal(result.unsupportedCount, 0);
});

// ---------------- Aid Fix Unit Tests ----------------

const fakeIndexHtml = `
<!DOCTYPE html>
<html>
<body>
<div class="control-hints keyboard-hints">
  <span><kbd>A</kbd><kbd>D</kbd> MOVE / GUARD</span>
  <span><kbd>J</kbd> ×4 PUNCH CHAIN</span>
  <span><kbd>K</kbd> ×3 KICK CHAIN <kbd>S</kbd>+<kbd>K</kbd> SWEEP</span>
  <span><kbd>L</kbd> PARRY</span>
  <span><kbd>F</kbd> CLINCH / MOUNT</span>
  <span><kbd>H</kbd> ALL CONTROLS</span>
  <span><kbd>Q</kbd><kbd>V</kbd> SIDESTEP</span>
</div>
<div class="controls-grid keyboard-guide">
  <span><kbd>A</kbd> <kbd>D</kbd> Move · hold away to guard</span>
  <span><kbd>J</kbd> Tap four times: jab → cross → hook → uppercut</span>
  <span><kbd>K</kbd> Tap three times: roundhouse → high kick → spinning back kick</span>
  <span><kbd>S</kbd> + <kbd>K</kbd> Low sweep · defeats high guard</span>
  <span><kbd>S</kbd> + <kbd>J</kbd> Body jab → body hook</span>
  <span><kbd>Q</kbd> / <kbd>V</kbd> Sidestep deeper / nearer</span>
  <span><kbd>L</kbd> Timed parry · watch their windup</span>
  <span><kbd>F</kbd> / <kbd>G</kbd> Grab a nearby rival (close range)</span>
  <span><kbd>W</kbd> Jump <kbd>S</kbd> Duck</span>
  <span><kbd>E</kbd> Pick up / throw a nearby crate</span>
  <span><kbd>R</kbd> Restart <kbd>ESC</kbd> Pause <kbd>H</kbd> Controls</span>
</div>
<p class="start-note">PRESS ENTER TO FIGHT</p>
</body>
</html>
`;

const controlFacts = extractGameControlFacts(fakeIndexHtml);

const aidGuard: TutorAid = {
  title: "Learn to Guard Effectively",
  playerFacingText: "Hold away from your rival to guard and reduce incoming damage by 80%.",
  rationale: "Guard override",
  archetype: "casual",
  tuningOverrides: { "rules.guardDamageMultiplier": 0.15 },
};

const aidCombo: TutorAid = {
  title: "Master Your First Combo",
  playerFacingText: "Tap J four times quickly: jab → cross → hook → uppercut.",
  rationale: "Combo practice",
  archetype: "casual",
  tuningOverrides: { "anim.JAB.damage": 15, "anim.JAB.hitStop": 4 },
};

test("computeAidFacts: correctly derives percentage complement and lists keys", () => {
  const facts = computeAidFacts(aidGuard, 2, controlFacts);
  assert.deepEqual(facts.overrideKeys, ["rules.guardDamageMultiplier"]);
  assert.equal(facts.facts["rules.guardDamageMultiplier.damageReductionPct"], 85);
  assert.equal(facts.facts["rules.guardDamageMultiplier.damageTakenPct"], 15);
  assert.ok(facts.allowedNumbers.includes(85));
  assert.ok(facts.allowedNumbers.includes(15));
  assert.ok(facts.allowedNumbers.includes(0.15));
});

test("checkAidRewrite: accepts correct rewrite matching computed facts and controls", () => {
  const facts = computeAidFacts(aidGuard, 2, controlFacts);
  const check = checkAidRewrite("Hold away from your rival to guard and reduce incoming damage by 85%.", facts, controlFacts);
  assert.equal(check.valid, true);
  assert.equal(check.reasons.length, 0);
});

test("checkAidRewrite: number mismatch rejects unsupported percentage/number", () => {
  const facts = computeAidFacts(aidGuard, 2, controlFacts);
  // 80% is the old buggy number; computed fact is 85%
  const check = checkAidRewrite("Hold away from your rival to guard and reduce incoming damage by 80%.", facts, controlFacts);
  assert.equal(check.valid, false);
  assert.match(check.reasons.join(" "), /number mismatch|80/i);
});

test("checkAidRewrite: unknown key rejects invented controls", () => {
  const facts = computeAidFacts(aidGuard, 2, controlFacts);
  // 'X' is not a valid keyboard key in game/index.html
  const check = checkAidRewrite("Press X to guard and reduce incoming damage by 85%.", facts, controlFacts);
  assert.equal(check.valid, false);
  assert.match(check.reasons.join(" "), /unknown key|X/i);
});

test("checkAidRewrite: unknown key rejects invented control name like Shift or Z", () => {
  const facts = computeAidFacts(aidCombo, 0, controlFacts);
  const check = checkAidRewrite("Press Shift and Z to punch 4 times.", facts, controlFacts);
  assert.equal(check.valid, false);
  assert.match(check.reasons.join(" "), /unknown key/i);
});

test("runAidFix: retry once then stop when code or reviewer rejects", async () => {
  const aids: TutorAid[] = [aidGuard]; // single aid test
  let superCalls = 0;
  let ultraCalls = 0;

  const mockChat = async (opts: any) => {
    if (opts.model === SUPER) {
      superCalls++;
      if (superCalls === 1) {
        // Propose bad rewrite with number mismatch (80% instead of 85%)
        return {
          content: JSON.stringify({ rewrite: "Hold away to guard and reduce damage by 80%." }),
          reasoning: null,
          tokensIn: 100,
          tokensOut: 20,
          ms: 50,
          finishReason: "stop",
        };
      }
      // Retry call: feed back objection and propose correct rewrite (85%)
      assert.match(opts.user, /objection|reject|80/i);
      return {
        content: JSON.stringify({ rewrite: "Hold away to guard and reduce incoming damage by 85%." }),
        reasoning: null,
        tokensIn: 120,
        tokensOut: 20,
        ms: 50,
        finishReason: "stop",
      };
    } else if (opts.model === ULTRA) {
      ultraCalls++;
      // Reviewer accepts the valid candidate
      return {
        content: JSON.stringify({
          reviews: [
            {
              aidIndex: 0,
              verdict: "ACCEPT",
              reason: "Accurate rewrite using 85% reduction and standard controls.",
            },
          ],
        }),
        reasoning: null,
        tokensIn: 200,
        tokensOut: 30,
        ms: 50,
        finishReason: "stop",
      };
    }
    throw new Error(`Unexpected model: ${opts.model}`);
  };

  const result = await runAidFix(aids, fakeIndexHtml, mockChat as any);
  assert.equal(superCalls, 2); // Initial Super + exactly 1 retry
  assert.equal(result.aids[0].retries, 1);
  assert.equal(result.aids[0].codeCheck.valid, true);
  assert.equal(result.aids[0].rewrite, "Hold away to guard and reduce incoming damage by 85%.");
  assert.equal(result.rejections.totalRetries, 1);
});

test("runAidFix: stops after one retry even if second rewrite is also rejected", async () => {
  const aids: TutorAid[] = [aidGuard];
  let superCalls = 0;

  const mockChat = async (opts: any) => {
    if (opts.model === SUPER) {
      superCalls++;
      // Always returns bad number 80%
      return {
        content: JSON.stringify({ rewrite: "Hold away to guard and reduce damage by 80%." }),
        reasoning: null,
        tokensIn: 100,
        tokensOut: 20,
        ms: 50,
        finishReason: "stop",
      };
    } else {
      return {
        content: JSON.stringify({
          reviews: [{ aidIndex: 0, verdict: "REJECT", reason: "Number 80% is wrong." }],
        }),
        reasoning: null,
        tokensIn: 100,
        tokensOut: 20,
        ms: 50,
        finishReason: "stop",
      };
    }
  };

  const result = await runAidFix(aids, fakeIndexHtml, mockChat as any);
  assert.equal(superCalls, 2); // Initial + 1 retry, then stopped!
  assert.equal(result.aids[0].retries, 1);
  assert.equal(result.aids[0].codeCheck.valid, false);
});

// ---------------- CLI Offline Tests ----------------

test("CLI drift-judge --dry-run prints estimated tokens and exits 0", () => {
  const res = spawnSync(process.execPath, ["--import", "tsx", "ai/cli/nemotron-review.ts", "drift-judge", "--dry-run"], {
    encoding: "utf8",
    timeout: 15_000,
    env: { ...process.env, NEBIUS_API_KEY: "" },
  });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /drift-judge dry-run/i);
  assert.match(res.stdout, /characters=\d+/i);
});

test("CLI aid-fix --dry-run prints computed facts and exits 0", () => {
  const res = spawnSync(process.execPath, ["--import", "tsx", "ai/cli/nemotron-review.ts", "aid-fix", "--dry-run"], {
    encoding: "utf8",
    timeout: 15_000,
    env: { ...process.env, NEBIUS_API_KEY: "" },
  });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /aid-fix dry-run/i);
  assert.match(res.stdout, /aid 0/i);
});

test("CLI drift-judge --results-from runs offline and writes drift-judge.json", () => {
  const scratch = mkdtempSync(resolve("data/test-review-"));
  const outPath = join(scratch, "drift-judge.json");
  const answerPath = join(scratch, "mock-drift.json");

  // Mock model answer
  const mockVerdicts = {
    verdicts: Array.from({ length: 8 }, (_, i) => ({
      claimIndex: i + 1,
      verdict: i < 3 ? "REAL_DRIFT" : i === 6 ? "DOC_VAGUE" : "NOT_DRIFT",
      // Quote actual line snippet so isReasonSupported passes
      reason: i < 3
        ? "Code at ai.js advances with `dist>1.62` contradicting design."
        : i === 6
        ? "Code has `rival.grappleCooldown` which implements the throw cooldown."
        : "Code filters actions with `options.filter` avoiding repetitions.",
    })),
  };
  writeFileSync(answerPath, JSON.stringify(mockVerdicts, null, 2));

  try {
    const res = spawnSync(
      process.execPath,
      ["--import", "tsx", "ai/cli/nemotron-review.ts", "drift-judge", "--results-from", answerPath, "--out", outPath],
      { encoding: "utf8", timeout: 15_000, env: { ...process.env, NEBIUS_API_KEY: "" } }
    );
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /drift-judge/i);
    const saved = JSON.parse(readFileSync(outPath, "utf8"));
    assert.equal(saved.placeholder, false);
    assert.equal(saved.source, "injected");
    assert.equal(saved.verdicts.length, 8);
    assert.equal(typeof saved.agreement.cohensKappa, "number");
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("CLI aid-fix --results-from runs offline and writes aid-fix.json without modifying data/tutor/results.json", () => {
  const scratch = mkdtempSync(resolve("data/test-review-"));
  const outPath = join(scratch, "aid-fix.json");
  const answerPath = join(scratch, "mock-aid.json");

  // Read tutor results mtime before run
  const tutorOriginal = readFileSync("data/tutor/results.json", "utf8");

  const mockAidAnswers = {
    rewrites: [
      { aidIndex: 0, rewrite: "Tap J four times quickly: jab → cross → hook → uppercut." },
      { aidIndex: 1, rewrite: "Press Q or V to sidestep deeper or nearer to find your opening." },
      { aidIndex: 2, rewrite: "Hold away from your rival to guard and reduce incoming damage by 85%." },
    ],
    reviews: [
      { aidIndex: 0, verdict: "ACCEPT", reason: "Accurate combo controls." },
      { aidIndex: 1, verdict: "ACCEPT", reason: "Accurate sidestep controls." },
      { aidIndex: 2, verdict: "ACCEPT", reason: "Accurate 85% reduction." },
    ],
  };
  writeFileSync(answerPath, JSON.stringify(mockAidAnswers, null, 2));

  try {
    const res = spawnSync(
      process.execPath,
      ["--import", "tsx", "ai/cli/nemotron-review.ts", "aid-fix", "--results-from", answerPath, "--out", outPath],
      { encoding: "utf8", timeout: 15_000, env: { ...process.env, NEBIUS_API_KEY: "" } }
    );
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /aid-fix/i);
    const saved = JSON.parse(readFileSync(outPath, "utf8"));
    assert.equal(saved.placeholder, false);
    assert.equal(saved.source, "injected");
    assert.equal(saved.aids.length, 3);
    assert.equal(saved.aids[2].rewrite, "Hold away from your rival to guard and reduce incoming damage by 85%.");
    assert.equal(saved.aids[2].codeCheck.valid, true);

    // Verify data/tutor/results.json is unmodified!
    const tutorAfter = readFileSync("data/tutor/results.json", "utf8");
    assert.equal(tutorOriginal, tutorAfter);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("CLI refuses to read any environment file via --results-from", () => {
  const res = spawnSync(
    process.execPath,
    ["--import", "tsx", "ai/cli/nemotron-review.ts", "drift-judge", "--results-from", ".env"],
    { encoding: "utf8", timeout: 15_000 }
  );
  assert.notEqual(res.status, 0);
  assert.match(res.stderr + res.stdout, /environment/i);
});

test("computeAidFacts: a 0..1 value that is not a multiplier (jab startup, seconds) gets no percentage facts", () => {
  const aidJab = { ...aidGuard, tuningOverrides: { "anim.JAB.startup": 0.05 } } as typeof aidGuard;
  const facts = computeAidFacts(aidJab, 0, controlFacts);
  assert.equal(facts.facts["anim.JAB.startup"], 0.05);
  assert.equal(facts.facts["anim.JAB.startup.percentage"], undefined);
  assert.ok(!facts.allowedNumbers.includes(5), "5 percent must not be an allowed number for a startup time");
  assert.ok(!facts.allowedNumbers.includes(95));
});
