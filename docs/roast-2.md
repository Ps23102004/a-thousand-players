# Roast, round 2: A Thousand Players

Written 2026-10-28 (Wednesday), about 42 hours before the Nebius x NVIDIA deadline (Fri 2026-10-30 10:00 PT). This is the second judging round. The first is `docs/judge-panel.md` (6.1/10). This round was asked to be harsher. It is read-only: no source was edited, nothing was committed, `.env` was not read, and the only paid calls were the judge calls listed below.

Scope: `HEAD` is `4f303f2`. The working tree also holds uncommitted work from other sessions running at the same time (`adapters/`, `ai/cli/calibrate-*.ts`, `docs/generality.md`, edits to `MatchRow.tsx` and `FindingCard.tsx`). Scores judge `HEAD`. Where that parallel work changes a finding, the section says so.

---

## 1. Verdict in one screen

| Rubric | Round 1 (`judge-panel.md`) | Round 2, reconciled | Change and why |
|---|---|---|---|
| NVIDIA / Nebius technical | 7.6 | **7.4** | Ultra now runs live (a Round 1 gap closed), but live triage has not yet fixed a single recorded bug, and Ultra's confidence numbers are anti-calibrated. |
| Product and impact | 6.0 | **6.0** | Still one game and no outside user. "Who it is for" and the competitor line were added, but there is no evidence anyone besides the author wants it. |
| Demo and presentation | 5.6 | **5.5** | "Start here", source tags and cached answers are good. There is still no URL, no video and no public repo, and the script's two strongest lines overclaim. |
| Skeptic and security | 5.2 | **5.8** | The unlicensed assets are gone (history rewritten, 1 tracked file left in `game/assets`). New problems found: a "verified" finding that verifies nothing about its bug, an Ultra-authored fix that only shows up under a balance patch, a bug2 "4 of 4" that is 2 seeds, and a red engine test file in the working tree. |
| **Panel mean** | **6.1** | **6.2** | |

**The short roast.** The engineering is real and the honesty section is rare. But the project's *presentation* still claims more certainty than its *data* earned. Every judge, independently, landed on the same three things:

1. **Nothing is submitted.** No hosted URL, no `git remote`, no video. Every judge put this first.
2. **The confidence numbers are decoration.** Ultra rated its own bug1 patch 92% and its bug2 patch 90%. Those patches fixed 0 of 8 and 0 of 4 rounds. The UI prints these numbers as chips on the findings, the bugs page and the live triage verdict.
3. **"Verified" and "fixed" are stretched.** "31 of 31 verified" checks Ultra against tables code put in its prompt. bug4's "fix" deletes a height guard. bug3's crash only happens under the sweep-nerf tuning. "Two held up" in the video counts both of them.

**What the council and the judges agree is the single biggest change:** ship the submission (URL, public repo, video) by Thursday noon PT, and in the same deploy remove or relabel every model-confidence chip. After that, spend at most 4 to 6 hours on one honest accuracy number. Section 7 has the full ranked list.

---

## 2. What was checked by running code

| Check | Result |
|---|---|
| `npx tsc --noEmit -p .` (working tree) | exit 0, no output |
| `npm run test:ts` (working tree) | 181 tests: 177 pass, 0 fail, 4 todo |
| `npm run test:engine` (working tree) | 113 tests: 108 pass, **4 fail**, 1 todo. All 4 failures are in `engine/tests/verify-fix.test.mjs` (tests 103, 107, 108, 112). Fable and Opus saw failures in the same file on their own runs. |
| `npm run test:engine` on a clean export of `HEAD` (`git archive`) | 110 tests: 109 pass, 0 fail, 1 todo |
| `npm run test:ts` on that clean export | 5 failures in the live-triage tests. This copy symlinks `node_modules` from outside its folder, and live triage runs patches under Node `--permission`, so these are likely an artifact of the copy. That is unverified. |
| Data checks with `node -e` on `data/run-main/` | Opus re-derived 2,831 rounds, 891/1,940, 31.5%, quit reasons 708/250/42, 220,334/4,439 tokens, 31/31 claims, Ultra 27 calls and $0.941. All match the README. |

**Reading of the test results.** The `verify-fix` tests pass on a clean `HEAD` and fail in the shared working tree. The most likely cause, which is unverified, is that the parallel sessions write to the same `.work/` scratch folders that `verify-fix` uses, or that the tests depend on timing and the machine was busy. A judge who clones the repo gets the clean `HEAD` result. But **there is no CI** (no `.github/`), so nobody has shown a clean run on a machine other than the author's.

