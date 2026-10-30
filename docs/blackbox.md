# Black-box browser-game mode

Source mode imports a game's simulation, controls its seed, and verifies bugs by exact replay.
Black-box mode accepts an HTTP(S) URL and operates the browser like a person: visible buttons,
keyboard, mouse, screenshots, console/page errors, and request failures. It never imports the
unknown game's logic or reads its simulation state. Screenshots and a timestamped input trace
are the evidence; a seeded input generator does **not** make the game deterministic.

## Run

Use the existing global Playwright installation and system Google Chrome, with a visible desktop:

```bash
npm run blackbox -- http://localhost:3000/game --seconds 60 --seed 1 --out reports/my-game
# Equivalent:
node blackbox/cli.mjs http://localhost:3000/game --seconds 60 --seed 1 --out reports/my-game
```

`PLAYWRIGHT_DIR` can override the default
`~/.local/lib/node_modules/@playwright/cli/node_modules/playwright`. No new dependency, Next page,
API route, or hosted function is added. A new browser context is used, without your existing login.
Use a separate output directory per run; reusing it overwrites the report/trace and may leave old PNGs.
Only HTTP(S) targets are accepted by the CLI. The default run makes no model call.

The runner clicks up to three visible, enabled buttons/links matching a whole word from
`start|play|new|continue|ok|accept|begin|resume|deploy|retry|launch|enter|go|got it|close`
(case-insensitive), records the text of each click,
then clicks a visible canvas to request focus / trigger the game's pointer-lock handler.
Labels containing restart, quit, exit, reset, delete, new game (including new game+), buy,
purchase, sign in, log in, download or share are excluded even if they also contain a start word.
Plain new remains eligible. Intercepted clicks record `click-intercepted` and continue;
an intercepted canvas click falls back to a mouse click at its centre. If that fails too,
exploration continues with keyboard input only.
It probes W/A/S/D individually, then rotates through W/A/S/D, Space, Shift, R, E, 1–4,
Enter, Escape and all four arrow keys. Seeded randomness varies hold durations and mouse positions;
mouse moves and left-button down/up events are recorded too. These are actual Playwright inputs,
not synthetic DOM keyboard events. The exploration budget begins after startup clicks.

Each run writes:

- `report.json`: status (`completed`, `crashed`, or `incomplete`), observations, findings,
  environment refusals with counts, startup clicks, input counts, probe/frame differences and screenshot paths.
- `inputs.json`: each attempted input with milliseconds since run start, type, key/button/position,
  and `sent` or `failed` status. Key-down and key-up timestamps describe the hold duration.
- `frame-*.png`: sampled canvas (or viewport fallback) screenshots initially and about every five seconds, plus initial
  movement probes and a final frame when the page survives. The report identifies each frame.

A page crash, page close, or top-level navigation to `about:blank` stops exploration early.
An uncaught JavaScript error is recorded as a page error and exploration continues, since many
such errors leave the game running. Automation/load failures produce `incomplete` with an
`explorer-error` observation; they are not silently classified as game crashes. Partial evidence
is written when these failures are caught. A browser-launch failure has no game evidence.
The CLI exits nonzero on an incomplete run or failed vision request; findings are in the report,
not encoded as the exit status.

## Detectors

PNG pixels are decoded in an isolated blank browser page. The detector sample is the largest visible
canvas's on-screen rectangle, or the viewport when there is no visible canvas. Each sample is
resized to 64×36 RGBA; the functions in `blackbox/detectors.mjs` are pure. Screenshot files contain
the sampled region, clipped to the viewport. No PNG decoding library is added.

| Finding | Evidence / decision | Caveat |
| --- | --- | --- |
| `crash` | Browser page crash, closed game tab, or top-level `about:blank` navigation | Intentional exit/navigation can look like a crash; other navigation is not classified |
| `console-error` | Browser console error text and timestamp | Logging an error does not necessarily break gameplay |
| `page-error` | Uncaught page error text and timestamp | The game may recover or keep working |
| `failed-request` | Network request failure, or HTTP status ≥400, with URL and timestamp | Ads, telemetry and optional resources can fail harmlessly |
| `blank` | Two consecutive five-second samples have ≥99.5% near-black or near-white pixels (all RGB ≤8 or ≥247) | Loading screens and intended fades can be flagged; colored blank screens may be missed |
| `freeze` | At least two non-blank still intervals despite inputs, after earlier visual response/motion | Still means normalized mean absolute RGB difference ≤0.0001; static gameplay can be flagged, animated overlays can hide a freeze |
| `deadkeys` | All four initial movement probes have no visible pixel response | A suspicion, not proof: unsupported bindings, focus, menus, slow loading or a wall can explain it |
| Optional vision | Super-VL describes three real chronological screenshots | Separate second opinion, never an automatic proven glitch |

