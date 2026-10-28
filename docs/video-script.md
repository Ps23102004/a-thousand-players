# Video script (target 2:50, hard limit 3:00)

Record the screen at 1080p, voice over after. Every number below comes from `data/run-main/` or the README (the fifteen-second figure is the Throughput line in the README); do not add numbers that are not in them.
Replace `[URL]` with the hosted demo URL once there is one. Do not record the hosted pages before the URL exists; record `npm run dev` and re-record the last 15 seconds on the hosted site.

| Time | On screen | Voice over |
|---|---|---|
| 0:00 | Home page, crowd grid of 3D-less tiles playing | "I built a fighting game for a class. Then a thousand synthetic players broke it in about fifteen seconds." |
| 0:12 | Terminal: `npm run crowd`, rounds/s counter; then the Crowd section numbers | "Nemotron Nano wrote a thousand player personas. A headless copy of the real game ran them for 2,831 rounds, about nine and a half hours of play, at 60 frames a second on a twelve-core Mac." |
| 0:30 | Findings page, one finding with its green verified claims | "Then Nemotron Ultra read every play log in one call, 220 thousand tokens, and wrote eight findings. Code recomputed each of its 31 claims from the raw data. All 31 matched. It also deleted 13 seeds Ultra had made up." |
| 0:52 | Charts: casual win rate 6%, quit rate; cheeser win rate 92% | "The story: casual players win 6% of rounds and 97% quit. Players who spam one move win 92%." |
| 1:05 | Click a seed, 3D replay plays in the browser, badge shows deterministic re-simulation | "Every finding is a seed. Click it and the real game replays the exact round in your browser. Same inputs, same match." |
| 1:20 | Bugs page: bug4 verified, bug3 verified, bug2 'fixed by hand' | "It also found real bugs: a knocked-down fighter softlocked on a crate, and a thrown crate that crashed the physics engine. Ultra proposed patches, and the engine replayed the exact seeds to check them. Two held up. Ultra failed twice on a third, so I traced it by hand. That is in the write-up." |
| 1:48 | Exploit page: table with landed hits column | "Exploit mode: Nano evolves strategies and the engine scores them. The best one wins every round. Super first explained why with the wrong mechanism. The recorded hits showed it is sweep into mount, so the explanation now starts from that measured tally." |
| 2:10 | Repro page: type the report, oracle appears, two matching rounds, click one | "Repro: type a bug report in plain English. Super writes a checkable oracle. Plain code runs it over every recorded round, and it finds exactly the two rounds with that bug." |
| 2:28 | Replay page, Eyes panel with Super-VL answer and the three frames | "Eyes sends three frames to Super-VL. On that bug round it missed the floating fighter the engine caught, so it describes; it does not decide." |
| 2:42 | Model table slide (below), then repo and URL | "Nano writes players and strategies. Super turns English into things the engine runs. Ultra reads everything and triages. Super-VL looks at frames. Tavily finds design precedent. Code does all the checking. Try it at [URL]." |

## Model table slide (static, 8 seconds)

| Model | Job | Checked by |
|---|---|---|
| Nemotron Nano 30B | Personas, exploit strategies | Validator, engine |
| Nemotron Super 120B | Bug report to oracle, patch notes to tuning, exploit explanation | Oracle schema, recorded hits |
| Nemotron Ultra 550B | Whole-crowd report, bug triage and patches | Claim recompute, replay of exact seeds |
| Nemotron Super-VL | Describes replay frames | Nothing: advisory only |
| Tavily | Precedent for each finding's fix | Not verified |

## Limits to say or show on screen (judges asked for them)

- Players are synthetic; quitting comes from a simple mood model.
- Crowd players run Nano-written policies natively, not an LLM call per move.
- Findings are sampled; zero matches is not proof of absence.
- bug2 was fixed by hand and part of that fix is a workaround; bug1 is only partly fixed.
- Super-VL missed a bug the engine caught.

## Before recording

1. `npm run dev`, open `/`, `/bugs`, `/modes/exploit`, `/modes/repro`, and a `/replay?key=p0537%3A1` page in tabs. Let the replay finish once so the shaders are warm.
2. Run the Repro sample report once to confirm it still returns two rounds. The oracle can vary between calls.
3. Check the daily call cap in the rate limiter is not used up (200 calls a day, 10 a minute per address).
4. Never show `.env`. Keep the terminal to the crowd command and its output.
5. The YouTube video must be public and 3:00 or shorter.
