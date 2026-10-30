# Voice-over v2: one flowing paragraph per scene

Why a new script: the first recording was read line by line and the video has less room than the old script needed, which made the speech stop and start. This version is **tighter and written to each scene's real length**. Read **each paragraph in one go, naturally, like you are telling a friend**. Leave **a clear pause of about 2 seconds between paragraphs** (that is all the tool needs to find them). Do not stop inside a paragraph. If you stumble, keep going or restart that paragraph after the pause; I use the last clean one.

Target pace: a calm, steady talk. The seconds below are how long the picture stays on that scene, so a paragraph that takes about that long is perfect.

| # | Scene | Picture length | Words | Read this |
|---|---|---|---|---|
| 1 | Title | 2.4 s | 3 | A Thousand Players. |
| 2 | Home | 10.7 s | 26 | I built a fighting game for a class. Then a thousand synthetic players played nine and a half hours of it, and found where it breaks. |
| 3 | Terminal | 17.3 s | 30 | On Nebius Token Factory, Nemotron Nano wrote a thousand player personas. A headless copy of the game plays them: about 2,800 rounds in fourteen seconds. The recorded run has 2,831. |
| 4 | Findings | 17.9 s | 32 | Then Nemotron Ultra read a summary of all 2,831 rounds and wrote eight findings. Code rechecked all 31 of its number claims, and all 31 matched. It also caught 13 invented seeds. |
| 5 | Charts | 9.0 s | 18 | The story: casual players win 6% of rounds, and 97% quit. Players who spam one move win 92%. |
| 6 | Replay | 14.6 s | 30 | Every finding is a seed. Click it, and the real game replays that exact round in your browser. Same inputs, same match. Here a fighter floats out of the arena. |
| 7 | Bugs | 22.8 s | 52 | The crowd also found real bugs. Ultra's patch fixed nothing here. My hand fixes now make all 29 flagged rounds replay clean. Ultra failed twice on this one, so I traced it by hand. Its fix for this crash passed the replay, and it shipped. Its softlock fix passed on one seed. |
| 8 | Exploit | 15.7 s | 30 | Exploit mode: Nano evolves strategies, and the engine scores them. The best one wins 30 of 30. Super first got the move wrong; the recorded hits say sweep, then pin. |
| 9 | Repro | 29.1 s | 53 | Repro: type a bug report in plain English. Super turns it into a check, and plain code runs it on every recorded round. Two match. Ultra proposes a patch: it only switched on a fix the game already has, so no credit. On the other round, the engine replayed Ultra's patch. Still broken. |
| 10 | Eyes | 11.7 s | 24 | Eyes sends three frames to Super-VL, a vision model. It missed the floating fighter the engine caught, so it describes; it does not decide. |
| 11 | Models | 11.2 s | 24 | Four NVIDIA Nemotron models, all on Nebius Token Factory. Nano writes players, Super writes checks, Ultra reads everything, Super-VL looks. Code checks it all. |
| 12 | Limits | 6.7 s | 12 | The limits: the players are synthetic, and findings are samples, not proof. |
| 13 | End | 4.9 s | 7 | Try it: a-thousand-players dot vercel dot app. |
