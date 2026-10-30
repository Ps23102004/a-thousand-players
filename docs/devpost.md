# A Thousand Players: Devpost

**Tagline:** A crowd of 1,000 Nemotron-written players plays your game, finds the bugs, and proves each one with a seed that replays in the browser.

- **What it is:** a web app where 1000 synthetic players, written by NVIDIA Nemotron on Nebius Token Factory, play a browser game, and every finding comes with a replayable seed.
- **Proof:** all 29 flagged rounds show their bug on the recorded build (29 of 29) and none on the shipped game (0 of 29) ([PROOF.md](https://github.com/Ps23102004/a-thousand-players/blob/main/docs/PROOF.md)).
- **Live:** https://a-thousand-players.vercel.app
- **Video:** https://youtu.be/tKOsGMdRnNc

---

## Submission fields

**Project name:** A Thousand Players

**Track:** Best Apps and Agents

Why this track (the official track text is quoted below):

1. The track asks for "any app or agent someone would actually use". This is a web app for small game teams with no QA department. It needs no login, and each page is tagged **Recorded run** or **Live model call**.
2. The track text says to "reach for Nemotron 3 Ultra when you need serious reasoning, and let Nano or Super handle the fast, everyday calls". That is the split here. Nano wrote 1000 personas in 289 s (`ai/README.md`). Super turns a bug report into a checkable oracle in 0.7 to 1.6 s (`ai/README.md`). Ultra read a 220,334-token summary of the whole crowd in one call (`data/run-main/findings.json`).
3. The track tip says "a multi-step autonomous workflow that chains tools end to end stands out". The workflow here is: personas, 2831 simulated rounds, an Ultra report, code recomputing every claim, bug clusters, an Ultra patch, a sandboxed replay of the exact seed, and a replay link into the real game.
4. The hosted app makes live Token Factory calls (Repro, Balance, Eyes, Design Advisor, live Triage) and one live Tavily search (Find precedent), so it is not only a page of recorded output.

Honest weakness: the triage agent is the weakest part. Across 24 measured triages, 3 patches made the replayed round run clean (2 of the first 15, then 1 of 9 with the line-range prompt; `docs/calibration.md` sections 1 and 6). Coding and Agentic Engineering is the alternative track, since the triage loop applies a patch and tests it by replaying the seed. It would put that low fix rate at the center of the entry, so I chose the track that fits the whole product.

**Built With:** Nebius Token Factory, NVIDIA Nemotron 3 Nano 30B, NVIDIA Nemotron 3 Super 120B, NVIDIA Nemotron 3.5 Super-VL, NVIDIA Nemotron 3 Ultra 550B, Tavily, Next.js, React, TypeScript, Node.js, Three.js, Rapier (`@dimforge/rapier3d-compat`), undici, Vercel

**Links:**
- Live demo: https://a-thousand-players.vercel.app
- Demo video: https://youtu.be/tKOsGMdRnNc
- Code: https://github.com/Ps23102004/a-thousand-players (MIT license)

**Feedback (Token Factory and the NVIDIA models):** the full text is [docs/token-factory-feedback.md](https://github.com/Ps23102004/a-thousand-players/blob/main/docs/token-factory-feedback.md) in the repo. It gives five points for Token Factory, Nemotron Nano, Super, Super-VL and Ultra (what I used it for, what worked, what needs work, onboarding, would I build with it again), plus a Tavily note. Paste it into the form's feedback field or link it; the onboarding sections are filled from the build log and the git history.

**Nebius products used:** only Nebius Token Factory was used. Nebius AI Cloud was not used.

**Team:** Parth Singh (solo; Representative).

---


## Summary

Indie developers rarely get enough playtesters. A Thousand Players gives them a crowd. Nemotron Nano writes 1000 synthetic player personas, from patient turtles to button-mashers to cheesers. A headless, deterministic copy of the game plays every one of them, and Nemotron Ultra reads a summary of all the play logs in a single context to find where players struggle, quit, or break the game.

Every finding cites seeds, and any seed replays the same match in the real 3D game in the browser. Code re-checks every structured number Ultra claims before showing it, and cited seeds/rounds/events and drift quotes/symbols are checked to exist; titles, prose and root-cause explanations are shown as model claims, not verified. When the engine catches a broken round, Ultra proposes a patch, and the engine applies it to a scratch copy of the game and replays the exact seeds to see if the bug is gone.

The test bed is Market Brawl, Parth's own Three.js + Rapier fighting game, written for a university course. In the main run, 1000 players played 2831 rounds. Ultra returned 8 findings; all 31 of its numeric claims matched the data code recomputed (they are cells of tables code also put in its prompt, so this checks reading, not discovery). On a planted 1000-player fixture it found all 4 hidden stories. Five rule fixes are in the game: `throwPropGuard` (bug3's crash guard, Ultra's patch), `mountReleaseFix` (bug2, by hand after Ultra failed twice), `grabReleaseFix`, `knockdownOnPropFix` and `getupCrateFix` (all by hand; together the fixes make all 29 flagged rounds run clean, including all 21 bug1 rounds). Ultra's own bug4 patch was verified on 1 seed and not shipped; its bug1 patch fixed 0 of 8.

The players are synthetic. The findings are hypotheses to replay and check, not a replacement for real people.

**Who it is for.** Small game teams with no QA department. The test-bed game, Market Brawl, is Parth's own. This project is MIT licensed, proves each finding with a deterministic replay, and checks the model's claims with code. It is a prototype: the full pipeline runs on Market Brawl, and the crowd harness also ran on two other games of Parth's.

## How Nemotron is used

All calls go to Nebius Token Factory through its OpenAI-compatible chat completions API. Each model has a job that needs it:

- **Nemotron Nano 30B** writes persona policies in bulk (1000 personas in 289 s over 69 calls). It can also pick each action live for a spotlight player (implemented and measured, not part of the main run) (median 3.5 s per uncached call, 3 tokens out), and it proposes and evolves exploit strategies (32 strategies over 2 generations). An earlier Nano-driven ReproBot fresh-play attempt ran out of its 40-call budget and was superseded by the local Gemma run (see "Spec Drift, ReproBot, and Tutorial Director").
- **Nemotron Super 120B** turns English into things the engine can run: a bug report becomes an oracle predicate that plain code then runs over all 2831 recorded rounds to find the replayable ones, and patch notes become tuning overrides (0.7 to 1.6 s per report). It also explains why the winning exploit strategies work, once the prompt includes the hits the engine recorded; from the rule text alone it guessed a wrong mechanism (see "What is verified"). In Tutorial Director (`/modes/onboarding`), one Super call drafted 3 onboarding aids evaluated with the Patch Prophet paired crowd.
- **Nemotron Super-VL** describes replay frames in Eyes and the Design Advisor. Glitch Hunter also batches second opinions: 10 engine-flagged + 10 matched clean rounds, 20 calls. Hit rate 8/10 (Wilson 95% interval 49.0–94.3%); false-alarm rate 2/10 (5.7–51.0%). The recorded run has only 10 flagged rounds of the requested types, so the sample is small. The engine remains the detector (`docs/glitch-hunt.md`, `data/glitch-hunt/results.json`); `/bugs` displays the score.
- **Nemotron Ultra 550B** reads a summary of every round at once. For the main run, that was 220,334 prompt tokens covering 1000 players and 2831 rounds, in one call, with no chunking. The summary is trimmed: per-round timed events (knockdown, throw, prop, mount) were trimmed for all 1000 players to fit the budget (989 keep counts and bug events, 11 show outcomes only; the aggregates cover every round). Ultra also does bug triage: it reads a timeline re-simulated from the seed plus the relevant game source, and proposes a root cause and a find/replace patch. In the hosted app this runs live: the **Triage this** button on a Repro match makes one Ultra call (about 27K prompt tokens; a second call only if the first patch fails validation). Code applies the patch to a temp copy of the game and replays the exact seed, and the page shows fixed or not fixed, decided by the replay, not the model. The Ultra call took 2.6 to 6.0 s in the three recorded live runs, and the whole click took 4.9 to 7.1 s (the before replay, and the after replay when a patch applied) (`docs/evidence/triage-live/`). The page says about 5-10 s (the recorded runs), longer if Ultra is slow. On the built-in example `p0537:1` the verdict is **not credited: the patch only switches on a fix the game already ships** (`data/samples/triage.json`). In Spec Drift (`/modes/drift`), one Ultra call (about 32K estimated prompt tokens) over `docs/design.md`, `game/README.md` and the game source proposed 8 doc-vs-code drift claims.

**Tavily** is called live from the hosted app: the **Find precedent** button on a Repro match sends the oracle's description (server-built query, developer sites only) and shows the top 3 writeups. 12 Tavily searches were also used offline to collect a committed corpus of 12 short review quotes (<= 300 chars) for the Design Advisor.

Thinking is turned off on every call (`chat_template_kwargs: {"enable_thinking": false}`). These are structured tasks, and with thinking on, short answers could come back empty.

## What is verified and what is synthetic

**Verified by code:**
- **Determinism.** `npm run engine:test` plays 16 seeds twice each. Final-state hashes and event lists matched for all 16 (`mismatches=0`).
- **Report claims.** Every structured claim Ultra makes (metric, scope, value) is recomputed from the raw runs. Main run: 31 of 31 matched. 13 seeds that Ultra cited did not exist in the runs and were dropped or repaired from the cited player and round (`ai/verify.ts`); the split between dropped and repaired was not stored.
- **Planted fixtures.** On a 1000-player fixture with four planted stories, Ultra found all four, including the single sweep-spamming player out of 1000. 23 of 24 claims were verified, and the one failure was a real error that the verifier caught.
- **Bug patch results across clusters.** Ultra's patch fixed bug3 (3 of 3 replays, shipped) and passed on the one bug4 seed (ending by KO at 18.73 s) but was NOT shipped (it removes a height guard); bug1 and bug2 patches fixed 0. In a regression crowd of 200 personas, bug rounds went from 4 to 3.
- **Spec Drift quotes and symbols.** Code verified for all 8 claims that the quoted text exists verbatim in the named doc and the symbol exists in the named code file ("8 of 8 verified, 0 dropped"). Existence checks only.
- **Advisor review attribution.** Code drops any citation not in the committed 12-quote corpus (`data/reviews/corpus.json`) and drops any "players say/like" claim without a citation.
- **Controls crawler.** 92 of 92 checks with stronger preconditions (a reviewer found 7 weak checks; fixed).
- **Tutorial Director struggle table.** Computed by code from the recorded run (casual players: 5.9% round win rate, 97% quit), and win rate changes for the 3 aids recomputed with the Patch Prophet paired crowd (200 personas, 1 round, seed 1).

**Synthetic, or not checked:**
- **The players.** Quitting and boredom come from a simple mood model with traits written by Nano. Crowd players run their policies natively. They are not driven by an LLM decision by decision.
- **Super's exploit explanation.** From strategy text alone it blamed "recovery-state grabs"; the recorded hits (117 SWEEP, 49 GROUND for the top strategy) show sweep into mount. The page now shows the measured hit tally beside each strategy, and the prompt includes it. Super's recorded prose after the tally names the sweep and the guard rule but still over-reads the grabs (`README.md`, "Honest limits").
- **Ultra's prose.** Only claims and seeds are checked. On a fixture, the narrative text included a made-up count.
- **Prices.** Only Ultra has a dollar estimate, at an unverified aggregator price. `usage.json` records 27 Ultra calls (892,282 tokens in, 16,225 out, about $0.94 including bug triage). Its Nano and Super rows cover only the exploit and oracle calls, not the persona run, so they understate those models.
- **Spec Drift semantic drift.** Ultra proposed 8 claims; a second model (Gemini 3.8 Flash, read-only) judged them: 3 real drift, 1 vague doc wording, 4 not drift. One run; the judge is a second opinion, not ground truth. No doc or code was changed because of it.
- **ReproBot fresh-play.** A local Gemma player (not Nemotron) did no better than a scripted baseline; full numbers under "Spec Drift, ReproBot, and Tutorial Director" below.
- **Advisor review corpus.** 12 search-snippet quotes, keyword topic tags, no sentiment, nothing trained; details under "Design Advisor" below.
- **Tutorial Director onboarding aids.** Win-rate changes on one seed, within noise, not proof that any tip teaches; full numbers under "Spec Drift, ReproBot, and Tutorial Director" below.

## Patch Prophet and game controls

On Balance, Super translates patch notes into validated tuning. **Run Patch Prophet** then runs a paired sample live in sequential child processes: the same 200 personas and seeds, one round each, recorded tuning versus the new tuning. The UI labels the sample and offers a cached fallback for the exact example tuning. Prophet adds no model call beyond the existing Super translation. The example gave 66 → 69 wins out of 200 on seed 1 and 55 → 64 on seed 2 (`docs/prophet.md`, `data/prophet/example.json`, `data/prophet/seed-2.json`). One hosted run with different tuning took 36.7 s, before 66/200 and after 62/200 (`docs/evidence/hosted-smoke-2026-10-29.md`).

The game UI and controls crawler reports **92 of 92 controls work**, covering HUD buttons, guide keys and an injected fake gamepad, with stronger preconditions after a reviewer found 7 weak checks (fixed). The `/games` block displays the report. A deliberately broken pause button is caught. No broken control was found, so nothing was fixed (`e2e/game-ui.spec.cjs`, `docs/controls.md`, `docs/controls-report.json`). Physical controller hardware is untested.

## Design Advisor

A vision model (Nemotron Super-VL) looks at four frames of a recorded round, the crowd data shows where simulated players quit and exploit, three web searches fetch developer and design writeups on comparable fighting games, and one Nemotron Super call turns that into at most six cited suggestions (lighting, camera, readability, difficulty, onboarding, dialogue, feedback). Code drops a suggestion that cites a web URL that was not a search result, and removes a citation to a crowd row that does not exist or a frame number out of range (a recommendation with no evidence left is dropped). It also drops one with an onboarding or dialogue suggestion that has no verbatim quote from the game text, a tuning key that does not exist, or a viral, trending or popular claim not found in a source it cites. The model is called once (a second time only if its first answer is not JSON). It is retrieval, not training: nothing is trained on viral or player-preference data, and no suggestion is proven to work. Gameplay suggestions name the tuning key that tests them with the crowd; visual ones need human playtesters. Code checks that cited evidence exists, not that it is relevant. Tested live on Market Brawl only.

The Advisor can also cite public review quotes from a committed corpus of 12 short quotes (<= 300 chars) with URLs from public review pages (IGN 4, Reddit 3, GameSpot 3, Steam 2), collected with 12 Tavily searches (`data/reviews/corpus.json`, `docs/reviews.md`). The Advisor can cite them as "player opinion"; code drops any citation not in the corpus and any "players say/like" claim without a citation. Quotes are search snippets from many games, not only fighting games. Topic tags are keyword guesses and can be wrong; sentiment is NOT used. Retrieval with attribution, nothing was trained or fine-tuned.

## Spec Drift, ReproBot, and Tutorial Director

- **Spec Drift page `/modes/drift`** (`docs/drift.md`, `data/drift/results.json`, `data/drift/judge.json`): one Nemotron Ultra call (about 32K estimated prompt tokens) over `docs/design.md`, `game/README.md` and the game source proposed 8 doc-vs-code drift claims; code verified for all 8 that the quoted text exists verbatim in the named doc and the symbol exists in the named code file ("8 of 8 verified, 0 dropped"; existence checks only). A second model (Gemini 3.8 Flash, read-only) judged them: 3 real drift, 1 vague doc wording, 4 not drift. The page shows second-model-confirmed ones first. One run; the judge is a second opinion, not ground truth. No doc or code was changed because of it.
- **ReproBot fresh-play (two runs, local Gemma player, not Nemotron).** A small local model (`gemma4:e4b-mlx`, no per-call cost) played 20 fresh seeds per arm and the oracle stopped each round on a match. For the **rare** example bug report (4 of 2,831 recorded rounds, so about a 2.8% chance of a single hit in 20 rounds) it reproduced **0 of 20** on the recorded build, 0 of 20 on the shipped build and 0 of 20 for a no-model baseline: that shows nothing, by construction. For a **common** report (the player is knocked down in the first 30 s) it reproduced **19 of 20** on the recorded build, **19 of 20** on the shipped build and 20 of 20 for the no-model baseline: the pipeline works end to end, but a model-driven player was not better than the scripted baseline. The local player fell back to a default move on 23% (recorded, rare) and 33% (shipped, rare) of its calls ([notes](https://github.com/Ps23102004/a-thousand-players/blob/main/docs/reprobot.md), `data/reprobot/results.json`, `data/reprobot/results-common.json`). The earlier Nemotron Nano attempt hit its 40-call budget after 2 rounds and is superseded.
- **Tutorial Director page `/modes/onboarding`** (`docs/tutor.md`, `data/tutor/results.json`): a struggle table computed from the recorded run (casual players: 5.9% round win rate, 97% quit) and 3 onboarding aids drafted by one Nemotron Super call, each measured with the Patch Prophet paired crowd (200 personas, 1 round, seed 1): overall wins of 200 before to after: 66 to 75, 66 to 69, 66 to 60; casual wins of 39: 5 to 9, 5 to 8, 5 to 5. One seed, within noise, round 1 only, quit model not re-simulated, no real new players. It shows what changes in win rates, not that any tip teaches anything.

## Proof of the fixes

[docs/PROOF.md](https://github.com/Ps23102004/a-thousand-players/blob/main/docs/PROOF.md) shows, for each of the four bug clusters, the same seed and player replayed with the recorded build (bug shows) and with the shipped game (clean), as frames from the real 3D replay plus engine numbers: all 29 flagged rounds replayed (21 bug1, 4 bug2, 3 bug3, 1 bug4), bug events with the recorded build 29 of 29, with the shipped game 0 of 29. Regenerate with `node scripts/proof-table.mjs`. Replays of known seeds, not a proof of absence.

## What is not done

- **Patch Prophet runs a sample.** The first 200 recorded personas, one round each, are not the full crowd or a randomized sample. Two seeds do not establish statistical significance or human preference.
- **Glitch Hunter is a second opinion.** Its 10 flagged rounds give wide intervals; clean means no recorded invariant event, not proof of absence. The engine remains the detector.
- **Still not built:** Mechanic Forge, ModForge, SightGuide, SimDojo. Commercial games were not tested.
- **Spec Drift checked existence only.** Code verified that quotes exist in docs and symbols exist in code (8 of 8), but not semantic correctness. The Gemini 3.8 Flash judge is a second opinion (3 real drift, 1 vague doc wording, 4 not drift), not ground truth. One run; no doc or code was changed because of it.
- **ReproBot fresh-play shows no model advantage.** See the full numbers under "Spec Drift, ReproBot, and Tutorial Director" above.
- **Review corpus is limited search snippets.** See "Design Advisor" above.
- **Tutorial Director measures tuning noise, not teaching.** See "Spec Drift, ReproBot, and Tutorial Director" above.
- **bug2 was fixed by hand, not by Ultra.** Out of bounds after a mount release (4 rounds): Ultra's patch failed twice (0 of 4). Replaying the seed tick by tick showed two causes in the mount-release code, a spawn inside a crate and a stale floor contact. The fix makes all 4 seeds run clean and cuts regression bug rounds from 4 to 1. The stale-contact part is a workaround with a visible side effect (the fighter rests 0.07 m low), and the underlying Rapier behavior is not understood.
- **bug3 fix was verified only on its own seeds.** The `throwProp` crash fix passed 3 of 3 replays. The 200-persona regression crowd never hits that crash, so it cannot show a side effect.
- **bug1 was not fixed by Ultra.** Ultra's patch fixed 0 of 8 replayed rounds. The shipped game replays all 21 clean (checked 2026-10-29): `mountReleaseFix`, `grabReleaseFix` and `getupCrateFix` are hand fixes. The last refreshes floor contacts at getup near a crate, clearing the remaining p0094:1 sweep-nerf round.
- **bug4 ships a hand fix, not Ultra's patch.** Ultra's patch removes a height guard entirely, so it is not shipped. The narrower `knockdownOnPropFix` is (a knockdown ends once the body is at rest), and the bug4 seed replays clean on the shipped game.
- **Full pipeline on one game.** The full pipeline (Ultra report, triage, Repro, Eyes) runs on Market Brawl only. Homeground and Clean Getaway have crowd-harness adapters only (see `docs/generality.md`).
- **No proof of absence.** The crowd samples the game. A bug it never hit may still exist.
- **Ultra's 1M-token context is unproven here.** About 300K prompt tokens worked. A 900K probe hit the per-minute token quota.
- **Live triage checks one seed, with no regression crowd.** "Fixed" on the Repro page means that one replayed round has no bug events. Ultra's live answers vary: of the two recorded bug2 rounds it missed one, and the one patch that passed the other only re-enabled a fix the game already ships, so it is no longer credited, and on bug4 its root cause was wrong (the offline run, which feeds the replay result back once, found a working patch). Each click makes up to two Ultra calls (the second only if the first patch fails validation). Ultra's stated confidence is not calibrated: across 20 measured live triages with a replay verdict (11 with the first prompt, 9 with the line-range prompt) it said 85-95% every time, and 1 was credited as a fix (stated 85%; it clamps a fighter's height rather than finding the cause). Counting the 4 offline triages too, 24 triages gave 3 credited fixes (docs/calibration.md).

## What came from the course project and what I built for this hackathon

The rules (section 4) ask for this. The hackathon opened on 2026-08-26. I checked dates with `git log`.

**From the course project: the test-bed game, Market Brawl.** Market Brawl is a 3D fighting game (Three.js + Rapier) that Parth wrote for the course CSCI 310, Project 2. It is the game the crowd plays. It is not the product. Market Brawl has no repository of its own: its 10 commits (2026-10-20 13:34 to 16:17 -0400) are in the history of Parth's private notes repository, filtered to the course folder. That history is not public, so the date claim is not publicly checkable. Its design document in `game/docs/superpowers/specs/` is dated 2026-10-20. So the game is Parth's own course project, started after the hackathon opened; it was written for the course, not for this hackathon. Everything else below was built for the hackathon. Parth owns Market Brawl and publishes it in this repository under the MIT license.

**Changed in the game for this project.** This repo's first commit is 2026-10-28 00:59 (-0400), and it already contains the game. Comparing `game/src` with the course project's `src` shows:
- one new file, `game/src/tuning.js`, a table of rule constants (guard damage, posture, a CPU decision delay) that `combat.js` and `ai.js` now read instead of hard-coded numbers, so the engine can override them;
- `world.js`: the arena's physics colliders moved into one function (`createArenaColliders`) so the headless engine builds the same arena;
- `replay.html`, a new page that replays a round from a seed in the real game.

**Changed in the game after the first commit.** The original committed snapshot was dated 2026-10-28 (last game commit `5c5792c`, 2026-10-28 21:45 -0400): 8 files and 62 lines added, 14 removed since commit `5794356`. Each rule fix sits behind a flag in `game/src/tuning.js`, so rounds recorded before the fix still replay as recorded:
- `mountReleaseFix` (commit `299bbde`): mount release avoids crates and refreshes the body's floor contact (`ground.js`, `main.js`). Commit `8c5589f` then put the fix behind the rule flag (`tuning.js`, `ground.js`) so recorded rounds still replay as recorded.
- `throwPropGuard` (`9ad93a5`): `throwProp` skips a crate that broke while carried (`props.js`). This is Ultra's patch.
- `grabReleaseFix` (`55cd763`): the same floor-contact refresh after a grab (`character.js`).
- `knockdownOnPropFix` (`5c5792c`): a knockdown ends once the body is at rest (`ground.js`).
- `getupCrateFix`: refresh floor contacts once at getup near an intact prop (`ground.js`); seed 501070 no longer floats beside the crate. Default on, recorded-build flag off.
- `cpuLowBlock` (`5c5792c`), now default on: a balance change that crouch-blocks low attacks and answers crouching recovery with a sweep (`ai.js`). The 100-seed decision sweep cuts crouch-jab wins 100/100 → 0/100 and all-keys wins 100/100 → 40/100; crowd win rate drops 31.0% → 23.5%, casual stays 5/39. Recorded rounds and comparison baselines pin 0 ([decision](https://github.com/Ps23102004/a-thousand-players/blob/main/docs/cpu-lowblock.md#decision)).
- `replay.html`: replay-link validation and clearer errors.

The game README also changed, and the 162 old model and texture files were removed from the tree and the history on 2026-10-28 because their license was not established.

**Two other games the adapters run on. Both are Parth's own.** `adapters/` runs the same crowd harness on two games (`docs/generality.md`):
- **Homeground**, a procedural longboard game. Repository `github.com/Ps23102004/homeground`: public, MIT, not a fork, created 2026-08-22 (first commit that day), 7 commits, last push 2026-09-11 (checked with `gh api`). **It was created before the hackathon opened on 2026-08-26.** Only its board physics is vendored here (`adapters/homeground/vendor`, upstream commit in `UPSTREAM_COMMIT`, license file "Copyright (c) 2026 Parth Singh"); the adapter that runs it is new in this repo.
- **Clean Getaway**, a 9-seat heist and trial game. It is a private repository that judges cannot open (its GitHub repository was created 2026-10-25, with no license). Parth's local clone has 52 commits, all by Parth, first 2026-10-05 18:39 -0400, last 2026-10-07 11:49 -0400 (`git log` of the local clone), so it was written after the hackathon opened but before this repo's first commit; those dates are not publicly checkable. Nothing of it is copied; the adapter reads it by path. **The Clean Getaway adapter cannot run from the public clone of this repo.** It needs that game checked out (default `~/Developer/clean-getaway`, or set `CLEAN_GETAWAY_ENGINE`), and the Clean Getaway numbers in `docs/generality.md` came from Parth's local clone.

The adapters are new in this repo (first committed in `55cd763`, 2026-10-28).

**New since 2026-10-28 (first commit 2026-10-28 00:59 -0400; updated through 2026-10-29):**
- `engine/`: the headless deterministic simulator, crowd runner, bug detection and fix verification.
- `ai/`: the Nemotron layer on Token Factory (personas, report and claim verification, triage, exploit search, oracle, vision, advisor, Tavily precedent).
- `app/`, `components/`, `lib/`: the Next.js web app, the live API routes, rate limits and cached examples.
- `data/run-main/`: the recorded 1000-player run and its outputs.
- Patch Prophet on Balance (`app/api/prophet`, `lib/prophet.ts`, `data/prophet/`), the game controls crawler (`e2e/game-ui.spec.cjs`, `docs/controls-report.json`, `/games` block), and the Glitch Hunter batch (`data/glitch-hunt/results.json`, `/bugs` block).
- `adapters/`, `e2e/`, `scripts/`, the tests and the docs.

The first commit already holds the engine, the AI layer and the web app, so any work before it was not committed in this repo.

## How AI assistance was used

AI coding assistants, mainly Claude, wrote much of the code, tests and documentation in this repo, and much of Market Brawl before it (the game README says AI assistance was used for implementation, debugging, visual design, tests and concept art). Parth directed the work and reviewed it. The commit trailers in this repo (`git log`) name Claude Opus 5.5, Claude Sonnet 5.5, Claude Fable 5.1, OpenAI Codex (gpt-6.1-sol and gpt-6.1-terra) and Gemini 3.8 Flash as co-authors of most commits; they cover this repo only, not Market Brawl's history. Several models also reviewed each other's work (see `docs/nemotron-review.md` and the review notes in the README). The narration in the demo video is the author's own recorded voice (cleaned: pauses and one fumble cut, sped up 1.08x), not a cloned voice (an earlier experiment with a locally cloned voice was not used in the submitted video). The concept image `game/assets/art/midnight-circuit.png` is AI-generated. The tool and date of that image are not recorded in the repo, and the share of the code written by hand was not measured.

Reviews used independent models: Gemini 3.8 Flash (Prophet security review: no defects; Glitch Hunter scoring: found defects, fixed; Spec Drift judge; Advisor corpus review: found mislabelled keyword sentiment, fixed by removing sentiment), Codex gpt-6.1-terra and gpt-6-luna (docs fact-check, controls test quality, drift/ReproBot review). Builders: Codex gpt-6.1-sol and gpt-6.1-terra, Gemini 3.8 Flash; Claude planned, reviewed and ran tests.

The models inside the product are NVIDIA Nemotron models served by Nebius Token Factory. The product does not trust them or the assistants: every structured number Ultra states is recomputed by code from the raw runs, cited seeds/rounds/events and drift quotes/symbols are checked to exist, determinism is tested (`npm run engine:test`, 16 seeds twice, `mismatches=0`), and every fix verdict comes from replaying the exact seed. Titles, prose and root-cause explanations are shown as model claims, not verified; a model's stated confidence is never used as a result (`docs/calibration.md`).

## Try it / testing instructions

**Hosted app:** https://a-thousand-players.vercel.app. No login, no account, free to use. Open it in any current browser.

**What each page does**
- `/` Home: the crowd grid replaying recorded rounds, and Ultra's findings with the numbers code re-checked.
- `/bugs`: the four bug clusters and what happened to each fix.
- `/games`: the same crowd harness on the other two games, with numbers.
- `/modes/exploit`: the 32 bot strategies, their landed hits, and replay links.
- `/modes/repro`: write a bug report in plain English; find the recorded rounds that show it, and the ReproBot fresh-play reproduction block.
- `/modes/balance`: write patch notes in plain English; get tuning values checked against allowed ranges.
- `/modes/advisor`: the Design Advisor, with cited suggestions for one round, grounded in public review quotes.
- `/modes/drift`: Spec Drift claims comparing docs against code, showing second-model-confirmed ones first.
- `/modes/onboarding`: Tutorial Director struggle table and 3 onboarding aids measured with Patch Prophet.
- `/replay?key=p0537%3A1`: the real 3D game re-simulating one recorded round from its seed.

**Click path for the Repro example (about 1 minute)**
1. Open `/modes/repro`.
2. Press **Use an example**, then **Find it in the crowd**. Super writes an oracle live. The page shows it and **2 rounds match**.
3. On a match, press **Triage this (Ultra)**. One live Ultra call (up to two tries) proposes a patch, code replays the seed with it, and the page shows **fixed**, **not fixed**, **patch did not apply** or **not a bug**. Any honest verdict is fine; "not fixed" is common. If the example is answered from the recorded sample, the verdict is **not credited: the patch only switches on a fix the game already ships**.
4. Press **Find precedent (Tavily)**. A live Tavily search shows up to 3 writeups.
5. Press a round's replay link. The real game loads at `/replay`, labelled **build as recorded (before the bug fixes)**. The page has speed buttons (0.5x, 1x, 2x, 4x). On `p0537:1` the airborne bug is at 13.8 s of round time (`docs/calibration.md` section 4), about 3.5 s of watching at 4x.
6. On the replay page, press **Look at 3 frames** (Eyes). Super-VL describes frames captured from the replay.

Steps 2, 3, 4 and 6 are live calls: Super writes the oracle, Ultra triages, Tavily searches, Super-VL looks at frames. Balance and the Advisor are live too: on `/modes/balance` press **Use an example**, then **Translate to tuning**, followed by **Run Patch Prophet** for the paired engine sample (no additional model call); on `/modes/advisor` press **Load this round**, then **Capture 4 frames and get suggestions**.

**Live routes, caps and cached answers** (read from `lib/ai-route.ts`)

The app has seven live API routes, including the model-free Patch Prophet route. Each has a per-address limit of 10 requests per minute and its own daily cap:

| Route | Used by | Model or service | Daily cap |
|---|---|---|---|
| `/api/repro` | Repro "Find it in the crowd" | Super | 80 |
| `/api/balance` | Balance "Translate to tuning" | Super | 40 |
| `/api/prophet` | Balance "Run Patch Prophet" | Child-process engine comparison; no model | 40 |
| `/api/eyes` | Replay page "Look at 3 frames" | Super-VL | 40 |
| `/api/triage` | Repro "Triage this (Ultra)" | Ultra, up to 2 calls per request | 40 |
| `/api/advisor` | Advisor | Super-VL, Super and 3 Tavily searches | 20 |
| `/api/precedent` | Repro "Find precedent" | Tavily | 100 |

- Repro, Balance, Eyes and Triage add up to 200 requests a day, the figure in the code comment in `lib/ai-route.ts`. The Advisor has its own 20 a day on top, and Find precedent (Tavily) has 100. The triage cap allows up to 80 Ultra calls a day.
- Counts are kept in memory in each server process (`lib/rate-limit.ts`). A restart resets them, and so does the UTC day change. On Vercel each running instance has its own counts, so the real ceiling can be higher than the table.
- Over a limit, a model/service route answers HTTP 429 with a `Retry-After` header. The exception for these routes: when the input is exactly the page's built-in example (the Repro and Balance example text, triage on `p0537:1`, the Advisor round `p0396:1`, Eyes on `p0537:1` with its default question, or the recorded precedent query), the route returns the real answer recorded for that example (`data/samples/*.json`, recorded 2026-10-28 and 2026-10-29), marked **cached** with the date. Any other input gets the 429.
- Prophet allows one live comparison per instance with a 100-second child-work deadline. On rate limit, busy or timeout, only the exact example tuning gets the labelled cached result (`data/prophet/example.json`); other tuning gets 429, 503 or 504 respectively (`lib/prophet.ts`).
- For the model/service routes, input over 4000 characters, a body over 64 KB, or a non-JSON body is refused before any model is called. With no API key on the server, a model/service route answers 503 "not configured". Prophet needs no key.

**Run it locally** (no keys needed to run the tests)

```bash
git clone https://github.com/Ps23102004/a-thousand-players && cd a-thousand-players
npm ci            # Node 22.15 or newer (package.json "engines")
npm test          # engine and TypeScript tests, offline, fake model endpoints
npm run dev       # http://localhost:3000 (predev copies the game into public/)
```

Optional: `cp .env.example .env` and set `NEBIUS_API_KEY` and `TAVILY_API_KEY` to turn on the live routes. Without them every recorded page works and model routes answer "not configured". Patch Prophet needs no key. Other checks: `npm run engine:test` (determinism, no key), `npx tsc --noEmit -p .` (types), `node scripts/check-recorded-replays.mjs` (recorded rounds replay event for event). Current gates (measured offline on 2026-10-30): engine 176 pass, 1 todo (`npm run test:engine`); TypeScript 385 pass, 2 todo (`node --import tsx --test ai/*.test.ts lib/*.test.ts app/api/*.test.ts app/modes/**/*.test.ts*`, broken down as `npm run test:ts` 378 pass + `app/modes` tests 7 pass); browser suite: 88 passed (7 skipped) in the last full run on 2026-10-30 plus black-box spec: 6 planted-bug cases; recorded replays: 45 of 45; engine:test mismatches=0.

## Uptime and cost

The hosted app is kept live and free to use through the end of judging, 2026-12-15, as the rules require (section 4, Testing). It runs on the Vercel Hobby plan, deployed from the CLI with no git integration, so pushing to GitHub does not update it. Parth watches the hosted app through 2026-12-15 and checks the Token Factory and Tavily credit balances himself. The daily caps above (`lib/ai-route.ts`) exist to protect model and search credits for that whole period. I will not remove them. When a cap is hit, the built-in examples still answer from recorded real outputs, so the main demo path keeps working.

The caps bound spend per server process, not for the whole deployment (see above). Measured spend of the main run: 27 Ultra calls, 892,282 tokens in and 16,225 out, about $0.94 at an unverified aggregator price (`data/run-main/usage.json`). Live triage is the costly route: about 27K prompt tokens per Ultra call (`README.md`).

