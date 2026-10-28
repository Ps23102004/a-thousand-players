# Judge panel: A Thousand Players

Written 2026-10-28 by an independent review session, one day before the deadline (Fri 2026-10-30 10:00 PT). It was a read-only review: no source was edited, no paid model API was called, and `.env` was not read.

**Checked by running code on this machine:**

- `npm run engine:test` printed `16 seeds x2 runs, mismatches=0, 23.9 rounds/s, 19k ticks/s`. The README says 28.6 rounds/s; the gap is load on this machine.
- `npx tsx --test lib/*.test.ts ai/logic.test.ts` passed 30 of 30.
- `npx tsc --noEmit -p .` exited 0.
- `git grep` found no API keys in tracked files. `.env*` is ignored and was never committed.
- Data checks with `node -e` over `data/run-main/*.json`: 31 of 31 claims have `ok: true`, `traces.json` has 0 live tiles, and the verdicts in `triage.json` are listed under Judge 4.

**Scope.** Scores reflect the repo as it stands today. Three things do not exist yet: a hosted URL, a video and a public repo. Scores that depend on them say so.

---

## Reconciled verdict

| Judge | Overall today | After the top 5 fixes (estimate) |
|---|---|---|
| 1. NVIDIA / Nebius technical | 7.6 | 8.3 |
| 2. Product and impact | 6.0 | 6.6 |
| 3. Demo and presentation | 5.6 | 7.8 |
| 4. Skeptic and security | 5.2 | 8.0 |
| **Panel (mean)** | **6.1** | **7.7** |

**Strength.** The engineering is better than most hackathon entries. It has a real deterministic engine, a browser replay whose hash matches the headless run, claim-by-claim verification of model output, and replay-verified patches. It also has an unusually honest limits section. On the NVIDIA angle, four Nemotron models each have a distinct job, and code checks each model's output. That is the "system of models" story NVIDIA itself tells.

**What drags the score down.** Mostly the submission, not the idea:

- Nothing is deployed, recorded or public.
- The repo ships 27 MB of 3D assets with unestablished licensing.
- Six or so statements in the docs and UI contradict the code or the data.
- The two most impressive model jobs, Ultra's long-context read and Nano's persona writing, never run in the hosted app.
- The Tavily output that would earn the bonus is junk.

All of this is fixable in about a day. The panel agrees that the order is: compliance and contradictions first, then the hosted demo and video, then the single addition named below.

---

## Judge 1: NVIDIA / Nebius technical

| Criterion | Score /10 | Evidence |
|---|---|---|
| Nemotron is load-bearing | 8 | Ultra reads 220,334 prompt tokens in one call (`data/run-main/findings.json`: `tokensIn 220334`). Nano wrote all 1000 personas. Super turns English into an oracle that code then runs (`app/api/repro/route.ts:7-9`). Remove any one model and a feature disappears. |
| Model variety and fit | 8 | Nano, Super, Ultra and Super-VL each have a different job (`ai/models.ts:4-7`, `README.md:48-54`). Small models do volume and the big model does hard reads. This matches the "system of models" in the vault's NVIDIA evidence base. |
| Depth of Token Factory use | 7 | `enable_thinking` was probed on all four models. 429 retry-after parsing, a 15-minute undici timeout and image_url input to VL all work (`ai/models.ts:12, 35-42, 47-49`). **But** the hosted runtime only calls Super and Super-VL (`app/api/*`). Ultra and Nano run offline in CLI scripts only. |
| Long-context use | 7 | 220K tokens in one call, with a budgeted trimming ladder (`ai/corpus.ts:103-132`). However, every claim Ultra makes maps onto a cell of a code-computed header (`ai/corpus.ts:13-45`: by archetype, by round, archetype x round). "31 of 31 verified" therefore mostly proves that Ultra transcribed numbers correctly, not that it found patterns. The planted-fixture test (`ai/README.md:35-43`, which finds the single sweep-spammer among 1000) is the stronger evidence and should lead. 1M context is unproven (`docs/devpost.md:45`). |
| Claims are verified | 9 | Claims are recomputed (`ai/verify.ts`), invented seeds are removed (13 in the main run), and patches are replayed on exact seeds. The project also documents where models failed: Super's wrong exploit mechanism, Super-VL's miss, and Ultra's bug2 patch. |
| **Overall** | **7.6** | |

