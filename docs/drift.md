# Spec Drift

`/modes/drift` stays static, importing `data/drift/results.json` and bundling the optional `data/drift/judge.json` snapshot. There is no API route, request-time data loading, or model call on the page. Rebuild the production app after replacing either snapshot.

The current results snapshot records eight existence-checked claims from `nvidia/Nemotron-3-Ultra-550b-a55b`, generated on **2026-10-29**. The second-model snapshot identifies its judge as **`gemini-3.8-flash-high via agy`**, read-only, run on **2026-10-29**. Its verdicts are **3 of 8 confirmed, 1 vague, 4 not drift**. This is **one second opinion, not ground truth**; neither the page nor this implementation independently establishes the semantic correctness of either model's conclusions. No design document or game code was changed to resolve these claims because of this review.

The page shows **Confirmed by a second model** (`REAL_DRIFT`) first and prominently, then **Doc wording is vague** (`DOC_VAGUE`), then **Second model disagrees** (`NOT_DRIFT`) in a closed native `<details>`. Each checked candidate retains the judge's reason alongside the original proposal, quote, and code location. Counts are computed from the claims and judge JSON, never hard-coded. Judge keys are the original **1-based positions** in the results claims array, so grouping preserves those candidate numbers. Replacing or reordering results requires a matching judge snapshot.

The optional judge uses a literal CommonJS import inside `try/catch` in `app/modes/drift/judge.cjs`. Next bundles this JSON statically; this permits a missing file without adding filesystem reads or fetches to the page. Without the file, or without a verdict for an index, the candidate remains visible as **not second-checked**. Unsupported verdicts are also unchecked, and orphan indexes do not inflate counts. The placeholder and empty-results states remain supported.

The offline CLI reads `docs/design.md`, `game/README.md`, and regular `game/src/*.js` files. It supplies full documents and deterministic, line-numbered code prefixes under the character budget in `ai/drift.ts`; omitted lines are explicitly marked. It does not read environment files. Prompt token counts are estimates (`ceil(characters / 4)`), not provider measurements.

Offline commands, run from the worktree root:

```bash
node --import tsx ai/cli/drift.ts --dry-run
node --import tsx ai/cli/drift.ts --results-from /path/to/ultra-answer.json
```

`--results-from` accepts the raw answer as a JSON array or `{"claims":[...]}` (also a fenced JSON answer). It makes no model call, rechecks every candidate against the current files, and labels provenance as **Imported answer**. Imported answers can be fake; this flag does not certify who produced them. `--out data/drift/example.json` allows a separate offline test result; output is restricted to `data/drift/`. Malformed JSON exits with an error and preserves the existing results file. Rejected individual claims are counted and their reasons stored; they are never listed as findings.

Answer shape (illustrative schema, not a measured finding):

```json
{"claims":[{"docClaim":"exact document substring","docFile":"game/README.md","codeSymbol":"updateRivalAI","codeFile":"game/src/ai.js","codeLine":1,"whatCodeDoes":"Explain the proposed contradiction here.","severity":"low"}]}
```

Each retained item must have a nonblank, verbatim quote in the named allowed document, a JavaScript identifier matching a whole identifier in the named game source, an integer line inside that file, nonblank explanation, and `high`, `med` or `low` severity. A trailing newline does not create an extra valid line. Source file hashes and the checked line's text are recorded with the results. The page presents copies of the quote and code location from that snapshot. Regenerate results if the source changes.

**Ultra proposed, code verified existence of the quote and symbol; whether the code really contradicts the doc is for a human to judge.** Matching is textual, like grep: a comment or string can match. The line-range check does not prove that the symbol is on that line. Severity and explanations are proposals. Counts show reference-check survival, not contradiction accuracy. No confidence score is treated as evidence. Empty results do not prove agreement, and trimmed source limits coverage.

The live path is for the lead only, with credentials already supplied by their shell:

```bash
node --import tsx ai/cli/drift.ts
```

It calls `chat()` once with `ULTRA` from `ai/models.ts`, thinking off, retries disabled. There is no repair call or web lookup. This display implementation made no network or model calls and did not read `.env`. Both data snapshots were left unchanged.

Verification:

```bash
node --import tsx --test app/modes/drift/*.test.*
node --import tsx --test ai/drift.test.ts
npm test
node node_modules/typescript/bin/tsc --noEmit --incremental false -p .
node scripts/check-recorded-replays.mjs
npm run engine:test
npm run dev -- -p 3161
E2E_BASE_URL=http://localhost:3161 NODE_PATH=~/.local/lib/node_modules/@playwright/cli/node_modules node ~/.local/lib/node_modules/@playwright/cli/node_modules/playwright/cli.js test -c e2e/playwright.config.cjs
```

The focused unit command is required: the existing `test:ts` script does not discover tests under `app/modes/drift/`. Fixture tests cover grouping, counts, original indexes, missing judgments, empty claims, static display, and a physically missing judge file using a temporary copy of the loader.

The browser spec covers placeholder and injected results, the recorded verdict groups and reasons, collapsed disagreements and expansion, mobile overflow, and a missing judge index. It swaps only `results.json` and restores the original bytes in `finally`; `judge.json` is read-only throughout. Fixture swaps are enabled only on a loopback dev server at port 3161 in this worktree. Do not interrupt it during a swap. This session did not execute e2e; the lead must run it.

Display-session checks (2026-10-29):

- Test-first: the new grouping and display tests failed with `ERR_MODULE_NOT_FOUND` before their implementation existed.
- `node --import tsx --test app/modes/drift/*.test.*`: `# tests 7`, `# pass 7`, `# fail 0`.
- `node --import tsx --test --test-name-pattern='static page renders' ai/drift.test.ts`: `# tests 1`, `# pass 1`, `# fail 0`. This regression covers the existing placeholder, empty, and imported-answer states without invoking the CLI or modifying data files.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false -p .`, `node --check e2e/drift.spec.cjs`, and `git diff --check`: passed.
- Isolated bundling with Next's installed webpack: `Static JSON bundle (present fixture): PASS` and `Static JSON bundle (missing fixture): PASS`. Only temporary fixtures were created; the real judge file was never edited or renamed.
- Production Next build and browser e2e were not run. No commit was made.