The 4 `todo` tests are known bugs that the author marked deliberately. They include shallow validation of the untrusted replay token in the URL (`lib/replay-token.test.ts:105`). That is honest, but a judge reads it as "known bug, not fixed".

---

## 3. Which models judged, and which failed

Each judge got the same brief (four rubrics, five worst things with file:line, unearned certainty, contradictions, single change, what a winner has). None of them saw `docs/judge-panel.md` or another judge's scores.

| Judge | Family | How it ran | Saw | Status |
|---|---|---|---|---|
| **Fable 5.1** | Anthropic | Agent subagent, `model: fable` | The whole repo; ran tests and `node -e` checks | Ran |
| **Opus** | Anthropic | Agent subagent, `model: opus` | The whole repo; re-derived every README number from data | Ran |
| **GPT-6.1 Sol** | OpenAI | `route-brain` worker `omni-sol` | A 117 KB bundle of 21 key files with line numbers (README, devpost, video script, `ai/README.md`, app pages and routes, `lib/triage-live.ts`, `lib/oracle.ts`, `lib/rate-limit.ts`, `lib/ai-route.ts`, `ai/verify.ts`, `ai/models.ts`, `ai/triage.ts`, `engine/bugs.mjs`, `summary.json`, `meta.json`) | Ran. It labelled itself "ChatGPT". |
| **Gemini 3.8 Flash** | Google | `route-brain` worker `omni-flash` | The same bundle | Ran, but it **labelled itself "Claude 3.5 Sonnet"**. The router reports `gemini-3.8-flash-high`. It also made factual errors: it said the public repo was "complete" and that "Tavily is included" without checking runtime use. It was the most generous judge. Its scores carry the least weight below. |
| **GLM** | Zhipu | `route-brain` worker `glm` | The same bundle | **Failed.** `delegate glm rc=1`: the delegate's Claude Code client did not recognize model `glm-5-turbo`. No GLM judgment exists. |

That makes four model families that actually ran: Anthropic (2), OpenAI, Google. A fifth (GLM) failed.

### Raw scores per judge

| Rubric | Fable 5.1 | Opus | GPT-6.1 Sol | Gemini Flash | Mean | Reconciled |
|---|---|---|---|---|---|---|
| Technical | 8.1 | 7.3 | 7.5 | 8.8 | 7.9 | **7.4** |
| Product | 6.4 | 6.2 | 6.2 | 7.2 | 6.5 | **6.0** |
| Demo | 5.8 | 6.4 | 5.5 | 8.5 | 6.6 | **5.5** |
| Skeptic | 7.6 | 6.6 | 5.0 | 7.0 | 6.6 | **5.8** |

**How the scores were reconciled.** The reconciled score is not the mean.

- **Gemini Flash is down-weighted.** It mis-identified itself, called the repo public, and gave Demo an 8.5 to an entry with no URL and no video.
- **Opus and Fable's verified findings are given full weight.** They read the data, not just the docs, and found things the doc-bundle judges could not see: f4's irrelevant claims, bug3 occurring only under sweep-nerf, bug2 being 2 seeds, and the failing test file.
- **Demo is held at 5.5.** All four judges say this score depends on a URL and a video that do not exist. With both done, and the 0:00 and 1:20 lines fixed, Demo is about 7.5.

### Where the judges disagreed

| Topic | Disagreement | Resolution |
|---|---|---|
| Long context | Fable gave it 9 ("220K in one call, checked"). Opus gave 6 ("proves Ultra can copy a table"). | **Opus is right on the evidence.** Every claim metric `ai/verify.ts:9-36` can check (winRate, quitRate, koShare, avgDuration, meanHpLoss, by archetype and round) is a cell of the header that code puts in the prompt. Nothing yet shows that 220K tokens were *needed*: no chunked baseline exists. `docs/token-factory-feedback.md:9` says "No chunking strategy could see patterns across players like that", which is an untested claim. The planted fixture (`ai/README.md:43`, the lone sweep-spammer among 1000) is the real evidence and should lead. |
| Endpoint abuse | Gemini: "trivial DoS, security theater". Fable: 7 ("model-written JS runs under `--permission` with network disabled"). | **Both are partly right.** The sandbox for patches is careful (`lib/triage-live.ts:43-55`, `app/api/triage/round.mjs`). The weak point is the budget, not the sandbox. One global daily cap of 200 is shared by every route (`lib/ai-route.ts:6`, `lib/rate-limit.ts:10`). One caller at 10 a minute uses it up in 20 minutes, and then Triage, Eyes and Precedent return 429 to every judge. Only the Repro and Balance examples have cached answers. |
| Is bug3 a win? | Sol and Gemini count it as a clean Ultra fix. Opus: "rests on 3 seeds from an experimental tuning". | **Opus is right.** `data/run-main/triage.json` bug3 has 3 rounds, and all are labelled `sweep-nerf` (seeds 901214, 163831, 529346). None are in the 2,831-round base run. The fix is real and shipped, but `README.md:46` and `docs/devpost.md:34` never say that it only reproduced under a balance patch. |
| Rule compliance | Gemini: "public repo and docs complete". The other three: missing. | `git remote -v` is empty and no URL exists anywhere. **Missing.** |

