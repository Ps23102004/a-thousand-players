# Patch Prophet

Balance now has **Run Patch Prophet** beside the translated tuning table. It posts numeric tuning to the new `POST /api/prophet` route. The existing Super translation is the only model step; Prophet itself never calls a model or an external API. The Balance page stays static (confirmed by the webpack build).

The server runs the existing `engine/crowd.mjs` twice in sequential child Node processes with `--workers 1 --rounds 1 --traces 0`, first with `data/run-main/meta.json`'s `recordedWith` tuning, then that same tuning plus the validated override. Both sides use the first 200 recorded personas, identical fighter choices and round seeds. This is a convenience sample, not a randomized or equally stratified sample. No engine/game behavior or recorded data was changed.

The UI explicitly says **sample of 200 personas, 1 round each, not the full 1000**. Its before/after rates, percentage-point changes and bug-round counts come from engine output. Losses, draws and crashes stay in each rate's denominator; a round with several invariant events counts as one bug round. Bug codes are stuck, oob, nan, clip, airborne, softlock and crash.

The route rejects unknown keys, arrays, empty overrides, non-finite/non-numeric values and values outside `data/baseline-tuning.json`'s allowed ranges. Model text never becomes shell code or a path. `execFile` receives a fixed executable and argument array; tuning goes into server-created temporary files. Child environments contain only PATH and NODE_ENV; temp files are deleted on success, error or timeout.

Limits are one live comparison per server instance, 10 requests per minute per address, 40 per UTC day per instance, a shared 100-second child-work deadline, and a 120-second route limit. Busy requests refund their rate-limit unit. Like live triage, these in-memory limits reset on restart and are not shared across Vercel instances. No shared/global quota is claimed. Child scripts, game sources, persona/meta data, cache and engine dependencies are explicitly included in `next.config.mjs`; the production trace passed 11 required-file checks.

Rate-limit, busy-slot and timeout responses use `data/prophet/example.json` only if every requested key and value matches its tuning, independent of key order. They include `cached: true` and an explanation shown in the page. Other tuning gets 429, 503 or 504 respectively. Other child failures return 500 without claiming a result. This cache covers the exact recorded Super answer for the built-in example; a future live Super answer that varies numerically does not qualify.

## Reproduce the offline measurements

No key or live model call is needed:

```sh
node scripts/make-prophet-cache.mjs --seed 1 --limit 200
node scripts/make-prophet-cache.mjs --seed 2 --limit 200
```

The script reads the existing example response from `data/samples/balance.json`:

```json
{
  "anim.SWEEP.damage": 12.8,
  "anim.SWEEP.recovery": 0.456,
  "rules.guardDamageMultiplier": 0.25
}
```

Each saved JSON records the generating command, generation timestamp, paired-crowd wall-clock milliseconds, baseline rules, seed, sample size and all aggregate counts. `wallMs` measures the entire `runProphet` operation, including the two child startups, file I/O and aggregation; it excludes the cache CLI's initial TypeScript loader startup and final JSON write.

| Seed / saved file | Paired wall-clock | Projected at 3× slower CPU | Overall wins before → after | Bug rounds before → after |
| --- | ---: | ---: | --- | --- |
| 1 / `data/prophet/example.json` | 9.742 s | 29.226 s | 66/200 → 69/200 (33.0% → 34.5%) | 1 → 1 |
| 2 / `data/prophet/seed-2.json` | 9.948 s | 29.844 s | 55/200 → 64/200 (27.5% → 32.0%) | 0 → 0 |

Both projections are below the requested 60-second budget, so the target stays at 200 personas. The slowdown is the task's assumption, not a hosted Vercel benchmark. These observations cover the built-in example, not every allowed tuning combination; the deadline bounds slower cases.

