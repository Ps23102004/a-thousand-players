# Bug hunt: fresh seeds, extreme tunings, fuzzing, abuse

2026-10-28. The first crowd run (`data/run-main/`, 2,831 rounds) found 4 clusters, and the same seeds were then
re-tested many times. This hunt used fresh ground only: new base seeds, extreme in-range tunings, input fuzzing,
a long soak, determinism across processes and the browser, API abuse with no model keys, and a production
performance pass. No Nebius or Tavily credit was spent. Output is under `.work/hunt/` (git-ignored).

## Summary

| # | Finding | Where | Severity | Status |
|---|---|---|---|---|
| H1 | **bug2 still happens on the shipped build.** After a throw, the thrown fighter keeps a stale floor contact, sinks 0.3 m and is ejected upward. Next to the wall, it rides the wall over the top. The same cause produces 25 of the 33 remaining `airborne` rounds (the open part of bug1). | `game/src/character.js` | High (visible, 1 in 2,500 rounds) | **Fixed, on by default** (`rules.grabReleaseFix: 1`; test fixtures re-pinned, see below) |
| H2 | **Mindless input wins every round.** Hold crouch, tap J at 6 Hz: 6 of 6 KOs in about 11 s. Hold every key and release one tick in three: 100 of 100 perfect KOs, all at exactly 9.9 s, whatever the seed or fighter. | `game/src/ai.js`, crouch attacks | High (balance) | Balance rule `rules.cpuLowBlock`, **on by default** ([numbers](#h2-crouch-attack-spam-beats-the-cpu-every-time)) |
| H3 | **A knockdown can never end** when the fighter lands on a crate. `FALL` waits for `y < 1.08`, and a body resting on a crate sits at y = 1.23. That is also below the 1.3 `airborne` threshold, so only `stuck`/`softlock` fire. This is bug4's cause through a new route. | `game/src/ground.js:40` | Medium | **Fixed, on by default** (`rules.knockdownOnPropFix: 1`; the height guard stays) |
| H4 | **Balance range has a dead zone.** With every `anim.*.active` at its allowed minimum (25% of default), no strike ever lands. 1,500 rounds gave 0 strike hits and 76% softlocks. At 50% the game works normally. | `data/baseline-tuning.json` bounds, `applyTuning` | Medium (Balance mode can propose it) | **Fixed** (raised minimums, plus a 2-tick window guard in `applyTuning`) |
| H5 | 7 `oob` escapes under extreme tunings that the grab fix does not clear (mostly `max-reach-drive`). | tuning extremes | Low | Documented |
| H6 | First ever `clip` (bodies overlapping for 2 s), in 1 `all-min` round. | | Low | Documented |
| A1–A12 | API and replay-page abuse: 12 issues. The worst: a crafted `/replay?t=` token gets a 500, and a triage timeout returns 500. | `app/api/*`, `app/replay`, `lib/` | Low to Medium | Fixed and tested; A10's engine half is `applyTuning` ([API abuse](#api-and-app-abuse)) |
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

**Now on by default.** `rules.grabReleaseFix` is 1 in `game/src/tuning.js`; `data/run-main/meta.json` keeps it at 0 for the
recorded rounds (45 of 45 sampled recorded rounds, including the sweep-nerf crash rounds, still replay event for event). The fix cleared the
test fixtures that pinned pre-fix rounds, so they were re-pinned: a 1,000-persona crowd at base seed 1 has **0** bug rounds with the fix on
(3,019 rounds), so `helpers.makeFixtureRun` now runs base seed 2, where p0609 r3 and p0686 r1 still go `airborne` (personas 47, 609, 686).
The `sim-core.test.mjs` mount-divergence case p0023 seed 799 no longer diverges and became p0029 seed 884 (rook). `engine/verify-fix.mjs`
takes `--seed` so its regression crowd plays the same base seed as the run it compares with.

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

**Shipped balance change, on by default.** `rules.cpuLowBlock` (default 1; recorded rounds explicitly pin 0, preserving the original random
sequence) is a probability p. With p > 0: when the CPU blocks a crouch attack (BODY_JAB, BODY_HOOK, SWEEP) it crouch-blocks with
probability p, and while a crouching player recovers it answers with SWEEP instead of CROSS or ROUNDHOUSE with probability p.
Crouch-blocking alone changes nothing (the CPU's standing block already stops body jabs; it loses because its high counters whiff),
so the low answer is what breaks the loop. 1,000 seeds per exploit, 5,000 crowd rounds per setting (all 1,000 personas, base seed 8080,
`--noquit 1`):

| `rules.cpuLowBlock` | S+J at 6 Hz: player wins (perfect) | All keys, released 1 tick in 3 | Persona crowd win rate | Crowd bug rounds |
|---|---|---|---|---|
| 0 (recorded CPU) | 100% (995 at 100 HP) | 100% (1,000) | 30.7% | 1 |
| 0.5 | 59.1% (87) | 88.9% (62) | 28.1% | 1 |
| 1 (shipped) | **0.4%** (0) | 47.7% (0) | 24.9% | 1 |
| 1, crouch-block only (no low answer, scratch copy) | 100% (994) | 100% (1,000) | | |

In this earlier 1,000-seed sample, at 1 the crouch-jab exploit nearly disappears and all-keys flicker is cut in half, but casual players lose 6 more rounds in 100. The lead has now shipped 1 as a balance change. The later 100-seed decision sweep found crouch-jab wins 100/100 → 0/100, all-keys wins 100/100 → 40/100, casual wins unchanged at 5/39, and crowd win rate 31.0% → 23.5%; see [the decision](cpu-lowblock.md#decision). Test: `engine/tests/hunt-cpu-low-block.test.mjs`. Harness:
`.work/h2-exploit.mjs`.

### H3: knockdown on top of a crate never ends

Fuzz `taps` seed 7184 (kai): a BACK_KICK at 11.0 s knocks the player onto the left crate. The body comes to rest at
y = 1.23, falls asleep at 12.5 s and stays in `KNOCKDOWN:FALL` until the time limit. `updateGround` only moves
FALL to DOWNED when `y < 1.08`. Because 1.23 is under the `airborne` threshold (1.3), the crowd sees only
`stuck:KNOCKDOWN` (21.1 s) and `softlock`. The new `stuck:KNOCKDOWN+softlock` cluster (2 all-min rounds) is the same
cause. bug4's patch (drop the height guard) would fix it and is still unshipped. A narrower fix would be to also
allow FALL to end once the body is asleep, or after fallTime + 1 s.

**Fixed, narrow version.** `rules.knockdownOnPropFix` (default 1) also ends FALL once the body is asleep, i.e. at rest; the
`y < 1.08` guard stays for everything else, and a time-based end was rejected because a body still falling would freeze mid-air
in DOWNED. bug4's representative round (p0653 r2, seed 529060) with the rule off: knocked onto the left crate at 15.87 s, rests at
y = 1.395, `airborne` 18.5 s, `stuck:KNOCKDOWN` 26 s, `softlock` 41 s, time-out loss. With it on: DOWNED at 17.25 s, the CPU mounts,
the player gets up, and the round ends by KO at 18.9 s with no bug events. `data/run-main/meta.json` records the run with the rule at 0.
Test: `engine/tests/hunt-knockdown-prop.test.mjs` (also checks a round whose knockdowns land on the floor is unchanged).

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

**Fixed.** The real cause is simpler: `active` is the **end** of the hit window (`animation.js`: `startup <= animTime < active`),
so any `active` at or below `startup` leaves no window at all. 25% of default does that to every move, and so does `startup` near its
own maximum at the default `active` (JAB: startup max 0.24 > active 0.14). Balance clamps each key on its own, so bounds alone cannot
stop the second case. Two changes:
1. Every `anim.*.active` minimum is now halfway between the default startup and the default active (JAB 0.035 to 0.10, BACK_KICK 0.1 to 0.355).
2. `applyTuning` keeps at least 2 ticks of window (`active >= startup + 2/60`). No-op on the shipped game and on `sweep-nerf` (window 0.04 s).

Every `active` (or `startup`) at the given edge, everything else default, 300 rounds each (`.work/h4.mjs`):

| Tuning | Strike hits before | Strike hits after | Softlock rounds after | Mean length after |
|---|---|---|---|---|
| shipped | 2,091 | 2,091 | 1 | 11.9 s |
| active 25% of default (old min) | 0 | 2,120 | 1 | 12.0 s |
| active at the new min | | 2,119 | 1 | 12.1 s |
| startup at max | 0 (35 of 60 softlock) | 1,634 | 15 | 31.7 s |
| startup max + active new min | 0 (36 of 60 softlock) | 1,634 | 15 | 31.7 s |

Test: `engine/tests/hunt-tuning-range.test.mjs` (bounds, the guard, and five range corners: strikes land, at most 1 in 4 rounds softlocks).

### Random-input baseline (roast fix 14)

Does a crowd of personas find more than mashing keys does? `node engine/fuzz-baseline.mjs --rounds 2000` plays rounds whose input
ignores the game (the `engine/tests/hunt-lib.mjs` fuzzers), base seed 60000, kai and rook alternating:

| Input | Shipped build (all fixes on) | Build as recorded (`recordedWith` rules at 0) |
|---|---|---|
| random key mask every tick, 2,000 rounds | 0 bug rounds per 1,000 | 0 per 1,000 |
| single-key taps, 2,000 rounds | 0 | 0 |
| attack mash while walking, 2,000 rounds | 0 | 0 |
| **persona crowd**, 5,000 rounds (base seed 8080) | **0.2 per 1,000** (1 round) | **2.8 per 1,000** (14 of 4,996) |

Random input found nothing in 6,000 rounds on either build, while the persona crowd found 14 bug rounds on the recorded build. The bugs
need play that reacts to the game (grabs, throws into walls, knockdowns next to crates), which random input almost never produces.

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

| # | Issue | Severity | Status and test |
|---|---|---|---|
| A1 | `/replay?t=` with `persona.skill`, `bio` or `id` set to an object or array gives **500** ("Objects are not valid as a React child") | Medium | **Fixed.** `isReplayToken` in `lib/replay-token.ts` type-checks every persona, rule, input and tuning field; `/replay` shows "This replay link is not valid." Tests: `A1: persona fields the page renders must be strings or numbers` (`lib/replay-token.test.ts`), `/replay with A1 ...` (`e2e/token-abuse.spec.cjs`) |
| A2 | `/api/triage` returns **500** "Triage stopped before a verdict" when the replay hits its 30 s timeout (all 10 of a parallel burst on a loaded machine) | Medium | **Fixed.** A replay timeout is `TriageError` 504 ("the server is busy, no model was called"). Test: `A2: a replay that hits its timeout becomes TriageError 504` (`lib/triage-live.test.ts`) |
| A3 | `/api/triage` with no key still runs the full replay (2 to 7.5 s of CPU) before its 503 | Low/Med | **Fixed.** The key is checked before the round lookup and any replay. Test: `A3: with no NEBIUS_API_KEY the route answers 503 'not configured' at once` (`app/api/triage.test.ts`) |
| A4 | No cap on concurrent triage replay processes (1 per request; many IPs means many processes; latency at 10 parallel went to 30 s or more) | Medium | **Fixed.** `liveSlot()` allows 2 live triages per instance; the third gets 503 with `Retry-After: 30`. Test: `A4: at most 2 live triages run at once per instance` (`app/api/triage.test.ts`) |
| A5 | `/api/repro`, `/balance`, `/eyes` with no key give 502 "try again in a minute" | Low | **Fixed.** 503 "not configured" before the limiter. Test: `A5: repro, balance and eyes return 503 'not configured'` (`app/api/routes.test.ts`) |
| A6 | One shared daily cap of 200 for all AI routes, and calls that spend nothing (503s, 502s, precedent with no key) count against it. 20 IPs × 10 calls lock every AI feature until midnight UTC | Medium | **Fixed.** Each route has its own daily cap (repro 80, balance 40, eyes 40, triage 40, precedent 100); key checks run before the limiter and only a call refused before any work (missing key, triage busy, a round with no bug event) gives its unit back. A security review showed that refunding on error text (the old 501 "not implemented" branch) or after a replay ran could be abused to get free calls or free CPU, so neither is refunded (tests: `security: a failure whose message says 'not implemented' is never refunded` and `only an error that cost nothing is refundable`). The built-in examples for triage (p0537 round 1), Eyes (p0537 round 1, default question) and precedent are served from recordings in `data/samples/` when refused. Tests: `A6: calls that never reach a model ... do not use the caller's limit`, `A6 / roast 7: each route has its own daily cap` (`app/api/routes.test.ts`), `A6: with no TAVILY_API_KEY ...` (`app/api/precedent.test.ts`), the three `roast 7:` sample tests |
| A7 | POST bodies have no size limit: a 200 MB body was parsed in full and the server grew to about 1.1 GB | Low on Vercel (4.5 MB cap), Med self-hosted | **Fixed.** `readJson` refuses bodies over 64 KB by `Content-Length` and by bytes read (Eyes: 1.1 MB, for 3 frames). Test: `A7: bodies over 64 KB are refused with 413` (`app/api/routes.test.ts`) |
| A8 | POST accepts `text/plain`, a CORS-simple request, so any website can make its visitors use up the cap | Low/Med | **Fixed.** 415 unless `Content-Type: application/json`. Test: `A8: a body that is not content-type application/json gets 415` (`app/api/routes.test.ts`) |
| A9 | `/game/replay.html`: a persona with no `id`, null `rules` entries or null `inputs` entries crashes `start()` silently (blank canvas) | Low | **Fixed.** `game/replay.html` runs the same checks as `isReplayToken` and catches errors from `start()`, showing a message. Tests: `A9: a persona with no id, null or non-object rules ...` (`lib/replay-token.test.ts`), `A9: game/replay.html with a ...` (`e2e/token-abuse.spec.cjs`) |
| A10 | Token tuning key `"rules.__proto__"` swaps `RULES`' prototype in the replay page, and resetting the tuning does not undo it | Low | **Token side fixed** (`applyTuning` is the engine's): tokens with tuning keys outside `data/baseline-tuning.json` or `rules.<name>`, or non-finite values, are refused. Test: `A10: tuning keys must be in data/baseline-tuning.json or rules.<name>` (`lib/replay-token.test.ts`). **Engine side fixed too**: `applyTuning` applies only keys in `data/baseline-tuning.json` or rules `RULES` already has, with finite numbers, and ignores `__proto__`, `constructor` and the like (`engine/tests/apply-tuning.test.mjs`) |
| A11 | Tokens of 16 KB to 20 K chars get a raw 431 from Node's header limit before the 20,000-char check | Info | **Fixed.** Cap is 8,000 chars (shipped links are under 1,000), so 8 K to 16 K gets the invalid-link page; over 16 KB Node still answers 431 before the app runs. Test: `A11: size cap is 8000 characters` (`lib/replay-token.test.ts`, `e2e/token-abuse.spec.cjs`) |
| A12 | `null` JSON body on repro and balance says "Body must be JSON." | Info | **Fixed.** "Body must be a JSON object." Test: `A12: a JSON null, array or number body is refused` (`app/api/routes.test.ts`) |

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

### Getup beside a crate (2026-10-29)

The full 29-round proof replay found one remaining shipped-game failure: p0094 round 1, seed 501070,
`data/patches/sweep-nerf.json`, fighter selected by `fighterFor`. The rival leaves DOWNED at 18.75 s beside
the right crate. DOWNED resets velocity each tick; when GETUP stops doing that, stale floor contacts let
the body sink from y=0.80 to 0.78 before the solver ejects it upward at about 7.6 m/s. It stays above
y=1.3 long enough to emit `[21.5, 'airborne', 1]`. GETUP does not teleport the body into the crate.

`rules.getupCrateFix` (default 1) refreshes contacts with `sleep(); wakeUp()` once when starting a getup
within 1.5 m of an intact prop. This is the existing mount/grab workaround applied to the remaining
transition; getups away from props retain their previous behavior. The Rapier contact-cache internals
are not established by this experiment. The fixed rival can rest low (about y=0.64), as with the earlier
contact-refresh workaround; this patch removes the launch without correcting that separate visual offset.
`data/run-main/meta.json` records this flag as 0 so legacy rounds replay unchanged.

`engine/tests/hunt-getup-crate.test.mjs` failed first on the shipped game, then passed with the fix:
no airborne event and the rival stays below y=1.3 on every tick from that getup through round end.
Flag 0 still reproduces the event. `node scripts/proof-table.mjs` now reports 0/21 bug1, 0/4 bug2,
0/3 bug3 and 0/1 bug4 after fixes. The paired 200-persona, one-round crowd (base seed 1, first 200
recorded personas) has 0 bug rounds and 62/200 wins (31.0%) on both the previous and fixed behavior.

Run `node --test engine/tests/hunt-getup-crate.test.mjs` for the focused regression.

Paired regression commands (outputs stay outside the recorded run):

```bash
mkdir -p /private/tmp/sparring-getup-crate
printf '%s\n' '{"rules.getupCrateFix":0}' > /private/tmp/sparring-getup-crate/off.json
node engine/crowd.mjs --personas data/run-main/personas.json --out /private/tmp/sparring-getup-crate/off --tuning /private/tmp/sparring-getup-crate/off.json --label previous --limit 200 --rounds 1 --seed 1 --workers 2 --traces 0
node engine/crowd.mjs --personas data/run-main/personas.json --out /private/tmp/sparring-getup-crate/narrow --label shipped --limit 200 --rounds 1 --seed 1 --workers 2 --traces 0
```

```bash
node engine/crowd.mjs --personas data/run-main/personas.json --out .work/hunt/s2027 --seed 2027 --noquit 1 --traces 0
HUNT_FUZZ_ROUNDS=500 HUNT_FUZZ_MAXT=99 node --test engine/tests/hunt-fuzz.test.mjs
HUNT_SOAK_ROUNDS=200 HUNT_SOAK_MAXT=99 node --expose-gc --test engine/tests/hunt-soak.test.mjs
HUNT_DET_SEEDS=50 HUNT_DET_MAXT=99 node --test engine/tests/hunt-determinism.test.mjs
node --test engine/tests/hunt-grab-release.test.mjs
node --test engine/tests/hunt-knockdown-prop.test.mjs engine/tests/hunt-tuning-range.test.mjs engine/tests/hunt-cpu-low-block.test.mjs engine/tests/apply-tuning.test.mjs
node engine/fuzz-baseline.mjs --rounds 2000
```

The browser determinism spec needs a server for `public/` (`npm run dev` or any static server) and the Playwright
command in `e2e/README.md`, with `-g` or the file name `hunt-determinism`.
