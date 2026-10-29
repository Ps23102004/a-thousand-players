# A Thousand Players — Devpost

> Team note, not for paste: placeholders look like `[PARTH: ...]`, `[PARTH/LEAD: ...]`, `[YOUTUBE_URL]`. Search for `[` before pasting. Everything between the two horizontal rules below is the Devpost form, in form order.

---

## Submission fields

**Project name:** A Thousand Players

**Track:** Best Apps and Agents

Why this track (the official track text is quoted below):

1. The track asks for "any app or agent someone would actually use". This is a web app for small game teams with no QA department. It needs no login, and each page is tagged **Recorded run** or **Live model call**.
2. The track text says to "reach for Nemotron 3 Ultra when you need serious reasoning, and let Nano or Super handle the fast, everyday calls". That is the split here. Nano wrote 1000 personas in 289 s (`ai/README.md`). Super turns a bug report into a checkable oracle in 0.7 to 1.6 s (`ai/README.md`). Ultra read a 220,334-token summary of the whole crowd in one call (`data/run-main/findings.json`).
3. The track tip says "a multi-step autonomous workflow that chains tools end to end stands out". The workflow here is: personas, 2831 simulated rounds, an Ultra report, code recomputing every claim, bug clusters, an Ultra patch, a sandboxed replay of the exact seed, and a replay link into the real game.
4. The hosted app is built to make live Token Factory calls (Repro, Balance, Eyes, Design Advisor, live Triage) and one live Tavily search (Find precedent), so it is not only a page of recorded output. [PARTH/LEAD: confirm live routes hosted]

Honest weakness: the triage agent is the weakest part. Across 24 measured triages, 3 patches made the replayed round run clean (2 of the first 15, then 1 of 9 with the line-range prompt; `docs/calibration.md` sections 1 and 6). Coding and Agentic Engineering is the alternative track, since the triage loop applies a patch and tests it by replaying the seed. It would put that low fix rate at the center of the entry, so we chose the track that fits the whole product.

**Built With:** Nebius Token Factory, NVIDIA Nemotron 3 Nano 30B, NVIDIA Nemotron 3 Super 120B, NVIDIA Nemotron 3.5 Super-VL, NVIDIA Nemotron 3 Ultra 550B, Tavily, Next.js, React, TypeScript, Node.js, Three.js, Rapier (`@dimforge/rapier3d-compat`), undici, Vercel

**Links:**
- Live demo: https://a-thousand-players.vercel.app
- Demo video: [YOUTUBE_URL]
- Code: https://github.com/Ps23102004/a-thousand-players (MIT license)

**Feedback (Token Factory and the NVIDIA models):** the full text is `docs/token-factory-feedback.md` in the repo. It gives five points for Token Factory, Nemotron Nano, Super, Super-VL and Ultra (what we used it for, what worked, what needs work, onboarding, would we build with it again), plus a Tavily note. [PARTH: paste it or link it here, and fill its onboarding `[PARTH: ...]` placeholders first.]

**Nebius products used:** only Nebius Token Factory was used. Nebius AI Cloud was not used.

