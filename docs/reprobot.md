# ReproBot fresh play

ReproBot evaluates whether a model-driven player can reproduce an example bug report in fresh, unscripted play.

## Design

### Choosers (`--chooser nano|local|fake`, default `fake`)
- **`local`**: Calls a local Ollama server over HTTP at `POST http://localhost:11434/api/chat`.
  - Model: configured by `REPROBOT_LOCAL_MODEL` (default: `gemma4:e4b-mlx`).
  - Options: `stream: false`, `temperature: 0.5`, small token budget (`num_predict: 6`), 20-second timeout per call, 0 retries.
  - Prompting & Caching: Reuses the exact same system prompt (`buildSystemPrompt`) and user prompt (`buildUserPrompt`) as `ai/spotlight.ts`, along with `obsKey` observation state rounding/caching and `parseAction`.
  - Fallback safety: Network errors, timeouts, or unparseable outputs fall back to the `"wait"` action. If fallbacks exceed 30% after 40 calls, the run aborts cleanly so that an unavailable local server is never mistaken for a passive player.
- **`fake`**: Fast, offline deterministic chooser for automated testing and CI.
- **`nano`**: Nemotron Nano cloud model via Nebius API.

### Reports (`--report rare|common`, default `rare`)
- **`rare`**: The built-in example bug report: "floats upward while blocking, then out of bounds". Targets `data/reprobot/results.json`.
- **`common`**: A frequent gameplay event oracle: "The player is knocked down at least once in the first 30 seconds." (`{ event: "knockdown", who: 0, minCount: 1, withinSeconds: [0, 30] }`). Demonstrates mechanism parity across arms since knockdown is not a bug. Targets `data/reprobot/results-common.json`.

### Multi-Arm Builds (`--build recorded|shipped|both`, default `both`)
When running with `--build both`, ReproBot plays the same deterministic fresh seeds across three comparative arms:
1. **Recorded build (`recorded`)**: Applies the `recordedWith` tuning from `data/run-main/meta.json` (bug fix flags set to 0, matching the version where the bug was originally reported).
2. **Shipped build (`shipped`)**: Applies `{}` (the current game rules where the bug has been fixed; an effective bug fix should yield 0 reproductions).
3. **Scripted control (`scripted`)**: Uses the baseline CPU policy from `engine/policy.mjs` for the player (no model calls) on the recorded build, providing a control baseline to compare model-driven play against heuristic play.

### Experiment Parameters
- **Early Stop**: Rounds stop immediately once the bug oracle (from `data/samples/repro.json` via `lib/oracle.ts`) matches, recording `tFirstMatch`.
- **Wall-Clock Cap**: `--max-seconds` (default: 900 seconds) prevents runaway execution.
- **Seeds**: Deterministic list of fresh seeds (default 20, starting at 2,000,000) that do not appear in `data/run-main/runs.jsonl` or `runs-sweep-nerf.jsonl`.
- **Dry Run**: `--dry-run` prints the execution plan and parameters as JSON without starting the simulator or contacting the model.

### Execution
Run the full local multi-arm experiment (rare report):
```bash
npx tsx ai/cli/reprobot.ts --chooser local --build both --rounds 20 --report rare
```

Run the common report experiment:
```bash
npx tsx ai/cli/reprobot.ts --chooser local --build both --rounds 20 --report common
```

To test execution offline with a fake model:
```bash
npx tsx ai/cli/reprobot.ts --chooser fake --build both --rounds 20 --report common
```

To preview without running:
```bash
npx tsx ai/cli/reprobot.ts --chooser local --build both --rounds 20 --dry-run
```

To import a reviewed results file:
```bash
npx tsx ai/cli/reprobot.ts --results-from /path/to/results.json --out data/reprobot/results.json
```

## Result: rare report

- **Configuration**: `data/reprobot/results.json`, chooser local `gemma4:e4b-mlx`, 20 fresh seeds per arm.
- **Report**: Built-in example report ("floats upward while blocking, then out of bounds").
- **Reproductions**:
  - Recorded build: 0 of 20 reproduced
  - Shipped build: 0 of 20 reproduced
  - Scripted control: 0 of 20 reproduced
- **Local-player fallbacks**:
  - Recorded arm: 89 of 383 calls (23%)
  - Shipped arm: 53 of 159 calls (33%)
  - Scripted arm: 0 calls
- **Analysis**: That bug is rare: 4 of 2,831 recorded rounds, so the chance of at least one hit in 20 rounds is $1 - (1 - 4/2831)^{20} = 2.8\%$: the experiment cannot show anything for that report at this scale.

## Result: common report

*(To be filled by the lead after running the live local experiment with `--report common`)*


## Result: rare report and common report (2026-10-29, local player gemma4:e4b-mlx, 20 fresh seeds per arm)

| Report | Recorded build | Shipped build | No-model baseline |
|---|---|---|---|
| Rare: floats upward while blocking, then out of bounds (4 of 2,831 recorded rounds) | 0 of 20 (383 calls, 89 fallbacks) | 0 of 20 (159 calls, 53 fallbacks) | 0 of 20 |
| Common: knocked down in the first 30 s | 19 of 20 (162 calls, 42 fallbacks) | 19 of 20 (116 calls, 31 fallbacks) | 20 of 20 |

Reading it: for the rare report 0 of 20 shows nothing (about a 2.8% chance of one hit by luck). For the common report the pipeline works end to end, and the recorded and shipped builds behave alike, as they should for a non-bug event. The model-driven player was not better than the scripted baseline, so this is a working mechanism and not a better bug finder. Fallbacks mean the local model did not return a usable move (the player waits); 23% to 33% on the rare arms is high.