| Archetype | Personas / rounds per side | Seed 1: wins (rate) before → after | Seed 2: wins (rate) before → after |
| --- | ---: | --- | --- |
| casual | 39 | 5 → 5 (12.8% → 12.8%) | 1 → 3 (2.6% → 7.7%) |
| cheeser | 23 | 21 → 21 (91.3% → 91.3%) | 21 → 20 (91.3% → 87.0%) |
| explorer | 13 | 7 → 3 (53.8% → 23.1%) | 2 → 2 (15.4% → 15.4%) |
| learner | 23 | 2 → 2 (8.7% → 8.7%) | 3 → 5 (13.0% → 21.7%) |
| masher | 36 | 9 → 11 (25.0% → 30.6%) | 10 → 12 (27.8% → 33.3%) |
| rusher | 33 | 14 → 16 (42.4% → 48.5%) | 10 → 11 (30.3% → 33.3%) |
| speedrunner | 10 | 7 → 7 (70.0% → 70.0%) | 6 → 7 (60.0% → 70.0%) |
| turtle | 23 | 1 → 4 (4.3% → 17.4%) | 2 → 4 (8.7% → 17.4%) |

The seed-1 bug round is a turtle round on each side; all other archetype bug counts are zero. Seed 2 has no bug rounds. Overall change is +1.5 percentage points for seed 1 and +4.5 for seed 2. The explorer change is −30.8 points on seed 1 and zero on seed 2, illustrating the small sample's seed sensitivity. Two seeds do not establish statistical significance or human preference. These are different tuning values and a different cohort/round count from `data/patches/sweep-nerf.json`; the earlier 92% → 82% result must not be presented as this example's outcome.

## Verification and remaining work

The new test was run before implementation and failed with `ERR_MODULE_NOT_FOUND` for `lib/prophet`. The first `npx tsx` invocation instead hit the sandbox's IPC prohibition, so the test-first loop used `node --import tsx --test`.

| Command | Observed summary |
| --- | --- |
| `npx tsx --test lib/prophet.test.ts` | Blocked: tsx IPC `listen EPERM`. |
| `node --import tsx --test lib/prophet.test.ts` | Initial expected missing-module failure; after implementation 6 tests pass. Includes real deterministic child runs, aggregation, validation, timeout, fallback, and direct HTTP handler tests. The handler's full 200-persona counts match the saved seed-1 cache. |
| `node scripts/make-prophet-cache.mjs --seed 1 --limit 200` | 9,742 ms; 66 → 69 wins, 1 → 1 bug rounds. |
| `node scripts/make-prophet-cache.mjs --seed 2 --limit 200` | 9,948 ms; 55 → 64 wins, 0 → 0 bug rounds. |
| `npm test` | Engine: 135 tests, 134 pass, 0 fail, 1 skipped. Then blocked at tsx IPC `listen EPERM`; full command does not pass. |
| `node --import tsx --test lib/*.test.ts ai/*.test.ts app/api/*.test.ts` | 260 tests: 251 pass, 0 ordinary assertion failures, 7 cancelled, 2 existing TODOs. Existing triage network-sandbox test cannot complete in this environment and its subsequent tests cancel. Full command exits 1. |
| `npx tsc --noEmit -p .` | Pass after correcting test fixture types; also passes after the build. |
| `node scripts/check-recorded-replays.mjs` | `rounds 45 legacy identical to recorded 45 fixed identical 23`. |
| `npm run engine:test` | `16 seeds x2 runs, mismatches=0, 24.6 rounds/s, 19k ticks/s`. |
| `npm run dev -- -p 3141` | Blocked: `listen EPERM 0.0.0.0:3141`. No server was started by this session. |
| `NODE_PATH=~/.local/lib/node_modules/@playwright/cli/node_modules E2E_BASE_URL=http://localhost:3141 node ~/.local/lib/node_modules/@playwright/cli/node_modules/playwright/cli.js test -c e2e/playwright.config.cjs e2e/prophet.spec.cjs` | Attempted new spec: 3 fail before feature assertions because Chrome launch/socket access is blocked. |
| `env -u E2E_REAL NODE_PATH=/Users/parthsingh/.local/lib/node_modules/@playwright/cli/node_modules E2E_BASE_URL=http://localhost:3141 node /Users/parthsingh/.local/lib/node_modules/@playwright/cli/node_modules/playwright/cli.js test -c e2e/playwright.config.cjs` | Attempted full browser suite: 83 fail, 3 skipped, 0 pass under the same restrictions. No browser pass is claimed. |
| `NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/private/tmp/prophet-font-mock.cjs npm run build -- --webpack` | Initial empty-CSS mock failed (`Font loaders must return one or more @font-face's`); corrected local-font CSS mock builds successfully. Google font requests are mocked to avoid network access. Build marks `/modes/balance` static and `/api/prophet` dynamic. Real font rendering is not verified. |
| Production trace assertion (Node, below) | All 11 required-file checks pass. |
| `git diff --check` | Pass. |
| `git add lib/prophet.ts lib/prophet.test.ts scripts/make-prophet-cache.mjs data/prophet/example.json data/prophet/seed-2.json` | Blocked creating shared worktree `index.lock` outside the writable sandbox. The chained commit did not run. |

