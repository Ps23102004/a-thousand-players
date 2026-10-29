# Credits and the Nebius Builder Program: claim kit

**Parth must do the clicks.** Joining the program, signing in, verifying an email and accepting each partner's terms need a person with the account. Everything below is ready to paste so it takes about 15 minutes. Aman and Aashna can join with their own accounts for their own credits; nothing is shared and **no key or login goes in the repo or in chat**.

Sources (official, checked 2026-10-29): https://dev.nebius.com/builders and the hackathon FAQ.

## What is on offer

| Credit | Value | Do we need it? | Why |
|---|---|---|---|
| **Nebius Token Factory** | $25 (Builder Program) plus the hackathon promo code below | **Yes, first** | Every live feature calls Nemotron through Token Factory. The rules say judges must be able to use the app free until **Dec 15**, so the balance has to last. |
| **Tavily** | $25 | **Yes, second** | The $3,000 Best Use of Tavily prize needs a **runtime** Tavily call in the hosted app. Repro "Find precedent" and the Design Advisor make those calls. |
| LangSmith | $100 | Optional | Tracing and evaluating LLM calls. **We do not use it today.** Do not add it before the deadline. |
| Toloka | $100 | Optional | Evaluation with human experts. **We do not use it today.** |
| Nebius certification | $1 | Optional | A digital badge; not part of the entry. |
| Free agentic AI course | free | Optional | |
| European compute grants and founder funding | n/a | **No** | Expanded benefits are for European builders. Skip unless you qualify. |

The FAQ states the official promo credits (the code below and the Builder Program) are **Token Factory credits only**: there is no separate AI Cloud grant, and a missing credit is handled on the Nebius Discord.

## Steps, in order

1. **Hackathon promo code (Token Factory credit):** go to https://nebius.com/promo-code and use the code from the hackathon FAQ, `NEBIUS-DEVPOST-GLOBAL26`. The form asks for a job title and a company: our notes say it was submitted earlier as Student / Independent and "the code arrives by email". **Check your inbox and spam first**; only submit again if nothing arrived.
2. **Builder Program:** https://dev.nebius.com/builders, press Join, sign in, **verify your email**, then **claim credits** for the tools you want (at least Token Factory and Tavily). Our notes say the form was filled earlier and only the **Register click** is missing.
3. **Check the balance** in the Token Factory console and the Tavily dashboard. Write the balance and the date in your work log. If the balance is low for a month of judging, ask in the Nebius Discord (link on the FAQ page).
4. **Teammates:** Aman and Aashna do steps 1 and 2 with their own accounts if they want credits for their own testing. Only Parth's keys go into the hosted app.

## Copy-paste text (the program asked for a product; we have one)

Use these as written. They match the README and contain no claim we cannot back.

**One line**
> A crowd of Nemotron-written synthetic players plays your game by the thousand, finds where it breaks, and proves every finding with a replayable seed.

**Short (about 50 words)**
> A Thousand Players tests browser games with a crowd of AI players. Nemotron Nano writes 1,000 player personas, a deterministic engine plays 2,800 rounds, Nemotron Ultra reads the results and proposes fixes, and code replays the exact seed to check each claim. Built on Nebius Token Factory with NVIDIA Nemotron.

**Longer (about 150 words)**
> Small game teams have no QA department. A Thousand Players gives them a crowd of synthetic players: Nemotron Nano writes 1,000 personas, a headless deterministic engine plays them against the game, and invariant checks find real bugs such as a fighter launched out of the arena. Nemotron Ultra reads a summary of every round and writes findings; code recomputes each number from the raw runs. A player's bug report written in plain English becomes a check (Nemotron Super) that finds the matching rounds, and each finding links to an exact-seed replay in the real game. Live triage asks Ultra for a patch and replays the seed in a sandbox to verify it. Super-VL describes frames, and Tavily finds related design writeups. Everything runs on Nebius Token Factory with NVIDIA Nemotron models. The test bed is Market Brawl, a fighting game Parth wrote for a university course; the same crowd harness also ran on two other games. Open source (MIT).

**How we would use each credit (honest)**
- *Token Factory:* the hosted demo's live calls (Super for Repro and Balance, Super-VL for Eyes and the Advisor, Ultra for live triage) through the judging period.
- *Tavily:* the runtime searches behind "Find precedent" and the Design Advisor.
- *LangSmith / Toloka:* after the hackathon, to trace our model calls and to have human experts check triage and advisor outputs. **Not used yet.**

**Links to give:** repo `https://github.com/Ps23102004/a-thousand-players` (private until the flip; use the live demo URL once deployed), demo video (after upload).

## After claiming

- [ ] Token Factory balance noted (amount, date)
- [ ] Tavily balance noted
- [ ] Hosted app env vars set from the new keys (in the Vercel dashboard only, never in the repo)
- [ ] A smoke test of the live routes spent a few cents and worked (Aashna)
- [ ] If any credit did not arrive: asked on the Nebius Discord, noted who and when
