# Calibration audit: how much to trust each number the app shows

Measured 2026-10-28. Question: "is its confidence right?" Short answer per signal:

| Signal | Verdict | Evidence |
| --- | --- | --- |
| Ultra triage `confidence` | **Uninformative.** Always 0.85-0.95; 2 of 15 patches fixed the replay. Brier 0.70, worse than a constant 0.13 (0.12). | 15 triages with a replay verdict + 7 answers whose patch did not validate (section 1) |
| Ultra triage `confidence`, line-range prompt | **Still uninformative.** 0.85-0.95 again; 1 of 9 patches fixed the replay (stated 0.85). Brier 0.70 against 0.10 for a constant 0.11. | 9 triages with a replay verdict + 4 answers over the 12-line limit, out of 13 calls (section 6) |
| Ultra triage validity | 5 of 12 controlled answers (42%) proposed a `find` text that is not in the source | `ai/cli/calibrate-triage.ts` |
| "31 of 31 claims verified" | True but weak: **all 31** claims are cells of the code-computed header Ultra is shown; a 5% relative error or a 3-point error still passes on every rate claim | `ai/cli/calibration-audit.ts` |
| Repro oracle (Super) | Precise when the report names an invariant (4 of 4 clear bug reports exact); 1 inverted oracle (a "nobody could hit" report matched every round); the one crash report was rejected (prompt since fixed to list `crash`; not re-measured) | 10 reports, 11 Super calls |
| Eyes (Super-VL) | 3 of 3 bug rounds flagged, 0 of 3 clean rounds flagged; named the real bug in 2 of 3 | 6 rounds, 6 Super-VL calls |
| Headline rates | Tight enough to quote with an interval: casual win 5.9% (3.5-8.5%), casual quit 97.0% (94.5-99.0%), cheeser win 92.3% (89.2-95.3%) | bootstrap over players |

**Sample sizes are tiny** for every model signal here (15 triages, 10 reports, 6 rounds). The intervals below say how little that is. The rate intervals are the only ones with a real sample behind them.

Model calls spent: Ultra 12 of 12 approved, Super 11 of 20, Super-VL 6 of 6 (`getUsage()` totals printed by each script). Raw outputs of the paid runs are in the shared session notes folder (`calibration-*.json`), not in the repo.

## 1. Ultra triage confidence

Outcome = the replay verdict decided by code: `fixed` counts 1; `not-fixed` and `reused-shipped-fix` (the patch edits, deletes or forces on a rule the replay forces off) count 0. Rows are scored with the current check (`editsForcedRule` in `lib/triage-live.ts`, which looks only at the changed part of a patch); re-running it on the recorded footage and controlled patches changed 2 rows: the old p0537:1 footage (fixed to reused-shipped-fix) and p0731:2 (reused-shipped-fix to not-fixed). Only the first changes any number below. Sources:

- `data/run-main/triage.json`: the offline triage (`ai/cli/triage.ts`), final attempt per cluster, verdict from `engine/verify-fix.mjs`.
- `docs/evidence/triage-live/*.live.json`: live "Triage this" responses recorded for the demo video (copied from the gitignored `footage/`).
- 12 controlled calls: `ai/cli/calibrate-triage.ts` runs the live flow (`lib/triage-live.ts`) over 13 recorded bug rounds (the three known seeds, the three throwProp crash rounds of the sweep-nerf run, and seven `airborne` rounds) with **one** Ultra call per round (no validation retry, so each call is one data point) and stops at 12 calls.

| source | round | stated confidence | replay verdict |
| --- | --- | --- | --- |
| offline triage.json | bug1 | 0.92 | not-fixed |
| offline triage.json | bug2 | 0.90 | not-fixed |
| offline triage.json | bug3 | 0.90 | fixed |
| offline triage.json | bug4 | 0.95 | fixed |
| docs/evidence/triage-live/run-a.live.json | p0731:2 | 0.92 | not-fixed |
| docs/evidence/triage-live/run-old.live.json | p0537:1 | 0.90 | reused-shipped-fix (was scored fixed: the patch deletes the `if(RULES.mountReleaseFix)` guard around the shipped fix, and the replay forces that rule to 0) |
| docs/evidence/triage-live/run-v3.live.json | p0537:1 | 0.92 | reused-shipped-fix |
| docs/evidence/triage-live/run-v3.live.json | p0537:1 | 0.92 | reused-shipped-fix |
| calibrate-triage | p0537:1 | 0.90 | reused-shipped-fix |
| calibrate-triage | p0731:2 | 0.85 | not-fixed (reused-shipped-fix under the old whole-patch check) |
| calibrate-triage | p0653:2 | 0.95 | not-fixed |
| calibrate-triage | p0009:3 | 0.90 | reused-shipped-fix |
| calibrate-triage | p0111:3 | 0.85 | not-fixed |
| calibrate-triage | p0129:3 | 0.85 | not-fixed |
| calibrate-triage | p0306:4 | 0.85 | not-fixed |