The new browser spec fakes only the existing Super response, then exercises the actual crowd route; it also covers busy-cache behavior and mocked cached/error UI at phone width. It is checked in but **not browser-verified** here. No live model, Tavily call, hosted CPU benchmark, deployment, push or successful commit was performed. No `.env` or credential was read or printed. All source edits are in the requested worktree and allowed feature paths.

To finish acceptance in a normal terminal, run the project commands above (without the sandbox), keep `E2E_REAL` unset and use only port 3141. Commit the implementation in small steps on `p1-prophet`, ending each message with `Co-Authored-By: GPT-6 <noreply@example.com>`. Do not push.

## Inspection and utility command ledger

These commands supported the work; commands repeated for targeted verification are listed once with their combined outcome. File edits used `apply_patch`. No external tooling or dependency was installed. Tool discovery found no GitNexus index for this project, so navigation used the user-named files and targeted `rg` reads. No relevant local-memory hit was found.

| Command / inspection | Summary |
| --- | --- |
| `pwd && rg --files -g 'AGENTS.md' -g 'README.md' -g 'e2e/README.md' -g '!node_modules' -g '!data'` | Confirmed worktree and instruction/readme paths. |
| `cat AGENTS.md README.md e2e/README.md` | Read project instructions and offline/browser test procedures first. |
| `cat /Users/parthsingh/.codex/skills/capabilities/SKILL.md /Users/parthsingh/.agents/CAPABILITIES/INDEX.md` | Read required capability routing. |
| `rg -n 'prophet\|sparring\|Thousand' /Users/parthsingh/.codex/memories/MEMORY.md` | No relevant hit. |
| `cat` on canonical Engineering Brain `ROUTING-CONSTITUTION.md`, `TOOL-ROUTING.md`, `MODEL-ROUTING.md`, `HARNESS-INTEGRATION.md`, `HEALTH-CHECK.md`, and capability `coding-workflow-and-review.md` | Read focused local engineering policy. No local model service was used. |
| `git status --short && git branch --show-current && cat package.json next.config.mjs && cat app/api/balance/route.ts app/modes/balance/*` | Initially clean branch `p1-prophet`; learned test scripts, tracing and current Balance flow. Repeated targeted reads without edits. |
| `cat app/api/triage/route.ts lib/triage-live.ts engine/crowd.mjs` | Read triage's child/slot/timeout patterns and crowd CLI. |
| `cat /Users/parthsingh/.codex/skills/graphify/SKILL.md` and capability workflow file | Read navigation guidance; GitNexus repository inventory had no project index. No graph/model extraction was run. |
| `rg --files node_modules/next/dist/docs` filtered for route-handlers/server-and-client/next-config | Located installed Next documentation. |
| `cat lib/ai-route.ts ai/balance.ts game/src/tuning.js e2e/playwright.config.cjs` and `cat engine/crowd.mjs ai/balance.ts lib/ai-route.ts` | Inspected route guards/config; `ai/balance.ts` does not exist, so targeted lookup located `ai/nl.ts`. |
| `cat data/samples/balance.json data/patches/sweep-nerf.json data/run-main/meta.json` | Established exact example tuning and recorded-build overrides. |
| `cat components/AiForm.tsx` | Read existing translation form and cache notice handling. |
| `cat e2e/forms.spec.cjs e2e/playwright.config.cjs` | Read selectors, fake/real-call boundary and port override. |
| `cat /Users/parthsingh/.codex/skills/test-driven-development/SKILL.md` | Applied test-first workflow. |
| `cat lib/rate-limit.ts lib/tuning.ts` | Read reusable limiter; `lib/tuning.ts` does not exist. |
| `rg -n 'recordedTuning\|validateTuning\|TuningSpec\|interface Run\|interface Persona' lib ai game/src/tuning.js` | Located shared allowlist, recorded tuning and types. |
| `cat node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` | Read installed route-handler conventions before coding. |
| `rg -n 'outputFileTracingIncludes\|caveat' node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md` and `sed -n '90,117p'` on that file | Confirmed route-keyed tracing includes. |
| `cat engine/crowd-worker.mjs lib/types.ts` | Confirmed round seed/fighter mapping, one-round semantics and result/event types. |
| `sed -n '1,48p' lib/data.ts` and `sed -n '60,96p' ai/nl.ts` | Inspected recorded tuning and model-side allowlist validation. |
| `cat app/api/triage/round.mjs` | Read child isolation pattern. |
| `cat lib/triage-live.test.ts` piped to `head -65` | Read existing real-engine test conventions. |
| `cat lib/replay-token.ts` piped to `head -40`, and `cat .gitignore` | Read fighter/tuning context and generated-output exclusions. |
| Node inspection of first 200 personas and baseline-tuning length | Measured eight archetype group counts (used in results table) and 85 allowlisted tuning specs. |
| `cat tsconfig.json` | Confirmed strict TypeScript/module settings. |
| `rg -o` for `process.env`, `IPC`, `ipc`, `createIpcServer` in `node_modules/tsx/dist/cli.mjs` (tail 20), `ls -ld .git`, `git rev-parse --git-dir`, `ls e2e` | Diagnosed IPC restriction and external Git worktree metadata path. |
| `mkdir -p /private/tmp/prophet-backups && cp app/modes/balance/BalanceForm.tsx app/modes/balance/page.tsx next.config.mjs /private/tmp/prophet-backups/` | Backed up edited existing source/config files. |
| `cat app/api/routes.test.ts` (head 90), `cat lib/layout-static.test.ts`, `rg -n '^import' engine/sim.mjs engine/policy.mjs game/src/*.js` (head 70) | Read server-only test stub, static-page guard and engine dependencies. |
| `cat node_modules/server-only/package.json` | No standalone package; reused Next's compiled empty stub as existing route tests do. |
| `cat app/layout.tsx` | Confirmed Google-font build dependency and existing static layout. |
| `rg -n 'mockedResponses\|NEXT_FONT_GOOGLE_MOCKED_RESPONSES'` in Next's `fetch-css-from-google-fonts.js`, then `cat` that file | Found documented offline build mock mechanism. |
| `rg -n 'mismatches\|seeds' /private/tmp/prophet-determinism.log` and `rg -n '# (tests\|pass\|fail)' /private/tmp/prophet-npm-test.log` | Extracted exact determinism and engine-test summaries. |
| `git status --short && git diff --check` | Confirmed scoped source changes and clean whitespace. |
| `rg -n 'cancelled\|EPERM\|not ok' /private/tmp/prophet-ts-test.log` (head 22) | Identified existing TODOs and triage test cancellation cascade. |
| Node inspection of `e2e/test-results/results.json` statistics | Measured full-suite 83 failures, 3 skips, no passing browser tests. |
| `rg -n 'table-wrap\|\.panel\|pre ' app/globals.css` | Checked existing horizontal table scrolling for mobile. |
| Node writes of `/private/tmp/prophet-font-mock.cjs` | First wrote empty CSS; corrected it to `@font-face { font-family: OfflineTest; src: local(Arial); font-weight: 400 700; }` after the build diagnostic. Only a temporary build fixture was changed. |
| `git diff -- app/modes/balance/BalanceForm.tsx app/modes/balance/page.tsx next.config.mjs && cat lib/prophet.ts app/api/prophet/route.ts` | Reviewed final scoped diff and request/child logic. |
| Node table formatter reading both saved Prophet JSON files | Generated the archetype table directly from measured counts. |
| Node production trace assertion reading `.next/server/app/api/prophet/route.js.nft.json` | Asserted presence of crowd, crowd-worker, sim, policy, tuning, personas, meta, cache, Three module/core and Rapier; 11 checks pass. |
| `rg -n -A 32 -B 4 'a patched replay cannot reach the network' lib/triage-live.test.ts` | Confirmed the cancelled existing test first waits on local UDP/TCP binds, which this environment prohibits. |

Long-running commands were polled for completion; test/build logs were redirected to `/private/tmp/prophet-*.log`, then their final lines were read. The attempted chained commit message was `feat(prophet): compare deterministic paired crowds with exact-example fallback`, followed by the required co-author trailer; staging failed before a commit could be created.
