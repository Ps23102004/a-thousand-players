# Spec Drift

`/modes/drift` is a static page importing `data/drift/results.json`. The committed file has `"placeholder": true`: **not run yet**. No live Ultra result is claimed. No API route or deployment function is added. Rebuild the production app after replacing the results file.

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

It calls `chat()` once with `ULTRA` from `ai/models.ts`, thinking off, retries disabled. There is no repair call or web lookup. This implementation session did not execute it. The lead can instead hand over a raw answer file for `--results-from`.

Verification:

```bash
node --import tsx --test ai/drift.test.ts
npm test
npx tsc --noEmit -p .
node scripts/check-recorded-replays.mjs
npm run engine:test
npm run dev -- -p 3161
E2E_BASE_URL=http://localhost:3161 NODE_PATH=~/.local/lib/node_modules/@playwright/cli/node_modules node ~/.local/lib/node_modules/@playwright/cli/node_modules/playwright/cli.js test -c e2e/playwright.config.cjs
```

The new browser spec swaps the static JSON to cover placeholder and injected results, then restores the original bytes in `finally`. It only enables fixture swaps on a loopback dev server at port 3161 in this worktree. Do not interrupt it during a swap. The existing `e2e/content.spec.cjs` exact nav list needs the new Spec Drift link added by the lead; that file is outside this task's allowed edits. The README also still lists Spec Drift as unbuilt and is outside this task's allowed edits.

Implementation-session checks (2026-10-29):

- `node --import tsx --test ai/drift.test.ts`: 7 passed, after observing failing tests before implementation.
- `npx tsc --noEmit -p .` and `git diff --check`: passed.
- `node scripts/check-recorded-replays.mjs`: `rounds 45 legacy identical to recorded 45 fixed identical 23`.
- `npm run engine:test`: `16 seeds x2 runs, mismatches=0`.
- `npm test`: engine section had 134 passes and 1 existing TODO, then the `tsx` launcher failed with sandbox `listen EPERM`.
- Direct-loader equivalent `node --import tsx --test lib/*.test.ts ai/*.test.ts app/api/*.test.ts`: 297 passes, 0 assertion failures, 7 cancellations and 2 existing TODOs. The existing triage network-isolation test requires binding a local socket; the sandbox cannot do that. Rerunning with `--test-skip-pattern='a patched replay cannot reach the network'` excluded that test: 303 passes, 0 failures/cancellations, 2 TODOs.
- Browser suite discovery: 91 tests in 13 files, including both new Drift tests. Browser execution is **not verified**: port 3161 failed with `listen EPERM`, and the focused spec failed during Chrome launch (the other serial test did not run). The lead must run the suite outside this sandbox.
- Commit attempt failed because Git's worktree `index.lock` is outside the writable sandbox. Changes are uncommitted on `p2-drift`; no push was attempted. No live call ran, and the results file remains a placeholder.
