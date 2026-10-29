# Aashna: engineer, tester, fixer and suggester

**Your job in one sentence:** make sure the project really works the way we say it does, find what is broken, fix what is small, write up what is big, and tell us what to improve, before Friday 10:00 PT.

**Read first (30 minutes):** [../README.md](../README.md), the repo's main [README](../../../README.md), then [../REQUIREMENTS.md](../REQUIREMENTS.md) sections A and B so you know what "working" has to mean for the judges.

**Your work log:** [work.md](work.md). Newest entry at the top: what you ran, what happened (paste the exact output), what you fixed or want fixed.

## What the project is (so you can test it)

A crowd of Nemotron-written synthetic players plays a 3D fighting game in a headless engine, records rounds, finds invariant violations (stuck, out of bounds, airborne, crash, softlock), and proves each with a seed that replays in the real game in the browser. A Next.js web app shows it, with live model modes (Repro, Balance, Eyes, Design Advisor, live Triage). **Models propose, code checks.**

Code map: `engine/` the headless sim and crowd runner (plain Node `.mjs`) and `engine/tests/`; `game/` the game and the browser replay page; `ai/` the Nemotron layer (Token Factory client, personas, report, triage, advisor); `lib/` shared code (rate limits, replay tokens, oracle matching, calibration); `app/` and `components/` the web app and its API routes; `adapters/` the crowd harness on two other games; `e2e/` the Playwright browser tests; `scripts/`; `data/run-main/` the recorded run (do not edit).

## Set up

You need **Node 22.15 or newer** (check `node -v`).

```bash
git clone <repo url> && cd a-thousand-players
npm ci
npm test                     # engine + library + AI + API tests; about 1 minute; fully offline
npx tsc --noEmit -p .        # types
npm run dev                  # app at http://localhost:3000
```

Keys are optional. Ask Parth if you need them for live-model tests, and **never commit or paste them**. Without keys the live routes answer 503 "not configured", which is correct behavior.

Expected right now: engine **134 pass, 1 todo**; TypeScript **251 pass, 2 todo**; browser suite **80 pass** (3 real-model tests are off by default); `node scripts/check-recorded-replays.mjs` says **45 of 45**; CI is green.

## What to do (in this order)

### 1. Confirm everything passes on your machine
Run the commands above plus `npm run engine:test` (must say `mismatches=0`) and `npm run build`. Log the outputs. If anything fails on your machine but passes for Parth, that is a finding: write down your OS, Node version and the full error.

### 2. Smoke-test the hosted app (once Parth sends the URL), logged out, in a private window
For each page, check it loads, no error banner, no console errors (browser dev tools), and looks right on a phone-width window too.

| Page | What to check |
|---|---|
| `/` | Crowd grid animates; findings show with "numbers checked by code"; charts render. |
| `/bugs` | Four clusters with verdict chips; replay links open. |
| `/games` | Three games with numbers. |
| `/modes/exploit` | Table with "landed hits" and replay links. |
| `/modes/repro` | Press **Use an example**, then **Find it in the crowd**: an oracle appears and **2 rounds match**. Press **Triage this (Ultra)** on a match: a verdict appears (any honest verdict is fine; an error after 2 tries is allowed but note it). Press **Find precedent**: sources appear (this is the Tavily runtime call that earns the bonus prize; **confirm it works hosted**). |
| `/modes/balance` | Use the example: tuning values appear. |
| `/modes/advisor` | Run it: cited recommendations appear, caveat box visible. |
| `/replay?key=p0537%3A1` | The 3D game loads and plays; badge says "build as recorded"; at 8x speed an airborne bug appears near 13.8 s. Try the **Eyes** panel once. |

Then: hit a live route 12 times quickly and confirm you get a clean 429 (rate limit) and that the built-in example still returns a cached answer. **Do not hammer it more than that; it spends real credits.** Note any page that is slow (over 3 seconds) or broken on mobile.

