# Playable game controls crawler

Status (2026-10-29, run by the lead in system Chrome against `npm run dev -p 3142`): the crawler reports **92 of 92 controls work**; with the pause button deliberately broken (`E2E_BREAK_CONTROL=btn-pause`) the spec fails with `btn-pause: false !== true` and the game stays unpaused (`paused:false`), so the spec does catch a dead control. It was written by gpt-6.1-sol in a sandbox that could not run a browser; the browser runs were done afterwards.

`node e2e/game-ui.spec.cjs --init-report` inventoried **92** control checks. The checked-in report has **0 working, 0 failed, 92 untested** (`works: null`). `/games` statically imports that file and displays “controls checked: 0 of 92 work”, alongside the failed and untested counts. A successful browser run replaces pending rows with measured results; rebuild/redeploy afterward to update the hosted static page.

## What is exercised

The source of truth is `game/index.html`, `game/src/main.js`, `player.js`, `gamepad.js`, `hud.js`, `ground.js` and `grapple.js`. The offline catalog test compares the HUD IDs and keyboard guide keys to the real HTML, so a changed guide requires updating the crawler.

- All **12** named HUD buttons: start, pause, resume, restart, both menu paths, both help entry points, help close, both guide tabs and sound. Guide tabs assert visibility and both `aria-pressed` states; sound asserts the game flag, label and ARIA state in both directions.
- All **15** distinct keyboard-guide keys: A, D, E, ESC, F, G, H, J, K, L, Q, R, S, V, W. This includes full punch/kick chains, both low attack chains, movement and release, guard when retreating, jump, crouch, parry, crate pickup/throw, both grab aliases, clinch strikes/throw/release, mount strikes/stand, prompt-confirmed technical rise, escape, counterthrow and mount reversal.
- Standard gamepad buttons and axes through an injected `navigator.getGamepads`: lateral/depth stick frames, all D-pad directions, face buttons, L1 combinations, analog L2, R1, R2, OPTIONS, CREATE, touchpad, R3, L3, fighter selection, menu focus navigation, confirm and back. Contextual combat is checked with the same state assertions as the keyboard.
- Pause/resume checks run the real animation loop and inspect `getHUDState().gameTime`. Restart checks begin with damaged fighters and elapsed time (or game over), then assert both HP, health-bar ARIA values, the HUD timer and game time reset.

The crawler uses the existing Playwright configuration unchanged: system Chrome, viewport and timeouts from `e2e/playwright.config.cjs`. It waits for the actual `gameApp.running` state, the enabled start button, document focus and real render frames. There are no fixed sleeps. The playable test rejects any base URL whose port is not **3142** and blocks external requests and `/api/` calls.

Most combat checks stop the animation loop, disable the CPU and advance the real `updateFight(1 / 60)` simulation explicitly after real keyboard events or fake pad frames. Fixtures reset and position real fighters, place a real crate, and use exported knockdown/grapple/mount functions to reach contextual prompts. They do not replace input handlers or fake outcomes. Live animation-loop pause/resume is tested separately. The fake pad is polled explicitly, including neutral/context-transition frames and releases. Uncaught game errors fail the associated control check. Failure rows include the exception and observed game state; subsequent checks continue from reset fixtures.

## Lead: browser acceptance on the assigned port

Use the dev server already running at `http://localhost:3142`, or start this worktree with `npm run dev -- -p 3142` (predev syncs `game/` into `public/game/`). Do not use the README's shared default port for this feature.

```bash
E2E_BASE_URL=http://localhost:3142 NODE_PATH=~/.local/lib/node_modules/@playwright/cli/node_modules node ~/.local/lib/node_modules/@playwright/cli/node_modules/playwright/cli.js test -c e2e/playwright.config.cjs game-ui.spec.cjs
```

The first test writes each observation to `docs/controls-report.json`, attaches the report to Playwright and logs the measured totals. A loader/setup failure leaves controls untested. The second test checks the `/games` counter against that file. Report rows have `{control, input, expected, observed, works}`; `true` means observed pass, `false` means observed failure, `null` means no browser observation. An interrupted crawl retains completed rows.

Run the full offline browser suite after the normal crawler:

```bash
E2E_BASE_URL=http://localhost:3142 NODE_PATH=~/.local/lib/node_modules/@playwright/cli/node_modules node ~/.local/lib/node_modules/@playwright/cli/node_modules/playwright/cli.js test -c e2e/playwright.config.cjs
```

Do not set `E2E_REAL=1`.

## Deliberately broken button: proof run

The spec has an opt-in local mutation. It replaces the pause button with a DOM clone, removing both `onclick` and registered click listeners. The mutation exists only in that test page, is never committed to game source and is discarded when the page closes. Only the target control runs in mutation mode; its report goes to the Playwright output directory, preserving the normal report.

```bash
E2E_BASE_URL=http://localhost:3142 E2E_BREAK_CONTROL=btn-pause NODE_PATH=~/.local/lib/node_modules/@playwright/cli/node_modules node ~/.local/lib/node_modules/@playwright/cli/node_modules/playwright/cli.js test -c e2e/playwright.config.cjs game-ui.spec.cjs -g 'playable game'
```

Observed result (2026-10-29): exit nonzero, report `Controls: 0 of 92 work; 1 failed; 91 untested` in mutation mode, and nonzero exit, `btn-pause` has `works: false`, and `controls-broken-button.json` records that `paused` stayed false. Run the normal crawler command again without `E2E_BREAK_CONTROL` to verify the fresh page works. Record the actual failure text and subsequent passing totals here before claiming browser acceptance. No broken source patch remains to revert.

