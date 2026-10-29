# Proof: bugs found, fixed, and replayed

A crowd of 1000 synthetic players played 2,831 rounds of Market Brawl and the engine flagged **four bug clusters (29 flagged rounds)**. Each one below is shown the same way: the **same seed and the same player**, replayed once with the build as it was recorded (fix off) and once with the shipped game (fix on). Frames are captured from the real 3D game replay; the numbers come from the engine. Regenerate with `node scripts/proof-table.mjs` and `npx tsx scripts/proof-gallery.ts` (the second needs `npm run dev -- -p 3150`).

## The numbers (engine, same seed and persona, before vs after)

| Bug | Rounds replayed | Bug events with the recorded build | Bug events with the shipped game |
|---|---|---|---|
| bug1 | 8 | 8 of 8 | 0 of 8 |
| bug2 | 4 | 4 of 4 | 0 of 4 |
| bug3 | 3 | 3 of 3 | 0 of 3 |
| bug4 | 1 | 1 of 1 | 0 of 1 |

Reading the table: **16 flagged rounds were replayed (8 of bug1's 21, all of bug2, bug3 and bug4); every one shows a bug event with the recorded build and none with the shipped game.** The other 13 bug1 rounds were not replayed. This is a replay of known seeds, not a proof of absence: the 65,000-round hunt in [`bug-hunt.md`](bug-hunt.md) found no game crash, NaN or crate escape on fresh seeds, but did find rarer cases under extreme tunings (documented there as H5 and H6).

## bug1: Fighter floats up after a mount release or throw (`airborne`)

- Cluster size in the crowd run: **21** rounds. Shown: `p0009:3`, seed 822230. Fix off: 8 of 8 replayed rounds show the bug; fix on: 0 of 8.
- Fix in the shipped game: `mountReleaseFix` and `grabReleaseFix` (by hand). Ultra's own patch fixed 0 of 8.
- Watch it: [before (recorded build)](https://a-thousand-players.vercel.app/replay?t=eyJzZWVkIjo4MjIyMzAsInR1bmluZyI6eyJydWxlcy5tb3VudFJlbGVhc2VGaXgiOjAsInJ1bGVzLnRocm93UHJvcEd1YXJkIjowLCJydWxlcy5ncmFiUmVsZWFzZUZpeCI6MCwicnVsZXMua25vY2tkb3duT25Qcm9wRml4IjowfSwiZmlnaHRlciI6ImthaSIsIm1heFQiOjE3LCJwZXJzb25hIjp7ImlkIjoicDAwMDkiLCJuYW1lIjoiSXZhbiIsImFyY2hldHlwZSI6InR1cnRsZSIsInNraWxsIjowLjY3LCJyZWFjdGlvbl90aWNrcyI6MTgsInBhdGllbmNlIjowLjgzLCJmcnVzdHJhdGlvbl90b2xlcmFuY2UiOjAuNzcsImJpbyI6IjQ5LXllYXItb2xkIGNoZXNzIHBsYXllciwgd2FpdHMgZm9yIHJpdmFsJ3MgbWlzdGFrZSwgbmV2ZXIgaW5pdGlhdGVzIGF0dGFjay4iLCJydWxlcyI6W119fQ) · [after (shipped game)](https://a-thousand-players.vercel.app/replay?t=eyJzZWVkIjo4MjIyMzAsInR1bmluZyI6e30sImZpZ2h0ZXIiOiJrYWkiLCJtYXhUIjoxNywicGVyc29uYSI6eyJpZCI6InAwMDA5IiwibmFtZSI6Ikl2YW4iLCJhcmNoZXR5cGUiOiJ0dXJ0bGUiLCJza2lsbCI6MC42NywicmVhY3Rpb25fdGlja3MiOjE4LCJwYXRpZW5jZSI6MC44MywiZnJ1c3RyYXRpb25fdG9sZXJhbmNlIjowLjc3LCJiaW8iOiI0OS15ZWFyLW9sZCBjaGVzcyBwbGF5ZXIsIHdhaXRzIGZvciByaXZhbCdzIG1pc3Rha2UsIG5ldmVyIGluaXRpYXRlcyBhdHRhY2suIiwicnVsZXMiOltdfX0)

![bug1 before and after](proof/bug1-before-after.jpg)

## bug2: Fighter launched out of the arena after a mount release (`oob`, `airborne`, `softlock`)

- Cluster size in the crowd run: **4** rounds. Shown: `p0537:1`, seed 634310. Fix off: 4 of 4 replayed rounds show the bug; fix on: 0 of 4.
- Fix in the shipped game: `mountReleaseFix` (by hand, after Ultra failed twice).
- Watch it: [before (recorded build)](https://a-thousand-players.vercel.app/replay?t=eyJzZWVkIjo2MzQzMTAsInR1bmluZyI6eyJydWxlcy5tb3VudFJlbGVhc2VGaXgiOjAsInJ1bGVzLnRocm93UHJvcEd1YXJkIjowLCJydWxlcy5ncmFiUmVsZWFzZUZpeCI6MCwicnVsZXMua25vY2tkb3duT25Qcm9wRml4IjowfSwiZmlnaHRlciI6ImthaSIsIm1heFQiOjk5LCJwZXJzb25hIjp7ImlkIjoicDA1MzciLCJuYW1lIjoiTW9uYSIsImFyY2hldHlwZSI6ImNhc3VhbCIsInNraWxsIjowLjI0LCJyZWFjdGlvbl90aWNrcyI6NDAsInBhdGllbmNlIjowLjE1LCJmcnVzdHJhdGlvbl90b2xlcmFuY2UiOjAuMzUsImJpbyI6Ik5pZ2h0IHdhcmQgbnVyc2UsIGZpZ2h0cyBmb3IgYSBxdWljayB0aHJpbGwsIHF1aXRzIGltbWVkaWF0ZWx5IGFmdGVyIGJlaW5nIGhpdCIsInJ1bGVzIjpbeyJyaXZhbCI6ImFjdGl2ZSIsIndlaWdodHMiOnsicHVuY2giOjh9fSx7IndlaWdodHMiOnsicmV0cmVhdCI6OX19XX19) · [after (shipped game)](https://a-thousand-players.vercel.app/replay?t=eyJzZWVkIjo2MzQzMTAsInR1bmluZyI6e30sImZpZ2h0ZXIiOiJrYWkiLCJtYXhUIjo5OSwicGVyc29uYSI6eyJpZCI6InAwNTM3IiwibmFtZSI6Ik1vbmEiLCJhcmNoZXR5cGUiOiJjYXN1YWwiLCJza2lsbCI6MC4yNCwicmVhY3Rpb25fdGlja3MiOjQwLCJwYXRpZW5jZSI6MC4xNSwiZnJ1c3RyYXRpb25fdG9sZXJhbmNlIjowLjM1LCJiaW8iOiJOaWdodCB3YXJkIG51cnNlLCBmaWdodHMgZm9yIGEgcXVpY2sgdGhyaWxsLCBxdWl0cyBpbW1lZGlhdGVseSBhZnRlciBiZWluZyBoaXQiLCJydWxlcyI6W3sicml2YWwiOiJhY3RpdmUiLCJ3ZWlnaHRzIjp7InB1bmNoIjo4fX0seyJ3ZWlnaHRzIjp7InJldHJlYXQiOjl9fV19fQ)

![bug2 before and after](proof/bug2-before-after.jpg)

## bug3: Game crashes when a smashed crate is thrown (`RuntimeError: unreachable in throwProp`)

- Cluster size in the crowd run: **3** rounds. Shown: `p0233:2`, seed 901214. Fix off: 3 of 3 replayed rounds show the bug; fix on: 0 of 3.
- Fix in the shipped game: `throwPropGuard` (Ultra's patch, replay-verified 3 of 3).
- Watch it: [before (recorded build)](https://a-thousand-players.vercel.app/replay?t=eyJzZWVkIjo5MDEyMTQsInR1bmluZyI6eyJhbmltLlNXRUVQLnN0YXJ0dXAiOjAuMTQsImFuaW0uU1dFRVAuZGFtYWdlIjoxMSwicnVsZXMubW91bnRSZWxlYXNlRml4IjowLCJydWxlcy50aHJvd1Byb3BHdWFyZCI6MCwicnVsZXMuZ3JhYlJlbGVhc2VGaXgiOjAsInJ1bGVzLmtub2NrZG93bk9uUHJvcEZpeCI6MH0sImZpZ2h0ZXIiOiJyb29rIiwibWF4VCI6MTIsInBlcnNvbmEiOnsiaWQiOiJwMDIzMyIsIm5hbWUiOiJDaGVuIiwiYXJjaGV0eXBlIjoiZXhwbG9yZXIiLCJza2lsbCI6MC40NSwicmVhY3Rpb25fdGlja3MiOjMwLCJwYXRpZW5jZSI6MC42NSwiZnJ1c3RyYXRpb25fdG9sZXJhbmNlIjowLjc1LCJiaW8iOiIzMS15ZWFyLW9sZCBDaGluZXNlIGN1cmlvdXMgdGlua2VyZXIgdGVzdGluZyBldmVyeSBtYXJrZXQgZ2FkZ2V0LiIsInJ1bGVzIjpbeyJkaXN0IjoiZmFyIiwicml2YWwiOiJhY3RpdmUiLCJ3ZWlnaHRzIjp7InByb3AiOjV9fSx7ImRpc3QiOiJjbG9zZSIsInJpdmFsIjoicmVjb3ZlcnkiLCJ3ZWlnaHRzIjp7InB1bmNoIjo2LCJraWNrIjo1fX0seyJyaXZhbCI6ImRvd24iLCJ3ZWlnaHRzIjp7ImdyYWIiOjd9fV19fQ) · [after (shipped game)](https://a-thousand-players.vercel.app/replay?t=eyJzZWVkIjo5MDEyMTQsInR1bmluZyI6eyJhbmltLlNXRUVQLnN0YXJ0dXAiOjAuMTQsImFuaW0uU1dFRVAuZGFtYWdlIjoxMX0sImZpZ2h0ZXIiOiJyb29rIiwibWF4VCI6MTIsInBlcnNvbmEiOnsiaWQiOiJwMDIzMyIsIm5hbWUiOiJDaGVuIiwiYXJjaGV0eXBlIjoiZXhwbG9yZXIiLCJza2lsbCI6MC40NSwicmVhY3Rpb25fdGlja3MiOjMwLCJwYXRpZW5jZSI6MC42NSwiZnJ1c3RyYXRpb25fdG9sZXJhbmNlIjowLjc1LCJiaW8iOiIzMS15ZWFyLW9sZCBDaGluZXNlIGN1cmlvdXMgdGlua2VyZXIgdGVzdGluZyBldmVyeSBtYXJrZXQgZ2FkZ2V0LiIsInJ1bGVzIjpbeyJkaXN0IjoiZmFyIiwicml2YWwiOiJhY3RpdmUiLCJ3ZWlnaHRzIjp7InByb3AiOjV9fSx7ImRpc3QiOiJjbG9zZSIsInJpdmFsIjoicmVjb3ZlcnkiLCJ3ZWlnaHRzIjp7InB1bmNoIjo2LCJraWNrIjo1fX0seyJyaXZhbCI6ImRvd24iLCJ3ZWlnaHRzIjp7ImdyYWIiOjd9fV19fQ)

![bug3 before and after](proof/bug3-before-after.jpg)

*A crash is not visible in a still: the game stops responding at the crash time, so the two rows look alike up to that point. The proof for bug3 is the table above and the live replay links.*

## bug4: Knocked-down fighter stuck on a crate until the 99 s limit (`stuck`, `softlock`)

- Cluster size in the crowd run: **1** rounds. Shown: `p0653:2`, seed 529060. Fix off: 1 of 1 replayed rounds show the bug; fix on: 0 of 1.
- Fix in the shipped game: `knockdownOnPropFix` (by hand; Ultra's own patch worked on this seed but removes a height guard, so it was not shipped).
- Watch it: [before (recorded build)](https://a-thousand-players.vercel.app/replay?t=eyJzZWVkIjo1MjkwNjAsInR1bmluZyI6eyJydWxlcy5tb3VudFJlbGVhc2VGaXgiOjAsInJ1bGVzLnRocm93UHJvcEd1YXJkIjowLCJydWxlcy5ncmFiUmVsZWFzZUZpeCI6MCwicnVsZXMua25vY2tkb3duT25Qcm9wRml4IjowfSwiZmlnaHRlciI6InJvb2siLCJtYXhUIjo5OSwicGVyc29uYSI6eyJpZCI6InAwNjUzIiwibmFtZSI6Ik1pZ3VlbCIsImFyY2hldHlwZSI6ImNoZWVzZXIiLCJza2lsbCI6MC4zNCwicmVhY3Rpb25fdGlja3MiOjM4LCJwYXRpZW5jZSI6MC4xLCJmcnVzdHJhdGlvbl90b2xlcmFuY2UiOjAuNjUsImJpbyI6Ik1leGljYW4gbWVjaGFuaWMsIG1hc2hlcyBwdW5jaCB3aGVuIHByZXNzdXJlZC4iLCJydWxlcyI6W3sicml2YWwiOiJkb3duIiwid2VpZ2h0cyI6eyJwdW5jaCI6OSwia2ljayI6NH19LHsid2VpZ2h0cyI6eyJyZXRyZWF0Ijo2LCJqdW1wIjo1fX1dfX0) · [after (shipped game)](https://a-thousand-players.vercel.app/replay?t=eyJzZWVkIjo1MjkwNjAsInR1bmluZyI6e30sImZpZ2h0ZXIiOiJyb29rIiwibWF4VCI6OTksInBlcnNvbmEiOnsiaWQiOiJwMDY1MyIsIm5hbWUiOiJNaWd1ZWwiLCJhcmNoZXR5cGUiOiJjaGVlc2VyIiwic2tpbGwiOjAuMzQsInJlYWN0aW9uX3RpY2tzIjozOCwicGF0aWVuY2UiOjAuMSwiZnJ1c3RyYXRpb25fdG9sZXJhbmNlIjowLjY1LCJiaW8iOiJNZXhpY2FuIG1lY2hhbmljLCBtYXNoZXMgcHVuY2ggd2hlbiBwcmVzc3VyZWQuIiwicnVsZXMiOlt7InJpdmFsIjoiZG93biIsIndlaWdodHMiOnsicHVuY2giOjksImtpY2siOjR9fSx7IndlaWdodHMiOnsicmV0cmVhdCI6NiwianVtcCI6NX19XX19)

![bug4 before and after](proof/bug4-before-after.jpg)

## What this does and does not show

- The crowd found these bugs; **models did not fix most of them.** Ultra's patches fixed bug3 and worked on one bug4 seed; bug1 and bug2 were fixed by hand after Ultra failed (see the README).
- The fixes sit behind rule flags that are on in the shipped game and off in the recorded data, so recorded rounds still replay exactly (`node scripts/check-recorded-replays.mjs`: 45 of 45).
- The stills are one seed per bug. They illustrate the engine numbers; they are not a statistical claim.
