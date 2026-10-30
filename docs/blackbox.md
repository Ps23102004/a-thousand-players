# Black-box browser-game mode

Black-box mode operates an HTTP(S) browser page through visible startup controls, keyboard,
mouse, screenshots and browser events. It does not import game simulation code or inspect its
state. The seeded generator chooses inputs; it does not make the game deterministic or guarantee replay.

## Run

The CLI uses the installed global Playwright and headed system Google Chrome in a fresh context:

```bash
node blackbox/cli.mjs http://127.0.0.1:3193/game --seconds 60 --seed 1 --out reports/my-game
```

Supply a server serving your authorized test target. The fixture browser spec below starts its
own server. `PLAYWRIGHT_DIR` can override the default
`~/.local/lib/node_modules/@playwright/cli/node_modules/playwright`.
No model calls are made unless optional vision is requested. Use a separate output directory
per run: reports and trace overwrite existing files, and old screenshots may remain.

## Startup, recovery and cleanup

Up to three rounds click visible, enabled labels matching a whole word from
`start|play|new|continue|ok|accept|begin|resume|deploy|retry|launch|enter|go|got it`.
New Game and Continue as guest are eligible; New Game Plus and tested commerce/destructive
combinations are excluded. Tests include donate, shop, store, order, checkout, subscribe,
reset, start over, erase, wipe and delete, including combinations with play/start.
Hyphens and underscores are normalized. **This is a non-exhaustive label heuristic, not a
safety guarantee.** Labels do not establish what a button actually does.

Cross-origin/non-HTTP links and form actions, download attributes and new/named browsing
targets are skipped at startup. Same-origin navigation is allowed. Unexpected top-level
cross-origin departures record `navigation-away`. Before more input/capture, the explorer
returns to the original URL, repeats startup once and clicks a visible canvas for focus.
There are at most two restoration attempts per run; another departure or failed restoration
ends incomplete. Intercepted startup clicks record `click-intercepted`. Canvas clicks fall back
to the canvas centre, then keyboard-only mode if that fails. Dispatch errors are recorded as
failed inputs and `input-error` environment notes.

Alert, confirm and prompt dialogs are recorded and dismissed. Beforeunload is accepted while
an intentional navigation back to the start origin is in progress, otherwise dismissed.
Popups are recorded and closed; downloads are recorded and cancelled. Cleanup waits up to
100 ms for in-flight handlers, input releases and decoder closure. Cleanup-only popup/download
handlers remain until the game page closes or a subsequent exploration replaces them; they
never refocus the page. A decoder page created after timeout is closed on eventual resolution.
These actions cannot undo side effects or prevent all network traffic.

Every attempted keyboard/mouse down is tracked before awaiting it. On the start origin,
cleanup sends releases for all attempted downs, including those still pending; a down that
settles after cleanup receives another release if the page is still open on that origin.
Pending browser commands cannot be cancelled reliably. Releases are not sent to foreign pages.

## Budget and artifacts

The requested wall-clock budget includes setup, navigation, startup and probes. Reaching it
ends exploration; it does not itself mark a healthy capture/input operation incomplete.
In-flight work has a separate three-second stall bound after the budget. A command still
unresolved then produces `deadline-exceeded` and incomplete status. Cleanup has its own 100 ms
bound; report file I/O follows. Blocked Node execution/filesystem and process termination are
outside these bounds. Late cleanup does not mutate an already returned report.

Each run writes:

- `report.json`: status (`completed`, `crashed`, `incomplete`), findings/environment observations,
  startup clicks, probe differences, `expectedControlProbes`, `freezeAssessment`, restoration
  attempt count and frame paths.
- `inputs.json`: attempted inputs with elapsed milliseconds, key/button/position and sent/failed status.
- `frame-*.png`: initial, idle/control probe, periodic and (when time remains) final screenshots.

Periodic samples are scheduled at least five seconds after the preceding periodic sample
finishes capture/write, rather than catching up to a schedule anchored before capture/probes.
Frame timestamps describe sample capture completion. Probe/final frames remain evidence but do
not bound periodic diff intervals. `diffs`, `inputsSent` and `intervalActivity` align with the
initial/periodic frames. Screenshot pixels are resized to 64×36 RGBA in an isolated decoder page.
The largest visible canvas rectangle clipped to the viewport is sampled, or the whole viewport.

A browser crash, page close or top-level `about:blank` ends crashed. An uncaught error is recorded
while exploration continues. Automation errors end incomplete. Trace/report write errors are
returned in memory as incomplete; unwritable storage may prevent saving the report at all.
A browser-launch failure has no game evidence. The CLI's exit status reflects incomplete runs
or vision failure, not whether the report contains findings.

## Detectors

All findings are observations or suspicions, not proof of a game defect.

| Finding | Tested rule | Limitation |
| --- | --- | --- |
| `crash` | Browser crash, closed page, top-level `about:blank` | Intentional exits can resemble crashes |
| `page-error` | One uncaught page error, except recognized environment refusals | Gameplay may continue |
| `console-error` / `console-warning` | Two identical messages of the same kind; one counted finding | Repeated logs may be harmless |
| Single critical `console-error` | A non-environment error mentioning WebGL, context or initialization; `confidence: low` | Keyword heuristic; not proof of failure |
| `failed-request` | Repeated identical URL/message, or a single script/document/wasm/json failure (including .js/.mjs/.wasm/.json URL suffixes) | Single critical failures have `confidence: low`; optional assets can still be harmless |
| `blank` | Adjacent periodic samples both ≥99.5% near-black or near-white, with timestamps at least 5000 ms apart | Missing timestamps/short gaps do not qualify; slow loaders and intentional dark/bright scenes can still trigger it |
| `freeze` | Earlier pixel change (initial input response, idle animation or earlier periodic change), then two non-blank still intervals with delivered inputs, starting with a complete repeated probe set showing no response | The complete unchanged probe evidence carries through adjacent still intervals; no idle animation is required; inaccessible moves can still look frozen; animation can hide a freeze |
| `deadkeys` | A complete initial probe set has no visible response and the idle check found no animation | Unsupported controls, wrong click targets, focus or menus can explain it |

