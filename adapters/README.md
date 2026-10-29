# Adapters: running the crowd on another game

Market Brawl's engine (`engine/`) is built around that one game. `adapters/` holds the same crowd method
in a game-agnostic form, plus two adapters for games that are nothing like a brawler:

| Game | What it is | Adapter | Time it took |
|---|---|---|---|
| `homeground/` | Longboard downhill physics on map tiles (TypeScript). Physics vendored, MIT. | `sim.mjs` 129 lines, `policy.mjs` 69, test 55 | About half a day, most of it reading the game |
| `clean-getaway/` | 9-seat heist, investigation and trial, a pure state machine. Referenced by path (`~/Developer/clean-getaway`), nothing copied. | `sim.mjs` 117 lines, `policy.mjs` 87, test 46 | About half a day |

Results, verdicts and what had to change: `docs/generality.md` and the `/games` page.

## Run

```bash
node --import tsx --test adapters/*/*.test.mjs
node --import tsx adapters/crowd.mjs --game homeground --n 100 --fuzz 100 --seed 1 --maxT 240
node --import tsx adapters/crowd.mjs --game clean-getaway --n 100 --fuzz 100 --seed 1
node adapters/export-games.mjs   # writes data/games/*.json for the /games page
```

`crowd.mjs` writes `adapters/<game>/out/summary.json` and `runs.jsonl`. No model calls: personas are the first
`--n` of `data/run-main/personas.json`, plus `--fuzz` random-input players.

## The contract

An adapter is a folder `adapters/<game>/` with two modules.

**`sim.mjs`**

- `createSim({ seed, maxT })` returns a sim object. Same seed, same inputs, same result. Patch every source of
  nondeterminism (`Math.random`, `Date.now`, `crypto.randomUUID`, wall-clock timers) to come from `seed`.
- `sim.step(input)` advances one fixed step with `input` held and returns `sim.done`. `input` is whatever the
  game takes: a key bitmask (Homeground) or a typed action object or `null` (Clean Getaway). Record every
  input change in `sim.inputs` as `[tick, input]`.
- `sim.observe()` returns what a player can see. For a real-time game include a `bucket` string (the
  situation a policy reacts to: Homeground uses `road`, `offroad`, `wall`, `air`, `bail`). Clean Getaway
  returns the game's own per-seat view instead and has no buckets.
- `sim.events` is a list of `[t, code, arg?]`. Invariant checks push events here: `crash`, `nan`, `oob`,
  `stuck`, `softlock`, and whatever else is a broken state in this game.
- `sim.result()` returns `{ out, t, ev, hash, inputs }`. `hash` folds the full game state each step, so two
  runs that diverge anywhere get different hashes.
- `inputController(inputs)` returns `{ step(sim) }` that plays recorded `inputs` back exactly.
- `runRound(sim, controller)` loops `sim.step(controller.step(sim))` until done, and turns a thrown exception
  into a `crash` event instead of killing the crowd.

**`policy.mjs`**

- `createPolicy(persona, seed)` returns `{ step(sim) }` giving the next input. Use the persona's `archetype`
  (a base weight table per bucket), `skill` (chance of the good move) and `reaction_ticks` (decision
  cadence). Ignore the persona's `rules`: they are Market Brawl vocabulary.
- `createFuzzer(seed)` returns `{ step(sim) }` that sends random and malformed input. If the game has an
  input validator on its trust boundary (Clean Getaway's `parseAction`), send fuzz through it.

Shared helpers (seeded RNG, FNV hash, float hasher, weighted pick, persona loader) are in `lib/common.mjs`.

## Add a game, step by step

1. **Find the sim.** Locate the code that advances game state, separate from rendering and the DOM. If
   rendering is tangled in, shim it or vendor only the physics (as Homeground does). Check the license
   before copying anything; otherwise import by path.
2. **Make it deterministic.** Fixed time step, seeded RNG, no wall clock. Write the test first: same seed
   twice gives the same hash.
3. **Write `sim.mjs`** to the contract above. Start with cheap invariants (`nan`, `oob`, `crash`).
4. **Write `policy.mjs`.** Pick the action vocabulary and the situation buckets. If the game ships a bot,
   use it as the competent move and let the archetype decide how a persona deviates from it.
5. **Write `<game>.test.mjs`:** same seed twice, replay from recorded inputs alone, fuzzer replay, and one
   constructed bad state per invariant to prove each detector fires.
6. **Register the game** in `crowd.mjs` (`BUGS`: which event codes count as bugs) and in
   `export-games.mjs` (name, genre, verdicts, notes).
7. **Run a small crowd and calibrate.** Look at every event type. Game-specific invariants like `stuck` and
   `softlock` gave false positives here until checked against how the game is meant to play. Rename or
   downgrade those (Homeground's `stalled` is counted, not a bug) and write the verdict down.
8. **Run the full crowd** and `export-games.mjs`; the game appears on `/games`.

## What makes it slow

- Sim tangled with rendering or the DOM (Market Brawl needed `KeyTarget`, window shims, Three.js in Node).
- `Math.random` and `Date.now` used all over the game.
- A native game. The Unreal Bully remake would need UE automation with `-nullrhi`, an input-injection
  component and a state hash on the game thread: days, not hours, plus the UE editor and owned assets.
- No built-in bot in a strategy game: competent play then needs a model.