Crash suppresses derived blank/freeze/deadkeys findings. Blank takes precedence over freeze and
unresponsive controls; earlier observed response distinguishes a later freeze from initial deadkeys.
Sustained blank/freeze observations are retained even if the game later recovers. Independent console/page/request observations are retained. No findings means **no observed signal**,
not proof the game works. Detection thresholds are calibrated only against the tiny fixture below.

Pointer-lock, user-gesture and fullscreen refusals, and WebGL context driver warnings, are
classified under `report.environment` with a kind, message and count instead of game findings.
Other script errors remain findings. A freeze is still reported when preceded by an environment
refusal; if the last event before the freeze observation is such a refusal, its kind is added as
`likelyCause` (for example, `"pointer-lock-refused"`). This is a suspected cause, not proof.

## Run on three real open-source games (2026-10-30)

- **animal-strike:** played and responded; automation refused pointer lock. No game defect was shown.
- **agentofduty:** paused itself on pointer-lock failure, and the explorer was stuck on its Resume button before this fix.
- **warzone:** aborted on an intercepted canvas click before this fix.

These are weaknesses of the explorer found by real use. Re-run results will be added by the lead.

## Optional vision

`--vision` is explicitly opt-in and makes one call to `ai/models.ts` `chat()` using its `VL`
(Super-VL) model. Export `NEBIUS_API_KEY` in the shell through your normal credential setup;
this CLI never opens an environment file. It sends the first, middle and last observation screenshot
(excluding movement probes). Fewer than three real frames yields `insufficient-frames` with no call.
The text goes under `report.vision`, marked `secondOpinion: true`; failures are reported there.
Unit tests inject a fake `chat` and make no model/network calls. No live vision call was made while
implementing this feature.

## Verification and fixture

`blackbox/fixtures/bugged-game.html` is an original canvas game, Square Courier. Click Start and
move its square with WASD/arrows. `?bug=none|freeze|blank|error|deadkeys|crash` plants one fault:
freeze/blank at 8 seconds, uncaught error at 5 seconds, ineffective movement, or `about:blank` at
10 seconds. `none` has no planted bug. Tests use only the explorer's public observations.

```bash
node --test blackbox/*.test.mjs
npm test
npx tsc --noEmit -p .
node scripts/check-recorded-replays.mjs
npm run engine:test

# Self-contained fixture server on 127.0.0.1:3181; no Next server or baseURL required.
# Run outside a port/browser-restricted sandbox. --headed keeps the visible-window requirement.
NODE_PATH=~/.local/lib/node_modules/@playwright/cli/node_modules \
  node ~/.local/lib/node_modules/@playwright/cli/node_modules/playwright/cli.js \
  test -c e2e/playwright.config.cjs blackbox.spec.cjs --workers=1 --headed
```

The browser spec asserts **exactly** the planted finding type for each flag and no finding for
`none`, plus startup clicks, inputs, and real PNG artifacts. It takes roughly two minutes.
It has not passed in this sandbox: binding `127.0.0.1:3181` fails with `EPERM`, before game exploration.
The lead must run it outside the sandbox. Passing offline fake tests does not verify real browser
behavior or detection accuracy on arbitrary games.

## Limits

- **No seed replay.** The seed chooses exploratory inputs only. There is no guaranteed replay,
  simulation hash, invariant proof, or exact bug reproduction. Results can differ between runs
  because the game's clock, RNG, network, browser scheduling and input timing are uncontrolled.
- **Needs a visible window.** The CLI launches headed Chrome. It is a local desktop tool, not
  a Vercel function, remote game-streaming service, or in-game agent. Keep the game tab focused.
- **Cannot see inside native games.** It handles browser URLs only. A native game's streamed
  browser view exposes pixels and browser inputs only, not the native engine or native crash state.
- **Vision is a second opinion.** It can miss glitches or invent one; it cannot establish a cause,
  verify a fix, or guarantee a finding. Only an opt-in run sends screenshots to the configured model.
- **Not competent play.** It has a fixed exploratory key set, no game-specific strategy, gamepad,
  touch gestures, login, CAPTCHA solving, menu understanding or automatic consent interpretation.
  It may click an unwanted action matching the startup words; use a disposable test game/session.
- Sampling misses short glitches and small changes. Screens outside the viewport, hidden canvases,
  multiple game surfaces, cross-origin overlays, menus and animations can confuse the heuristics.
  Pointer lock/fullscreen depend on the game's handlers and browser permissions; a canvas click
  cannot guarantee either. Initial movement probes cannot prove a particular control is broken.
- A loading delay or intended static screen can trigger a false alarm. A frozen game behind an
  animated HUD may be missed. A completely hung browser/renderer may block observation or final
  output; the runner is not an external watchdog. Abrupt process termination may lose the trace.
- Screenshots, console text and request URLs may contain private session data. Outputs stay local
  unless `--vision` is requested; review artifacts before sharing them. No automatic redaction.