**Rationale.** This is a model-as-hypothesis, code-as-judge architecture, and it is the strongest technical pattern in the entry. Two things would move it up. Ultra should be called at runtime in the hosted app at least once. The verification story should lead with the planted fixture and with checks that are not simply cells copied from the header. The fraction tolerance of ±0.05 absolute (`ai/verify.ts:40`) is loose for rates near 0: a claimed 4% win rate would pass for anything from 0% to 9%.

## Judge 2: Product and impact

| Criterion | Score /10 | Evidence |
|---|---|---|
| The pain is real | 7 | Indie studios lack playtesters and QA hours, and bugs that cannot be reproduced cost real time. The four real bugs found in a real game, with seeds, back this up (`README.md:26-31`). |
| A clear user | 5 | "Indie developers" (`docs/devpost.md:5`), but no named user, quote or workflow. The test bed is the author's own class game. A judge will ask who pays and what they do on Monday morning. |
| Differentiation from prior art | 6 | The vault names modl.ai (enterprise game-testing bots) and Orak (ICLR 2026 benchmark) (`Game ideas 2026-10-28.md`). The panel also knows of nunu.ai (agent game QA), Regression Games, and EA SEED's RL playtesting research. These were recalled from memory and not re-checked today. The entry's real differentiators are seed-exact replay, model claims checked by code, and patches proven by replay. Those are not stated against the competitors anywhere in the docs. |
| More than a demo | 5 | There is one adapter (`README.md:139-148`). Archetype behavior comes from a hand-written base table (`engine/policy.mjs:8-17`). The bug invariants are specific to Market Brawl. Porting to a second game is the real product test, and it has not been done. |
| Evidence of value | 7 | Two model-proposed fixes (bug3, bug4) were replay-verified, and one bug was hand-traced with the tooling. The CPU's crouch-block hole was confirmed by an exploit search over 960 rounds. These are real outcomes. |
| **Overall** | **6.0** | |

**Rationale.** The product is credible, but the story stops at "it worked on my game." One paragraph on who uses it and why seed replay beats modl.ai-style bots would be worth more than another feature. So would a one-line "what it would take to adapt your game" estimate.

## Judge 3: Demo and presentation (as a stranger)

| Criterion | Score /10 | Evidence |
|---|---|---|
| The video script | 7 | Tight, with numbers sourced and limits stated (`docs/video-script.md:6-35`). The voice-over is 321 words, about 2:10 at 150 wpm, so it fits. The 1:20 beat packs three bugs, two verdicts and a hand fix into 28 seconds, and a viewer will get lost there. |
| README for a stranger | 7 | Good structure, results tables and honest limits. But "What it does" lists 8 steps and omits Balance mode, which is in the nav (`app/layout.tsx:34`). There is no screenshot, no demo URL and no 30-second "try this" path. |
| Hosted-demo story | 3 | No URL exists. The video says "Try it at [URL]" (`docs/video-script.md:17`). Nothing tells a visitor which pages are live model calls (Repro, Balance, Eyes) and which are precomputed (Findings, Bugs, Exploit). |
| Where a viewer gets lost | 5 | "Oracle", "invariant", "regression crowd" and "spotlight" appear without a gloss. The bugs page shows bug2 as **not fixed** (`triage.json` verdict `not-fixed`, and `lib/data.ts:146` does not read `fixes/bug2.manual.json`). The video says the page shows bug2 "fixed by hand" (`docs/video-script.md:13`). |
| Honesty and limits | 9 | The limits appear on the home page, in the README and in the video. This is rare and judges reward it. |
| **Overall** | **5.6** (7.8 once the URL and video exist and the bug2 chip matches) | |

**Rationale.** The material is strong, but the viewer path is missing. Add a "Start here" line to the README and the home page: watch a replay, run Repro with the sample, open Bugs. Label each page **Live model call** or **Recorded run**.

## Judge 4: Skeptic and security