**The one big unknown:** live Triage runs a child Node process with the permission flag in a temp folder, and the route allows up to 180 seconds. Nobody has run that on Vercel. If it fails there, tell Parth immediately: the fallback is the cached sample answer plus a clear label, and we must not claim the live Ultra triage works if it does not.

### 3. Hunt for bugs the earlier rounds missed
We have already run 65,000 fresh rounds, fuzzing, an API abuse pass and three mock-judge rounds. Look at what they did not cover:
- Use the app like a stranger. Click everything. Try wrong inputs: empty, huge, other languages, emoji, pasted code in the Repro box.
- Different browsers and a real phone (Safari, Firefox, Chrome).
- Keyboard-only navigation and a screen reader pass on `/` and `/modes/repro`.
- The replay page with slow network (browser dev tools throttling).
- Anything in the README Quick start that does not work for a new person on a clean machine.

### 4. Known open items you can pick up (all small, each with a test first)

| Item | Where | Notes |
|---|---|---|
| Three tests marked `todo` that document known small bugs | `engine/tests/policy.test.mjs:243` (the policy keeps pressing a key after a prompt closes), `lib/eyes.edge.test.ts:130` (capture time can land after the round's end because of rounding), `lib/rate-limit.test.ts:102` (`retryAfter` is NaN when the limit is 0) | Fix one, change `todo` to a normal test, run `npm test`. |
| Leftover escapes under extreme tunings | `docs/bug-hunt.md` H5 (7 out-of-bounds) and H6 (one clip) | Low priority; document or fix behind a rule. |
| The replay page loads about 2.2 MB of game code eagerly (mobile Lighthouse 82) | `docs/bug-hunt.md` P1 to P5 | Lazy-load the iframe until the user scrolls to it. |
| Tavily "Find precedent" results are sometimes off-topic | `ai/precedent.ts` | Only improve if you can show better results on three examples. |
| The CPU never blocks low attacks, so mindless input wins every round | optional rule `rules.cpuLowBlock`, **off by default** | A design decision for Parth; do not turn it on without asking. |

### 5. Rules for fixing things (important)

1. **Test first.** Write a test that fails, then fix, then see it pass.
2. **Never break recorded replays.** The recorded rounds must keep replaying exactly. If you change game or engine behavior, put it behind a rule flag in `game/src/tuning.js`, set that flag to 0 in `data/run-main/meta.json` (`recordedWith`), and run `node scripts/check-recorded-replays.mjs` (must stay **45 of 45**) and `npm run engine:test`.
3. **Do not edit `data/run-main/`.** It is the recorded evidence.
4. **Do not change a number in the README or video script** without checking its source and telling Aman.
5. Small fix: do it on your branch (`aashna/<topic>`), open a pull request into `main` with the test output in the description. **Big change or anything unclear: write it up in [../SUGGESTIONS.md](../SUGGESTIONS.md) instead** and let Parth decide. Nothing risky in the last 12 hours before submission.
6. No force-push, no history rewriting.

### 6. Final-day tasks (see SUBMISSION-RUNBOOK.md)

Final secret scan, fresh-clone install and test on the last commit, the last smoke test of the hosted app, a model-credit check, and keeping the app healthy until Dec 15.

## How to suggest

Use [../SUGGESTIONS.md](../SUGGESTIONS.md): what, why, evidence, cost, risk. Good suggestions from testing: a confusing label, a slow page, a claim the app makes that you could not reproduce, a missing explanation a judge would want in the first 30 seconds.

## Your checklist

- [ ] Cloned, `npm ci`, `npm test`, `tsc`, `build`, `engine:test` pass on my machine (outputs logged)
- [ ] Hosted smoke test done (table above), screenshots logged
- [ ] Live Triage works on the hosted app, or the problem is reported
- [ ] Tavily "Find precedent" works on the hosted app
- [ ] Rate limit and cached examples behave
- [ ] Two or more new bugs found or "no new bug found" stated, with what I tried
- [ ] At least one known item fixed with a test, or written up
- [ ] Final secret scan, fresh clone, last test pass on the final commit
- [ ] Privacy check for the live app (LEGAL L10): nothing user-entered is stored