---

## 4. The roast: five worst things, per judge

### Fable 5.1
1. No hosted URL, no video, no remote, 48 hours out (`docs/video-script.md:4`; `git remote -v` is empty).
2. bug4's "Fixed and replay-verified" is a guard deletion. `fixes/bug4.json` turns `if(g.elapsed>=fallTime && pos(f).y<1.08)` into `if(g.elapsed>=fallTime)`. The symptom was suppressed, not the cause (`README.md:43`). `docs/devpost.md:9,34` still counts it as one of "Two bug fixes".
3. Ultra's self-reported confidence is shown as if it meant something. bug1 is 0.92 with 0 of 8 fixed, and bug2 is 0.90 with the wrong root cause. `ai/triage.ts:75` only clamps the number.
4. The test suite is not green: `verify-fix.test.mjs` fails with `Cannot read properties of null (reading 'verdict')`. There are also 4 known-bug `todo` tests, including shallow validation of an untrusted URL token (`lib/replay-token.ts:17-18`).
5. The crowd does not use Nemotron while it plays (`README.md:53`). The hook "broke it in about fourteen seconds" (`docs/video-script.md:8`) is 14 s of native simulation on the already-fixed build. It leaves out 289 s of Nano and the Ultra call.

### Opus
1. No URL and no video. Whether `--permission` and `execFile` even run on Vercel is unverified, so the live triage path has never been shown on the target host.
2. bug2's "Fixed, 4 of 4" is 2 seeds. Seeds 634310 and 497239 each appear under `base` and under `sweep-nerf`. The evidence is a hand-typed string, `"replay":{"bug2":"4/4 clean"}` in `fixes/bug2.manual.json`, with no before and after data per seed. bug4, by contrast, has real arrays in `bug4.verify.json`.
3. The "verified" physics-bug finding verifies nothing about the bug. `findings.json` f4, "Physics bug: !airborne invariant violation on turtle and explorer players", carries three green claims: turtle quitRate, turtle koShare and explorer quitRate. None measures airborne. The title is also wrong: airborne rounds are spread over turtle, cheeser, learner, casual and explorer, and its own second seed (p0355) is a learner. It still shows checkmarks and "confidence 85%" (`components/FindingCard.tsx:16`).
4. bug3, the one shipped fix Ultra wrote, only crashes under sweep-nerf (see section 3).
5. The tests are not green, and the docs contradict each other on how many Ultra calls live triage makes (see section 5).

### GPT-6.1 Sol
1. "You have a submission-shaped README, not a verified submission." The `[URL]` placeholder is still there (`docs/video-script.md:4,17`).
2. The headline "31 of 31 verified" is a reading-comprehension test, and the README admits it (`README.md:59`).
3. The video stitches two runs together. "Fourteen seconds" comes from the 2,829-round run on the fixed build, while 2,831 is the recorded run (`docs/video-script.md:8-9` against `README.md:37`).
4. The budget guard resets with the infrastructure. It is in memory and per instance (`lib/rate-limit.ts:1`), while one triage call can spend two Ultra calls and two child processes.
5. "You are measuring your own bot design and selling it as player insight." Quitting comes from a mood model, and the cheeser table already favors sweeps (`README.md:52,58`). The video gives "casual players win 6% and 97% quit" the weight of user research (`docs/video-script.md:11`).

### Gemini 3.8 Flash (down-weighted, see section 3)
1. Abuse of the live Ultra route: up to two 40-second Ultra calls plus child processes behind an in-memory limiter (`app/api/triage/route.ts:5-20`).
2. "Nemotron does not play the game." Nano writes static policies that run natively, and the author hard-coded the cheeser's sweep bias.
3. bug4 is celebrated as a fix but deletes a safety guard (`README.md:43,60`).
4. A live "fixed" verdict rests on one seed with no regression crowd (`app/modes/repro/MatchRow.tsx:88`).
5. Super-VL is dead weight: it missed the bug it was shown (`README.md:57`), so it is there to tick a multimodal box.

