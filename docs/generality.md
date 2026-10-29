# Does the crowd approach work beyond Market Brawl?

Run on 2026-10-28. Two games besides Market Brawl, both the user's own, both driven headlessly through
`adapters/<game>/`. No model calls (no Nebius credits). Personas: the first 100 of the 1000 saved in
`data/run-main/personas.json`, plus 100 random-input fuzzers per game.

## What was available locally

| Game | Where | Stack | Headless? | Used |
|---|---|---|---|---|
| **Homeground**: longboard downhill on your own street, built from map data | GHFS clone `Ps23102004/homeground` (MIT) | TypeScript, Three.js, Express tile server | Easy. The board physics (`src/game/board.ts`, `collider.ts`) is already three.js-free with a fixed 120 Hz substep and a headless test. No randomness. Real levels need the live map tile server, so the adapter builds seeded synthetic tiles in the same format as the game's own physics test. | yes |
| **Clean Getaway**: 9-seat heist, investigation, arrest/chase, trial | `~/Developer/clean-getaway` (no LICENSE file, so referenced by path, nothing copied) | TypeScript, pure state-machine engine, Netlify functions | Easy. `createGame/startGame/act/tick(state, now)` takes explicit time, has its own seeded RNG and its own bots. Only nondeterminism: `crypto.randomUUID()` for player ids, which the adapter seeds. | yes |
| **Bully remake** | GHFS clone `Ps23102004/bully-remake-private`; `~/Developer/bully-remake` is a symlink to the unmounted external drive "Project Dev" | Unreal Engine 5.8, C++ | **Not testable here.** Not a web project. It needs the UE 5.8 editor and assets imported from an owned copy of *Bully: Scholarship Edition*. A headless UE build could run it (`-nullrhi`, automation), but that is a different adapter: C++ input injection and a game-thread hash. | no |
| **GTA 5** | `~/Developer/playgta5-mods` (launcher patch + local mirror server for a third-party browser streaming site; the mirror itself is not on disk) | Commercial game | **Not testable.** The real GTA V is a commercial console/PC game. It cannot be run or driven here. Only a browser remake or clone could be, and none is on this machine. | no |
| neon-underground, dynamo games-puzzles | symlinks into the unmounted "Project Dev" drive | unknown | Not reachable. Mount the drive to survey them. | no |
| Secret-knock lock sim | GHFS clone | Three.js | A simulation, not a game. Skipped. | no |

Both picks are a long way from a fighting game. One is continuous vehicle physics with no opponent. The other
is a discrete, timed, multi-seat social game with no physics at all.

## Results

Same crowd runner for both games: `adapters/crowd.mjs`. Each round: one seeded level or case, one persona or
fuzzer, recorded inputs. Every round that raised an invariant event, plus every 10th round, is replayed from its
inputs alone, and the hash and event list are compared.

### Homeground (200 rounds of 240 s)

- **Speed:** 6.3 rounds/s, about 1,390 simulated seconds per wall second, on one core (31.8 s wall in total).
- **Determinism:** 22 of 22 replays match. Tests cover same seed twice, inputs-only replay, and fuzzer replay.
- **Outcomes:** 35 finished the run, 164 timed out, 1 left the map.
- **Personas behave differently, which shows the persona layer carries over:**

  | Archetype | Rounds | Finished | Avg distance |
  |---|---|---|---|
  | rusher | 17 | 16 | 868 m |
  | learner | 8 | 7 | 904 m |
  | turtle | 10 | 6 | 809 m |
  | casual | 17 | 4 | 528 m |
  | masher | 20 | 0 | 198 m |
  | cheeser | 16 | 0 | 106 m |
  | fuzz | 100 | 0 | 58 m |

