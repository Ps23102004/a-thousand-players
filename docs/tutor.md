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
