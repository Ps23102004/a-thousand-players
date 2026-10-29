// Offline: node --import tsx ai/cli/drift.ts --dry-run | --results-from answer.json
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { buildDriftPrompt, runDrift, verifyDrift, type DriftResults, type DriftSources } from "../drift";
import { ULTRA } from "../models";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));

async function main() {
  const { values } = parseArgs({ options: {
    "dry-run": { type: "boolean", default: false },
    "results-from": { type: "string" },
    out: { type: "string", default: "data/drift/results.json" },
  } });
  if (values["dry-run"] && values["results-from"]) throw new Error("Choose --dry-run or --results-from");
  const output = resolve(root, values.out!);
  const outputRelative = relative(join(root, "data/drift"), output);
  if (!outputRelative || outputRelative.startsWith("..") || !output.endsWith(".json")) throw new Error("--out must be a JSON file inside data/drift/");
  // No symlink may redirect a write outside this worktree, including the atomic temp file.
  for (let path = output + ".tmp"; path !== root; path = dirname(path)) {
    if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error("Output path cannot contain symlinks");
  }
  if (existsSync(output) && lstatSync(output).isSymbolicLink()) throw new Error("Output path cannot be a symlink");
  const readSource = (file: string) => {
    const path = join(root, file);
    if (realpathSync(path) !== path) throw new Error(`Source cannot be a symlink: ${file}`);
    return readFileSync(path, "utf8");
  };
  const sources: DriftSources = { docs: {}, code: {} };
  for (const file of ["docs/design.md", "game/README.md"]) sources.docs[file] = readSource(file);
  for (const file of readdirSync(join(root, "game/src"), { withFileTypes: true }).filter(f => f.isFile() && f.name.endsWith(".js")).map(f => `game/src/${f.name}`).sort()) sources.code[file] = readSource(file);
  const prompt = buildDriftPrompt(sources);
  console.log(`Prompt characters=${prompt.characters} estimatedTokens=${prompt.estimatedTokens} (characters/4 estimate; not measured tokens)`);
  if (values["dry-run"]) return;

  let verification;
  if (values["results-from"]) {
    const input = realpathSync(values["results-from"]);
    if (input.split(/[\\/]/).some(part => /^\.env(?:\.|$)/.test(part))) throw new Error("Refusing to read an environment file");
    verification = verifyDrift(readFileSync(input, "utf8"), sources);
  } else {
    // Exactly one Ultra request, thinking off, retries disabled. Only the lead runs this path.
    verification = await runDrift(sources);
  }
  if (verification.error) throw new Error(verification.error);
  const result: DriftResults = {
    ...verification, placeholder: false, source: values["results-from"] ? "injected" : "model", model: ULTRA,
    generatedAt: new Date().toISOString(),
    prompt: { characters: prompt.characters, estimatedTokens: prompt.estimatedTokens },
    sourceHashes: Object.fromEntries(Object.entries({ ...sources.docs, ...sources.code }).map(([file, text]) => [file, createHash("sha256").update(text).digest("hex")])),
  };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output + ".tmp", JSON.stringify(result, null, 2) + "\n");
  renameSync(output + ".tmp", output);
  console.log(`${result.verified} of ${result.proposed} claims verified by code; ${result.dropped} dropped`);
  console.log(`Wrote ${relative(root, output)} (${result.source}; existence checks only)`);
}

main().catch(error => { console.error(`[drift] ${error instanceof Error ? error.message : "Failed"}`); process.exitCode = 1; });
