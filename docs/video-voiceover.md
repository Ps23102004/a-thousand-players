# Video voice-over

Narration for the rough cut (`footage/cut/rough-cut.mp4`, 2:58.4, built by `footage/cut/build.sh`). Read it as one take, or line by line with `footage/cut/voiceover-timecodes.md` (same lines, each with a start and end time). `footage/cut/captions.srt` has the same lines as subtitles. The hosted demo URL is https://a-thousand-players.vercel.app; the spoken end line says it as "a-thousand-players dot vercel dot app". The on-screen end card shows a literal `[URL]` (and the build prints a warning) unless `APP_URL` and `REPO_URL` are set when building (see "Rebuild with real URLs" below).

This replaces the voice-over column of `docs/video-script.md` for the cut. The scene order is the same; times moved because the cut opens with a 3-second title card and closes with a limits card and an end card.

## Speaking pace

Numbers below were computed from `footage/cut/narration.tsv` (41 lines) and the built `rough-cut.mp4` (178.43 s by `ffprobe`).

- 375 words over 178.4 s of video: **126.1 words per minute** overall, **134.0 wpm** inside the spoken windows (167.9 s of windows); the end card is held 5.5 s so the spoken URL (7 words in 4.9 s) fits; margin to 3:00 is 1.6 s, and the mux below cuts the audio at the video length. A relaxed demo read is 130 to 150 wpm.
- **Models scene fixed.** The model-table slide is now held 3.5 s longer (`tpad=stop_mode=clone` on seg 10 in `build.sh`; the slide is static, so the clone is invisible). The Models narration is 27 words in an 11.0 s window (2:34.7 to 2:45.7), 147 wpm. Split into two lines: 17 words in 6.3 s (162 wpm, the Nebius + NVIDIA call-out) and 10 words in 4.5 s (133 wpm). The old 7.5 s window was about 216 wpm.
- **Fastest lines (still fast):** 171 wpm ("It also caught 13 seeds Ultra made up." and "The recorded hits say sweep, then pin..."), 168 wpm (the Findings opener), 167 wpm ("Code recomputed each of its 31 number claims..."). The bug1 line is now short: "Ultra's patch fixed nothing. My hand fixes replay all eight clean." is 11 words in 5.3 s, 125 wpm, so it is no longer a pacing risk.
- Lines inside a scene are 0.1 s apart, so read them as continuous speech. Between scenes there is at least 0.4 s of room. The cut is 3.6 s under the 3:00 limit.

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
The crowd also found real bugs. Ultra's patch fixed nothing. My hand fixes replay all eight clean. Here Ultra failed twice, so I traced it by hand. Ultra's fix for this crash passed the replay, and it shipped. Its softlock fix passed on one seed.

**[1:37.3–1:52.8] Exploit**
Exploit mode: Nano evolves strategies, and the engine scores them. The best one wins all 30 rounds. Super first explained why, and got the move wrong. The recorded hits say sweep, then pin. Now the explanation starts there.

**[1:53.3–2:22.3] Repro**
Repro: type a bug report in plain English. Super turns it into a check the engine can run. Plain code runs it on every recorded round. Two match. Then Ultra reads the code and proposes a patch. It only switched on a fix the game already has. No credit. On the other round, the engine replayed Ultra's patch. Still broken.

**[2:22.7–2:34.2] Eyes**
Eyes sends three frames to Super-VL, a vision model. On this round, it missed the floating fighter the engine caught. So it describes. It does not decide.

**[2:34.7–2:45.7] Models**
Four NVIDIA Nemotron models, all on Nebius Token Factory. Nano writes players. Super turns English into checks. Ultra reads everything. Super-VL looks. Code checks all of it.

**[2:46.2–2:52.7] Limits**
The limits: the players are synthetic. And findings are samples, not proof.

**[2:53.2–2:58.1] End**
Try it: a-thousand-players dot vercel dot app.

