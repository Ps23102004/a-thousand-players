# Glitch Hunter

Measured batch.

Command: `npx tsx ai/cli/glitch-hunt.ts --seed 1`. Model: `nvidia/Nemotron-3.5-Super-VL`.

Prompt: Do these frames visibly show a physically impossible fighter position or motion, such as floating, clipping into scenery, being outside the arena, or being frozen? Answer YES or NO first, then briefly explain only what is visible.

Rates show counts, percentage, Wilson 95% interval, and unparseable answers. Unparseable answers count as misses. Controls are matched by archetype then closest duration; per-type false alarms use controls matched to rounds with that type, so categories can overlap.

| Group | Hit rate | False-alarm rate |
|---|---|---|
| Overall | 8/10 (80.0%; 49.0–94.3%; 0 unparseable) | 2/10 (20.0%; 5.7–51.0%; 0 unparseable) |
| airborne | 8/10 (80.0%; 49.0–94.3%; 0 unparseable) | 2/10 (20.0%; 5.7–51.0%; 0 unparseable) |
| oob | 2/2 (100.0%; 34.2–100.0%; 0 unparseable) | 0/2 (0.0%; 0.0–65.8%; 0 unparseable) |
| clip | no observations | no observations |
| stuck | 1/1 (100.0%; 20.7–100.0%; 0 unparseable) | 0/1 (0.0%; 0.0–79.3%; 0 unparseable) |
| nan | no observations | no observations |
| softlock | 3/3 (100.0%; 43.9–100.0%; 0 unparseable) | 0/3 (0.0%; 0.0–56.1%; 0 unparseable) |

Small sample; camera distance can hide a glitch. Engine invariants are the detector and vision is a second opinion. Clean means no recorded invariant event, not proof of absence.

## What was selected, and what the misses were

- **Sample size:** the recorded run (`data/run-main/runs.jsonl`) contains only 10 rounds with an engine-flagged invariant of the requested types (nearly all `airborne`), so the batch is **10 flagged + 10 matched clean rounds, one Super-VL call each (20 calls)**, not the 20 + 20 first planned. Hence the wide intervals above; per-type rows for `clip` and `nan` have no rounds at all.
- **Missed (2 of 10 flagged, both `airborne`):** `p0744:3` and `p0306:4`. The answers describe a normal scene (one fighter standing on or near a box); the engine's airborne event is a few frames long and the camera pulls back, which matches the miss on `p0537:1` noted in `docs/calibration.md` in an earlier hand test (this batch did flag `p0537:1`).
- **False alarms (2 of 10 clean):** `p0938:2` (answer: a fighter lying flat on their back) and `p0046:2` (a fighter "airborne in a horizontal position"). Both are plausible knockdown or knockback poses that the engine does not count as an invariant violation. I did not inspect the frames by hand, so whether either is a real glitch is not established; by the engine's definition they are false alarms.
- Single run, one seed (1), one prompt. The model's own explanation text is not a result. Not a claim about other games or other camera setups.