Near-black means every RGB channel ≤8; near-white means every channel ≥247. Still means
normalized mean absolute RGB difference ≤0.0001. Blank overrides freeze/deadkeys, and crash
suppresses derived visual/control findings. Sustained observations remain even after recovery.
`frozenIntervals` is only a raw trailing still-interval count, not a freeze finding.

Initial probes send W/A/S/D, all four arrows, Space, Enter and a mouse click: 11 in normal mode,
10 in keyboard-only fallback. The wander loop additionally rotates through Shift, R, E, 1–4
and Escape, with seeded holds/mouse positions. Still periodic intervals repeat the full available
probe set. `intervalActivity` is true on visible probe change, false for a complete unchanged
set and null for missing evidence. A complete unchanged set remains evidence through subsequent
still intervals even when the last repeat suite runs out of budget. Pixel change, a responding
probe, a blank endpoint or an interval without delivered inputs resets that evidence. A partial
set alone cannot start a freeze streak. Arrow/Space/Enter/mouse responses protect static/turn-based
games from a freeze finding. `freezeAssessment` is `suspected` for a detected freeze,
`inconclusive` when initial coverage or necessary interval probes are missing, otherwise
`not-observed`; it does not certify health.

`controls` is responsive only from an initial probe difference when the idle checks did not
change. Periodic differences never establish responsiveness. Idle is checked before controls and again after them when time remains. When idle animation is observed,
control response is inconclusive, even if input frames differ: animation alone cannot establish
response. A partial zero-response probe set is also inconclusive. These short idle checks are heuristics;
intermittent animation and screenshot timing can still confound attribution.

Specific pointer-lock, user-gesture/autoplay, fullscreen, permission-policy, CORS/offline policy
refusals and WebGL ReadPixels/software-rendering notices are counted under `environment`.
Programming errors, generic initialization failures, GPU resets and context loss are not hidden
as those refusals. A single ordinary warning/optional-resource error remains an observation.
If the last event before a freeze is an environment refusal, `likelyCause` names it as a
suspected cause. All browser events are retained. No findings means no observed signal.

## Verification and fixtures

Only original local fixtures are used for this change. Square Courier's normal/freeze variants
are static until input; the freeze variant has **no moving marker** and stops painting at 8 s.
Other flags produce blank pixels at 8 s, one uncaught error at 5 s, dead inputs, or `about:blank`
at 10 s. `animated-deadkeys` has independently moving pixels with ineffective inputs.
`delayed-animated-deadkeys` starts independent animation during the probes.
`single-request` loads one missing script; `single-console` emits one WebGL initialization error.
`turn-based-game.html` redraws only on arrow presses, with no idle animation.

Offline tests execute these actual scripts with a fake clock/rectangle rasterizer. Browser/API
fakes also test delayed downs, late pages/handlers, startup label/target exclusions, beforeunload
recovery, restoration/focus and the two-restoration cap, deadline capture completion, both probe
modes, missing evidence and elapsed sample timing. They do not verify actual Chrome rendering.
The original fake clock advanced only during sleeps, with zero screenshot/decoding cost; its
rectangle rasterizer samples pixel centers and omits grid strokes and browser resampling. Real
Chrome consumes budget capturing/decoding and can produce different periodic pixel differences.
`chrome-freeze-report.json` preserves the failed Chrome run's exact observations and timings;
the detector replay and fixture tests with 90 ms capture cost cover its truncated final probe
suite, alongside healthy, arrow-only, animated-dead-input and other planted-bug controls.

```bash
node --test blackbox/*.test.mjs

# Fixture server on 127.0.0.1:3193 only; no Next server or external game.
NODE_PATH=~/.local/lib/node_modules/@playwright/cli/node_modules \
  node ~/.local/lib/node_modules/@playwright/cli/node_modules/playwright/cli.js \
  test -c e2e/playwright.config.cjs blackbox.spec.cjs --workers=1 --headed
```

The browser spec selects only original fixtures and asserts exact planted finding kinds,
startup/input traces and real PNG artifacts. It also checks inconclusive animated controls,
low-confidence single failures and no false finding for arrow-only turns. No TypeScript files
are changed, so the TypeScript check is skipped. Browser/server launch outcomes are recorded
separately in the task summary; offline passes do not establish a browser pass.

## Optional vision and limits

`--vision` is opt-in and sends three chronological observation screenshots through `ai/models.ts`
`chat()` using its VL model. Set credentials in the shell through your normal setup; the CLI
does not open environment files. Fewer than three real observation frames makes no call.
The result is marked `secondOpinion: true`, not a proven glitch. Tests inject chat; no live
vision call is part of this fixture verification.

This is exploratory input, not competent play: there is no game-specific strategy, gamepad,
touch, login or CAPTCHA handling. Random clicks and R/Enter/Escape can confirm, restart or quit
regardless of label filtering. Use an authorized disposable test session. Pointer lock/fullscreen
and actual focus depend on the game and browser. Sampling misses brief/small glitches;
multiple canvases, hidden surfaces, animated overlays and intended loaders can confuse it.
No WebGL-only fixture establishes renderer/context diagnosis. Screenshot pixels cannot tell
intentional darkness from lost WebGL context. Seeds and traces cannot guarantee replay.
Screenshots, console text and URLs may contain private data; artifacts stay local unless vision
is requested, and are not automatically redacted.
