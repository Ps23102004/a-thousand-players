# Aman: researcher and validator

**Your job in one sentence:** make sure everything we claim is true, everything the hackathon requires is met, and all the legal and paperwork pieces are handled, before Friday 10:00 PT.

You are the person who says "this sentence in our README is not backed by anything" or "the rules say X and we do Y". You do not need to write code (you can, if you want).

**Read first (30 minutes):** [../README.md](../README.md), then [../REQUIREMENTS.md](../REQUIREMENTS.md) and [../LEGAL-AND-LICENSES.md](../LEGAL-AND-LICENSES.md) (those two are your main working documents), then the repo's main [README](../../../README.md).

**Your work log:** [work.md](work.md). Newest entry at the top. Put every finding, answer, decision and open question there, with the source (a link, a rules clause, a file path).

## What you own

1. **Requirements match.** Open the live official pages (links at the top of REQUIREMENTS.md). For every row in REQUIREMENTS.md sections A and B, confirm it still says the same thing, and mark it "re-checked <date, time>". If the page says something new, add a row. **Do this again on submission morning.**
2. **Fact validation.** Every number and claim in `README.md`, `docs/devpost.md`, `docs/token-factory-feedback.md` and `docs/video-voiceover.md` must be supported. Method:
   - Find the sentence, find its source (a file under `data/run-main/`, a test, a doc under `docs/`), open the source and compare.
   - If you can confirm it: nothing to do. If not: write it in your log as "unverified: <sentence> in <file:line>, because <reason>" and tell Aashna (she can check by running code).
   - Start with the numbers that judges will quote: 1000 players, 2,831 rounds, 220,334 tokens, 31 of 31 claims, 6% casual win rate, 97% quit rate, 92% cheeser win rate, test counts. They are in `data/run-main/summary.json` and the README "Results" section. `docs/calibration.md` explains how far each number can be trusted.
3. **Guidelines match.** Compare the project against the organizers' tips (REQUIREMENTS section E): is the first 30 seconds of the video the aha moment, are Nebius Token Factory and NVIDIA named clearly in the video and the text, is the problem and audience clear? Write what you would change.
4. **Track decision.** REQUIREMENTS section D. Read the official track texts, recommend one with reasons.
5. **Feedback form.** REQUIREMENTS section C. Restructure `docs/token-factory-feedback.md` to the organizers' five points per tool. Ask Aashna for technical details; use the measured numbers already in the file; say plainly that Nebius AI Cloud was not used.
6. **Legal and paperwork.** [LEGAL-AND-LICENSES.md](../LEGAL-AND-LICENSES.md): the open questions L1 to L13 and the paperwork list. The most important: **L1 (who owns the Market Brawl course project)**, **L7 (eligibility of each of us)**, **L8 (Representative and prize split)**, **L6 (Nebius and Tavily terms)**.
7. **Devpost submission text.** Prepare, in `docs/devpost.md`: Built With list, track, AI assistance disclosure, "what existed before / what is new", testing instructions, "stays up until Dec 15". Parth (the Representative) pastes and submits.
8. **Research, if there is time.** A real problem needs a real audience. Find 1 to 3 real game developers or QA people (friends, a game-dev Discord, the Nebius Discord) and get a sentence of reaction to the demo. Record who said what and when. Also look at similar tools (modl.ai, nunu.ai) and check our "who it is for" paragraph is fair to them.

## How to work

- Make a branch: `git checkout -b aman/<topic>` (for example `aman/legal-notices`). Edit only docs. Commit with a clear message, push, open a pull request into `main`. Parth merges.
- If you find something wrong in the code or data, do not fix it yourself: log it in [../SUGGESTIONS.md](../SUGGESTIONS.md) or tell Aashna.
- If you are unsure whether a claim is true, **say it is unverified**. Never guess.
- Do not paste keys, passwords or personal emails anywhere in the repo.

## Your checklist (copy of the key tasks; tick them in work.md)

- [ ] Registered on Devpost, joined the hackathon; accepted the repo and team invitations
- [ ] Eligibility confirmed for myself, Aashna, Parth (LEGAL L7)
- [ ] Re-checked every requirement row against the live pages (date and time recorded)
- [ ] Track recommended with reasons
- [ ] Read Nebius and Tavily terms; clause numbers noted (L6)
- [ ] Course ownership question answered (L1)
- [ ] `THIRD-PARTY-NOTICES.md` written
- [ ] Feedback restructured (REQUIREMENTS C)
- [ ] Devpost text additions written
- [ ] Facts in README / Devpost / voice-over validated; list of unverified items sent to Parth
- [ ] Video checked frame by frame for logos and music (L11)
- [ ] After the repo is public: license shows in the About box; README renders; no secrets
- [ ] Team members added to the Devpost form and accepted
- [ ] Rules and updates pages saved (PDF or dated copy) on submission day