### Merged and de-duplicated, ranked by how much a judge would mark down
1. Nothing is submitted (4 of 4 judges, and 7 of 7 council seats).
2. Model confidence numbers are shown as fact and are anti-calibrated (Fable, Opus, Gemini, and 7 of 7 seats once shown the data).
3. "Fixed" and "verified" are stretched: bug4 is a guard deletion, bug3 is sweep-nerf only, bug2 is 2 seeds, and f4 verifies unrelated numbers (Fable, Opus, Gemini).
4. "31 of 31" and "220K tokens in one call" prove reading, not discovery, and no baseline shows the long context was needed (Sol, Opus, and Round 1).
5. The live budget is one global in-memory cap that any one caller can drain, which takes the live demo down for everyone (all four judges).
6. The video hook mixes runs ("fourteen seconds" plus 2,831) and the synthetic findings are pitched as player insight (Sol, Fable).
7. The `verify-fix` tests are red in the working tree and there is no CI (Fable, Opus, confirmed in this round).

---

## 5. Contradictions still in the repo

| # | One side | Other side |
|---|---|---|
| K1 | `docs/devpost.md:50` "Each click is one model call with no retry." `app/api/triage/route.ts:5` and `lib/triage-live.ts:1` say "ONE Nemotron Ultra call". | `docs/devpost.md:22` "a second only if the first patch fails validation"; `lib/triage-live.ts:121` `LIVE_ATTEMPTS = 2`; `README.md:109` "up to **two** Ultra calls"; the button says "up to 2 tries" (`app/modes/repro/MatchRow.tsx:48`). |
| K2 | `docs/devpost.md:9` "Two bug fixes (bug3, bug4) were verified by replay"; `docs/video-script.md:13` "Two held up." | `README.md:43,60`: bug4 is verified on 1 of 1 seeds, removes a height guard, and is not shipped. bug3 only reproduces under sweep-nerf (`triage.json`). |
| K3 | `docs/video-script.md:8` "broke it in about fourteen seconds" | `README.md:37`: the 14.2 s run is the current build *with* the bug2 and bug3 fixes, 2,829 rounds. The recorded bug-finding run's wall time is not stated anywhere. |
| K4 | `README.md:37`: 14.2 s, 199 rounds/s | `footage/manifest.md:38`: 14.3 s, 198 rounds/s, win rate 30.7% for the "same" day's run |
| K5 | Home page tag "read 219,064 tokens of logs in one call" (`app/page.tsx:58`, `corpusTokens`) | `README.md:38` and the voice over: 220,334 prompt tokens. 219,064 is the estimate. |
| K6 | `README.md:38` "13 cited seeds did not exist in the runs and were removed" | `ai/verify.ts:44-66` *repairs* a bad seed from (player, round) when it can, and only drops the rest. `findings.json` stores neither `droppedSeeds` nor `repairedSeeds`, so the 13 cannot be re-derived from the data. |
| K7 | `docs/video-script.md:27` "Tavily: Precedent for each finding's fix" | Runtime Tavily runs only on Repro matches (`docs/devpost.md:24`); the home cards say "No calls recorded in this run" (`footage/manifest.md:27`). |
| K8 | `docs/token-factory-feedback.md:9` "No chunking strategy could see patterns across players like that" | No chunked baseline was ever run. Untested. |
| K9 | `README.md:22` "Nano writes 1000 player personas" | `data/run-main/usage.json`: Nano has 3 calls and 1,849 tokens in. The 69-call persona run is not logged (acknowledged at `docs/devpost.md:40`, but the model panel still undercounts). |
| K10 | Live triage verdict chip "not credited: the patch only switches on a fix the game already ships" | It sits above the grey line "'fixed' means this one round runs clean…" (`footage/manifest.md:20`). Commit `4f303f2` says it now shows that caveat only under a fixed verdict (`MatchRow.tsx:88`), so this is fixed at `HEAD` but still visible in footage clip `08-repro.v3.mp4`. |

Round 1's C1 to C9 are mostly fixed (the bug2 chip, Balance wording, spotlight wording, feedback numbers). K1 to K9 are new or left over.

---

## 6. Is the confidence right? Where certainty was claimed and not earned

This is the section judges will remember. **The project's own data shows that Ultra's confidence is not just uncalibrated but inverted on the cases that matter.**

