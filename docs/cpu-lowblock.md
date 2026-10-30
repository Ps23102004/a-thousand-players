# CPU Low Block Parameter Sweep

## Execution
- **Command:** `node scripts/cpu-lowblock-sweep.mjs`
- **Wall Time:** 62.4 s
- **Sample Sizes:**
  - Mindless A & B: 100 seeds (7000000..7000099), fighter kai
  - Persona crowd: 200 personas x 1 round, base seed 1

## Win Rate Sweep Table

| $v$ (cpuLowBlock) | Mindless A Win% (95% CI) | Mindless B Win% (95% CI) | casual Win% | cheeser Win% | explorer Win% | learner Win% | masher Win% | rusher Win% | speedrunner Win% | turtle Win% | Overall Crowd Win% |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 0.00 | 100.0% [96.3%, 100.0%] | 100.0% [96.3%, 100.0%] | 12.8% | 82.6% | 46.2% | 4.3% | 25.0% | 42.4% | 70.0% | 4.3% | 31.0% |
| 0.25 | 96.0% [90.2%, 98.4%] | 96.0% [90.2%, 98.4%] | 12.8% | 82.6% | 46.2% | 4.3% | 22.2% | 33.3% | 70.0% | 4.3% | 29.0% |
| 0.50 | 62.0% [52.2%, 70.9%] | 85.0% [76.7%, 90.7%] | 12.8% | 60.9% | 46.2% | 4.3% | 22.2% | 27.3% | 70.0% | 4.3% | 25.5% |
| 0.75 | 22.0% [15.0%, 31.1%] | 72.0% [62.5%, 79.9%] | 12.8% | 52.2% | 46.2% | 4.3% | 22.2% | 24.2% | 70.0% | 4.3% | 24.0% |
| 1.00 | 0.0% [0.0%, 3.7%] | 40.0% [30.9%, 49.8%] | 12.8% | 47.8% | 46.2% | 4.3% | 22.2% | 24.2% | 70.0% | 4.3% | 23.5% |

## Exploit Mechanics & Durations

| $v$ | Mindless A Win% | Mindless A KO% | Mindless A Med Time | Mindless B Win% | Mindless B KO% | Mindless B Med Time |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 0.00 | 100.0% | 100.0% | 11.3s | 100.0% | 100.0% | 9.9s |
| 0.25 | 96.0% | 96.0% | 12.1s | 96.0% | 96.0% | 14.6s |
| 0.50 | 62.0% | 62.0% | 14.8s | 85.0% | 85.0% | 16.4s |
| 0.75 | 22.0% | 22.0% | 12.9s | 72.0% | 72.0% | 16.9s |
| 1.00 | 0.0% | 0.0% | 11.6s | 40.0% | 40.0% | 16.4s |

## Analysis & Measurement Interpretation

This parameter sweep evaluates the effect of `rules.cpuLowBlock` ($v \in [0, 0.25, 0.5, 0.75, 1.0]$) on both mindless input exploits and archetype win rates across the shipped game engine. Each mindless condition tested $N = 100$ independent seeds (7000000..7000099) with fighter kai, accompanied by Wilson 95% score confidence intervals to quantify estimation uncertainty given the sample size. The baseline crowd evaluated $N = 200$ personas across 8 archetypes for 1 round at base seed 1 using the shipped crowd worker simulation functions.

At $v = 0.00$ (the original default), Mindless A (crouch + 6 Hz jab) and Mindless B (all keys held with 1 tick in 3 released) both achieve 100.0% win and KO rates (Wilson 95% CI: [96.3%, 100.0%]) with median round durations of 11.3 s and 9.9 s respectively, verifying bug-hunt finding H2 that low attacks are completely unanswered by the stock CPU and its high counter-attacks whiff over crouching fighters. Introducing `rules.cpuLowBlock` progressively suppresses both exploits: at $v = 0.50$, Mindless A falls to 62.0% [52.2%, 70.9%] and Mindless B to 85.0% [76.7%, 90.7%]; at $v = 1.00$, Mindless A is completely neutralized to 0.0% [0.0%, 3.7%], while Mindless B is reduced to 40.0% [30.9%, 49.8%].

Across the 200-persona competent crowd baseline, raising $v$ impacts low-attack exploiters while preserving non-low archetypes: the exploit archetype `cheeser` (which heavily spams sweeps and low attacks) drops steadily from 82.6% (19/23) at $v = 0$ down to 47.8% (11/23) at $v = 1.00$. `rusher` win rate drops from 42.4% (14/33) to 24.2% (8/33) and `masher` drops from 25.0% (9/36) to 22.2% (8/36). In contrast, the `casual` archetype win rate is unchanged at 12.8% (5/39) in this 200-persona 1-round sample (compared to ~5.9% in the full 1,000-persona multi-round dataset) because casual players rely on standing jabs and kicks rather than low attacks, so the CPU low-block rule is rarely engaged against them. Overall crowd win rate declines from 31.0% (62/200) at $v = 0$ to 23.5% (47/200) at $v = 1.00$.

## Decision

Ship `RULES.cpuLowBlock: 1` as a balance change. The CPU crouch-blocks low attacks and answers a crouching player's recovery with a sweep. In the 100-seed sweep, mindless A (hold crouch + tap J at 6 Hz) falls from 100/100 wins at 0 to 0/100 at 1; mindless B (all-keys flicker) falls from 100/100 to 40/100. Casual players stay at 5/39 at every tested value.

