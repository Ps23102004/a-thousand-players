# Black-box browser-game mode

Black-box mode operates an HTTP(S) browser page through visible startup controls, keyboard,
mouse, screenshots and browser events. It does not import game simulation code or inspect its
state. The seeded generator chooses inputs; it does not make the game deterministic or guarantee replay.

## Run

The CLI uses the installed global Playwright and headed system Google Chrome in a fresh context:

```bash
node blackbox/cli.mjs http://127.0.0.1:3193/game --seconds 60 --seed 1 --out reports/my-game
```

CLI `--seconds` must be finite and between 1 and 3600 inclusive. Out-of-range values
produce a clear error before browser launch.

Supply a server serving your authorized test target. The fixture browser spec below starts its
own server. `PLAYWRIGHT_DIR` can override the default
`~/.local/lib/node_modules/@playwright/cli/node_modules/playwright`.
No model calls are made unless optional vision is requested. Use a separate output directory
per run: reports and trace overwrite existing files, and old screenshots may remain.

## Startup, recovery and cleanup

Up to eight startup rounds click visible, enabled labels matching a whole word from
`start|play|new|continue|ok|accept|begin|resume|deploy|retry|launch|enter|go|got it`.
New Game and Continue as guest are eligible; New Game Plus and tested commerce/destructive
combinations are excluded. Tests include donate, shop, store, order, checkout, subscribe,
reset, start over, erase, wipe and delete, including combinations with play/start.
Labels containing whole words `trial|premium|deposit|real money|bet|wager|forfeit|abandon|unlock|google|facebook|apple`
are also excluded. Start, Play, New Game, Continue and Play again remain eligible.
Hyphens and underscores are normalized. **This is a non-exhaustive label heuristic, not a
safety guarantee.** Labels do not establish what a button actually does.

The primary label rule (`isSafeStartLabel`) stays strict. After the normal sequence,
if idle checks show no animation and input probes show no pixel response, a separate
`isMenuWalkLabel` fallback can use the remaining rounds. It also considers anchors without
`href`, `[onclick]`, `[role=link]`, and `li`/`div` elements with computed `cursor:pointer`.
Fallback labels must be nonempty, contain a letter or number, and be at most 24 characters
after whitespace/hyphen/underscore normalization. They must pass the existing commerce and
destructive exclusions and exclude navigation/meta words: back, settings, options, shop,
garage, store, leaderboard, scores, achievements, credits, about, help, how to play, quit,
exit, sound, music, language, source, github, twitter, share, login/log in and register.
Start-like labels rank first, then mode/difficulty/level labels such as Endless, Campaign,
Story, Easy, Normal, Hard and Level 2; other short level names such as Loopy remain eligible
in DOM order. Each round re-queries at most 100 candidates and attempts at most one new
label. Case, whitespace, hyphen and underscore variants count as the same label, even after
a failed click. Initial and delayed menu progression share the eight-round budget and label
history. No eligible target ends the current sequence; later periodic checks may retry within
that same budget. The wall-clock budget can end progression sooner.

Fallback stops as soon as idle animation or input/periodic pixel changes have been observed.
Each successful fallback click refocuses the canvas and samples fresh idle/control probes
before another round. Earlier menu frames remain saved with `startup:` label prefixes;
control and periodic assessments restart from the new screen so menu probes do not mask
game responsiveness. `startupClicks` and `inputs.json` retain the attempted menu path and
sent/failed status. The existing strict resume and origin-restoration paths remain separate:
they can reuse a start/resume label when a running game pauses or the page is restored;
they never enable the broad menu-walk rule.

Cross-origin/non-HTTP links and form actions, download attributes and new/named browsing
targets are skipped at startup. Menu walk reuses `isSafeStartTarget` and additionally skips
any target/formtarget attribute, including empty or `_self` values. Inherited anchor
destinations, target and download attributes are checked for nested clickable elements.
The URL landed on after the first navigation establishes the
start origin and restoration URL, including HTTP-to-HTTPS and apex-to-www redirects.
Same-origin links on that landed host are allowed. Unexpected top-level
cross-origin departures record `navigation-away`. Before more input/capture, the explorer
returns to the landed URL, repeats startup once and clicks a visible canvas for focus.
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
suspected cause. Console and network events are ignored while the page is away from the
start origin; events attributed to a foreign page/frame are also ignored after restoration.
Request ownership uses the page/frame URL, so the game's cross-origin CDN failures remain
eligible. `net::ERR_ABORTED` during the explorer's restore navigation is ignored; game aborts
outside restoration and other failures on the start origin remain evidence.
Other browser events are retained. No findings means no observed signal.

## Verification and fixtures