| Claim on screen or in docs | What the data says | Evidence |
|---|---|---|
| Bug triage confidence chips: bug1 92%, bug2 90%, bug3 90%, bug4 95% (`app/bugs/page.tsx:48`) | bug1's patch fixed 0 of 8; bug2's failed twice, 0 of 4. The two lowest-performing patches carry confidence as high as the ones that worked. | `data/run-main/triage.json` `confidence` against the verdicts |
| Live triage chip "confidence 92%" (`app/modes/repro/MatchRow.tsx:65`) | In the calibration session's 12 live Ultra triage runs over recorded bug rounds: **0 fixed**, 4 not fixed, 3 "reused the shipped fix" (no credit), 5 failed validation on both tries. Every answered run claimed 0.85 to 0.95. | `side-session-notes/.../calibration-triage-runs.json` (another session's data, 12 Ultra calls, 318,355 tokens in). Three of the five validation failures are bug3 rounds, whose `find` text no longer exists because the fix is already shipped, so those are partly an artifact. |
| Finding confidence chips: f1 95%, f2 98%, f3 90%, f4 85% (`components/FindingCard.tsx:16`) | These are numbers the model wrote about itself. The verifier only caps confidence at 0.3 when a finding has no seed left (`ai/verify.ts:79`). Nothing else checks it. f4 at 85% has a wrong title and no claim about its bug. | `findings.json`, `ai/verify.ts:79` |
| Green "verified by code" claims on f4 "Physics bug: !airborne…" | The three claims are quit rate and KO share. The claim language (`ai/verify.ts:9-36`) has five aggregate metrics and *cannot express* a claim about a bug, a trend ("zero learning", f3) or a cause ("survival bias", f8). A green check next to those titles implies a check that never happened. | `findings.json` f4 claims; `ai/verify.ts:7,30-35` |
| "31 of 31 structured claims matched" (`docs/devpost.md:9`, `README.md:38`) | True, but the README (`README.md:59`) admits these are cells of the header code put in the prompt. The Devpost headline drops that caveat. The fraction tolerance is ±0.05 absolute (`ai/verify.ts:40`), so a claimed 4% passes for anything from 0% to 9%. f1 claims winRate 0.04, which is exactly that case. | `ai/verify.ts:40`, `findings.json` f1 |
| "Fixed by hand, replay-verified, 4 of 4" (bug2) | 2 unique seeds × 2 tunings. The evidence is a typed string. | `triage.json` bug2 rounds; `fixes/bug2.manual.json` |
| "Fixed and replay-verified on 1 of 1 seeds" (bug4) | One seed, a deleted guard, and a regression change of 4 to 3 bug rounds out of 555, which is noise. | `fixes/bug4.json`, `fixes/bug4.verify.json` |
| "42 of 42 sampled recorded rounds replay event for event" (`README.md:30`) | No script, log or test in the repo produces this number. Unverified. (`engine/tests/replay-recorded.test.mjs` exists, but it does not report 42.) | `grep` across the repo |
| "finds exactly the two recorded rounds" (`README.md:27`, `docs/video-script.md:15`) | Honest on the recorded take, but the README itself says the oracle varies between calls, and the script says to re-check before recording (`docs/video-script.md:40`). Say "found" rather than "finds". | |
| Ultra's summary prose, shown first on the home page (`app/page.tsx:64`) | "31% overall quit rate" at Round 2: `summary.quitCurve` gives a 35 to 38% drop (Opus). "zero progression" for masher and learner is not a checkable claim. Ends with "0 of 31 claims did not match", a double negative. | `findings.json.summary` |

**What is earned and should be said more loudly:** determinism (16 seeds × 2, `mismatches=0`), the planted 1000-player fixture (4 of 4 stories, including the one sweep-spammer among 1000, and 23 of 24 claims with the one failure a real catch), and the fact that every live triage verdict is decided by a replay, not by the model. The honest story is: **"the model's confidence is worthless; the replay is what you trust."** That is a better pitch than any confidence chip.

---

## 7. The council (Roast Room)

**Decision put to the council:** "We submit this project to the Nebius x NVIDIA hackathon on Friday. What is still weak, what would make a judge mark it down, and what single change adds the most?"

**Options:**
- **A.** Ship only: deploy, public repo, video, doc fixes.
- **B.** A, then a capped accuracy eval (planted bugs on held-out seeds, precision and recall for the crowd and for Ultra triage).
- **C.** A, then a second game adapter.
- **D.** Keep polishing: more modes, re-record footage.