| Criterion | Score /10 | Evidence |
|---|---|---|
| Overclaims | 5 | See the contradictions table below. Two are on the live home page. |
| Docs agree with code and data | 5 | Nine contradictions found (table below). Each is a 5-minute fix. |
| Leaked secrets | 10 | None in tracked files. `.env*` is ignored and absent from history. Keys are read only from `process.env` (`ai/models.ts:45`, `ai/precedent.ts:9`). |
| Abuse of public endpoints | 6 | There is a per-IP limit of 10/min, a daily cap of 200, input caps, and an IP taken from a platform-set header (`lib/ai-route.ts:9-16`). **But** the limiter is in memory per instance (`lib/rate-limit.ts:1`). On Vercel each instance has its own 200 cap, and the count resets on cold start, so spend is not truly bounded. In the other direction, one caller rotating IPs can burn the cap and judges then see 429s. One Eyes request can also become up to 5 billed calls through retries (`ai/models.ts:58`). |
| License and submission rules | 3 | **The repo tracks 27 MB of 3D assets (`game/assets/models`, `game/assets/textures/ae/`, 162 files) whose own README says "Their licensing has not been established here" (`game/README.md:140`).** File names such as `GN_Bully01.gltf`, `bully01_md_d.png` and `bulletinchapter1_6_d.png` look like assets extracted from a commercial game. They are not loaded. Publishing them under an MIT repo is a takedown and disqualification risk. They are in the very first commit (5794356), so deleting them in a new commit still publishes them in history. Also: no hosted URL, no video, the repo is not public, and the Tavily bonus call never happens at runtime. |
| **Overall** | **5.2** | |

### Contradictions found (doc or UI versus code or data)

| # | Where | Says | Reality |
|---|---|---|---|
| C1 | `README.md:5`, `README.md:153` | The game is "copied unchanged" into `game/` | `git log -- game/src` shows 299bbde (bug2 fix in `ground.js`, `main.js`) and 8c5589f changed it. `game/src/tuning.js` was extracted too (build log). |
| C2 | `app/page.tsx:87`, `components/ModelPanel.tsx:5` | "Only the spotlight tiles are picked move by move by Nano live" / Nano "picks each action for the live spotlight players" | `traces.json` and `runs.jsonl` contain 0 `"live":true` rows. `README.md:38` says the spotlight player is not part of the main run. |
| C3 | `app/modes/balance/page.tsx:16-17` | "The same crowd then replays with the new values so you can compare before and after." | `BalanceForm.tsx` only shows the tuning table from `/api/balance`. No crowd is re-run. The sweep-nerf comparison exists only as offline data. |
| C4 | `docs/token-factory-feedback.md:48-52` | Ultra 14 calls, 555,498 tokens in; Super 1 call | `data/run-main/usage.json`: Ultra 27 calls, 892,282 in; Super 2 calls. `docs/devpost.md:36` already uses 27. |
| C5 | `docs/token-factory-feedback.md:9` | "a 1000-player corpus (2,556 rounds) of 224.4K tokens", read as the main run | That is the planted fixture (`ai/README.md:9, 43`). The main run is 2,831 rounds and 220,334 tokens. |
| C6 | `docs/video-script.md:3, 8-9` | "Every number below comes from `data/run-main/` or the README", then uses "fourteen seconds" and "eleven CPU cores" | Neither number is in `data/run-main/` or the README. They appear only in the vault build log. |
| C7 | `docs/video-script.md:13` | The bugs page shows bug2 "fixed by hand" | The bugs page renders bug2 as "not fixed": `triage.json` has verdict `not-fixed`, and `lib/data.ts:146` never reads `fixes/bug2.manual.json`. |
| C8 | `components/ModelPanel.tsx:7` | Super-VL is used "to confirm or caption a finding" | `README.md:42`: it missed the bug it was asked about, so it cannot confirm anything. |
| C9 | Panel and `usage.json` | Model panel usage | No Super-VL row and no persona-run Nano calls (69) are in `usage.json`. The VL card reads "No calls recorded in this run". |

### Further skeptic notes (true, but disclose them)