## Where the old script disagreed with the footage or the README

Each of these is already handled in the narration above; the list says what changed and why.

1. **Rounds over the terminal shot.** The script said 2,831 rounds in about fourteen seconds. The terminal shows today's re-run on the current build: 2,829 rounds in 14.2 s on 11 workers. 2,831 is the recorded run. The narration says "about 2,800" over the terminal and gives 2,831 for the recorded run; a caption explains the difference.
2. **"60 frames a second."** The engine steps at 60 Hz with no renderer (README), so it draws no frames. Dropped.
3. **Token count.** The narration says 220 thousand (README: 220,334 prompt tokens). The Findings page, visible in the first second of that scene, shows "219,064 tokens", which is the corpus estimate. Both are true; the caption uses 220,334. If that bothers you, start the Findings shot after the tag.
4. **"Deleted 13 seeds."** The README says the 13 made-up seeds were "dropped or repaired". The narration says "caught".
5. **"All 31 matched."** True, but the README notes the check proves Ultra transcribed numbers it was shown, not that it discovered them. Not said on screen; consider saying "All 31 matched the data it was given" if a judge might push on it.
6. **Bug descriptions.** The script described bug4 as "softlocked on a crate"; the bug4 card says the knockdown fall never ends and does not mention a crate. The narration just says "softlock". bug4's chip says "fix verified" but Ultra's patch is not shipped (README); a narrower hand fix, `knockdownOnPropFix`, is. The caption says Ultra's fix is not shipped.
7. **bug1 status.** `/bugs` shows bug1 as "not fixed · 0 of 8 seeds" (Ultra's patch). The README and the limits say the shipped game replays all 8 clean (the bug2 mount-release fix clears 5, `grabReleaseFix` the other 3), checked 2026-10-28. The narration says both in one line ("Ultra's patch fixed nothing. My hand fixes replay all eight clean."); the caption and limits card add the numbers and that 13 other rounds of the cluster were not replayed.
   Follow-up (2026-10-29): the engine proof now replays all 21 bug1 rounds clean. The fifth shipped flag, `getupCrateFix`, clears p0094:1's sink-and-eject during getup beside a crate; the recorded narration still describes the earlier 8-round check.
8. **Triage beat.** The script's Repro scene ended at "found the two rounds". The cut adds the v3 triage ("not credited: the patch only switches on a fix the game already ships") and one shot from the older take 08b ("not fixed: the replay still breaks"). The narration covers both.
9. **Tavily.** The script's closing line names Tavily; the narration drops it for time. The model-table slide still shows it, with "Precedent for each finding's fix / Not verified", where the script table says "Related developer writeups / Not reviewed". Either wording is accurate; they just differ.
10. **Two takes in the Repro scene.** The "not fixed" shot (2:16.6–2:22.4) comes from the older take (08b, commit 0983ace). In that take the first row had a red HTTP 502 box; the cut starts after it scrolls away, but the page state differs from the v3 shot just before it. A viewer will not notice; a careful judge might.
11. **Hours of play.** The narration says "nine and a half hours"; the home page counter shows 9.6 (`summary.json`: 9.58 simulated hours). Both round the same number.
12. **"Sweep into mount."** "Mount" is fighting-game jargon; the narration says "sweep, then pin". The README adds that Super's prose still over-reads the grabs after the code-written tally; not said.

## Rebuild with real URLs

The end card prints "Runs on Nebius Token Factory with NVIDIA Nemotron" plus two URL lines. `build.sh` reads them from the environment and falls back to the literal `[URL]`, so an unconfigured build is visibly unfinished:

```bash
APP_URL="https://a-thousand-players.vercel.app" REPO_URL="https://github.com/Ps23102004/a-thousand-players" bash footage/cut/build.sh
```

The rebuild takes about a minute and rewrites `rough-cut.mp4`. `build.sh` prints a WARNING to stderr if either URL is still the literal `[URL]`. Hosted demo URL used for the current build: https://a-thousand-players.vercel.app.

## Mux the final video

**First rebuild `rough-cut.mp4` with the real URLs (previous section).** The mux copies the video untouched (`-c:v copy`), so a `[URL]` on the end card stays there.

Record the voice-over to `~/Desktop/voiceover.wav` (a `.m4a` works too: change the filename). Read it against `voiceover-timecodes.md` while playing `rough-cut.mp4` muted. Start the take at 0:00 of the video. First compare lengths; the video is 178.43 s:

```bash
ffprobe -v error -show_entries format=duration -of csv=p=0 ~/Desktop/voiceover.wav
```

Check the take is not silent or the wrong file (a mean volume of about -91 dB means silence; expect roughly -30 to -15 dB for speech). If the take is mono and you want stereo, add `-ac 2` to the mux command below (optional).

```bash
ffmpeg -hide_banner -i ~/Desktop/voiceover.wav -af volumedetect -f null - 2>&1 | grep -E "mean_volume|max_volume"
ffmpeg -hide_banner -sseof -6 -i ~/Desktop/voiceover.wav -af volumedetect -f null - 2>&1 | grep -E "mean_volume|max_volume"
```

The second command checks the last 6 s, where the URL line is. If either shows silence, re-record. Run the same two checks on `footage/cut/final.mp4` after the mux (swap the filename).

If the voice-over is **longer than the video**, the command below cuts it off at the video's end and you lose the tail (the URL line). Re-record or trim instead of accepting that. Then mux. `-c:v copy` leaves the video untouched, `loudnorm` levels the voice (one pass, EBU R128 target -16 LUFS), `apad` plus `-shortest` pads a shorter voice-over with silence to the video's length and stops there:

```bash
cd ~/Developer/sparring && ffmpeg -y -i footage/cut/rough-cut.mp4 -i ~/Desktop/voiceover.wav \
  -map 0:v:0 -map 1:a:0 -c:v copy \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11,apad" -c:a aac -b:a 192k -ar 48000 \
  -shortest -movflags +faststart footage/cut/final.mp4
```

This replaces the silent audio track in `rough-cut.mp4`; it does not mix with it. The output is `footage/cut/final.mp4` (gitignored; do not commit it).

### Checks after the mux

1. Duration is under 180 s (limit is 3:00; expect 178.4):
   ```bash
   ffprobe -v error -show_entries format=duration -of csv=p=0 footage/cut/final.mp4
   ```
2. Streams: one `h264` video and one `aac` audio:
   ```bash
   ffprobe -v error -show_entries stream=codec_name,codec_type -of csv=p=0 footage/cut/final.mp4
   ```
3. Listen to the whole file once with headphones. Check that the voice is audible, not clipped, and that you hear **"Nebius Token Factory"** in the Terminal and Models scenes and **"NVIDIA Nemotron"** in the Models scene, aloud. The rules require the video to explain the Nebius and NVIDIA usage; captions and the end card do not replace saying it.
4. Check the end card shows the real URLs (not `[URL]`) and that you read the URL aloud on the last line.
5. No music and no third-party logos: the cut has none; do not add any in the voice-over file.

### Upload to YouTube

1. YouTube Studio, Create, Upload videos, pick `footage/cut/final.mp4`. Upload early: the organizers warn large files take long.
2. Visibility: **Public**. Not "Unlisted" and not "Private": the rules ask for a public video.
3. Title and description: say what it is; put the demo URL and the repo URL in the description. Set "Not made for kids". Wait for processing to finish (SD is enough to test; HD finishes later).
4. Test the link in a **private (incognito) window** with no Google login, on a second device if you can. It must play without signing in.
5. Paste the link into the Devpost submission. After the deadline (Fri 2026-10-30 10:00 PT) the submission is locked; do not edit or replace the video afterwards.