- **Invariant events:**
  - **`oob` (1 round, fuzz32 seed 100135, replays exactly): real design gap.** The rider rode off the top edge of
    the 1 km tile. The game has no boundary: `heightAt` clamps at the tile edge, and nothing in `Game.update`
    stops or respawns you, so you keep riding on an extruded flat past the rendered world. Mitigation in the game
    today: the player can press R. The `oob` test reproduces it.
  - **`stuck` (1 round, fuzz29): not a bug.** Nose-first against a wall at rest, straight pushing can't move you,
    because steering is gated by speed ("no pivoting on the spot", by design). A constructed test shows that
    pumping while carving escapes 10.8 m in a few seconds. The invariant can't tell "wedged" from "player not
    trying".
  - **No `nan`, `clip` (fall-through), `tunnel` (inside a building), `overspeed` or `airborne` events** in about
    44,000 simulated seconds. That fits the game's own `test-physics.ts`, which already asserts these on
    synthetic terrain.
  - **`stalled` (76 rounds, counted but not treated as a bug):** no 2 m of progress in 15 s. It is almost all
    fuzzers and mashers spinning in circles. A first version called this `softlock` and produced 16 false
    positives in a 60 s run. The real game has no timer or fail state, so "not moving" is a player choice.
  - Minor observation, not reported as a bug: `yaw` is never wrapped (it reached -23 rad in tests). This is
    harmless at these magnitudes.

### Clean Getaway (200 one-case games)

- **Speed:** 6.8 games/s (29.4 s wall for 200 games), about 940 simulated seconds per wall second. A case lasts
  16 to 327 simulated seconds (median 116). Phases where no human seat acts fast-forward, as in the real game.
- **Coverage:** all 20 scenarios and all 9 seats were played. The crowd player takes whichever seat the game
  deals it (criminal, cop, lawyer, prosecutor, judge), and the other 8 seats are the game's own bots.
- **Determinism:** 20 of 20 replays match, including the event list. Tests cover same seed twice, seeded seat
  dealing, inputs-only replay, and fuzzer replay.
- **Outcomes:** 200 of 200 cases closed, with an outcome.
- **Actions:** personas sent 5,718 actions, of which 2,604 were accepted and 3,114 rejected by the rules (top
  reasons: `wrong-phase`, `busy`, `not-in-scene`). Fuzzers sent 12,573, of which 832 were accepted and 11,741
  rejected, including 1,133 `bad-action` from the server's own `parseAction` input validation: garbage ids,
  5,000-char chat, control characters, off-grid chase cells, duplicate accusations.
- **Invariant events: none.** No crash (any non-`RuleError` exception), no NaN, no actor in an unknown zone, no
  chase cell off the 7x7 grid, no duplicate seat, no phase past its deadline, no case closed without an outcome.
  Constructed bad states (actor in zone `the-moon`, NaN score) trip `oob` and `nan` in the tests, so the
  detectors work. The game simply held up.
- A first run called `act` directly and skipped `parseAction`, which the server always runs first. It was
  rerun through `parseAction`, so the fuzz hits the real trust boundary. Both runs gave 0 events.

## What had to change in the persona and policy layer (the honest generality finding)

The crowd structure transferred unchanged: seeded sim, fixed step, input recording, invariant events, a
replayable hash, persona or fuzzer per round, clustering, and replay checks. `adapters/crowd.mjs` is 56 lines
and game-agnostic. The policy skeleton transferred too: archetype base weights per situation bucket, a weighted
pick, decision cadence from `reaction_ticks`, and `skill` as the chance of the "good" move.

What did **not** transfer:

1. **Persona `rules` are Market Brawl vocabulary** (`dist: close`, `rival: startup`, `punch: 8`). Neither game can
   use them, so they are ignored. Only `archetype`, `skill`, `reaction_ticks` and the id seed carry over. Personas
   written for one game are a fighting-game asset, not a general one. Making them general would need a Nemotron
   call per game to rewrite each persona's rules in that game's action vocabulary. **Not done (it would spend
   credits).**