- **The cheeser story is partly circular.** The cheeser archetype's base table hard-codes sweep weights of 6 and 8 (`engine/policy.mjs:14`). So "cheesers win 92% by sweep" is partly the author's table, not something Nano or Ultra discovered. What is independently true is that the CPU never crouch-blocks. The exploit search shows that (top strategies win 100/97/93% through SWEEP, `README.md:33`), and it should be the lead framing.
- **"Fix verified" for bug4 rests on one seed, and the patch deletes a guard.** The `y<1.08` check is removed entirely (`data/run-main/fixes/bug4.json`), so a fighter still in the air can enter DOWNED. The regression crowd moved from 4 bug rounds to 3. Say "1 of 1 seeds" next to the chip.
- **Verified patches are not in the shipped game.** bug3 and bug4 exist only as patch files (`README.md:86`). The hosted game still has the crate-throw crash and the crate softlock. That is fine, but say so, because "fixed" reads as shipped.
- **Tavily precedent is junk.** For f1 and f3 the "precedent" is the MMA Fighting homepage, Poki and CrazyGames. f8 cites a market-size report (`findings.json` `.precedent`). The query is mostly the model's suggestion text plus "fighting game" (`ai/precedent.ts:5`). Showing these to judges hurts more than it helps.
- **The "1M context" headline must not appear anywhere.** It is correctly hedged in the docs today. Keep it that way in the Devpost form.
- The game README cites Three.js r170 and Rapier 0.14 (`game/README.md:5`). The engine uses 0.186.1 and 0.21.0 (`package.json`). This is a harmless mismatch, but a sharp-eyed judge will spot it.
- Leftover stub text: `lib/ai-route.ts:1, 36-38` still mentions "while ai/ is a stub". It is harmless.

---

## Ranked work list (impact on score ÷ hours)

| Rank | Change | Impact | Hours | Ratio |
|---|---|---|---|---|
| 1 | **Remove the unlicensed assets from the repo and its history before the first push.** Remove `game/assets/models` and `game/assets/textures`, keep `art/midnight-circuit.png`, and publish from a fresh root commit or `git filter-repo`. Back up first. | Removes a disqualification risk | 0.3 | very high |
| 2 | **Fix contradictions C1 to C9.** Wording changes, plus reading `bug2.manual.json` into the bugs page chip "fixed by hand, 4/4". | +1.0 skeptic, +0.5 demo | 1 | very high |
| 3 | **Deploy to Vercel** with env vars. Smoke-test Repro, Balance and Eyes live. Put the URL in the README, video and Devpost. | Required; +2 demo | 1.5 | very high |
| 4 | **Label every page "Live model call" or "Recorded run"** and add a "Start here" path to the README and home page. | +0.8 demo | 0.5 | high |
| 5 | **Judge-proof the cap.** When the limiter returns 429, or for the sample input, serve a cached real response marked "cached". Note that the cap is per instance. | Avoids the worst case of a judge seeing an error | 0.75 | high |
| 6 | **Record the 3-minute video.** Split the 1:20 bugs beat into two. Drop "fourteen seconds" and "eleven cores" unless you add them to `summary.json`. | Required | 3 | high |
| 7 | **Fix Tavily and make it a runtime call.** Build the query from the finding title, add `include_domains` (gamedeveloper.com, gdcvault.com, game postmortems), and add a "Find precedent" button on a finding or bug that calls Tavily live. | Bonus, and it removes an embarrassment | 1.5 | medium-high |
| 8 | **Disclose the circular parts.** Note the cheeser base table, that claims are checked against header cells, and that patches are not shipped. Lead the verification story with the planted fixture. | +0.5 tech, +0.5 skeptic | 0.3 | high |
| 9 | **Log all model usage.** Record the persona run's 69 Nano calls and the VL calls in `usage.json`, so the model panel shows all four models working. | +0.3 tech | 0.5 | medium |
| 10 | **One live Ultra path in the hosted app.** See the single addition below. | +0.7 tech, +0.5 product | 5 to 8 | medium |
| 11 | **Add a "Who uses this" paragraph and a comparison against modl.ai and nunu.ai** to the README and Devpost. | +0.6 product | 0.75 | medium-high |
| 12 | **Tighten the claim tolerance** for small rates, for example relative tolerance when the value is under 0.2. | +0.2 tech | 0.5 | low |

## The 10 game ideas: what was built

This is one product with five modes: Crowd and Report, Bugs (triage), Exploit, Repro and Balance, plus Eyes on the replay page. It is not ten products.

