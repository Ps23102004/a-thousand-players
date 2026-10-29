# Team guide: start here

Project: **A Thousand Players**, our entry to the **Nebius x NVIDIA Global AI Hackathon** (Devpost).
**Deadline: Friday 2026-10-30, 10:00 PT.** Check the clock in Pacific time before you plan your day.

A crowd of Nemotron-written synthetic players plays a browser game, finds where it breaks, and proves every finding with a replayable seed. Read the main [README](../../README.md) first (10 minutes), then your own page below.

## Who does what

| Person | Role | Your page | Your work log |
|---|---|---|---|
| **Parth** | Owner and builder. Final say, keys, accounts, the video voice-over, clicking Submit. | n/a | n/a |
| **Aman** | **Researcher and validator.** Checks every fact we state, reads the rules and guidelines, matches the project against them, owns legal and paperwork. | [aman/README.md](aman/README.md) | [aman/work.md](aman/work.md) |
| **Aashna** | **Engineer, tester, fixer and suggester.** Runs the tests, hunts bugs, fixes what is small, writes up what is big. | [aashna/README.md](aashna/README.md) | [aashna/work.md](aashna/work.md) |

**Both of you can suggest anything** (features, wording, bugs, risks) in [SUGGESTIONS.md](SUGGESTIONS.md). Aman suggests from research and the rules; Aashna suggests from testing and code. Parth decides.

## The shared files (read these)

| File | What it is |
|---|---|
| [REQUIREMENTS.md](REQUIREMENTS.md) | Every hackathon rule, judging criterion, prize and judge tip we know, with our status for each and who owns it. |
| [LEGAL-AND-LICENSES.md](LEGAL-AND-LICENSES.md) | Licenses, third-party material, ownership and paperwork questions, with what is known and what is open. |
| [SUBMISSION-RUNBOOK.md](SUBMISSION-RUNBOOK.md) | The step-by-step list for the final day, in order. |
| [CREDITS-AND-PROGRAM.md](CREDITS-AND-PROGRAM.md) | The Nebius Builder Program and partner credits: what each is worth, the steps for Parth to click through, and ready-to-paste product text. |
| [SUGGESTIONS.md](SUGGESTIONS.md) | The shared suggestion inbox with a template. |

## How we work in the repo

The repo is **private** (`Ps23102004/a-thousand-players`). Parth invites you as collaborators (GitHub, Settings, Collaborators). It becomes public just before submission.

1. `git clone` it, then `npm ci`. Copy `.env.example` to `.env` only if Parth gives you keys. **Never commit `.env`, never paste a key in a file, chat or issue.** Without keys everything recorded still runs.
2. Work on **your own branch**: `aman/<topic>` or `aashna/<topic>`. Small, one topic each.
3. Keep your notes in **your own folder** (`docs/team/aman/` or `docs/team/aashna/`). Write what you did, what you found and what you need in your `work.md`, newest at the top.
4. Before you ask to merge: `npm test` and `npx tsc --noEmit -p .` must pass. Open a pull request into `main`; Parth reviews and merges. Doc-only changes by Aman can go straight to a PR the same way.
5. **Do not rewrite history or force-push.** The history was cleaned once on purpose (unlicensed assets removed); a force-push could bring them back.
6. A fact stated in the README, Devpost text or video must be checked against code or data. If you cannot check it, say "unverified" and tell Parth.

## What the project claims (so you can check it)

The honest short version, with where each claim lives:

- 1000 synthetic players, 2,831 recorded rounds on Market Brawl: `data/run-main/summary.json`.
- Nemotron Nano writes personas, Super turns English into oracles and tuning, Ultra reads a summary of all rounds and proposes patches, Super-VL describes frames, Tavily finds related writeups: [README "Model roles"](../../README.md#model-roles).
- **Models propose, code checks.** Findings' numbers are recomputed by code; fix verdicts come from replaying the exact seed.
- It works on three games' crowd harness, not only one: `docs/generality.md`.
- Its limits are published: [README "Honest limits"](../../README.md#honest-limits) and `docs/calibration.md`. Ultra's own confidence number is **not** reliable and the app says so.

## Where things are

```
README.md                main readme (what judges read first)
docs/devpost.md          the text we paste into the Devpost form
docs/token-factory-feedback.md   the written feedback the rules require
docs/video-script.md, docs/video-voiceover.md   the 3-minute video
docs/judge-panel.md, docs/roast-2.md    earlier mock-judge reports (what judges would criticise)
docs/calibration.md, docs/bug-hunt.md, docs/generality.md    measured evidence
docs/team/               this folder
```