2. **Each game needs its own action vocabulary and bucket function.** Homeground: road / offroad / wall / air /
   bail buckets, and carve / pump / tuck / brake / follow-road / ram-wall actions. Clean Getaway: no buckets.
   Its moves are typed actions with arguments (`{kind:'accuse', suspects:[…]}`), not a key mask. So the "input
   mask" in the README contract becomes an Action object there, and the replay records actions.
3. **"Competent play" came from the game itself.** In Clean Getaway the persona's good move is the game's own bot
   (`bots.decide`), and the archetype only sets how the persona deviates: cheeser sends exploit-style arguments,
   rusher leaves or runs early, turtle waits. Without a built-in bot, a social or strategy game would need a
   model or a hand-written strategy. In Homeground the competent move (follow the road) was easy to hand-write.
4. **Invariants are game-specific and need calibration.** The general ones (NaN, out of bounds, crash) were
   cheap. The interesting ones ("stuck", "softlock") produced false positives until checked against how the game
   is meant to work. That judgement is the human (or triage-model) step that does not automate away.
5. The Market Brawl `engine/policy.mjs` and `engine/sim.mjs` could not be imported as-is, because they load
   Rapier and `game/src` at module load. The few generic helpers (mulberry32, FNV, pick) are duplicated in
   `adapters/lib/common.mjs`.

## Reproduce

```bash
node --import tsx --test adapters/homeground/homeground.test.mjs adapters/clean-getaway/clean-getaway.test.mjs
node --import tsx adapters/crowd.mjs --game homeground --n 100 --fuzz 100 --seed 1 --maxT 240
node --import tsx adapters/crowd.mjs --game clean-getaway --n 100 --fuzz 100 --seed 1
```

Outputs go to `adapters/<game>/out/summary.json` and `runs.jsonl`. Clean Getaway needs `~/Developer/clean-getaway`
(override with `CLEAN_GETAWAY_ENGINE=<path to src/engine/>`). Homeground's physics is vendored in
`adapters/homeground/vendor/` (MIT, upstream commit in `UPSTREAM_COMMIT`).

## What a third game would cost

For a JS/TS game whose simulation can be separated from rendering: about 100 to 130 lines of `sim.mjs` (seeding,
fixed step, invariants, hash, observation), 70 to 90 lines of `policy.mjs` (bucket function and action
vocabulary per archetype), and about 50 lines of tests. That was half a day each here, much of it spent reading
the game. The cost rises steeply when:

- the sim is tangled with rendering or the DOM (Market Brawl needed `KeyTarget`, window shims, and Three.js in Node);
- the game uses `Math.random`/`Date.now` all over (patch them, as `engine/sim.mjs` does);
- the game is native, such as the Unreal Bully remake. That needs an in-engine harness (UE automation plus
  `-nullrhi`, an input-injection component, and a state hash on the game thread). It is days, not hours, and
  needs the UE editor and the owned game assets on the machine;
- there is no built-in bot and the game is strategic. Then "competent play" needs a model.

## Is it general, or only Market Brawl?

The **harness** is general: seeded headless sim, recorded inputs, invariant events, deterministic replay, and a
crowd of differently-behaving players. It ran on a physics riding game and a turn-and-timer social game in
under a day, with 100% replay matches on both. The persona archetypes produced clearly different play in a game
they were not written for (rushers finish 16 of 17 runs, cheesers 0 of 16). The **personas' detailed content**
is not general: the Nemotron-written rules are fighting-game tables and were dropped, and every game needs its
own action vocabulary, situation buckets and invariants, written by someone who has read the game. The **bug
yield** depends on the game. The crowd found one real design gap in Homeground (no map boundary) and nothing
in Clean Getaway, whose engine is a well-tested pure state machine with input validation. That zero is useful
evidence about Clean Getaway, but it is not a demo. A fair claim: this is a reusable method with a thin
per-game adapter, not a drop-in tool. Market Brawl got the most bugs because it is the game with real-time
physics contact between two bodies, which is where crowds earn their keep.