Only original local fixtures are used for this change. Square Courier's normal/freeze variants
are static until input; the freeze variant has **no moving marker** and stops painting at 8 s.
Other flags produce blank pixels at 8 s, one uncaught error at 5 s, dead inputs, or `about:blank`
at 10 s. `animated-deadkeys` has independently moving pixels with ineffective inputs.
`delayed-animated-deadkeys` starts independent animation during the probes.
`single-request` loads one missing script; `single-console` emits one WebGL initialization error.
`turn-based-game.html` redraws only on arrow presses, with no idle animation.
`multi-menu-game.html` requires Play → Endless → Easy, using a role link and a
pointer-styled list item, before showing an animated canvas. `level-list-game.html` presents
Loopy/Backtrack/Dash as anchors without `href`, then shows a canvas that redraws on keys.
Both are original fixtures; the browser cases assert the full startup path, visible game,
game-region PNGs, fresh control probes and absence of `not-started`.

Offline tests execute the Square Courier and arrow-only scripts with a fake clock/rectangle rasterizer. Browser/API
fakes also test delayed downs, late pages/handlers, startup label/target exclusions, beforeunload
recovery, restoration/focus and the two-restoration cap, deadline capture completion, both probe
modes, missing evidence and elapsed sample timing. They do not verify actual Chrome rendering.
Regression fakes cover redirected startup origins and landed-host links/restoration, foreign
console/network events, restore aborts versus game failures, the additional label exclusions,
and CLI budget bounds.
Menu-walk tests cover allowed/blocked labels, fresh DOM queries, preference order, no
repeated normalized label, the shared eight-round cap, hidden/disabled choices, target and
download attributes, inherited foreign destinations, pointer/onclick eligibility and
stopping on animation or input response. These offline DOM/clock fakes do not replace the
real-Chrome fixture cases.
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
Canvas-drawn menus with no DOM clickable element are still not operable by menu walk;
there is no OCR, coordinate-based menu recognition or game-specific key sequence. Animated
menus can look like gameplay and disable fallback. Menus requiring the same label twice,
labels longer than 24 characters, more than eight choices, or a late choice beyond the first
100 candidates can remain unfinished. A click in `startupClicks` records an action, not proof
of gameplay. Script handlers can navigate or perform hidden side effects despite safe-looking
labels and destinations; these heuristics cannot establish what arbitrary handlers do.
No WebGL-only fixture establishes renderer/context diagnosis. Screenshot pixels cannot tell
intentional darkness from lost WebGL context. Seeds and traces cannot guarantee replay.
Screenshots, console text and URLs may contain private data; artifacts stay local unless vision
is requested, and are not automatically redacted.

## Real open-source games: final run (2026-10-30, explorer commit 55be90f)

Five open-source browser games, 60 seconds each, seed 1. Results were checked against each game's screenshots, not only the report.

| Game | What the explorer actually did (from screenshots) | Result |
|---|---|---|
| agentofduty | Pressed Resume, started the mission, took damage. | No findings. The earlier freeze was the game's own pause screen, now handled. |
| animal-strike | Pressed PLAY and played. | No findings. Pointer-lock refusals are filed as browser limits, not game bugs. |
| hexapipes | Pressed Play but stayed on the puzzle-picker page; no puzzle solved. | No findings. Partly tested only. |
| warzone | Pressed PLAY, ENDLESS and CONTINUE: menus only, no combat. | No findings. Not really played. |
| canvas-td | Stayed on its level-select screen. Read-only source inspection later confirmed DOM anchors without `href` for Loopy, Backtrack and Dash (`index.html:30–32`, click binding in `scripts/ui.js:358`). | "Not started": not tested in that run. |

The explorer found no game defect in these five, and it did not play four of them through.
This is a weak result and must not be presented as a clean bill of health for those games.

Read-only follow-up on the saved Warzone inputs, report, PNGs and source: PLAY, the long
ENDLESS description and CONTINUE were sent at roughly 13 seconds. `src/screens.js:574`
wires CONTINUE to character selection; the next control is `#deployBtn` (DEPLOY ▶).
`src/main.js:3264` advances it to loadout, where `#loadout-deploy` (also DEPLOY ▶) starts
the run through `src/screens.js:571`. The old three-round sequence exhausted its rounds
before the first DEPLOY. Later screenshots show SHOP and the main menu, not combat;
the input trace also sends Escape at 16.338 s after CONTINUE, and the game's menu Escape
handler walks back up the stack (`src/main.js:3171–3176`).
`animationEvidence: true` is consistent with animated menus, not proof of a run. Eight
primary rounds can reach the first DEPLOY, but the no-repeat label rule still prevents
the second identically labelled DEPLOY. Animated menus can also suppress broad fallback.
This change does not claim Warzone combat was reached.

Canvas TD's choices are covered by the new DOM menu-walk fixture. Neither real game was
executed for this change; the historical results above remain unchanged. The lead runs the
real-Chrome fixture spec separately from offline verification.

The first run's false positives (agentofduty freeze, canvas-td deadkeys) are fixed and covered by tests on local fixtures.
