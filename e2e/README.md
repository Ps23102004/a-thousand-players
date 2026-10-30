# Browser end-to-end suite

Playwright specs for every page of the app. They use the Playwright runner bundled with the global
`@playwright/cli` install (the repo has no `@playwright/test` dependency) and the system Google Chrome.

## Run

Start the app in one terminal:

```bash
npm run dev -- -p 3140
```

Then run the suite (no model calls, about 1 minute):

```bash
NODE_PATH=~/.local/lib/node_modules/@playwright/cli/node_modules node ~/.local/lib/node_modules/@playwright/cli/node_modules/playwright/cli.js test -c e2e/playwright.config.cjs
```

Add `E2E_REAL=1` in front to also run the three real model calls (1 Repro, 1 Balance, 1 Eyes). These spend credits.

Options: `E2E_BASE_URL` (default `http://localhost:3140`), `E2E_CHANNEL=` (empty uses Playwright's bundled Chromium).
Results: `e2e/test-results/results.json` (observed values are in each test's annotations). Screenshots: `e2e/screenshots/`.

## Specs

| File | Covers |
| --- | --- |
| `routes.spec.cjs` | Every route returns 200 with no console errors or failed requests; `/replay` empty, malformed, bad JSON, key-only and full token |
| `tutor.spec.cjs` | Onboarding placeholder and measured fixture; fixture swaps require `E2E_BASE_URL=http://localhost:3164` and the worktree dev server on that port |
| `content.spec.cjs` | Nav links, counters, crowd canvas and tile list, 4 charts, finding claims, `/bugs` clusters, exploit table and its replay links |
| `games.spec.cjs` | `/games` loads clean, shows Market Brawl, Homeground and Clean Getaway with replay counts and the honest limits; no horizontal scroll at 375 px |
| `game-ui.spec.cjs` | Playable `/game/index.html`: every HUD button, keyboard guide key and simulated standard gamepad action; writes `docs/controls-report.json`. Run with `E2E_BASE_URL=http://localhost:3142`; offline checks and broken-button proof instructions: `docs/controls.md` |
| `replay.spec.cjs` | Game badge, seed 634310 at `speed=8` (airborne at 13.8 s, end result vs recording), `at=` seek, controls |
| `responsive-a11y.spec.cjs` | 375x812 and 768x1024 overflow and tap targets, keyboard order and focus, labels, alt text, headings, contrast |
| `forms.spec.cjs` | Repro and Balance: empty, whitespace, 4001 chars, API validation, example; real calls behind `E2E_REAL=1` |

## Known failures (real app defects, not test bugs)

1. `/bugs` at 375 px scrolls sideways: the signature chip `crash:RuntimeError: unreachable in throwProp (props.js:303)` does not wrap (page is 480 px wide).
2. `/bugs` jumps from `h1` to `h3`: the bug cards have no `h2` above them.
3. `/game/replay.html` requests `/favicon.ico`, which returns 404 (a console error on every game load).

## Black-box explorer only

This suite serves only original `blackbox/fixtures` on `127.0.0.1:3193`; no Next server,
model calls, external games, or other port is needed. Run it by itself with one worker:

```bash
NODE_PATH=~/.local/lib/node_modules/@playwright/cli/node_modules \
  node ~/.local/lib/node_modules/@playwright/cli/node_modules/playwright/cli.js \
  test -c e2e/playwright.config.cjs blackbox.spec.cjs --workers=1 --headed
```

It covers the six original Square Courier scenarios, independently animated dead inputs (including animation starting during probes),
a single missing script, one WebGL initialization console error, and the arrow-only turn-based fixture.
The freeze fixture is static until input and has no moving marker. Animated dead inputs must
report controls as inconclusive; single critical failures must have low confidence.
Only this spec should be selected for fixture-only verification; the app/real-game specs above
are outside that scope. Offline verification is `node --test blackbox/*.test.mjs`.
No TypeScript is changed by these fixes, so the TypeScript check is skipped.
Browser launch/server availability must be reported separately from passing offline tests.