The cost is a crowd win-rate drop from 31.0% (62/200) to 23.5% (47/200), and mindless B still wins 40/100. The lead accepts this trade-off to remove the reliable crouch-jab exploit. Recorded rounds, Prophet comparisons and Tutor cached baselines pin `rules.cpuLowBlock: 0`, preserving their original measurements and random sequences.


## Replay and cache changes

`recordedWith`, both Prophet `baselineTuning` objects and all three Tutor cached `baselineTuning` objects now explicitly include `rules.cpuLowBlock: 0`. Prophet passes the recorded tuning to its first crowd and merges only the user's validated overrides over that same tuning for its second crowd. `engine/crowd.mjs` passes the tuning to every worker, and `applyTuning` applies it after restoring shipped defaults. Thus the new default does not leak into either side.

Both 200-persona Prophet caches were checked against fresh offline child crowds, including every archetype count and bug count: seed 1 remains 66 → 69 wins and seed 2 remains 55 → 64. All cached numeric measurements are unchanged. Tutor's three cached measurements remain 66 → 75, 66 → 69 and 66 → 60 wins; only their baseline flag metadata changed. No cache regeneration or quoted Prophet result changes were needed.

The recorded-replay check still reports 45/45 legacy-identical rounds; the shipped-default identical count is now 18 (previous documented count: 23). All 29 proof rounds remain clean (0 bug events), with their recorded-side results unchanged. The shipped-side outcome or time changes below are in `docs/proof/engine-before-after.json`; five outcomes and eleven times changed. In particular, bug4's shipped KO time is now 18.9 s rather than 19.53 s.

| Bug | Crowd | Round | Seed | Previous shipped CPU | New shipped CPU |
|---|---|---|---|---|---|
| bug1 | base | p0129:3 | 689759 | win at 24.42 s | win at 21.87 s |
| bug1 | base | p0306:4 | 594319 | win at 11.28 s | loss at 10.72 s |
| bug1 | sweep-nerf | p0112:3 | 662057 | win at 19.25 s | win at 20.73 s |
| bug1 | sweep-nerf | p0129:3 | 689759 | win at 29.72 s | win at 24.8 s |
| bug1 | sweep-nerf | p0244:3 | 839995 | win at 22.53 s | loss at 26.8 s |
| bug1 | sweep-nerf | p0306:4 | 594319 | win at 11.33 s | loss at 10.83 s |
| bug1 | sweep-nerf | p0396:1 | 819833 | win at 33.42 s | win at 22.4 s |
| bug1 | sweep-nerf | p0407:1 | 990614 | win at 21.08 s | loss at 28.12 s |
| bug1 | sweep-nerf | p0675:2 | 743292 | loss at 15.65 s | win at 22.07 s |
| bug3 | sweep-nerf | p0233:2 | 901214 | loss at 11.37 s | loss at 7.47 s |
| bug4 | base | p0653:2 | 529060 | loss at 19.53 s | loss at 18.9 s |


## Verification

The regression was added before changing the default: the shipped-default and fixed-seed low-response assertions failed with 0, then passed with 1 (seed 9101, same crouch-jab controller). All nine low-block engine tests pass. The game AI test also checks that crouching recovery selects SWEEP by default and CROSS with the flag at 0. Historical wall-escape and shattered-crate reproductions explicitly use the original CPU so they continue to exercise their target defects; the proof table still exercises the shipped CPU.

| Check | Result |
|---|---|
| `node scripts/check-recorded-replays.mjs` | 45 legacy identical of 45; 18 fixed identical. |
| All `engine/tests/*` via `npm test` | 143 passed, 0 failed, 1 existing TODO (144 tests). The subsequent TypeScript CLI stage exits with `listen EPERM` while creating its IPC pipe; the requested `node --import tsx --test ...` run is reported separately below. |
| `npm run engine:test` | 16 seeds twice, mismatches=0. |
| `node scripts/proof-table.mjs` | All 29 clean; bug1 0/21, bug2 0/4, bug3 0/3, bug4 0/1. |
| All `game/tests/*`, using already cached Vitest offline | 98 passed, 2 failed: absent `Development_Notebook_Project2.md` and `CSCI310_Project2_Slides.html`. |
| `node --import tsx --test ai/*.test.ts lib/*.test.ts app/api/*.test.ts` | Latest full run: 342 passed, 2 failed in concurrent Reprobot work, 7 triage tests cancelled at local socket setup, 2 existing TODOs. The two failures also reproduce when running `ai/reprobot.test.ts` alone. An earlier full run had 343 passes, no assertion failures, 7 cancelled and 2 TODOs before the additional proof-token test and concurrent Reprobot changes. |
| Focused Prophet and replay-token tests | All 24 passed, including real child crowds and the full 200-persona cached seed-1 comparison. Both cached Prophet seeds separately match fresh offline before/after crowds exactly. |
| `npx --no-install tsc --noEmit -p .` | Passed, using the installed compiler without network. |

No commit, push, network request or `.env` read was performed. The experiment scripts and their outputs, and `data/cpu-lowblock/`, were not edited by this change. Backups and detailed command logs are under `/private/tmp/sparring-lowblock-*`.
