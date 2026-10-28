# A Thousand Players — Devpost

## Summary

Indie developers rarely get enough playtesters. A Thousand Players gives them a crowd. Nemotron Nano writes 1000 synthetic player personas, from patient turtles to button-mashers to cheesers. A headless, deterministic copy of the game plays every one of them, and Nemotron Ultra reads all of the play logs in a single context to find where players struggle, quit, or break the game.

Every finding cites seeds, and any seed replays the same match in the real 3D game in the browser. Code re-checks every number Ultra claims before showing it. When the engine catches a broken round, Ultra proposes a patch, and the engine applies it to a scratch copy of the game and replays the exact seeds to see if the bug is gone.

Our test bed is Market Brawl, a student's Three.js + Rapier fighting game. In the main run, 1000 players played 2831 rounds. Ultra returned 8 findings, and 31 of 31 structured claims matched the recomputed data. One bug fix was verified by replay.

The players are synthetic. The findings are hypotheses to replay and check, not a replacement for real people.

## How Nemotron is used

All calls go to Nebius Token Factory through its OpenAI-compatible chat completions API. Each model has a job that needs it:

- **Nemotron Nano 30B** writes persona policies in bulk (1000 personas in 289 s over 69 calls). It can also pick each action live for a spotlight player (implemented and measured, not part of the main run) (median 3.5 s per uncached call, 3 tokens out), and it proposes and evolves exploit strategies (32 strategies over 2 generations).
- **Nemotron Super 120B** turns English into things the engine can run: a bug report becomes an oracle predicate, and patch notes become tuning overrides (0.7 to 1.6 s per report). It also explains why the winning exploit strategies work, once the prompt includes the hits the engine recorded; from the rule text alone it guessed a wrong mechanism (see "What is verified").
- **Nemotron Super-VL** looks at replay frames and describes what it sees (5.2 s for one frame).
- **Nemotron Ultra 550B** reads the whole crowd at once. For the main run, that was 220,334 prompt tokens covering 1000 players and 2831 rounds, in one call, with no chunking. Ultra also does bug triage: it reads a timeline re-simulated from the seed plus the relevant game source, and proposes a root cause and a find/replace patch.

Thinking is turned off on every call (`chat_template_kwargs: {"enable_thinking": false}`). These are structured tasks, and with thinking on, short answers could come back empty.

## What is verified and what is synthetic

**Verified by code:**
- **Determinism.** `npm run engine:test` plays 16 seeds twice each. Final-state hashes and event lists matched for all 16 (`mismatches=0`).
- **Report claims.** Every structured claim Ultra makes (metric, scope, value) is recomputed from the raw runs. Main run: 31 of 31 matched. 13 seeds that Ultra cited did not exist in the runs and were removed.
- **Planted fixtures.** On a 1000-player fixture with four planted stories, Ultra found all four, including the single sweep-spamming player out of 1000. 23 of 24 claims were verified, and the one failure was a real error that the verifier caught.
- **Two bug fixes.** bug3: Ultra's `throwProp` guard made all 3 crashing seeds run clean. bug4 (below): For bug4 (a knocked-down fighter stuck mid-fall until the 99 s time limit), Ultra's patch made the replayed seed end by KO at 18.73 s with no bug events. In a regression crowd of 200 personas, bug rounds went from 4 to 3.

**Synthetic, or not checked:**
- **The players.** Quitting and boredom come from a simple mood model with traits written by Nano. Crowd players run their policies natively. They are not driven by an LLM decision by decision.
- **Super's exploit explanation.** From strategy text alone it blamed "recovery-state grabs"; the recorded hits (117 SWEEP, 49 GROUND for the top strategy) show sweep into mount. The page now shows the measured hit tally beside each strategy, and Super's text is grounded in it.
- **Ultra's prose.** Only claims and seeds are checked. On a fixture, the narrative text included a made-up count.
- **Prices.** Only Ultra has a dollar estimate, at an unverified aggregator price. Main-run total: $0.59 across 14 Ultra calls.

## What is not done

- **bug2 is not fixed.** Out of bounds after a mount release (4 rounds): after the format fix, Ultra's patch applied but the replayed seeds still failed (0 of 4), after 2 attempts.
- **bug3 fix was verified only on its own seeds.** The `throwProp` crash fix passed 3 of 3 replays. The 200-persona regression crowd never hits that crash, so it cannot show a side effect.
- **One bug patch did not work.** bug1 (fighter floats up after a mount release, 21 rounds): the patch applied cleanly but fixed 0 of 8 replayed rounds.
- **One game.** The adapter contract is documented, but Market Brawl is the only game that implements it.
- **No proof of absence.** The crowd samples the game. A bug it never hit may still exist.
- **Ultra's 1M-token context is unproven here.** About 300K prompt tokens worked. A 900K probe hit the per-minute token quota.
