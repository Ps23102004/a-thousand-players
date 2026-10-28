# A Thousand Players

A crowd of Nemotron-driven synthetic players plays your browser game by the thousand, finds where it breaks, and backs every finding with a seed you can replay in the real game.

Built for the Nebius x NVIDIA Global AI Hackathon. The test bed is **Market Brawl**, a student's CSCI 310 3D fighting game (Three.js + Rapier), copied unchanged into `game/`. All models run on Nebius Token Factory.

## What it does

1. **Personas.** Nemotron Nano writes 1000 player personas (archetype, skill, reaction time, patience, frustration tolerance, a short bio, and sparse decision rules). A validator rejects bad ones and a repair loop asks for replacements.
2. **Crowd.** A headless, deterministic copy of the game (`engine/`) plays every persona for 1 to 5 rounds against the game's own CPU rival, at 60 Hz with no renderer, across all CPU cores. A simple mood model decides when a player quits from frustration or boredom.
3. **Report.** Nemotron Ultra reads every play log in one context and returns findings. Each finding has structured claims and the seeds of rounds that show it. Code then recomputes every claim from the raw runs and removes any seed that does not exist.
4. **Bug triage.** Invariant checks in the engine (`engine/bugs.mjs`) group broken rounds into bug clusters. Ultra proposes a root cause and a patch. `engine/verify-fix.mjs` applies the patch to a scratch copy of the game, replays the exact seeds, and runs a regression crowd.
5. **Exploit search.** Nano proposes bot strategies, the engine plays each one, Nano evolves the best ones, and Super writes an explanation of why they win.
6. **Replay.** Any round can be re-run in the real 3D game in the browser from its seed.

## Results from the main run

All numbers below come from files in `data/run-main/`.

- **Crowd** (`summary.json`): 1000 players, 1000 sessions, 2831 rounds, 891 wins and 1940 losses for the players (win rate 31.5%). Session end reasons: 708 frustration, 250 satisfied, 42 hit the round cap.
- **Report** (`findings.json`): Ultra read the whole crowd in one call (220,334 prompt tokens including the system prompt; the corpus estimate was 219,064; 4,439 tokens out) and returned 8 findings. **31 of 31 structured claims matched the recomputed value. 13 cited seeds did not exist in the runs and were removed.**
- **Bug triage** (`triage.json`, `fixes/`): 4 bug clusters.

  | Cluster | Signature | Rounds | Result |
  |---|---|---|---|
  | bug4 | `stuck:KNOCKDOWN+airborne+softlock` | 1 | **Fixed and replay-verified.** Seed 529060 ran to the 99 s time limit before the patch and ends by KO at 18.73 s with no bug events after it. Regression crowd of 200 personas: bug rounds 4 before, 3 after. |
  | bug1 | `airborne` | 21 | Ultra proposed a patch; it applied cleanly but fixed 0 of 8 replayed rounds. **Not fixed.** |
  | bug2 | `oob+airborne+softlock` | 4 | **Not fixed.** On the retry, Ultra's patch applied but the replayed seeds still showed the bug (0 of 4 fixed, 2 attempts). The root cause it named (stale aim offset in `releaseMount`) is a hypothesis, not a confirmed cause. |
  | bug3 | `crash: RuntimeError: unreachable in throwProp (props.js:303)` | 3 | **Fixed and replay-verified, 3 of 3 seeds.** Ultra guarded `throwProp` against a prop whose body was already freed. The first two triage runs failed because Ultra ignored the answer format; adding a concrete format example to the prompt fixed that. The regression crowd (200 personas) did not contain this crash, so it shows no change (4 bug rounds before and after). |

- **Exploit search** (`exploit.json`): 32 strategies over 2 generations, 30 rounds each (960 rounds). The best strategy ("Mid Grapple Cheese") won 30 of 30 rounds (win rate 1.0) against the CPU. The recorded hits show how: 117 SWEEP hits, 49 GROUND strikes. Every top strategy wins the same way, sweep (which the CPU never crouch-blocks) into knockdown into mount, whatever Nano's rule text said it was doing.

## Honest limits

- **Players are synthetic.** Quit and boredom come from a simple mood model with Nano-written traits. It generates hypotheses; it does not replace human playtesters.
- **Crowd players are not LLM-driven move by move.** Nano writes each persona's policy, and the engine runs that policy natively. Driving all 1000 players with model calls on every decision was measured as too slow and too costly. The live "spotlight" player (`ai/spotlight.ts`, Nano picks each action) is implemented and measured but is not part of the main crowd run.
- **Findings are sampled, not proofs of absence.** If the crowd did not hit a bug, that does not mean the bug is not there.
- **Only the claims and seeds are machine-checked.** Ultra's prose can still contain wrong numbers. On a test fixture it wrote "10/18 Round 1s end in draws" when there were 3. Trust the verified claims, not the narrative.
- **Super's exploit explanation was wrong until it was grounded.** Given only the strategies' rule text and the CPU code, Super explained the wins as "recovery-state grabs". The recorded hits say sweep into mount. The prompt now includes the measured hit tally per strategy, and the `explanation` field starts with that tally, written by code. Super's prose after it names the sweep and the guard rule, but still over-reads the grabs.
- **One game adapter.** The adapter contract is documented below, but Market Brawl is the only game that implements it.
- **Prices are estimates.** Only Ultra has a dollar estimate, at an unverified aggregator price ($1/M input, $3/M output). Other models report tokens only.

