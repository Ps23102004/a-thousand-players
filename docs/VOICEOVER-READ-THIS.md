# Voice-over: read this while the silent video plays

Play `footage/cut/rough-cut.mp4` muted (or on mute in a player), and read each line when its time comes. The video is already recorded; you only record your voice. Speak at a normal, relaxed pace; if a line runs long, drop its last few words rather than rushing. Save as `~/Desktop/voiceover.wav` (or .m4a), starting at 0:00 of the video. Then tell me and I mux it (command in docs/video-voiceover.md).

| Start | End | Scene | Say |
|---|---|---|---|
| 0:00.5 | 0:02.6 | Title | A Thousand Players. |
| 0:03.2 | 0:07.0 | Home | I built a fighting game for a class. |
| 0:07.1 | 0:13.8 | Home | Then a thousand synthetic players played nine and a half hours of it, and found where it breaks. |
| 0:14.2 | 0:18.5 | Terminal | On Nebius Token Factory, Nemotron Nano wrote a thousand player personas. |
| 0:18.6 | 0:22.5 | Terminal | A headless copy of the real game plays them. |
| 0:22.6 | 0:28.0 | Terminal | Here it runs about 2,800 rounds in fourteen seconds, on a twelve-core Mac. |
| 0:28.1 | 0:31.3 | Terminal | The recorded run has 2,831 rounds. |
| 0:31.8 | 0:37.5 | Findings | Then Nemotron Ultra read a summary of all 2,831 rounds in one call: 220 thousand tokens. |
| 0:37.6 | 0:40.3 | Findings | It wrote eight findings. |
| 0:40.5 | 0:44.8 | Findings | Code recomputed each of its 31 number claims from the raw data. |
| 0:44.9 | 0:46.5 | Findings | All 31 matched. |
| 0:46.6 | 0:49.4 | Findings | It also caught 13 seeds Ultra made up. |
| 0:50.0 | 0:54.6 | Charts | The story: casual players win 6% of rounds, and 97% quit. |
| 0:54.7 | 0:58.8 | Charts | Players who spam one move win 92%. |
| 0:59.3 | 1:02.9 | Replay | Every finding is a seed. |
| 1:03.0 | 1:08.0 | Replay | Click it, and the real game replays that exact round in your browser. |
| 1:08.1 | 1:10.4 | Replay | Same inputs, same match. |
| 1:10.5 | 1:13.8 | Replay | Here a fighter floats out of the arena. |
| 1:14.2 | 1:16.5 | Bugs | The crowd also found real bugs. |
| 1:16.6 | 1:21.9 | Bugs | Ultra's patch fixed nothing. My hand fixes replay all eight clean. |
| 1:22.1 | 1:27.5 | Bugs | Here Ultra failed twice, so I traced it by hand. |
| 1:27.7 | 1:33.2 | Bugs | Ultra's fix for this crash passed the replay, and it shipped. |
| 1:33.4 | 1:36.9 | Bugs | Its softlock fix passed on one seed. |
| 1:37.3 | 1:41.5 | Exploit | Exploit mode: Nano evolves strategies, and the engine scores them. |
| 1:41.6 | 1:44.3 | Exploit | The best one wins all 30 rounds. |
| 1:44.5 | 1:48.5 | Exploit | Super first explained why, and got the move wrong. |
| 1:48.6 | 1:52.8 | Exploit | The recorded hits say sweep, then pin. Now the explanation starts there. |
| 1:53.3 | 1:57.0 | Repro | Repro: type a bug report in plain English. |
| 1:57.1 | 2:01.5 | Repro | Super turns it into a check the engine can run. |
| 2:01.6 | 2:06.8 | Repro | Plain code runs it on every recorded round. Two match. |
| 2:07.0 | 2:10.6 | Repro | Then Ultra reads the code and proposes a patch. |
| 2:10.8 | 2:16.3 | Repro | It only switched on a fix the game already has. No credit. |
| 2:16.6 | 2:22.3 | Repro | On the other round, the engine replayed Ultra's patch. Still broken. |
| 2:22.7 | 2:26.4 | Eyes | Eyes sends three frames to Super-VL, a vision model. |
| 2:26.6 | 2:30.6 | Eyes | On this round, it missed the floating fighter the engine caught. |
| 2:30.7 | 2:34.2 | Eyes | So it describes. It does not decide. |
| 2:34.7 | 2:41.0 | Models | Four NVIDIA Nemotron models, all on Nebius Token Factory. Nano writes players. Super turns English into checks. |
| 2:41.2 | 2:45.7 | Models | Ultra reads everything. Super-VL looks. Code checks all of it. |
| 2:46.2 | 2:49.5 | Limits | The limits: the players are synthetic. |
| 2:49.6 | 2:52.7 | Limits | And findings are samples, not proof. |
| 2:53.2 | 2:58.1 | End | Try it: a-thousand-players dot vercel dot app. |
