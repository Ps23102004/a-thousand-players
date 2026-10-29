# Tutorial Director

The static Onboarding page displays recorded struggle rates and, after an offline run, proposed player-facing aids with paired Prophet measurements. The struggle table is recomputed from `data/run-main/personas.json`, `runs.jsonl`, and `sessions.json`. Quit means frustration or boredom in the synthetic session model; round 2 duration includes only players who reached that round.

Run from the repository root:

```sh
node --import tsx ai/cli/tutor.ts --dry-run
node --import tsx ai/cli/tutor.ts --results-from /path/to/answer.json
node --import tsx ai/cli/tutor.ts
```

The dry run prints the table and prompt size without a model call. The imported-answer mode accepts model-format JSON or a text file containing it, does not call a model, and labels its provenance as imported. The last command makes one Super request and then runs each accepted tuning through the same offline Prophet function used by the API. It writes `data/tutor/results.json`; rebuild the static site to publish the snapshot. No API route is added. The committed placeholder has no measured aids.

Code checks titles, text, cited archetype, quoted text, allowed tuning keys and ranges, duplicates and the proposal limit. It cannot establish that unquoted model prose is factually correct or that an aid teaches. Inspect proposals before use. A failed run does not write partial results.

Prophet compares the recorded tuning and each override with paired personas and seeds: round 1 only, 200 personas. The quit/frustration model is NOT re-simulated; an aid that raises casual win rate may still not teach anything; real new players are not involved. The text itself is not applied to the simulated player policy. Changes in win rate measure tuning under this sample, not the effectiveness of the aid. Bug counts report engine-flagged rounds, not proof of absence of bugs.

## Result of the one live run (2026-10-29)

`npx tsx --env-file=.env ai/cli/tutor.ts`: one Super call, 3 aids proposed, 0 dropped by validation, each measured with the Prophet paired crowd (200 personas, 1 round, **seed 1 only**, about 13 s each). Source: `data/tutor/results.json`.

| Aid (drafted by Super) | Overall wins of 200 (before to after) | Casual wins of 39 | Bug rounds |
|---|---|---|---|
| Master Your First Combo (jab timing and damage) | 66 to 75 | 5 to 9 | 1 to 0 |
| Practice Sidestepping (jab reach 1.3) | 66 to 69 | 5 to 8 | 1 to 1 |
| Learn to Guard Effectively (guard multiplier 0.15) | 66 to 60 | 5 to 5 | 1 to 1 |

Read this carefully: one seed, 39 casual rounds, and differences of 3 to 9 wins are within the noise of such a small sample (the same seed-1 baseline is 66 wins; Prophet's second seed gave a different baseline, see `docs/prophet.md`). Nothing here shows that an aid teaches a new player anything; it only shows what happens to round-1 win rates when the tuning behind the tip changes. The quit and frustration model was not re-simulated, and no real new player took part. The player-facing text of each aid was checked by hand against the game's own controls (J x4 chain, Q/V sidestep, guard multiplier 0.2) and matches, except that the guard aid's text says "reduce incoming damage by 80%" while its tuning (0.15) would give 85%.
