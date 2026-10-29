# Bug hunt: fresh seeds, extreme tunings, fuzzing, abuse

2026-10-28. The first crowd run (`data/run-main/`, 2,831 rounds) found 4 clusters, and the same seeds were then
re-tested many times. This hunt used fresh ground only: new base seeds, extreme in-range tunings, input fuzzing,
a long soak, determinism across processes and the browser, API abuse with no model keys, and a production
performance pass. No Nebius or Tavily credit was spent. Output is under `.work/hunt/` (git-ignored).

## Summary

| # | Finding | Where | Severity | Status |
|---|---|---|---|---|
| H1 | **bug2 still happens on the shipped build.** After a throw, the thrown fighter keeps a stale floor contact, sinks 0.3 m and is ejected upward. Next to the wall, it rides the wall over the top. The same cause produces 25 of the 33 remaining `airborne` rounds (the open part of bug1). | `game/src/character.js` | High (visible, 1 in 2,500 rounds) | **Fix written, tested, behind `rules.grabReleaseFix`, default off** (see below) |
| H2 | **Mindless input wins every round.** Hold crouch, tap J at 6 Hz: 6 of 6 KOs in about 11 s. Hold every key and release one tick in three: 100 of 100 perfect KOs, all at exactly 9.9 s, whatever the seed or fighter. | `game/src/ai.js`, crouch attacks | High (balance) | Documented |
| H3 | **A knockdown can never end** when the fighter lands on a crate. `FALL` waits for `y < 1.08`, and a body resting on a crate sits at y = 1.23. That is also below the 1.3 `airborne` threshold, so only `stuck`/`softlock` fire. This is bug4's cause through a new route. | `game/src/ground.js:40` | Medium | Documented (bug4's patch is still unshipped) |
| H4 | **Balance range has a dead zone.** With every `anim.*.active` at its allowed minimum (25% of default), no strike ever lands. 1,500 rounds gave 0 strike hits and 76% softlocks. At 50% the game works normally. | `data/baseline-tuning.json` bounds, `applyTuning` | Medium (Balance mode can propose it) | Documented |
| H5 | 7 `oob` escapes under extreme tunings that the grab fix does not clear (mostly `max-reach-drive`). | tuning extremes | Low | Documented |
| H6 | First ever `clip` (bodies overlapping for 2 s), in 1 `all-min` round. | | Low | Documented |
| A1–A12 | API and replay-page abuse: 12 issues. The worst: a crafted `/replay?t=` token gets a 500, and a triage timeout returns 500. | `app/api/*`, `app/replay`, `lib/` | Low to Medium | Documented ([API abuse](#api-and-app-abuse)) |
| P1–P5 | Performance: `/replay?key=` loads 2.2 MB of game JS eagerly (mobile Lighthouse 82, TBT 572 ms). Every other page scores 94 or more. | `components/GameEmbed.tsx`, `public/game` | Medium | Documented ([Performance](#performance)) |

Held up: 65,000 crowd rounds, 500 fuzzed rounds and a 200-round soak, with **0 game crashes, 0 NaN, 0 crate
escapes**. Every cluster replays identically twice in fresh processes and matches its recording. 50 seeds hash
the same in 4 Node processes (2 of them in reverse order) and in Chrome.

## Engine and game

### Crowd runs

All 1000 personas from `data/run-main/personas.json`, `--noquit 1`, 5 rounds each: 65,000 rounds, 0 crashes.

| Run | Rounds | Bug rounds |
|---|---|---|
| shipped, base seeds 7 / 101 / 2027 / 31337 / 424242 | 25,000 | 37 (0.15%) |
| `zero-startup` (every startup at min) | 5,000 | 0 |
| `max-damage` | 5,000 | 0 |
| `tiny-posture` (posture damage min, knockdown load max) | 5,000 | 4 |
| `max-posture` (posture damage max, knockdown load min) | 5,000 | 12 |
| `max-reach-drive` | 5,000 | 34 |
| `slow-everything` (active, recovery, hitStop at max) | 5,000 | 9 |
| `all-min` (every key at its min) | 5,000 | 2,418 |
| `all-max` (every key at its max) | 5,000 | 7 |

The tuning files are in `.work/hunt/tunings/` and the tuning runs used base seed 55. Clusters use the same signature
rule as `engine/bugs.mjs`, via `.work/hunt/cluster.mjs`. "Twice" means the representative round was replayed in
two fresh processes with identical hash and bug events, and both match the recording.

| Signature | Rounds | Where | Representative (persona, round, seed, tuning) | Twice |
|---|---|---|---|---|
| `softlock` *(new)* | 2,222 | all-min 2,218, all-max 4 | p0064 r2 seed 941279 (all-max) | yes |
| `airborne` | 186 | shipped 33, max-reach-drive 26, all-min 109, others 18 | p0052 r4 seed 472576 (shipped) | yes |
| `airborne+softlock` *(new)* | 77 | all-min | p0011 r2 seed 168651 (all-min) | yes |
| `oob+airborne+softlock` | 13 | **shipped 2**, tunings 11 | p0653 r1 seed 777603 (shipped) | yes |
| `stuck:KNOCKDOWN+airborne+softlock` | 12 | shipped 2, tunings 10 | p0992 r2 seed 910550 (shipped) | yes |
| `oob+airborne` *(new)* | 8 | max-reach-drive 7, all-max 1 | p0002 r3 seed 352398 (all-max) | yes |
| `stuck:KNOCKDOWN+softlock` *(new)* | 2 | all-min | p0400 r1 seed 220410 (all-min) | yes |
| `clip+airborne+softlock` *(new)* | 1 | all-min | p0655 r4 seed 753207 (all-min) | yes |

### H1: stale contact after a grab (bug2 is back through a throw)

**Trace.** p0653, seed 777603, shipped build:
1. At 19.6 s the CPU grabs the player. While GRABBED, `character.js:109` places the player with `setTranslation` every tick.
2. At 20.1 s the player is thrown into the left wall. The crate there shatters.
3. From 21.30 to 21.45 s the player falls through the floor. y goes from 0.75 to 0.46 (resting height is 0.80). The ground contact pair exists but has **0 contact points**.
4. At 21.47 s contact points come back and the player is ejected upward at +3.4 m/s.
5. At 22.02 s, while walking back into the wall (blocking), the wall contact shows up at x = -9.78. A healthy body stops at -9.98, so this one overlaps the wall by 0.2 m. The solver then pushes the player up the wall at a steady +6 m/s, to y = 8.7. The result: `airborne` at 24.8 s, `oob` at 35.1 s, `softlock` for the rest of the round.

Walking or blocking into the wall without a grab never climbs; I tested it with the crate removed.

This is bug2's cause (2), the stale floor contact after a body was held still. The mount-release fix only
refreshes contacts in `releaseMount`, so a throw still reaches the same failure.

**Fix.** The same refresh as `mountReleaseFix` (`rb.sleep(); rb.wakeUp()`), in `updatePhysics` on the first update
after a fighter leaves GRABBED. It is behind `rules.grabReleaseFix`. Refreshing earlier, in `releaseGrapple` before
the throw's physics step, does **not** clear it; I tested that. `data/run-main/meta.json` has
`rules.grabReleaseFix: 0` so recorded rounds keep replaying as recorded, and `game/replay.html` counts the key as
"build as recorded".

| Crowd, 5,000 rounds each | Without the fix | With the fix |
|---|---|---|
| base seed 2027 | 9 bug rounds (1 oob) | 4 (0 oob) |
| base seed 424242 | 5 (1 oob) | 1 (0 oob) |
| base seed 8080 (fresh) | 8 (1 oob) | 1 (0 oob) |
| all 37 shipped-build bug rounds above, replayed | 37 | 10: 25 of 33 `airborne` and 2 of 2 `oob` cleared |
| 20 `oob` rounds from the tuning runs | 20 | 7 |

Win rate stays the same (0.308 vs 0.307 on seed 8080). Test: `engine/tests/hunt-grab-release.test.mjs` (both seeds
reproduce with the rule off and are clean with it on; the rule is inert in a round without a grab).

**Why it is off by default.** With the fix on, 4 existing engine tests fail, because they pin rounds that only
show bugs on the old physics. The fixture `airborne` rounds p0263 r1 and p0367 r2 in `helpers.makeFixtureRun`
(used by `bugs.test.mjs` and `cli.test.mjs`) are **cleared by this fix**. The mount-divergence seeds in
`sim-core.test.mjs` also change. This hunt may only add test files, so shipping it is one line plus re-pinning
those fixtures: set `grabReleaseFix: 1` in `game/src/tuning.js`, pick new fixture personas whose `airborne` survives,
then run `node scripts/sync-game.mjs`.

### H2: crouch-attack spam beats the CPU every time

`fuzz` mode `flicker` (all 12 keys held, all released one tick in three) won 100 of 100 rounds in the 500-round fuzz.
Every round ended at **9.9 s with the player at 100 HP**, whatever the seed (100 seeds) or fighter (kai or rook). That means the
CPU's seeded randomness never gets a turn. Smaller key sets (6 seeds each, `.work/hunt/flicker-period.mjs`):

| Held keys, released 1 tick in N | 20 Hz | 10 Hz | 6 Hz |
|---|---|---|---|
| all keys | 6/6 wins, 9.9 s | 6/6, 10.6–15.2 s | 6/6, 10.6–15.6 s |
| S + J (crouch + jab) | 6/6, 10.4 s | 6/6, 10.6–11.0 s | 6/6, 11.3 s |
| J + K + L + F (no crouch) | 1/6 | 0/6 | 1/6 |

So crouch plus a 6 Hz jab tap is enough, which a human can do. Mechanism, from the state trace
(`.work/hunt/flicker-trace.mjs`):
1. The player is almost always in STARTUP or ACTIVE, and in that case `decideRivalAction` only blocks or retreats.
2. The counters it does try while the player recovers (CROSS, ROUNDHOUSE) are high attacks that whiff over a crouching player.
3. BODY_JAB and BODY_HOOK chip through the block until posture breaks.
4. SWEEP knocks down, and the loop starts again after the 0.4 s wake-up invulnerability.

Fix direction (design, not small): when the player has been crouching for more than about 0.5 s, the CPU should
answer with low or crouching attacks or a throw. Alternatively, crouch attacks could give up their frame advantage on block.

### H3: knockdown on top of a crate never ends

Fuzz `taps` seed 7184 (kai): a BACK_KICK at 11.0 s knocks the player onto the left crate. The body comes to rest at
y = 1.23, falls asleep at 12.5 s and stays in `KNOCKDOWN:FALL` until the time limit. `updateGround` only moves
FALL to DOWNED when `y < 1.08`. Because 1.23 is under the `airborne` threshold (1.3), the crowd sees only
`stuck:KNOCKDOWN` (21.1 s) and `softlock`. The new `stuck:KNOCKDOWN+softlock` cluster (2 all-min rounds) is the same
cause. bug4's patch (drop the height guard) would fix it and is still unshipped. A narrower fix would be to also
allow FALL to end once the body is asleep, or after fallTime + 1 s.

### H4: the `active` minimum makes every strike whiff

| Every `anim.*.active` at | Rounds | Strike hits | Softlock rounds | Mean length |
|---|---|---|---|---|
| 25% of default (allowed min) | 1,500 | **0** | 1,133 | 81 s |
| 50% | 1,500 | 12,488 | 1 | 21 s |
| 75% | 1,500 | 11,042 | 0 | 12 s |

Only grapple strikes and ground strikes land. `applyTuning` rescales keyframes only for `recovery`, so a short
active window most likely closes before the striking limb is extended. This explains the `all-min` softlock
cluster; guard multiplier 0, minimum damage, minimum reach and minimum AI delay alone give 0 to 100 softlocks.
The Balance model may propose any value inside these bounds, so either raise the `active` minimums to about 50%
of default or scale the keyframes with `startup` and `active` too.

### H5, H6: leftover escapes and the first clip

The 7 tuning-run `oob` rounds that `grabReleaseFix` does not clear: 3 `max-reach-drive`, 1 `all-max`, 1 `all-min`,
1 `slow-everything`, plus one more. The 4× attack drive is the likely push. The single `clip+airborne+softlock`
round (p0655 r4, all-min) is the first `clip` any run has hit. Neither is triaged further.

### Other observations (not bugs on their own)

- Fighters fall at most 1.96 m/s (`setLinearDamping(5)` in `character.js:94`), so an airborne body takes seconds
  to come down. That stretches every launch into a long `airborne` event.
- The sim's own invariants never look at crates. My per-tick check (`engine/tests/hunt-lib.mjs`) watches fighter and crate
  position, health and posture bounds, and found nothing in 500 fuzzed rounds.

### Property tests, soak, determinism

New test files run small inside `npm test` and were run at full size for this hunt:

| Test | Full-size run | Result |
|---|---|---|
| `engine/tests/hunt-fuzz.test.mjs` | `HUNT_FUZZ_ROUNDS=500 HUNT_FUZZ_MAXT=99`, 5 shards of 100 | 500 rounds × 5 modes (random mask every tick, mash, hold all, flicker, taps): 0 crash, 0 NaN, 0 fighter or crate out of the arena, health and posture in bounds every tick. Bug events: 1 round (H3). |
| `engine/tests/hunt-soak.test.mjs` | `HUNT_SOAK_ROUNDS=200 HUNT_SOAK_MAXT=99 node --expose-gc` | 200 back-to-back rounds (policy, fuzz, all-max and all-min tunings mixed): canary hash identical before and after. Heap flat at 23–24 MB. RSS goes 261 MB to 460 MB within the first 25 rounds (WASM memory high-water mark) and stays at 460–461 MB. No growth, no WASM poisoning. |
| `engine/tests/hunt-determinism.test.mjs` | `HUNT_DET_SEEDS=50 HUNT_DET_MAXT=99` | 50 seeds (fresh base seed 2027): identical hashes in 4 processes, 2 of them in reverse order |
| `e2e/hunt-determinism.spec.cjs` | same, Chrome via Playwright | the same 50 seeds re-simulated in the browser with the replay page's three and Rapier builds: identical to Node. Run again after the `character.js` change: still identical. |
| `engine/tests/hunt-grab-release.test.mjs` | as is | H1 |

`npm test`: engine 116 pass, TS 183 pass, 0 fail. The `not ok` lines are existing `# TODO` markers. Run under the heavy
load from other sessions (load average 150 to 275), `verify-fix.test.mjs` failed 3 tests per run, a different 3 each
time; with no changes to engine or game files, that is timing, and it passed once load dropped.

## API and app abuse

Dev server with `NEBIUS_API_KEY=` and `TAVILY_API_KEY=` set empty. `@next/env` only fills undefined keys, so
`.env` cannot override them, and every model call stopped at the missing key. Inputs per route: 33 hostile ones
(malformed JSON, 1 and 10 MB bodies, wrong types, unicode, NUL and RTL characters, `__proto__` and
`constructor.prototype` keys) plus wrong methods. Every route answered 4xx, 502 or 503, with no stack traces or
paths, and no pollution afterwards. Already documented elsewhere and not repeated here: a refusal returns 502
instead of 422, and `x-forwarded-for` can be rotated.

| # | Issue | Severity | Suggested fix |
|---|---|---|---|
| A1 | `/replay?t=` with `persona.skill`, `bio` or `id` set to an object or array gives **500** ("Objects are not valid as a React child") | Medium | `decodeToken` should type-check every persona field the page renders |
| A2 | `/api/triage` returns **500** "Triage stopped before a verdict" when the replay hits its 30 s timeout (all 10 of a parallel burst on a loaded machine) | Medium | 504 via `TriageError`, never 500 |
| A3 | `/api/triage` with no key still runs the full replay (2 to 7.5 s of CPU) before its 503 | Low/Med | check the key first |
| A4 | No cap on concurrent triage replay processes (1 per request; many IPs means many processes; latency at 10 parallel went to 30 s or more) | Medium | at most about 2 at a time, 503 with Retry-After |
| A5 | `/api/repro`, `/balance`, `/eyes` with no key give 502 "try again in a minute" | Low | 503 "not configured", as precedent and triage do |
| A6 | One shared daily cap of 200 for all AI routes, and calls that spend nothing (503s, 502s, precedent with no key) count against it. 20 IPs × 10 calls lock every AI feature until midnight UTC | Medium | count only real model calls, and give precedent its own limiter |
| A7 | POST bodies have no size limit: a 200 MB body was parsed in full and the server grew to about 1.1 GB | Low on Vercel (4.5 MB cap), Med self-hosted | check `Content-Length` before `req.json()` |
| A8 | POST accepts `text/plain`, a CORS-simple request, so any website can make its visitors use up the cap | Low/Med | require `application/json` or check `Origin` |
| A9 | `/game/replay.html`: a persona with no `id`, null `rules` entries or null `inputs` entries crashes `start()` silently (blank canvas) | Low | share one validator with the server and catch errors from `start()` |
| A10 | Token tuning key `"rules.__proto__"` swaps `RULES`' prototype in the replay page, and resetting the tuning does not undo it | Low | `applyTuning` should accept only known keys with finite numbers |
| A11 | Tokens of 16 KB to 20 K chars get a raw 431 from Node's header limit before the 20,000-char check | Info | cap at about 8,000 |
| A12 | `null` JSON body on repro and balance says "Body must be JSON." | Info | `body?.[field]` |

Concurrency, 100 simultaneous POSTs per route at load average 190 to 275:

| Route | Statuses | p50 | p95 | Max |
|---|---|---|---|---|
| precedent | 503 × 100 | 317 ms | 649 ms | 676 ms |
| repro | 502 × 37, 429 × 63 (daily cap reached) | 368 ms | 626 ms | 653 ms |
| balance | 429 × 100 | 423 ms | 618 ms | 630 ms |
| eyes | 429 × 100 | 579 ms | 799 ms | 855 ms |
| triage | 429 × 100 | 659 ms | 1,109 ms | 1,126 ms |

Live triage with no key: from 1 IP, 12 parallel requests gave 10 replays and 2 × 429, so the per-IP limit holds.
From distinct IPs, 10 parallel requests took 7.5 s each and all returned 503. At most 10 replay processes ran at once, none were
left over, and no temp directories were left (they are only created after a model answer). Full notes are in the
shared session notes (`hunt-api-abuse.md`).

## Performance

Production build (`npm run build`, 3 to 5 s) served by `next start`. Lighthouse, desktop / mobile:

| Page | Score | LCP | TBT | TTI |
|---|---|---|---|---|
| `/` | 100 / 94 | 0.60 / 3.11 s | 0 / 42 ms | |
| `/bugs` | 100 / 98 | 0.57 / 2.48 s | 0 / 21 ms | |
| `/replay` | 100 / 97 | 0.56 / 2.66 s | 0 / 20 ms | |
| `/replay?key=p0537:1` | 100 / **82** | 0.55 / 2.65 s | 17 / **572 ms** | 0.55 / **4.6 s** |

CLS is 0 everywhere; warm TTFB is 10 to 50 ms. Bundle: `.next/static` is 624 KB raw / 192 KB gz, and each page loads about
140 KB gz of JS (react-dom 70 KB, router 44 KB). Fonts add 90 KB per page. Cold transfer is about 245 KB per page, 311 KB on `/`,
and **2.3 MB on `/replay?key=`**. `public/game` is 16 MB on disk.

Slow things, ranked:
1. **P1** `/replay?key=` loads 2.2 MB of game JS immediately: the iframe in `components/GameEmbed.tsx` sits below the fold with no lazy loading. Add `loading="lazy"` or a click-to-play poster.
2. **P2** Rapier ships its WASM inlined as text (`rapier.mjs` 4.34 MB, 1.61 MB gz). The non-compat build with a separate `.wasm` is 852 KB with brotli. Only switch after checking that browser hashes still match Node (`e2e/hunt-determinism.spec.cjs`).
3. **P3** Mobile LCP is 2.5 to 3.1 s on every page, mostly render delay: 7 font weights (90 KB) and about 150 ms of render-blocking CSS. Trim weights, or use `display: "optional"` for the hero font.
4. **P4** The replay renders at 60 fps forever, including when paused, after the end and when off-screen (`frame()` always calls `draw()`). Skip drawing when idle or hidden.
5. **P5** `scripts/sync-game.mjs:13` deploys the same 4.3 MB Rapier file twice (`rapier.es.js`), and three.js is not minified (about 205 KB to save).

Smaller: `/` inlines 64 full traces (239 KB of its HTML, `app/page.tsx:10`). `CrowdGrid` keeps animating off-screen
(about 30 ms of CPU per second). There are 13 KB of legacy polyfills because no `browserslist` is set. On the replay
page, WASM init takes 6 ms and the first frame comes after 469 to 755 ms; 8× playback holds 60 fps even with the CPU slowed 4×.

## Reproduce

```bash
node engine/crowd.mjs --personas data/run-main/personas.json --out .work/hunt/s2027 --seed 2027 --noquit 1 --traces 0
HUNT_FUZZ_ROUNDS=500 HUNT_FUZZ_MAXT=99 node --test engine/tests/hunt-fuzz.test.mjs
HUNT_SOAK_ROUNDS=200 HUNT_SOAK_MAXT=99 node --expose-gc --test engine/tests/hunt-soak.test.mjs
HUNT_DET_SEEDS=50 HUNT_DET_MAXT=99 node --test engine/tests/hunt-determinism.test.mjs
node --test engine/tests/hunt-grab-release.test.mjs
```

The browser determinism spec needs a server for `public/` (`npm run dev` or any static server) and the Playwright
command in `e2e/README.md`, with `-g` or the file name `hunt-determinism`.