**Teammates:** Parth Singh (owner and builder), Aman (research, rules and legal checks), Aashna (engineering and testing). [PARTH: Devpost needs each person's account added and the invitation accepted; name the Representative.]

---

> Team note, not for paste. Track is **recommended, Parth decides**: `docs/team/REQUIREMENTS.md` section D suggests Best Apps and Agents and Aman has not yet confirmed it against the live rules. The repo is private until Parth flips it public; the Code link only works after that.
>
> Checked while writing this file:
> - Package list: the Built With names come from `package.json`, `ai/models.ts` and `ai/precedent.ts`. Playwright is left out of Built With: it is not in `package.json`, and the browser suite in `e2e/` runs on a global `@playwright/cli` install (`e2e/README.md`). Add it back if you want to credit the test tool.
> - Hosting: the app is live at https://a-thousand-players.vercel.app, deployed from the Vercel CLI on the Hobby plan. There is no git integration, so a push does not redeploy; run the deploy again after any change. Commit `35f0a5f` made the pages static to fit Hobby's 12-function limit. API keys were being added when this was written, so `[PARTH/LEAD: confirm live routes hosted]` markers stay in the text until someone has clicked every live button on the hosted URL.
> - Model names: the Token Factory ids in `ai/models.ts` are `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`, `nvidia/nemotron-3-super-120b-a12b`, `nvidia/Nemotron-3.5-Super-VL` and `nvidia/Nemotron-3-Ultra-550b-a55b`.
> - Triage numbers: "3 of 24" is 2 of 15 plus 1 of 9, the same figures as the last bullet of "What is not done".


## Summary

Indie developers rarely get enough playtesters. A Thousand Players gives them a crowd. Nemotron Nano writes 1000 synthetic player personas, from patient turtles to button-mashers to cheesers. A headless, deterministic copy of the game plays every one of them, and Nemotron Ultra reads a summary of all the play logs in a single context to find where players struggle, quit, or break the game.

Every finding cites seeds, and any seed replays the same match in the real 3D game in the browser. Code re-checks every number Ultra claims before showing it. When the engine catches a broken round, Ultra proposes a patch, and the engine applies it to a scratch copy of the game and replays the exact seeds to see if the bug is gone.

Our test bed is Market Brawl, a student's Three.js + Rapier fighting game. In the main run, 1000 players played 2831 rounds. Ultra returned 8 findings; all 31 of its numeric claims matched the data code recomputed (they are cells of tables code also put in its prompt, so this checks reading, not discovery). On a planted 1000-player fixture it found all 4 hidden stories. Four rule fixes are in the game: `throwPropGuard` (bug3's crash guard, Ultra's patch), `mountReleaseFix` (bug2, by hand after Ultra failed twice), `grabReleaseFix` and `knockdownOnPropFix` (both by hand; with the mount fix they make all 8 replayed bug1 rounds and the bug4 seed run clean). Ultra's own bug4 patch was verified on 1 seed and not shipped; its bug1 patch fixed 0 of 8.

The players are synthetic. The findings are hypotheses to replay and check, not a replacement for real people.

**Who it is for.** Small game teams with no QA department. Other tools already use AI agents to play-test games; this project is MIT licensed, proves each finding with a deterministic replay, and checks the model's claims with code. It is a prototype with one game adapter. [PARTH: name comparable tools only after you have checked them. `docs/judge-panel.md` recalls modl.ai and nunu.ai from memory, not from a checked source.]

## How Nemotron is used

All calls go to Nebius Token Factory through its OpenAI-compatible chat completions API. Each model has a job that needs it:

- **Nemotron Nano 30B** writes persona policies in bulk (1000 personas in 289 s over 69 calls). It can also pick each action live for a spotlight player (implemented and measured, not part of the main run) (median 3.5 s per uncached call, 3 tokens out), and it proposes and evolves exploit strategies (32 strategies over 2 generations).
- **Nemotron Super 120B** turns English into things the engine can run: a bug report becomes an oracle predicate that plain code then runs over all 2831 recorded rounds to find the replayable ones, and patch notes become tuning overrides (0.7 to 1.6 s per report). It also explains why the winning exploit strategies work, once the prompt includes the hits the engine recorded; from the rule text alone it guessed a wrong mechanism (see "What is verified").
- **Nemotron Super-VL** looks at replay frames and describes what it sees (5.2 s for one frame). In the Eyes panel it gets three frames captured from the live replay. In a 6-round test it flagged 3 of 3 bug rounds and 0 of 3 clean rounds; on the first demo round it missed a fighter floating far from the camera. It is a description aid; the engine decides what is a bug.
- **Nemotron Ultra 550B** reads the whole crowd at once. For the main run, that was 220,334 prompt tokens covering 1000 players and 2831 rounds, in one call, with no chunking. It was a summary: per-round timed events (knockdown, throw, prop, mount) were trimmed for all 1000 players to fit the budget (989 keep counts and bug events, 11 show outcomes only; the aggregates cover every round). Ultra also does bug triage: it reads a timeline re-simulated from the seed plus the relevant game source, and proposes a root cause and a find/replace patch. In the hosted app this is meant to run live [PARTH/LEAD: confirm live routes hosted]: the **Triage this** button on a Repro match makes one Ultra call (about 27K prompt tokens; a second call only if the first patch fails validation). Code applies the patch to a temp copy of the game and replays the exact seed, and the page shows fixed or not fixed, decided by the replay, not the model. The Ultra call took 2.6 to 6.0 s in the three recorded live runs, and the whole click took 4.9 to 7.1 s (the before replay, and the after replay when a patch applied) (`docs/evidence/triage-live/`). The page itself tells the user to expect about 20-40 s. On the built-in example `p0537:1` the verdict is **not credited: the patch only switches on a fix the game already ships** (`data/samples/triage.json`).

**Tavily** is called live from the hosted app ([PARTH/LEAD: confirm live routes hosted]): the **Find precedent** button on a Repro match sends the oracle's description (server-built query, developer sites only) and shows the top 3 writeups.

Thinking is turned off on every call (`chat_template_kwargs: {"enable_thinking": false}`). These are structured tasks, and with thinking on, short answers could come back empty.

## What is verified and what is synthetic

**Verified by code:**
- **Determinism.** `npm run engine:test` plays 16 seeds twice each. Final-state hashes and event lists matched for all 16 (`mismatches=0`).
- **Report claims.** Every structured claim Ultra makes (metric, scope, value) is recomputed from the raw runs. Main run: 31 of 31 matched. 13 seeds that Ultra cited did not exist in the runs and were dropped or repaired from the cited player and round (`ai/verify.ts`); the split between dropped and repaired was not stored.
- **Planted fixtures.** On a 1000-player fixture with four planted stories, Ultra found all four, including the single sweep-spamming player out of 1000. 23 of 24 claims were verified, and the one failure was a real error that the verifier caught.
- **Two bug fixes.** bug3: Ultra's `throwProp` guard made all 3 crashing seeds run clean. bug4 (below): For bug4 (a knocked-down fighter stuck mid-fall until the 99 s time limit), Ultra's patch made the replayed seed end by KO at 18.73 s with no bug events. In a regression crowd of 200 personas, bug rounds went from 4 to 3.

**Synthetic, or not checked:**
- **The players.** Quitting and boredom come from a simple mood model with traits written by Nano. Crowd players run their policies natively. They are not driven by an LLM decision by decision.
- **Super's exploit explanation.** From strategy text alone it blamed "recovery-state grabs"; the recorded hits (117 SWEEP, 49 GROUND for the top strategy) show sweep into mount. The page now shows the measured hit tally beside each strategy, and the prompt includes it. Super's recorded prose after the tally names the sweep and the guard rule but still over-reads the grabs (`README.md`, "Honest limits").
- **Ultra's prose.** Only claims and seeds are checked. On a fixture, the narrative text included a made-up count.
- **Prices.** Only Ultra has a dollar estimate, at an unverified aggregator price. `usage.json` records 27 Ultra calls (892,282 tokens in, 16,225 out, about $0.94 including bug triage). Its Nano and Super rows cover only the exploit and oracle calls, not the persona run, so they understate those models.

## Design Advisor

A vision model (Nemotron Super-VL) looks at four frames of a recorded round, our crowd data shows where simulated players quit and exploit, three web searches fetch developer and design writeups on comparable fighting games, and one Nemotron Super call turns that into at most six cited suggestions (lighting, camera, readability, difficulty, onboarding, dialogue, feedback). Code drops a suggestion that cites a web URL that was not a search result, and removes a citation to a crowd row that does not exist or a frame number out of range (a suggestion with no evidence left is dropped). It also drops one with an onboarding or dialogue suggestion that has no verbatim quote from the game text, a tuning key that does not exist, or a viral, trending or popular claim not found in a source it cites. The model is called once (a second time only if its first answer is not JSON). It is retrieval, not training: nothing is trained on viral or player-preference data, and no suggestion is proven to work. Gameplay suggestions name the tuning key that tests them with the crowd; visual ones need human playtesters. Code checks that cited evidence exists, not that it is relevant. Tested live on Market Brawl only.

## What is not done

- **bug2 was fixed by hand, not by Ultra.** Out of bounds after a mount release (4 rounds): Ultra's patch failed twice (0 of 4). Replaying the seed tick by tick showed two causes in the mount-release code, a spawn inside a crate and a stale floor contact. The fix makes all 4 seeds run clean and cuts regression bug rounds from 4 to 1. The stale-contact part is a workaround with a visible side effect (the fighter rests 0.07 m low), and the underlying Rapier behavior is not understood.
- **bug3 fix was verified only on its own seeds.** The `throwProp` crash fix passed 3 of 3 replays. The 200-persona regression crowd never hits that crash, so it cannot show a side effect.
- **bug1 was not fixed by Ultra.** Fighter floats up after a mount release, 21 rounds: Ultra's patch fixed 0 of 8 replayed rounds. The shipped game now replays all 8 clean (checked 2026-10-28): the bug2 mount-release fix clears 5 and `grabReleaseFix` (a hand fix for the same stale floor contact after a grab) clears the other 3. The other 13 rounds of the cluster were not replayed.
- **bug4 ships a hand fix, not Ultra's patch.** Ultra's patch removes a height guard entirely, so it is not shipped. The narrower `knockdownOnPropFix` is (a knockdown ends once the body is at rest), and the bug4 seed replays clean on the shipped game.
- **One game.** The adapter contract is documented, but Market Brawl is the only game that implements it.
- **No proof of absence.** The crowd samples the game. A bug it never hit may still exist.
- **Ultra's 1M-token context is unproven here.** About 300K prompt tokens worked. A 900K probe hit the per-minute token quota.
- **Live triage checks one seed, with no regression crowd.** "Fixed" on the Repro page means that one replayed round has no bug events. Ultra's live answers vary: of the two recorded bug2 rounds it missed one, and the one patch that passed the other only re-enabled a fix the game already ships, so it is no longer credited, and on bug4 its root cause was wrong (the offline run, which feeds the replay result back once, found a working patch). Each click makes up to two Ultra calls (the second only if the first patch fails validation). Ultra's stated confidence is not calibrated: across 20 measured live triages with a replay verdict (11 with the first prompt, 9 with the line-range prompt) it said 85-95% every time, and 1 was credited as a fix (stated 85%; it clamps a fighter's height rather than finding the cause). Counting the 4 offline triages too, 24 triages gave 3 credited fixes (docs/calibration.md).

## What came from the course project and what we built for this hackathon

The rules (section 4) ask for this. The hackathon opened on 2026-08-26. We checked dates with `git log`.

**From the course project: the test-bed game, Market Brawl.** Market Brawl is a 3D fighting game (Three.js + Rapier) that Parth wrote for the course CSCI 310, Project 2. It is the game our crowd plays. It is not the product. The git history of its separate course repository has 10 commits from 2026-10-20 13:34 to 2026-10-20 16:17 (-0400), and its design document in `game/docs/superpowers/specs/` is dated 2026-10-20. So the game is Parth's own course project, started after the hackathon opened; it was written for the course, not for this hackathon. Everything else below was built for the hackathon. [PARTH: confirm the real start date of Market Brawl and say whether any earlier version exists; confirm the course and university allow publishing it under MIT (`docs/team/LEGAL-AND-LICENSES.md` L1).]

**Changed in the game for this project.** This repo's first commit is 2026-10-28 00:59 (-0400), and it already contains the game. Comparing `game/src` with the course project's `src` shows:
- one new file, `game/src/tuning.js`, a table of rule constants (guard damage, posture, a CPU decision delay) that `combat.js` and `ai.js` now read instead of hard-coded numbers, so the engine can override them;
- `world.js`: the arena's physics colliders moved into one function (`createArenaColliders`) so the headless engine builds the same arena;
- `replay.html`, a new page that replays a round from a seed in the real game.

**Changed in the game after the first commit.** All of these were committed on 2026-10-28 (no `game/` commit is dated later; the last is `5c5792c`, 2026-10-28 21:45 -0400). They are 8 files and 62 lines added, 14 removed since commit `5794356`. Each rule fix sits behind a flag in `game/src/tuning.js`, so rounds recorded before the fix still replay as recorded:
- `mountReleaseFix` (commit `299bbde`): mount release avoids crates and refreshes the body's floor contact (`ground.js`, `main.js`). Commit `8c5589f` then put the fix behind the rule flag (`tuning.js`, `ground.js`) so recorded rounds still replay as recorded.
- `throwPropGuard` (`9ad93a5`): `throwProp` skips a crate that broke while carried (`props.js`). This is Ultra's patch.
- `grabReleaseFix` (`55cd763`): the same floor-contact refresh after a grab (`character.js`).
- `knockdownOnPropFix` (`5c5792c`): a knockdown ends once the body is at rest (`ground.js`).
- `cpuLowBlock` (`5c5792c`), default off: an optional CPU rule to crouch-block low attacks (`ai.js`).
- `replay.html`: replay-link validation and clearer errors.

The game README also changed, and the 162 old model and texture files were removed from the tree and the history on 2026-10-28 because their license was not established (`docs/team/LEGAL-AND-LICENSES.md`).

**Two other games the adapters run on.** `adapters/` runs the same crowd harness on Homeground (a longboard game; its physics is vendored under `adapters/homeground/vendor`, MIT, upstream commit in `UPSTREAM_COMMIT`) and Clean Getaway (read by path, nothing copied). The adapters are new in this repo (first committed in `55cd763`, 2026-10-28; `docs/generality.md`). [PARTH: confirm both games are yours and give their creation dates; until then this text claims nothing about when the games were written.]

**New since 2026-10-28 (first commit 2026-10-28 00:59 -0400; through commit `35f0a5f` on 2026-10-29):**
- `engine/`: the headless deterministic simulator, crowd runner, bug detection and fix verification.
- `ai/`: the Nemotron layer on Token Factory (personas, report and claim verification, triage, exploit search, oracle, vision, advisor, Tavily precedent).
- `app/`, `components/`, `lib/`: the Next.js web app, the live API routes, rate limits and cached examples.
- `data/run-main/`: the recorded 1000-player run and its outputs.
- `adapters/`, `e2e/`, `scripts/`, the tests and the docs.

The first commit already holds the engine, the AI layer and the web app, so any work before it was not committed in this repo. [PARTH: say when you actually began building the platform, if that matters for the form.]

## How AI assistance was used

[PARTH: confirm wording. This statement is yours to own.]

AI coding assistants, mainly Claude, wrote much of the code, tests and documentation in this repo, and much of Market Brawl before it (the game README says AI assistance was used for implementation, debugging, visual design, tests and concept art). Parth directed the work and reviewed it. [PARTH: confirm the assistants and models used, and how much of the code you wrote by hand.] The concept image `game/assets/art/midnight-circuit.png` is AI-generated. [PARTH: name the tool and date.]

The models inside the product are NVIDIA Nemotron models served by Nebius Token Factory. The product does not trust them or the assistants: every number Ultra states is recomputed by code from the raw runs, determinism is tested (`npm run engine:test`, 16 seeds twice, `mismatches=0`), and every fix verdict comes from replaying the exact seed. A model's stated confidence is never used as a result (`docs/calibration.md`).

## Try it / testing instructions

**Hosted app:** https://a-thousand-players.vercel.app. No login, no account, free to use. Open it in any current browser. [PARTH/LEAD: confirm live routes hosted]

**What each page does**
- `/` Home: the crowd grid replaying recorded rounds, and Ultra's findings with the numbers code re-checked.
- `/bugs`: the four bug clusters and what happened to each fix.
- `/games`: the same crowd harness on the other two games, with numbers.
- `/modes/exploit`: the 32 bot strategies, their landed hits, and replay links.
- `/modes/repro`: write a bug report in plain English; find the recorded rounds that show it.
- `/modes/balance`: write patch notes in plain English; get tuning values checked against allowed ranges.
- `/modes/advisor`: the Design Advisor, with cited suggestions for one round.
- `/replay?key=p0537%3A1`: the real 3D game re-simulating one recorded round from its seed.

**Click path for the Repro example (about 1 minute)**
1. Open `/modes/repro`.
2. Press **Use an example**, then **Find it in the crowd**. Super writes an oracle live. The page shows it and **2 rounds match**.
3. On a match, press **Triage this (Ultra)**. One live Ultra call (up to two tries) proposes a patch, code replays the seed with it, and the page shows **fixed**, **not fixed**, **patch did not apply** or **not a bug**. Any honest verdict is fine; "not fixed" is common. If the example is answered from the recorded sample, the verdict is **not credited: the patch only switches on a fix the game already ships**.
4. Press **Find precedent (Tavily)**. A live Tavily search shows up to 3 writeups.
5. Press a round's replay link. The real game loads at `/replay`, labelled **build as recorded (before the bug fixes)**. The page has speed buttons (0.5x, 1x, 2x, 4x). On `p0537:1` the airborne bug is at 13.8 s of round time (`docs/calibration.md` section 4), about 3.5 s of watching at 4x.
6. On the replay page, press **Look at 3 frames** (Eyes). Super-VL describes frames captured from the replay.

Steps 2, 3, 4 and 6 are live calls: Super writes the oracle, Ultra triages, Tavily searches, Super-VL looks at frames. [PARTH/LEAD: confirm live routes hosted] Balance and the Advisor are live too: on `/modes/balance` press **Use an example**, then **Translate to tuning**; on `/modes/advisor` press **Load this round**, then **Capture 4 frames and get suggestions**.

**Live routes, caps and cached answers** (read from `lib/ai-route.ts`)

The app has six live API routes. Each has a per-address limit of 10 requests per minute and its own daily cap:

| Route | Used by | Model or service | Daily cap |
|---|---|---|---|
| `/api/repro` | Repro "Find it in the crowd" | Super | 80 |
| `/api/balance` | Balance "Translate to tuning" | Super | 40 |
| `/api/eyes` | Replay page "Look at 3 frames" | Super-VL | 40 |
| `/api/triage` | Repro "Triage this (Ultra)" | Ultra, up to 2 calls per request | 40 |
| `/api/advisor` | Advisor | Super-VL, Super and 3 Tavily searches | 20 |
| `/api/precedent` | Repro "Find precedent" | Tavily | 100 |

- Repro, Balance, Eyes and Triage add up to 200 requests a day, the figure in the code comment in `lib/ai-route.ts`. The Advisor has its own 20 a day on top, and Find precedent (Tavily) has 100. The triage cap allows up to 80 Ultra calls a day.
- Counts are kept in memory in each server process (`lib/rate-limit.ts`). A restart resets them, and so does the UTC day change. On Vercel each running instance has its own counts, so the real ceiling can be higher than the table.
- Over a limit, a route answers HTTP 429 with a `Retry-After` header. The one exception: when the input is exactly the page's built-in example (the Repro and Balance example text, triage on `p0537:1`, the Advisor round `p0396:1`, Eyes on `p0537:1` with its default question, or the recorded precedent query), the route returns the real answer recorded for that example (`data/samples/*.json`, recorded 2026-10-28 and 2026-10-29), marked **cached** with the date. Any other input gets the 429.
- Input over 4000 characters, a body over 64 KB, or a non-JSON body is refused before any model is called. With no API key on the server, a route answers 503 "not configured".

**Run it locally** (no keys needed to run the tests)

```bash
git clone https://github.com/Ps23102004/a-thousand-players && cd a-thousand-players
npm ci            # Node 22.15 or newer (package.json "engines")
npm test          # engine and TypeScript tests, offline, fake model endpoints
npm run dev       # http://localhost:3000 (predev copies the game into public/)
```

Optional: `cp .env.example .env` and set `NEBIUS_API_KEY` and `TAVILY_API_KEY` to turn on the live routes. Without them every recorded page works and the live routes answer "not configured". Other checks: `npm run engine:test` (determinism, no key), `npx tsc --noEmit -p .` (types), `node scripts/check-recorded-replays.mjs` (recorded rounds replay event for event). `npm test` ran on 2026-10-29: engine 134 pass, 1 todo; TypeScript 252 pass, 2 todo (254 tests). `node scripts/check-recorded-replays.mjs` replays 45 of 45 recorded rounds identically. The browser suite is described in `e2e/README.md` (not re-run for this text).

## Uptime and cost

The hosted app is meant to stay live and free to use through the end of judging, 2026-12-15, as the rules require (section 4, Testing). It runs on the Vercel Hobby plan, deployed from the CLI with no git integration, so pushing to GitHub does not update it. [PARTH: confirm Hobby limits are enough for the judging period.] The daily caps above exist to protect model and search credits for that whole period. We will not remove them. When a cap is hit, the built-in examples still answer from recorded real outputs, so the main demo path keeps working.

The caps bound spend per server process, not for the whole deployment (see above). Measured spend so far: the main run used 27 Ultra calls, 892,282 tokens in and 16,225 out, about $0.94 at an unverified aggregator price (`data/run-main/usage.json`). Live triage is the costly route: about 27K prompt tokens per Ultra call (`README.md`).

[PARTH: confirm who watches the app and how often (the runbook says weekly). Write the Token Factory and Tavily credit balances and the date you checked them.]