## Local evidence

- Test first: `node e2e/game-ui.spec.cjs --logic-test` initially failed all three report/fake-pad tests with “controlReport is not a function” / “fakePadFrame is not a function”. After additive helper implementation, all three passed.
- UI test first: adding the static import/counter contract test produced **3 passed, 1 failed** because `/games` had no report import. After the UI change, **4 passed, 0 failed**.
- The expanded offline suite now checks the HTML catalog, the real `GamepadControls` mapper and report semantics as well. Browser acceptance remains separate.

No game bugs have been verified in Chrome, no game source was changed, and no new rule flags or API routes were added. Recorded data was not edited. Physical gamepad hardware, rumble and adaptive triggers are untested.

## Commands run in this worktree

| Command | Observed summary |
| --- | --- |
| `node e2e/game-ui.spec.cjs --logic-test` (initial RED) | 0 passed, 3 failed: the report and fake-pad helpers did not exist |
| Same command after additive helper implementation | 3 passed, 0 failed |
| Same command after adding the UI contract test, before UI implementation | 3 passed, 1 failed: missing static JSON import |
| Same command after UI implementation | 4 passed, 0 failed |
| Same command after catalog/mapping coverage was added (final) | 6 passed, 0 failed |
| `node e2e/game-ui.spec.cjs --init-report` | Inventoried 92 controls; 0 browser observations; generated pending JSON |
| `node --check e2e/game-ui.spec.cjs` | Passed, including after the mutation-mode and error-reporting edits |
| `node --check e2e/helpers.cjs` | Passed |
| `npx tsc --noEmit -p .` | Passed, no diagnostics |
| `npm test > /tmp/p1b-npm-test.log 2>&1` | Engine: 135 tests, 134 passed, 0 failed, 1 TODO. TypeScript launcher then failed: `listen EPERM` opening its `tsx` IPC pipe. The shell wrapper tailed the log and therefore returned 0; **the npm test command did not pass** |
| `node --import tsx --test lib/*.test.ts ai/*.test.ts app/api/*.test.ts` | Fallback bypassed the launcher IPC pipe: 254 tests, 245 passed, 0 failed, 7 cancelled, 2 TODO; exit 1. Cancellation begins at the existing “a patched replay cannot reach the network” test, whose UDP bind cannot complete here. This is not a full-suite pass |
| `node scripts/check-recorded-replays.mjs` | `rounds 45 legacy identical to recorded 45 fixed identical 23` |
| `npm run engine:test` | `16 seeds x2 runs, mismatches=0, 7.2 rounds/s, 6k ticks/s` (concurrent checks, not a dedicated throughput benchmark) |
| `NODE_PATH=~/.local/lib/node_modules/@playwright/cli/node_modules node ~/.local/lib/node_modules/@playwright/cli/node_modules/playwright/cli.js test -c e2e/playwright.config.cjs game-ui.spec.cjs --list` | 2 tests discovered in 1 file; no browser launched |
| `git diff --check` | Passed |
| `git status --short --branch` | Branch `p1-controls`; changes limited to the six feature files below |
| `git log -1 --format='%h %s'` | Read the initial branch tip; no branch change |
| `git diff --stat`, `git diff --numstat`, `git diff -- app/games/page.tsx` | Reviewed tracked changes |
| `git add e2e/game-ui.spec.cjs e2e/helpers.cjs docs/controls-report.json && git commit -m 'test: crawl playable game HUD keyboard and virtual controller controls' -m 'Co-Authored-By: GPT-6 <noreply@example.com>'` | Failed at `git add`: cannot create the Git worktree's `index.lock` in the parent checkout. No commit or push occurred |

Read-only inspection commands were `pwd`, `rg --files` (project files and installed Next.js docs), `rg -n` (controls, animation, physics, test results and routing headings), `cat`, `sed -n` and `head` (AGENTS, README, e2e documentation/config/helpers/replay, package/TypeScript configuration, `/games`, game input/HUD/ground/grapple/player/physics sources, controller smoke tests, engine simulation/tests, installed skills, canonical routing and capability documents). A scoped memory-registry `rg` returned no relevant hits. `tail -n` read only the local check logs above. Python here-documents and `apply_patch` edited only the feature files. GitNexus's read-only repository listing had no index for this checkout, so navigation used the explicitly named files. No keys or environment files were inspected, and no live model or external API was called.

## Remaining delivery work

1. Run the normal crawler in system Chrome on port 3142; send any failures back with the generated report. Current JSON rows are inventory, not passing results.
2. Run the broken-button mutation and record the actual failed assertion; rerun without the mutation and record measured totals. The proof above is a runnable procedure, not completed evidence.
3. Run `npm test` and the full browser suite in an environment that permits their local sockets/browser. Recheck type compilation after any follow-up changes.
4. Commit on `p1-controls` from a shell that can write the parent worktree metadata. Suggested small commits: first the crawler, additive helpers and report; then the static `/games` block and documentation. End each commit message with `Co-Authored-By: GPT-6 <noreply@example.com>`. Do not push.

Files: `e2e/game-ui.spec.cjs`, `e2e/helpers.cjs` (additive only), `e2e/README.md` (one row), `docs/controls-report.json`, `docs/controls.md`, `app/games/page.tsx`.