| # | Idea | Status | Where |
|---|---|---|---|
| 1 | ReproBot | **Built, partly.** English report becomes a Super oracle, which plain code runs over 2,831 recorded rounds, and the matching replays are linked. It searches recorded rounds; it does not play new rounds to reproduce the bug. The fix half exists separately as bug triage, but a report does not flow into triage. | `/modes/repro`, `lib/oracle.ts`, `ai/triage.ts` |
| 2 | ExploitHound | **Built, as combat exploits.** Market Brawl has no economy, so the "dupes and economy" pitch does not apply. Nano evolves 32 strategies, the engine scores them, and Super explains the winners, grounded in the recorded hit tally. | `/modes/exploit`, `ai/exploit.ts` |
| 3 | Mechanic Forge | Not built | n/a |
| 4 | ModForge | Not built. The closest is Balance (English becomes tuning values, not code). | (`/modes/balance`) |
| 5 | SightGuide | Not built. Eyes reuses the same Super-VL plumbing, but for QA, not accessibility. | n/a |
| 6 | Glitch Hunter | **Partly folded in.** Engine invariants detect impossible motion with timestamps. Super-VL Eyes looks at frames around the first bug event but missed the floating fighter. | `engine/bugs.mjs`, Eyes panel |
| 7 | SimDojo | Not built | n/a |
| 8 | Spec Drift | Not built | n/a |
| 9 | Patch Prophet | **Partly folded in.** Balance turns patch notes into tuning live. The before and after crowd comparison (sweep-nerf: cheeser 92% to 82%) exists only offline; the page does not re-run it. | `/modes/balance`, `data/patches/sweep-nerf.json` |
| 10 | Tutorial Director | **Partly folded in.** Ultra's report diagnoses where players struggle and quit (round-2 wall, casual quit rate 97%) and suggests fixes. It drafts no onboarding. | Findings on `/` |

Totals: 2 built (one partly), 4 partly folded in, 4 not built.

## Single addition that would raise the score most before Fri 10:00 PT

**"Report to fix", live: one Ultra call in the hosted app that closes the loop.** On the Repro results, add a "Triage this" button for a matched round:

1. Send Ultra the 10 Hz timeline re-simulated from that seed plus the relevant source. `ai/triage.ts` already does this.
2. Apply its find/replace patch to an in-memory copy of the game modules.
3. Replay the exact seed headless in the serverless function. One round runs in well under a second (about 24 rounds/s on this machine).
4. Show the verdict "fixed" or "not fixed" and the diff.

Skip the 200-player regression crowd at runtime.

This one change does three things:

- **Ultra becomes a runtime model** (Judge 1's biggest gap).
- **The product's actual promise** (player report, then replayable round, then a verified patch) becomes something a judge can do in 60 seconds (Judges 2 and 3).
- **It reuses code that already exists** (`ai/triage.ts`, `engine/verify-fix.mjs` logic, `lib/oracle.ts`).

**Costs and risks:**

- **Cost:** about $0.02 to $0.05 per call at the unverified price.
- **Latency:** 20 to 60 s, under Vercel's 300 s default.
- **Packaging:** the Rapier WASM must load inside the function.
- **Fallback:** for the sample report, ship a cached run of the same flow so the demo never fails on stage.

Do it **only after** ranks 1 to 6. If time is short, rank 7 (live Tavily) is the cheaper runtime addition.

---

## Submission checklist: rules not yet met

| Rule | Status | What is missing |
|---|---|---|
| Runtime Nebius Token Factory calls with at least one Nemotron model | Code ready, **not live** | Deploy. Repro and Balance (Super) and Eyes (Super-VL) are the runtime calls. Smoke-test each on the hosted URL. |
| Hosted demo URL | **Not met** | Vercel deploy with `NEBIUS_API_KEY` and `TAVILY_API_KEY`. The prebuild sync runs automatically. Put the URL in the README, the video's last beat and Devpost. |
| Public YouTube video, 3:00 or shorter | **Not met** | Record from `docs/video-script.md` after fixing C6 and C7. Set it to public, not unlisted, if the rule says public. |
| Public repo with OSS license and README | **Not met** | The repo is not pushed. LICENSE (MIT) and README exist. **Remove the unlicensed `game/assets` from history first (rank 1).** |
| Written feedback on Nebius and NVIDIA tools | Drafted, **not submitted** | `docs/token-factory-feedback.md`. Fix C4 and C5, then paste it into the Devpost field. |
| Tavily runtime call (bonus) | **Not met** | Tavily runs only in the offline `ai/cli/report.ts`, and its results are off-topic. A live call in the hosted app is needed (rank 7). |
| Devpost form | **Not met** | Text is ready in `docs/devpost.md`. Track choice, screenshots and links are still needed. |
| Builder Program register click | **Not done** (per build log) | Register in the browser. |
| Third-party asset licensing | **Not met** | See rank 1. `game/README.md:140` itself says the licensing has not been established. |