No verdict, confidence not returned (the patch's `find` text was not in the file): 5 controlled calls (p0233:2, p0611:1, p0754:2 crash rounds in `props.js`; p0069:1 in `grapple.js`; p0355:2 in `player.js`) and 2 HTTP 502 responses in `docs/evidence/triage-live/run-a.live.json`.

| stated confidence | n | mean stated | observed fixed rate | 95% Wilson interval |
| --- | --- | --- | --- | --- |
| 0.80-0.90 | 4 | 0.850 | 0/4 = 0% | 0-49% |
| 0.90-0.95 | 9 | 0.909 | 1/9 = 11% | 2-44% |
| 0.95-1.00 | 2 | 0.950 | 1/2 = 50% | 10-91% |

- n 15, fixed 2 (bug3 and bug4, both from the offline triage). Stated confidence 0.85-0.95, mean 0.90. Observed fixed rate 13% (Wilson 4-38%).
- **Brier score 0.695.** Saying a constant 0.13 (the observed rate) for every triage would score 0.116 (a constant 0.20 scores 0.120); in-sample, so slightly flattering to the constant. Ultra's number is worse than knowing nothing about the individual triage.
- Mean stated confidence: 0.925 on the 2 fixes, 0.895 on the 13 misses. A 0.03 gap on 2 positives is noise.
- The buckets look monotone (0%, 11%, 50%), but all three Wilson intervals overlap heavily; with 15 points this is not evidence of ranking ability either way.
- Pattern in the misses: 3 of 7 controlled answers patched inside `if(RULES.mountReleaseFix)` even though the evidence's first line says the replay forces that rule to 0; the other 4 named a plausible line (`resetPos` at get-up, the FALL phase, `lock2DCorridor`) and the replay still broke. The confidence was the same either way.
- All four p0537 calls (old footage, two v3 footage, one controlled) edit the forced-off `mountReleaseFix` guard. The old-footage one was first scored `fixed` because it deletes the guard and keeps its body, which switches on the shipped fix; the current check scores it `reused-shipped-fix`. Re-scoring that one row moved the totals from 3 fixed (Brier 0.642) to 2 fixed (Brier 0.695).

**Conclusion:** Ultra's triage confidence is not calibrated and carries no measurable information about whether the patch works. The UI now labels it "Ultra states N% confidence" and prints the measured stated-vs-observed line under every live triage (`app/modes/repro/MatchRow.tsx`, numbers from `TRIAGE_CALIBRATION` in `lib/calibration.ts`). The replay verdict is the signal. A finding's `confidence` (the report, not triage) was never measured against outcomes; the Findings card now labels it the same way.

## 2. Findings claims (`ai/verify.ts`)

`claimOk` accepts a rate claim within **±0.05 absolute** and any other claim within **±10% relative**.

### Header copies vs independent aggregates

`ai/corpus.ts` `header()` prints, computed by code: overall (all five metrics), by archetype (all five), by round (win, quit, duration) and archetype x round (win, quit). A claim whose (metric, scope) is one of those cells can be copied from the prompt.

| findings file | claims | header cells | independent aggregates | failed verification |
| --- | --- | --- | --- | --- |
| main run (`data/run-main/findings.json`) | 31 | **31** | 0 | 0 |
| fixture 150 (`data/fixtures-ai/findings.json`) | 21 | 19 | 2 | 0 |
| planted fixture 1000 (`data/fixtures-ai/big/findings.json`) | 24 | 23 | 1 | 1 |

So "31 of 31 verified" means Ultra transcribed 31 table cells correctly. The only claims that were not header cells (3, all `avgDuration` by archetype x round on the fixtures) include the one real catch: on the planted fixture Ultra stated the cheeser round-1 average as 16.9 s, one player's time; the archetype average is 43.5 s.

### Mutations: how wrong can a claim be and still pass?

Every main-run claim's stated value shifted by a factor or by points; does it still verify against the recomputed value?

| shift | rate claims still verified (54 = 27 claims x ±) | other claims still verified (8) |
| --- | --- | --- |
| ±1% relative | 54/54 (100%) | 8/8 |
| ±5% relative | 54/54 (100%) | 8/8 |
| ±10% relative | 40/54 (74%) | 4/8 |
| ±20% relative | 14/54 (26%) | 0/8 |
| ±1 point absolute | 54/54 (100%) | - |
| ±3 points absolute | 54/54 (100%) | - |
| ±5 points absolute | 28/54 (52%) | - |

- 6 of 27 rate claims are below 15% (casual round-2 win 4%, cheeser quit 6%, cheeser KO share 7%, ...). For those, ±0.05 accepts a relative error of 36% to 125%: a claimed 4% win rate passes for anything from 0% to 9%.
- **Wrong scope:** keep the stated value but evaluate it on each sibling scope (another archetype or another round). 32 of 253 such wrong claims (12.6%) still verify.
- The honest claims are far tighter than the tolerance: the largest gap between a stated and a recomputed value is 0.0047 on rates (whole-percent rounding) and 0.1% on other metrics.

**Proposal for `ai/verify.ts` (not applied; not this audit's file):** rates ±0.01 absolute, other metrics ±2% relative. On the three findings files it keeps 75 of 76 honest claims, exactly as today (the one failure is the real catch above). Under it a ±5% relative shift passes 14/62 instead of 62/62, ±3 points passes 0/54 instead of 54/54, and wrong-scope claims pass 8/253 instead of 32/253. The fixture's `avgDuration` 78.7 vs 80.0 s (1.6% off) would still pass at 2%.

## 3. Repro oracle (Nemotron Super)

`ai/cli/calibrate-oracle.ts`: 10 bug reports through `bugReportToOracle` (Super, up to 2 calls each; 11 calls used). Each report has a hand-written reference predicate over the recorded events: the rounds that truly show what it describes. The oracle runs over all 5,706 recorded rounds (main run + sweep-nerf run).

| report | kind | rounds that truly show it | oracle matched | true matches | precision | recall | oracle |
| --- | --- | --- | --- | --- | --- | --- | --- |
| floated then flew out past the wall | clear | 2 | 2 | 2 | 100% | 100% | airborne(player) AND oob(player) |
| never got up after a knockdown | clear | 1 | 1 | 1 | 100% | 100% | knockdown AND stuck KNOCKDOWN |
| CPU swept me 3+ times in a round | clear | 626 | 626 | 626 | 100% | 100% | hit SWEEP by rival, minCount 3 |
| nobody could land a hit, round stalled | clear | 3 | 2,880 | 1 | 0.03% | 33% | hit(player) AND hit(rival): **inverted** |
| game crashed when a crate was thrown | clear | 3 | rejected | - | - | 0% | `{"error"}`: no matching event |
| "the guy was kind of flying??" | vague | 20 | 10 | 10 | 100% | 50% | airborne by the **rival** only |
| "the fight felt broken" | vague | 23 | rejected | - | - | - | rejected as too vague (reasonable) |
| fell through the floor, under the map | wrong | 0 | 0 | 0 | - | - | clip(player): correctly finds nothing |
| KO'd by one jab in the first 2 s | wrong | 0 | 0 | 0 | - | - | player_ko in [0,2] AND rival JAB: correctly finds nothing |
| checkout page charged my card twice | off-topic | 0 | rejected | - | - | - | rejected (correct) |

- Precision where the oracle matched something: 4 of the 5 oracles that matched any round had 100% precision; pooled over matches, 640 of 3,519 matched rounds are true, dragged down entirely by the one inverted oracle.
- Too loose: 1 of 10 (stalemate: a report about the *absence* of hits became a predicate on their presence; the predicate language has no negation or "no X for N s" atom except `softlock`, which Super did not use).
- Too strict: 2 of 10 (crash report rejected; "flying" read as the rival only).
- Correct refusals or empty results: 4 of 4 for the wrong and off-topic reports.
- **Cause of the crash rejection:** the oracle prompt in `ai/nl.ts` lists the invariant events without `crash`, although `ORACLE_EVENTS` accepts it, so Super never learns the event exists. Follow-up for the owner of `ai/nl.ts`: add `crash` (with its message as `arg`) to the prompt's event list. Done after this audit: the prompt now lists `crash`; the 10-report test has not been re-run.
- The app already says "Zero matches does not prove the bug is absent"; it should also say a match count is only as good as the oracle shown above it, which the page does by printing the oracle's atoms.

## 4. Eyes (Nemotron Super-VL)

`ai/cli/calibrate-eyes.ts`: the replay page renders each round and returns the same 3 frames the Eyes panel captures (`lib/eyes.ts captureTimes`, 640 px JPEG), then one Super-VL call with the default question. Graded by hand from the answers and frames.

| round | truth | frames at (s) | Super-VL said | grade |
| --- | --- | --- | --- | --- |
| p0537:1 (airborne 13.8, oob 14.3) | bug | 11.3, 13.8, 15.3 | crate overlapping a downed fighter in frame 1; frames 2-3 normal | flagged, but **missed the floating fighter** visible in frame 1 |
| p0653:2 (airborne 18.5, stuck 26) | bug | 16, 18.5, 20 | standing fighter floating in frame 1; downed fighter clipped into a crate | hit |
| p0009:3 (airborne 16.6) | bug | 14.1, 16.6, 16.7 | standing fighter floating above the crate in all frames | hit (checked against frame 2: correct) |
| p0001:1 | clean | 2, 3.9, 5.9 | "No" | correct |
| p0002:2 | clean | 4.4, 8.9, 13.3 | "No" | correct |
| p0100:1 | clean | 4.3, 8.7, 13 | "Nothing looks physically wrong" | correct |

- Flags something on a bug round: 3/3 (Wilson 44-100%). Names the real invariant: 2/3 (21-94%).
- False alarms on clean rounds: 0/3 (Wilson 0-56%).
- Same p0537 answer as the recorded demo: the README's "Super-VL missed a bug the engine caught" still holds for that round. Three rounds per class cannot distinguish a good detector from a coin that says "yes" on bug rounds; the Eyes panel's existing copy ("it describes; it does not decide") is the right framing.
- The keyword flag in the script is a first pass only; it misread two clean "No." answers as flags, which is why grading is by hand.

## 5. Headline rates

Player-level bootstrap (`bootstrapRatio` in `lib/calibration.ts`, 2,000 resamples, seed 1): resample players with replacement, recompute the rate. Rounds of one player share skill and policy, so treating rounds as independent (a Wilson interval over rounds) is too narrow; the bootstrap widens the casual win interval's lower end from 4.1% to 3.5%.

| rate | value | players | rounds | 95% bootstrap over players | Wilson (win: over rounds; quit: over players) |
| --- | --- | --- | --- | --- | --- |
| casual win rate | 5.9% | 200 | 440 | 3.5-8.5% | 4.1-8.5% |
| casual quit rate | 97.0% | 200 | 440 | 94.5-99.0% | 93.6-98.6% |
| cheeser win rate | 92.3% | 100 | 299 | 89.2-95.3% | 88.7-94.8% |
| cheeser quit rate | 6.0% | 100 | 299 | 2.0-11.0% | 2.8-12.5% |
| overall win rate | 31.5% | 1000 | 2831 | 29.3-33.9% | 29.8-33.2% |
| round 2 quit rate | 30.5% | 920 | 920 | 27.5-33.6% | 27.7-33.6% |

These intervals cover sampling noise among synthetic players only. They say nothing about whether the synthetic players behave like people (see README "Honest limits"). The Findings cards now show this interval next to every verified rate claim (`components/FindingCard.tsx`, `rateInterval`: Wilson over players for quit rates, which have no per-round structure; bootstrap over players for win rates and KO shares).

## What changed in the app

- `lib/calibration.ts` (+ `lib/calibration.test.ts`): Brier score, calibration table, Wilson interval, seeded player bootstrap, per-claim player groups matching `ai/verify.ts`, `rateInterval`, and the measured `TRIAGE_CALIBRATION` constants.
- `app/modes/repro/MatchRow.tsx`: the confidence chip reads "Ultra states N% confidence", followed by "Stated N% vs observed: ...", and the measured record (15 triages, 85-95% every time, 3 fixed, Brier 0.64 vs 0.16). That text predates the re-scoring in section 1, which gives 2 fixed and Brier 0.70 vs 0.12; the `TRIAGE_CALIBRATION` constants in `lib/calibration.ts` and the README line should be updated to match.
- `components/FindingCard.tsx`: 95% intervals on verified rate claims; the finding confidence chip is labelled as Ultra's own, unmeasured estimate.
- `README.md`: a short "How much to trust the numbers" section.

## Commands

```bash
# offline tables (no model calls): triage confidence, claim tolerance, header copies, rate intervals
npx tsx ai/cli/calibration-audit.ts --triage-runs <calibrate-triage output.json>

# 12 Ultra calls (hard cap in the script), one per recorded bug round, verdict by replay
npx tsx --env-file=.env ai/cli/calibrate-triage.ts --out <out.json> --max-calls 12

# 10 bug reports through the Repro oracle (Super, at most 20 calls)
npx tsx --env-file=.env ai/cli/calibrate-oracle.ts --out <out.json> --max-calls 20

# Eyes: needs the app running; --frames-only captures frames without calling Super-VL
npx tsx --env-file=.env ai/cli/calibrate-eyes.ts --base http://localhost:3140 --out <out.json>

npx tsx --test lib/calibration.test.ts
```

## 6. Live-triage patch anchoring (line ranges)

Change (`ai/triage.ts`, `lib/triage-live.ts`): Ultra now answers with `{file, startLine, endLine, replace}` (whole lines, at most 12) read off the numbered source, mapped in code to the exact find/replace that `applyPatches` already uses, so the scratch copy, sandbox and network lock are unchanged. A range whose text repeats is widened by neighbouring lines until unique. A legacy `find` that is not exact is accepted only if it matches in exactly one place with whitespace ignored. Patch sets that change only whitespace and patches that change the bracket balance (a dropped line) are rejected. A rejected `find` gets the closest real lines sent back. The evidence gains a `FIRED` row (which invariants fired, for whom, at what time, and the window shown), and the `TUNING` row says a patch that edits a forced-off `RULES.*` guard is not credited. That check now looks only at the part of a patch that changes, because whole-line patches often contain a guard they do not touch.

Same method as section 1 (`ai/cli/calibrate-triage.ts`, one Ultra call per round, no retry), same 12 rounds, before = the section 1 run, after = a new run. The before run was re-scored with the new guard check (no model calls): p0731:2 becomes a replayed `not-fixed`, so before it was 0 fixed under both rules.

| 12 rounds, 1 call each | before (`find` text) | after (line ranges) |
| --- | --- | --- |
| valid patch | 7 of 12 (58%) | 8 of 12 (67%) |
| invalid: `find` not in the file | 5 | 0 |
| invalid: range over 12 lines | n/a | 4 (Ultra rewrote whole functions, e.g. `throwProp` lines 285-308) |
| fixed | 0 | 1 (p0111:3) |
| reused-shipped-fix | 2 (3 under the old check) | 3 |
| not-fixed | 5 (4 under the old check) | 4 |
| tokens in / out | 318,355 / 4,352 | 325,312 / 5,300 |

- The after column is the run as it happened. The two checks added after it (whitespace-only, bracket balance) would have rejected 2 of its 8 valid answers: p0306:4 (a re-indent that changed nothing, replayed as `not-fixed`) and p0009:3 (it dropped a closing `}`, refused as `reused-shipped-fix`). Live, with two attempts, those go back to Ultra for a second try.
- Confidence in this arm (the 8 valid answers of the 12-round run plus the p0355:2 retry, 9 triages with a verdict): 0.85 five times, 0.90 twice, 0.95 twice (mean 0.883). Brier 0.704; a constant 0.111 (the observed rate, 1 of 9) scores 0.099. The one fix was stated at 0.85. Source: the run outputs in the session notes folder (`calibration-triage-ranges-after.json`, `-retry.json`).
- The one fix (p0111:3) clamps the fighter's height to 0.82 during get-up. It clears the `airborne` invariant on that seed, but it treats the symptom, not why the body rose.
- Two of the three reused answers (p0653:2, p0754:2) rewrote the shipped fix without its rule flag. The check catches that because the flag name is in the changed text.
- One extra call in the live setup (two attempts) on p0355:2: the first answer validated but put `ground.js` code into a `character.js` line range. Refused as `reused-shipped-fix`. Total Ultra calls for this section: 13.
- **Sample:** 12 rounds per arm and one call each. 0 to 1 fixed and 5 to 4 invalid are within noise. The clear result is the kind of failure: "find text not in the file" went from 5 to 0, and the main remaining failure is a range that is too long. The fixed rate has not measurably improved.

## Follow-ups (not done here)

- `ai/verify.ts`: tighten the tolerance as proposed in section 2.
- `ai/nl.ts`: add `crash` to the oracle prompt's event list; consider a "no hit for N s" atom, or tell Super to use `softlock` for stalemate reports.
- `ai/triage.ts`: with line ranges, 4 of 12 answers asked for more than 12 lines (section 6). Allowing about 30 lines, or asking for the smallest range in the prompt, is the next thing to measure.
- Drop the `confidence` field from the triage prompt, or ask for it after the replay result, if it is not going to be calibrated.
