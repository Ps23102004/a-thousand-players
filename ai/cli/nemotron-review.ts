// Offline & Lead runner for Nemotron Review
// Usage: npx tsx --env-file=.env ai/cli/nemotron-review.ts drift-judge|aid-fix [--dry-run | --results-from <file>] [--out <file>]
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  extractExcerpts,
  buildDriftJudgePrompt,
  validateDriftVerdicts,
  runDriftJudge,
  extractGameControlFacts,
  computeAidFacts,
  buildAidFixPrompt,
  buildAidReviewPrompt,
  runAidFix,
  type DriftClaim,
  type GeminiJudgeData,
  type TutorAid,
  type FakeAidAnswers,
} from "../nemotron-review";
import { extractJson } from "../models";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));

function assertSafePath(targetPath: string) {
  for (let p = targetPath + ".tmp"; p !== root; p = dirname(p)) {
    if (existsSync(p) && lstatSync(p).isSymbolicLink()) {
      throw new Error(`Output path cannot contain symlinks: ${p}`);
    }
  }
  if (existsSync(targetPath) && lstatSync(targetPath).isSymbolicLink()) {
    throw new Error(`Output path cannot be a symlink: ${targetPath}`);
  }
}

function assertNoEnvFile(filePath: string) {
  const parts = filePath.split(/[\\/]/);
  if (parts.some((p) => /^\.env(?:\.|$)/.test(p))) {
    throw new Error("Refusing to read an environment file");
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const mode = argv[0];

  if (mode !== "drift-judge" && mode !== "aid-fix") {
    throw new Error("Usage: ai/cli/nemotron-review.ts drift-judge|aid-fix [--dry-run | --results-from FILE] [--out FILE]");
  }

  const { values } = parseArgs({
    args: argv.slice(1),
    options: {
      "dry-run": { type: "boolean", default: false },
      "results-from": { type: "string" },
      out: { type: "string" },
    },
    allowPositionals: true,
  });

  if (values["dry-run"] && values["results-from"]) {
    throw new Error("Choose --dry-run or --results-from");
  }

  if (mode === "drift-judge") {
    const defaultOut = join(root, "data/nemotron-review/drift-judge.json");
    const output = resolve(root, values.out || defaultOut);
    assertSafePath(output);

    // Read input claims and gemini judge
    const driftResultsRaw = JSON.parse(readFileSync(join(root, "data/drift/results.json"), "utf8")) as {
      claims: DriftClaim[];
    };
    const claims = driftResultsRaw.claims;
    const geminiJudge = JSON.parse(readFileSync(join(root, "data/drift/judge.json"), "utf8")) as GeminiJudgeData;

    const readDoc = (file: string) => readFileSync(join(root, file), "utf8");
    const readCode = (file: string) => readFileSync(join(root, file), "utf8");

    const excerpts = extractExcerpts(claims, readDoc, readCode);
    const prompt = buildDriftJudgePrompt(excerpts);

    console.log(`[drift-judge] prompt characters=${prompt.characters} estimatedTokens=${prompt.estimatedTokens}`);
    if (values["dry-run"]) {
      console.log(`[drift-judge dry-run] 8 claims prepared with +-12 line excerpts. No model call.`);
      return;
    }

    let result;
    if (values["results-from"]) {
      assertNoEnvFile(values["results-from"]);          // by name first: the file may not exist, and a .env must be refused either way
      const input = realpathSync(values["results-from"]);
      assertNoEnvFile(input);                            // and again after symlinks are resolved
      const text = readFileSync(input, "utf8");
      const parsed = extractJson(text);
      result = validateDriftVerdicts(parsed, excerpts, geminiJudge);
      result.source = "injected";
    } else {
      result = await runDriftJudge(claims, geminiJudge, readDoc, readCode);
    }

    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output + ".tmp", JSON.stringify(result, null, 2) + "\n");
    renameSync(output + ".tmp", output);

    console.log(`[drift-judge] Agreement with Gemini: ${result.agreement.same}/8 same, Cohen's kappa=${result.agreement.cohensKappa}`);
    console.log(`[drift-judge] Unsupported reasons: ${result.unsupportedCount}`);
    console.log(`Wrote ${relative(root, output)} (${result.source})`);
  } else if (mode === "aid-fix") {
    const defaultOut = join(root, "data/nemotron-review/aid-fix.json");
    const output = resolve(root, values.out || defaultOut);
    assertSafePath(output);

    // Read tutor results (READ ONLY: NEVER MODIFY THIS FILE)
    const tutorResultsRaw = JSON.parse(readFileSync(join(root, "data/tutor/results.json"), "utf8")) as {
      aids: { aid: TutorAid }[];
    };
    const aids: TutorAid[] = tutorResultsRaw.aids.map((item) => item.aid);
    const indexHtml = readFileSync(join(root, "game/index.html"), "utf8");

    const controlFacts = extractGameControlFacts(indexHtml);
    const computedFacts = aids.map((a, i) => computeAidFacts(a, i, controlFacts));

    console.log(`[aid-fix] Loaded ${aids.length} aids. Allowed keys: ${Array.from(controlFacts.allowedKeys).sort().join(", ")}`);
    for (let i = 0; i < aids.length; i++) {
      console.log(`[aid-fix] Aid ${i} ("${aids[i].title}") computed facts:`, JSON.stringify(computedFacts[i].facts));
    }

    if (values["dry-run"]) {
      console.log(`[aid-fix dry-run] Completed fact computation and control extraction. No model calls.`);
      return;
    }

    let result;
    if (values["results-from"]) {
      assertNoEnvFile(values["results-from"]);          // by name first: the file may not exist, and a .env must be refused either way
      const input = realpathSync(values["results-from"]);
      assertNoEnvFile(input);                            // and again after symlinks are resolved
      const text = readFileSync(input, "utf8");
      const parsed = extractJson(text) as any;
      let fakeAnswers: FakeAidAnswers;
      if (Array.isArray(parsed)) {
        fakeAnswers = {
          rewrites: parsed.map((item, idx) => ({ aidIndex: item.aidIndex ?? idx, rewrite: item.rewrite ?? item })),
        };
      } else {
        fakeAnswers = parsed as FakeAidAnswers;
      }
      result = await runAidFix(aids, indexHtml, undefined, fakeAnswers);
    } else {
      result = await runAidFix(aids, indexHtml);
    }

    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output + ".tmp", JSON.stringify(result, null, 2) + "\n");
    renameSync(output + ".tmp", output);

    console.log(`[aid-fix] Processed ${result.aids.length} aids. Code rejections: ${result.rejections.codeRejections}, Reviewer rejections: ${result.rejections.reviewerRejections}, Retries: ${result.rejections.totalRetries}`);
    console.log(`Wrote ${relative(root, output)} (${result.source})`);
  }
}

main().catch((error) => {
  console.error(`[nemotron-review] ${error instanceof Error ? error.message : "Failed"}`);
  process.exitCode = 1;
});
