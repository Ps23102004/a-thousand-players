# Video voice-over

Narration for the rough cut (`footage/cut/rough-cut.mp4`, 2:52.9, built by `footage/cut/build.sh`). Read it as one take, or line by line with `footage/cut/voiceover-timecodes.md` (same lines, each with a start and end time). `footage/cut/captions.srt` has the same lines as subtitles. Replace `[URL]` with the hosted demo URL.

This replaces the voice-over column of `docs/video-script.md` for the cut. The scene order is the same; times moved because the cut opens with a 3-second title card and closes with a limits card and an end card.

## Speaking pace

- About 375 words over 2:52.9 of video: **125 words per minute** overall, 134 wpm inside the spoken windows. A relaxed demo read is 130 to 150 wpm, so there is room to breathe.
- The fastest lines are 171 wpm ("It also caught 13 seeds Ultra made up." and "The recorded hits say sweep, then pin..."). If a line runs long, drop its last clause rather than speeding up.
- **Needs a rebuild:** the Models line now carries the required audible Nebius + NVIDIA call-out (about 28 words) but its window is 7.5 s, which is about 220 wpm. The cut has about 7 s of headroom under the 3:00 limit: lengthen the Models scene by 3 to 4 s in `footage/cut/build.sh`, or shorten the line to "Four Nemotron models on Nebius Token Factory. Nano writes, Super translates, Ultra reads, Super-VL looks. Code checks all." Also make the end card say "Runs on Nebius Token Factory with NVIDIA Nemotron".
- Every window ends at least 0.2 s before the next starts. Pauses at scene changes are intentional.

## Narration

**[0:00.5–0:02.6] Title**
A Thousand Players.

**[0:03.2–0:13.8] Home**
I built a fighting game for a class. Then a thousand synthetic players played nine and a half hours of it, and found where it breaks.

**[0:14.2–0:31.3] Terminal**
On Nebius Token Factory, Nemotron Nano wrote a thousand player personas. A headless copy of the real game plays them. Here it runs about 2,800 rounds in fourteen seconds, on a twelve-core Mac. The recorded run has 2,831 rounds.

**[0:31.8–0:49.4] Findings**
Then Nemotron Ultra read a summary of all 2,831 rounds in one call: 220 thousand tokens. It wrote eight findings. Code recomputed each of its 31 number claims from the raw data. All 31 matched. It also caught 13 seeds Ultra made up.

**[0:50.0–0:58.8] Charts**
The story: casual players win 6% of rounds, and 97% quit. Players who spam one move win 92%.

**[0:59.3–1:13.8] Replay**
Every finding is a seed. Click it, and the real game replays that exact round in your browser. Same inputs, same match. Here a fighter floats out of the arena.

**[1:14.2–1:36.9] Bugs**
The crowd also found real bugs. Ultra's patch for this one fixed nothing. My hand fixes make all eight replayed rounds run clean. Here Ultra failed twice, so I traced it by hand. Ultra's fix for this crash passed the replay, and it shipped. Its softlock fix passed on one seed.

**[1:37.3–1:52.8] Exploit**
Exploit mode: Nano evolves strategies, and the engine scores them. The best one wins all 30 rounds. Super first explained why, and got the move wrong. The recorded hits say sweep, then pin. Now the explanation starts there.

**[1:53.3–2:22.3] Repro**
Repro: type a bug report in plain English. Super turns it into a check the engine can run. Plain code runs it on every recorded round. Two match. Then Ultra reads the code and proposes a patch. It only switched on a fix the game already has. No credit. On the other round, the engine replayed Ultra's patch. Still broken.

**[2:22.7–2:34.2] Eyes**
Eyes sends three frames to Super-VL, a vision model. On this round, it missed the floating fighter the engine caught. So it describes. It does not decide.

**[2:34.7–2:42.2] Models**
Four NVIDIA Nemotron models, all on Nebius Token Factory. Nano writes players. Super turns English into checks. Ultra reads everything. Super-VL looks. Code checks all of it.

**[2:42.7–2:49.2] Limits**
The limits: the players are synthetic. And findings are samples, not proof.

**[2:49.7–2:52.6] End**
Try it at [URL].

## Where the old script disagreed with the footage or the README

Each of these is already handled in the narration above; the list says what changed and why.

1. **Rounds over the terminal shot.** The script said 2,831 rounds in about fourteen seconds. The terminal shows today's re-run on the current build: 2,829 rounds in 14.2 s on 11 workers. 2,831 is the recorded run. The narration says "about 2,800" over the terminal and gives 2,831 for the recorded run; a caption explains the difference.
2. **"60 frames a second."** The engine steps at 60 Hz with no renderer (README), so it draws no frames. Dropped.
3. **Token count.** The narration says 220 thousand (README: 220,334 prompt tokens). The Findings page, visible in the first second of that scene, shows "219,064 tokens", which is the corpus estimate. Both are true; the caption uses 220,334. If that bothers you, start the Findings shot after the tag.
4. **"Deleted 13 seeds."** The README says the 13 made-up seeds were "dropped or repaired". The narration says "caught".
5. **"All 31 matched."** True, but the README notes the check proves Ultra transcribed numbers it was shown, not that it discovered them. Not said on screen; consider saying "All 31 matched the data it was given" if a judge might push on it.
6. **Bug descriptions.** The script described bug4 as "softlocked on a crate"; the bug4 card says the knockdown fall never ends and does not mention a crate. The narration just says "softlock". bug4's chip says "fix verified" but Ultra's patch is not shipped (README); a narrower hand fix, `knockdownOnPropFix`, is. The caption says Ultra's fix is not shipped.
7. **bug1 status.** `/bugs` shows bug1 as "not fixed · 0 of 8 seeds" (Ultra's patch). The README and the limits say the shipped game replays all 8 clean (the bug2 mount-release fix clears 5, `grabReleaseFix` the other 3), checked 2026-10-28. The narration and the caption say both: Ultra's patch fixed none, the hand fixes make all 8 run clean.
8. **Triage beat.** The script's Repro scene ended at "found the two rounds". The cut adds the v3 triage ("not credited: the patch only switches on a fix the game already ships") and one shot from the older take 08b ("not fixed: the replay still breaks"). The narration covers both.
9. **Tavily.** The script's closing line names Tavily; the narration drops it for time. The model-table slide still shows it, with "Precedent for each finding's fix / Not verified", where the script table says "Related developer writeups / Not reviewed". Either wording is accurate; they just differ.
10. **Two takes in the Repro scene.** The "not fixed" shot (2:16.6–2:22.4) comes from the older take (08b, commit 0983ace). In that take the first row had a red HTTP 502 box; the cut starts after it scrolls away, but the page state differs from the v3 shot just before it. A viewer will not notice; a careful judge might.
11. **Hours of play.** The narration says "nine and a half hours"; the home page counter shows 9.6 (`summary.json`: 9.58 simulated hours). Both round the same number.
12. **"Sweep into mount."** "Mount" is fighting-game jargon; the narration says "sweep, then pin". The README adds that Super's prose still over-reads the grabs after the code-written tally; not said.