**Mode and weights.** Seven seats, Rounds 1 and 2. Round 3 was skipped because the spread on the top option was 1 and no seat was at "ruin likely" (the skill's quick-mode skip rule), and to save cost. Weights: Bezos 3, Graham 3, Gary V 2, Martell 2, Wickman 2, Buffett 1, Hormozi 1. The session files (brief and both rounds) are in this session's scratchpad, not in the repo.

**Facts the Chair added for Round 2 (from the repo):**
- (a) Another session is building other-game adapters in parallel (`adapters/clean-getaway`, `adapters/homeground`, untracked).
- (b) A planted-fixture eval already exists.
- (c) Ultra reported 0.92 confidence on a patch that fixed 0 of 8.

### Each seat's argument (final positions, Round 2)

| Seat | Final scores (A · B · C · D) | Argument in one line | Moved? |
|---|---|---|---|
| Bezos (3) | 7 · 8 · 5 · 2 | Friday is the only one-way door, so lock A first. The biggest risk is trust, not breadth: "suspect the metric", and the 0.92 chip is our own metric arguing against us. Replace it with "replay-verified x/y seeds". | C 4 to 5 (a free option if the parallel session lands it) |
| Graham (3) | 8 · 8 · 4 · 1 | Unshipped work is worth zero to a judge. The demand evidence is the real student whose game got fixed, so open the video with them. Publish the eval number, but don't open with it. | B 7 to 8 (eval half built, chip misleading now) |
| Gary V (2) | 8 · 8 · 4 · 1 | The video is the attention surface. Hook first (the 1,000-player run in 20 s), proof at second 40 to 60. "Good marketing against a bad product speeds up everyone knowing", so fix the chip before you send judges to it. | A-only to A plus a mandatory small B |
| Martell (2) | 8 · 8 · 4 · 1 | 44 hours is the budget. "Leftover hours" drift into D, so B needs a written definition of done now. The founder owns the eval's first and last 10%; AI sessions do the middle. Kill the chip today. | A 7 to 8, C 3 to 4 |
| Wickman (2) | 8 · 7 · 3 · 1 | Root cause is Traction: nothing shipped. One Rock (A), one owner, done by Thursday. No adapter merges before submission, because the founder is the only Integrator. | A-only to A then capped B |
| Buffett (1) | 7 · 8 · 4 · 1 | Numbers times zero is zero. Volume is how busy the machine was, not what it is worth. Say "0.92 confidence, 0 of 8 fixed" yourself before a judge does. | B cap 10 h to 6 h |
| Hormozi (1) | 7 · 8 · 4 · 1 | Perceived likelihood is the weak term in the value equation. "1,000 players in 14 s" is a promise and "planted N, caught M" is proof. The chip must be checked against outcomes or removed. | B's scope widened to cover the chip |

### Chair's verdict

**Option scores** (weighted, sum of weights 14):
- B: (3×8 + 3×8 + 2×8 + 2×8 + 2×7 + 1×8 + 1×8) / 14 = **7.9**
- A: (3×7 + 3×8 + 2×8 + 2×8 + 2×8 + 1×7 + 1×7) / 14 = **7.6**
- C: (3×5 + 3×4 + 2×4 + 2×4 + 2×3 + 1×4 + 1×4) / 14 = **4.1**
- D: (3×2 + 3×1 + 2×1 + 2×1 + 2×1 + 1×1 + 1×1) / 14 = **1.2**

**GO on B: ship A first, then a capped accuracy eval.** The spread on B is 1 (7 to 8). Council confidence is 8/10. No seat is at "ruin likely". B is a two-way door; A (the Friday submission) is the one-way door, so A is a precondition, not an option.

**The arguments that carried the room:**
- Wickman, Buffett and Graham: the score is zero until A exists.
- Bezos and Hormozi: trust, not generality, is the weak term.
- Martell: B is cheap because the planted fixture already exists.

**The unanimous condition.** All 7 seats, independently, made the confidence chip a condition of yes: remove it, label it "uncalibrated", or replace it with the replay-verified count, **before the deploy goes live**.

**Strongest objection (minority, Gary V, Graham, Wickman):** the eval number should not open the video. Open with the spectacle (the 1,000-player run) or with the real student, and land the number at the proof beat by second 60. Hormozi and Buffett want the number up front. The Chair takes the majority-by-weight view: hook first, number by second 60, number at the top of the README.

**On C:** no founder hours before submission. If the parallel adapter work lands with its tests passing by Thursday 18:00 PT, it gets one README line and at most a 10-second clip. All 7 seats agree.

**Conditions with dates:**
1. Hosted URL, public repo and uploaded video live by **Thursday 12:00 PT**, tested from a logged-out browser.
2. Confidence chips removed or relabeled in the same deploy.
3. B capped at 6 hours, extending the existing planted eval to at least 5 to 8 planted bugs on held-out seeds, with misses published. It must produce a number by Thursday 18:00 PT or it is cut.

**Quote check.** `check_quotes.py` found no attributed brain quotes in the saved cards, because the Chair saved condensed cards. The one flagged string, "planted 10 bugs, caught 8, triaged 7", is Hormozi's hypothetical example, not a quote. No seat line above is presented as something the real person said.

---

## 8. Feature gaps: what a winning entry in this category has

Ranked by expected score gain per hour. "Doable" means before Fri 10:00 PT, alongside A.

| # | Gap | What similar or winning entries have | Score gain | Hours | Doable? |
|---|---|---|---|---|---|
| 1 | **Live, judge-proof demo** | A URL that works on the first click for every judge, with the best moment (Ultra's patch judged by replay) cached as a fallback | +2.0 Demo; required | 3 to 5 | **Yes** |
| 2 | **Honest confidence display** | Model confidence either calibrated or hidden; verdicts carry evidence counts | +0.8 Skeptic, +0.3 Tech | 0.5 | **Yes** |
| 3 | **Per-route budget and cached fallbacks for Triage, Eyes and Precedent** | Separate caps per route, plus a cached real answer for the sample round, so one caller cannot take down the demo | +0.5 Skeptic, protects Demo | 1 | **Yes** |
| 4 | **An eval of the AI's own accuracy** | A table: planted N bugs, the crowd found X, Ultra triage fixed Y, false positives Z. The calibration session's 12 live runs (0 fixed) are already half of the triage row. | +0.7 Tech, +0.5 Product | 4 to 6 | **Yes**, capped |
| 5 | **CI** | GitHub Actions running `npm test` and `tsc` on push, with a green badge | +0.3 Skeptic | 0.5 (after fixing the `verify-fix` scratch-dir collision) | **Yes** |
| 6 | **Baseline against random input** | "Nemotron personas found N bugs per minute; a random-key fuzzer found M." This is what makes Nemotron load-bearing for the crowd. | +0.5 Tech, +0.4 Product | 2 to 3 (the engine already takes policies; no model calls) | **Yes** |
| 7 | **Onboarding for a new game** | "Adapt your game in N steps", with the adapter contract and a checklist (`docs/generality.md` exists, untracked) | +0.3 Product | 1 | **Yes** |
| 8 | **Evidence for "42 of 42"** | Commit the script or test that produced it, or drop the number | +0.2 Skeptic | 0.5 | **Yes** |
| 9 | **A second game adapter** | Proof the contract is real (`adapters/` in progress elsewhere) | +0.6 Product, if it works | 6 to 15 founder hours if built here; about 3 to review if it lands | **Only if it lands finished** (council: no founder build time) |
| 10 | **Long-context ablation** | One finding that whole-corpus reading surfaces and a chunked baseline misses | +0.5 Tech | 3, plus Ultra tokens | Maybe; the fixture's lone sweep-spammer is the obvious candidate |
| 11 | **An outside developer's before and after** | A quote from the student whose game it is, or any second developer | +0.5 Product | 1 to 2, if the student is reachable | Maybe |
| 12 | **Leaderboard or public run gallery** | A page of runs across games or builds | +0.1 | 3 | No, low value |
| 13 | **LLM-in-the-loop crowd players at scale** | Nemotron deciding moves for many players | +0.3 Tech | Too slow and costly (measured, `README.md:53`) | No |

---

## 9. Top 15 ranked fixes

Effort is for one person with AI help. Files are where the change goes.

| Rank | Fix | Effort | File(s) |
|---|---|---|---|
| 1 | Deploy to Vercel with env vars, and smoke-test Repro, Triage (does `--permission` and `execFile` work on the host?), Eyes and Precedent from a logged-out browser. If Triage cannot run on the host, serve the cached live result for the sample round. | 3 h | `next.config.mjs`, `app/api/triage/route.ts`, `lib/triage-live.ts` |
| 2 | Push the public repo, and put the URL, repo and video links at the top of the README and Devpost. Replace `[URL]`. | 0.5 h | `README.md`, `docs/devpost.md`, `docs/video-script.md` |
| 3 | Remove the model-confidence chips, or relabel them "Ultra's self-rating (uncalibrated)", on findings, bugs and live triage. On bugs and live triage, show "replay-verified x of y seeds" instead. | 0.5 h | `components/FindingCard.tsx:16`, `app/bugs/page.tsx:48`, `app/modes/repro/MatchRow.tsx:65` |
| 4 | Edit and upload the video from the existing clips. Fix 0:00: drop "broke it in about fourteen seconds", or say "plays 2,800 rounds in fourteen seconds". Fix 1:20: "one Ultra fix shipped (a crash seen under a balance patch), one patch only hid the symptom, one bug fixed by hand". | 3 h | `docs/video-script.md:8,13` |
| 5 | Fix the live-triage call count everywhere: up to two Ultra calls. | 0.2 h | `docs/devpost.md:50`, `app/api/triage/route.ts:5`, `lib/triage-live.ts:1` |
| 6 | Restate the fixes honestly. bug4: "symptom suppressed on 1 seed, not shipped". bug3: "crash seen only under sweep-nerf; fix shipped". bug2: "2 seeds × 2 tunings". Drop "Two bug fixes verified". | 0.5 h | `docs/devpost.md:9,34`, `README.md:43-46`, `app/bugs/page.tsx` labels |
| 7 | Split the global daily cap per route and serve cached answers for the sample triage, Eyes and Precedent round, so one caller cannot 429 every judge. | 1 h | `lib/ai-route.ts:6`, `lib/rate-limit.ts` |
| 8 | Stop showing green checks under finding titles the claims cannot test. Either add a claim metric for bug events (for example `bugRate` by archetype, computed from `ev`), or label claims "numbers checked; title not checked". Fix f4's title. | 1 to 1.5 h | `ai/verify.ts:9-36`, `components/FindingCard.tsx`, `data/run-main/findings.json` (f4) |
| 9 | Publish the triage accuracy as it is: "live Ultra triage on 12 recorded bug rounds: 0 fixed, 3 only re-enabled the shipped fix, 4 not fixed, 5 invalid patches", next to the planted-fixture result. This is the council's B, mostly from data that already exists. | 2 to 4 h | `README.md` (results), `docs/devpost.md`, a data file under `data/run-main/` |
| 10 | Fix the `verify-fix` tests' shared scratch folders (use a `mkdtemp` per test), then add GitHub Actions for `npm test` and `tsc`. | 1 h | `engine/verify-fix.mjs`, `engine/tests/verify-fix.test.mjs`, `.github/workflows/ci.yml` |
| 11 | Lead the long-context story with the planted 1000-player fixture, not "31 of 31". Delete "No chunking strategy could see…" unless a chunked run backs it. | 0.3 h | `docs/devpost.md:9,33`, `docs/token-factory-feedback.md:9` |
| 12 | Back or drop "42 of 42 sampled recorded rounds replay event for event". | 0.5 h | `README.md:30`, `engine/tests/replay-recorded.test.mjs` |
| 13 | Store `droppedSeeds` and `repairedSeeds` in `findings.json`, and say "13 seeds dropped or repaired" with the split. | 0.3 h | `ai/cli/report.ts`, `ai/verify.ts:51`, `README.md:38` |
| 14 | Random-input fuzzer baseline against the persona crowd (bug rounds per 1,000 rounds), with no model calls. | 2 to 3 h | `engine/crowd.mjs` (a policy flag), `README.md` |
| 15 | Small consistency fixes: 219,064 vs 220,334 on the home tag (`app/page.tsx:58`); 14.2 vs 14.3 s (`footage/manifest.md:38`); the Tavily row on the model slide (`docs/video-script.md:27`); Ultra's summary double negative "0 of 31 did not match" (rewrite the verifier's suffix as "31 of 31 matched"). | 0.5 h | `app/page.tsx`, `footage/manifest.md`, `docs/video-script.md`, `ai/cli/report.ts` |

Ranks 1 to 7 take about 9 hours. They move the panel from 6.2 to about 7.5, mostly through Demo (+2) and Skeptic (+1.5). Ranks 8 to 10 add about +0.4 more. The second adapter is not on this list. If the parallel session lands it tested by Thursday 18:00 PT, give it one README line.

---

## 10. Limits of this review

- Paid calls made: GPT-6.1 Sol and Gemini 3.8 Flash (one call each), the GLM attempt (failed), two Claude judge subagents (Fable 5.1, Opus), and 14 council seat runs. No Nebius or Tavily calls.
- The bundle judges (Sol, Flash) saw 21 files, not the data folder, so their data claims rest on the docs.
- The live triage figures (0 of 12 fixed) come from another session's notes file, not from a run made in this review.
- The working tree changed while this review ran (parallel sessions). Test results are reported for both the working tree and a clean `HEAD` export.