## Model roles

| Model | Token Factory id | Job |
|---|---|---|
| Nemotron Nano 30B | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | Writes the 1000 persona policies in bulk; can pick each action live for a spotlight player (implemented, not in the main run); proposes and evolves exploit strategies |
| Nemotron Super 120B | `nvidia/nemotron-3-super-120b-a12b` | Turns English into things the engine runs: bug report to oracle predicate, patch notes to tuning overrides; explains why exploit strategies win |
| Nemotron Super-VL | `nvidia/Nemotron-3.5-Super-VL` | Looks at replay frames and describes what it sees |
| Nemotron Ultra 550B | `nvidia/Nemotron-3-Ultra-550b-a55b` | Reads every play log at once and writes the report; proposes root causes and patches in bug triage |
| Tavily | (search API) | Finds design precedent for each suggested fix |

Settings, latencies and token counts for each call are in [`ai/README.md`](ai/README.md).

## Replay determinism contract

`(seed, tuning, policy, game version)` always produces the same match. This is what makes every finding replayable.

- `Math.random` is replaced by a seeded mulberry32 stream **only while game logic runs**. Visual code in the browser keeps the real RNG.
- `performance.now` returns simulated time, because combo windows depend on it.
- The simulation steps at a fixed 60 Hz, and the browser replay uses the exact Rapier WASM build the headless engine ran (`scripts/sync-game.mjs` vendors it from `node_modules`).

`npm run engine:test` checks this: it plays 16 seeds twice each and compares the final-state hash and the full event list. Output from this machine:

```
16 seeds x2 runs, mismatches=0, 28.6 rounds/s, 22k ticks/s
```

A replay token is base64 JSON in the URL: `{ "seed": 88123, "tuning": "base", "policy": {...}, "fighter": "kai", "maxT": 60 }`.

## Bug-triage loop

```
engine/bugs.mjs     invariant violations in runs  -> bug clusters (bugs.json)
ai/triage.ts        Ultra reads a 10 Hz timeline re-simulated from the seed + the relevant source -> root cause + find/replace patch
engine/verify-fix   apply patch to a scratch copy of game/src (.work/<bug>)
                    replay the cluster's exact seeds -> fixed / not-fixed
                    run a regression crowd (default 200 personas), shipped vs patched
ai/cli/triage.ts    if not fixed, send the replay result back to Ultra once and try again
                    -> triage.json + fixes/<bug>.json + fixes/<bug>.verify.json
```

A patch is applied only if its `find` text matches the target file exactly once. The game in `game/` is never modified by triage.

## Running it

Requires Node.js. Install once:

```bash
npm install
```

Determinism and throughput check (no API key needed):

```bash
npm run engine:test
```

Play a crowd of personas across all CPU cores (no API key needed once `personas.json` exists):

```bash
npm run crowd -- --personas data/run-main/personas.json --out data/run-main
```

Options: `--tuning t.json --label patch` to run a tuning patch (Balance mode, for example `data/patches/sweep-nerf.json`), `--seed`, `--limit`, `--rounds`.

Copy the game and engine into `public/` so the web app can serve the real 3D game and replays (`dev` and `build` run this for you):

```bash
node scripts/sync-game.mjs
```

Run the web app:

```bash
npm run dev
```

### Steps that call models

These need a `.env` file with `NEBIUS_API_KEY` (Token Factory) and `TAVILY_API_KEY`. Never commit it.

```bash
npx tsx --env-file=.env ai/cli/personas.ts --n 1000 --out data/run-main/personas.json
npx tsx --env-file=.env ai/cli/report.ts --dir data/run-main
npx tsx --env-file=.env ai/cli/triage.ts --dir data/run-main
npx tsx --env-file=.env ai/cli/exploit.ts --dir data/run-main
```

Logic tests for the AI layer, no network:

```bash
npx tsx --test ai/*.test.ts
```

## Adapter contract

So another game can plug in:

```
createSim({ seed, tuning }) -> { tick(inputKeys, n), observe(), done, outcome, events, hash() }
renderReplay(token)        // in the browser
```

Only Market Brawl implements it today.

## Layout

```
game/        Market Brawl, unchanged
engine/      headless deterministic sim, crowd runner, bug detection, fix verification
ai/          Nemotron layer (Token Factory client, personas, report, verification, triage, exploit)
app/ components/ lib/   Next.js web app
data/        run outputs (run-main is the main 1000-player run)
docs/        design, Devpost text, Token Factory feedback
```

## License

MIT. See [LICENSE](LICENSE).
