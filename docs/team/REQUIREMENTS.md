# Requirements, guidelines and where we stand

**Verified against the live official pages on 2026-10-29.** Sources, all fetched that day:

- Official Rules: https://nebiusglobalaihackathon.devpost.com/rules
- Hackathon page: https://nebiusglobalaihackathon.devpost.com/
- Updates: https://nebiusglobalaihackathon.devpost.com/updates (submission checklist, "How to build a winning project", "Here's how judging works", prizes, kickoff tips)
- FAQs: https://nebiusglobalaihackathon.devpost.com/details/faqs
- Builder Program: https://dev.nebius.com/builders

Rules can change. **Aman: re-open these pages again on submission morning and mark each row "re-checked <date, time>".** Questions to the organizers go to the Nebius Discord (link on the FAQ page) or the Devpost discussion forum.

**Dates (official).** Submissions: Aug 26 2026, 9:00 PT to **Fri Oct 30 2026, 10:00 PT**. Judging: Dec 1 to Dec 15 2026. Winners: on or around Mon Jan 11 2027.

---

## A. The official submission checklist (posted by the organizers) and our answer

| # | Official question | Our answer | Status |
|---|---|---|---|
| 1 | Runs on Nebius Token Factory or AI Cloud **and** uses at least one NVIDIA open-source model? | Every model call goes to the Token Factory API with Nemotron Nano, Super, Ultra and Super-VL. FAQ: a different provider (HuggingFace, OpenRouter) does **not** count, and the web app itself may be hosted anywhere. | **Met in code.** Becomes visible to judges once hosted. |
| 2 | Fits clearly into one of the four tracks? | Best Apps and Agents, final (Parth, 2026-10-29; section D). | **Done** |
| 3 | Demo video under 3 minutes, public on YouTube, shows the app working and **explains Nebius + NVIDIA usage**? | Rough cut 2:58.4 (178.4 s), silent; Models scene rebuilt. Narration says Nebius Token Factory and Nemotron aloud. Still needs the voice-over and upload. | **Open** |
| 4 | Public repo, visible open-source license, README with setup and run instructions? | MIT `LICENSE`, README with quick start. Repo is private now. | **Open until flipped public** |
| 5 | Working demo URL? | Not deployed yet. | **Open** |
| 6 | Feedback on the Nebius tools and NVIDIA tech used, specific? | Drafted (`docs/token-factory-feedback.md`) but not in the structure the organizers asked for (section C). | **Open (Aman)** |
| 7 | All teammates added to the submission form, and they accepted the invitation? | Not done. | **Open (Parth + Aman + Aashna)** |

Also from the organizers: **upload the video early**; large files take long. **After the deadline the submission is locked: do not edit the code repo, the video or any project material, "even minor changes could affect your eligibility."**

---

## B. Official Rules, clause by clause

| Rules clause | What it says (short) | How we match | Status / gap | Owner |
|---|---|---|---|---|
| §3 Eligibility | Age of majority where you live. **Not open to residents of Brazil, Quebec, Russia, Crimea, Cuba, Iran, North Korea** or other OFAC-sanctioned places. Not open to employees or family of Nebius, Devpost and other promotion entities, **any Judge, or a company that employs a Judge**. Everyone on the team must be eligible. | Unknown for each person. | **Open: check each of the three of us.** Judges are listed on the hackathon page (NVIDIA, Nebius and Tavily staff): confirm no one is related to or employed alongside them in a way that matters. | Aman |
| §3, §4 Team | Teams of any size (FAQ: no maximum). A team **appoints one Representative** who enters the submission and is authorized to act for the team; prizes go to the Representative, who divides them. | Not decided. | **Open: name the Representative (suggested: Parth, who owns the repo and accounts) and agree in writing how a prize would be split.** | Parth + Aman |
| §4 What to create | A **working software application** that runs on Token Factory or AI Cloud, uses at least one NVIDIA open model, and fits one of the four tracks. Must be capable of being installed and running consistently and **function as depicted in the video and text**. | Fresh clone installs, passes all tests, builds and serves. | Met. Keep video and text strictly to what works. | Aashna verifies |
| §4 New and existing | A project that existed before Aug 26 must have been **significantly updated** after, and the entry must **explain what was updated**. | The platform is new (first commit 2026-10-28). The test-bed game, Market Brawl, is Parth's own earlier course project. | **Drafted** in `docs/devpost.md` (section "What came from the course project and what we built for this hackathon"), decided 2026-10-29. Parth and Aman confirm the wording before submission. | Aman + Parth confirm |
| §4 Third-party integrations | Any third-party SDK, API or data must be used **in accordance with its terms and licenses**. | Nebius Token Factory, Tavily, Three.js, Rapier, Next.js. | **Open: Aman reads the Nebius and Tavily terms** for anything that restricts what we do (public demo, rate, caching of outputs, showing outputs publicly). | Aman |
| §4 Submission requirements | Demo URL; text description; **public code repo URL** on GitHub, GitLab or Bitbucket that "must contain all necessary source code, assets, and instructions"; license "detectable and visible at the top of the repository page (About section)"; README with setup and run guidance that **highlights how you used NVIDIA Nemotron, where Token Factory accelerated your workflow, and any other Nebius tools or services used**. | README now has the section "Built on Nebius Token Factory and NVIDIA Nemotron" (added 2026-10-29). | **After flipping the repo public, open the repo page and confirm "MIT license" shows in the About box.** | Aman |
| §4 Video | Under 3 minutes (judges need not watch longer); **footage of the project functioning**; public on YouTube, link on the form; **no third-party trademarks, copyrighted music or other material without permission.** | Silent screen capture of our own app. No music. The on-screen captions mention model and company names as plain text. | **Check:** no logos of NVIDIA, Nebius, Tavily, Vercel, YouTube in the footage; no stock music; any text names kept as plain words. Confirm the third-party game names (Homeground, Clean Getaway) are fine to show. | Aman |
| §4 Track | Identify the track. | Best Apps and Agents, final (Parth, 2026-10-29). | **Done.** See D. | Parth |
| §4 Feedback | Provide feedback on Token Factory, AI Cloud and any NVIDIA tools, models or technologies used. | Drafted. | See C. | Aman |
| §4 Ownership | Original work, **solely owned by the Entrant**, not violating anyone's IP, privacy or publicity rights. Open source may be used if its licenses are complied with and you build something that enhances it. Third-party **technical assistance is allowed** if the result is the entrant's own. | Market Brawl is Parth's own CSCI 310 coursework. Much of the build used AI coding assistants (Claude). | **Open: Aman checks (1) the course and university policy on publishing coursework and who owns it, (2) that the entry says honestly that AI assistants were used.** | Aman |
| §4 Testing | Judges must be able to use the project **free of charge and without restriction until the Judging Period ends (Dec 15)**. If the site is private, include credentials. Judges are not required to test and may judge from text, images and video only. | Public app, no login. Our live routes have daily caps and rate limits (to protect credits). Cached sample answers cover the demo inputs when a limit is hit. | **Risk: the hosted app must stay up and keep working through Dec 15, with enough model credits.** Decided 2026-10-29: Parth watches the app until 2026-12-15. Keep checking credit balances. Do not remove the caps. | Parth + Aashna |
| §4 Financial support | The project must not have been developed with **financial or preferential support from the Sponsor** (funding, contract, commercial license). | We used only the public Builder Program and promo credits that the rules themselves advertise. | Probably fine; Aman confirms with the Discord if in doubt. | Aman |
| §5 Modifications | Drafts can be saved. After the deadline **no changes** to the submission. | | Freeze plan in SUBMISSION-RUNBOOK.md. | Parth |
| §6 Judging | Stage 1 pass/fail: reasonably fits the track theme and reasonably applies the required APIs, a genuine attempt, "not a superficial rebrand." Stage 2: four **equally weighted** criteria, scored **1 to 5**. Ties broken by the first criterion in the list. | See section E. | | |
| §7 IP and publicity | We keep ownership. The sponsor gets a non-exclusive license to use the entry for judging. **The sponsor and Devpost may use the name, likeness, voice and image of everyone who contributed, for 3 years.** Content must have no virus or harmful code. | Parth's voice is in the video. | **Each of you agrees to this by being on the team. Aman: make sure Aashna and Parth read §7 and §10 before you are added.** | Aman |
| §8 Prizes | See section F. One Overall **or** one Track award, plus one Bonus. Winners are **verified** (identity, role in the creation) and complete an **affidavit and tax forms** (US residents W-9, others W-8BEN) within 10 business days; winners pay their own taxes and fees. | | Know this in advance: **each team member must be able to prove their role.** | Aman |
| §9, §10 | Entry is acceptance of the rules as a contract; release of the organizers; consent to publicity and use of personal information. | | Read it. Each person is bound. | Everyone |

---

## C. Feedback: what the organizers asked for, and what we have

The official post "How to build a winning project" says feedback is **required**, goes straight to the Nebius and NVIDIA teams, and must be **specific**. For **Token Factory, AI Cloud and each NVIDIA model used**, cover:

1. What you used it for.
2. What worked well.
3. What needs work.
4. How onboarding felt, "zero to hello world".
5. Whether you would build with it again, and why.

"The docs were confusing" is useless without naming the tool. **Scoring:** feedback is judged on "completeness, viability, and potential impact" and competes for Most Valuable Feedback ($100 + NVIDIA swag, 10 winners).

Our `docs/token-factory-feedback.md` has what worked, problems and measured numbers for Token Factory and the four models, but it **lacks**: an onboarding "zero to hello world" account, "would you build again and why", a separate NVIDIA-models section (Nano, Super, Ultra, Super-VL one by one), and an explicit line that **AI Cloud was not used**. **Aman: restructure it to the five points above per tool, using facts from our own notes; Aashna supplies the technical details.**

---

## D. Track choice (decide today)

Stage 1 is a pass/fail check that we "reasonably fit" the track. Official track texts:

| Track | Official text (short) | Our fit |
|---|---|---|
| Coding and Agentic Engineering | "agents that write, run, and test code in Token Factory"; the organizers' tip: "an agent that plans, writes, tests, and iterates on a real repo with minimal human input is where it gets interesting." | Our triage agent reads code, proposes patches, applies them and **tests them by replaying the exact seed**, and retries with feedback. **But** its success rate is low (2 of 15 measured) and it is one feature, not the whole product. |
| Best Apps and Agents | "any app or agent someone would actually use"; "Reach for Nemotron 3 Ultra when you need serious reasoning, and let Nano or Super handle the fast, everyday calls"; the tip: "a multi-step autonomous workflow that chains tools end to end stands out." | **Strong fit.** A web app for game teams; Nano and Super for fast calls, Ultra for the heavy read; a multi-step workflow from crowd to findings to replays. This is exactly the model split they describe. |
| Personal AI | Always-on private assistant with persistent memory. | No. |
| Physical AI | Robots, IoT, hardware. | No. |

**Decided (Parth, 2026-10-29), final: Best Apps and Agents.** It fits the whole product and the model tiering. Coding and Agentic is defensible through the triage loop but invites a harder look at the weak fix rate.

---

## E. Judging criteria (equal weight, 1 to 5) and the tips from the organizers

| Criterion (official wording) | Our evidence |
|---|---|
| **Technological Implementation**: how well it is built; how effectively it uses Nebius Token Factory or AI Cloud and NVIDIA Nemotron | Four Nemotron models with different jobs; deterministic engine; code verifies model claims; 134 + 251 + 80 tests; CI green. |
| **Design**: a complete, coherent product, not a proof of concept | Web app with recorded and live modes, replays in the real game, clear labels of live versus recorded. |
| **Potential Impact**: a credible, specific case for a real problem and audience, and it actually addresses it as demonstrated | Small game teams without QA; works on three games (`docs/generality.md`). Honest limits. |
| **Quality of the Idea**: creative, non-obvious use of the models; understanding of the problem space | A crowd of AI players with proof by exact replay; models propose, code checks. |

**Tips from the organizers, and where we stand**

- Solve a real problem for a real audience; talk to potential users. *We have not talked to real game developers. Aman: if there is time today, get one or two quotes (a game dev friend, a Discord server).*
- Aha in the first 30 seconds of the demo (judges said about 2 minutes into the project). *The video opens on the crowd grid.*
- **Name the required tools clearly: in the project description, in the Built With section, and with audio in the video, "not just a passing mention".** *Done in README; narration updated; Devpost Built With still to fill.*
- Video is a pitch, not a tutorial: problem, solution working, who it is for, how it uses Nebius and NVIDIA, what the app does.
- **Never put API keys in code. Check the repo before you submit.** *Done: whole history scanned, 0 hits.*
- Name the project like a human. *"A Thousand Players".*
- Push the track past the basics (multi-step autonomous workflows).

---

## F. Prizes and how many we can win

Each project: **one Overall award OR one Track award, plus one Bonus.**

| Prize | Condition | Our position |
|---|---|---|
| Grand $20,000 / 2nd $10,000 / 3rd $6,000 | Top overall scores | In play |
| Track winner: NVIDIA Jetson Orin Nano (one per track) | Submitted in that track and top-scored there | In play (see D) |
| **Best Use of Tavily, $3,000** | "a **functional, runtime call to the Tavily API** as part of its solution" | Code ready (Repro "Find precedent", Design Advisor). **Must run in the hosted app.** |
| **Most Valuable Feedback, $100 + swag, 10 winners** | Complete the feedback section | See C |
| City Winner $500 (20) | **Attended** one of the listed Builders & Brews city events **in person** (FAQ: yes, required) | Only if a team member attended: ask. |

**Builder Program** (https://dev.nebius.com/builders): free membership with $25 Token Factory credit, $25 Tavily credit, $100 LangSmith, $100 Toloka and a $1 certification. FAQ: the official promo credits (code in our vault notes) are **Token Factory credits only**; no AI Cloud grant. Parth must click Register; Aman and Aashna can join the program for their own credits too.

---

## G. Our own honesty rules (do not break them)

1. Every number in the README, Devpost text or video comes from `data/run-main/`, a test, or a command anyone can run. Cite the file.
2. A model's stated confidence is **never** a result. Ultra said 85 to 95% every time and 2 of 15 patches fixed the round (`docs/calibration.md`).
3. "Verified" means a code check or an exact-seed replay; say which.
4. State what is not done: Super-VL is a description aid; the Design Advisor is not trained on viral data and is unmeasured; Bully remake and GTA V could not be tested.
5. No secrets in the repo. 6. No third-party assets without a license. 7. Do not headline "1M context" (the hosted model accepted about 300K tokens in our tests).

---

## H. Status board (update when something changes)

| Area | State |
|---|---|
| Code, tests, CI | Done. Engine 134, TypeScript 251, browser 80, CI green on GitHub. |
| README and docs | Done; now has the Nebius/NVIDIA usage section. |
| Eligibility check of each team member | **Open (Aman)** |
| Representative named, prize split agreed | **Open (Parth + Aman)** |
| Track chosen | **Done: Best Apps and Agents, final (Parth, 2026-10-29)** |
| Feedback in the organizers' structure | **Open (Aman + Aashna)** |
| "What existed before / what is new" text | **Drafted in `docs/devpost.md` (2026-10-29); Parth and Aman confirm** |
| Terms of Nebius, Tavily, game assets and coursework ownership reviewed | **Open (Aman)** see LEGAL-AND-LICENSES.md |
| Hosted URL, kept alive to Dec 15 | **Open. Parth watches the app until 2026-12-15 (decided 2026-10-29); checks by Aashna** |
| Video: cut is 2:58.4 (178.4 s), Models scene rebuilt; still needs voice-over, upload | **Open (Parth)** |
| Repo made public, license visible in About | **Open (Parth)**, verify (Aman) |
| Teammates added to the Devpost form and accepted | **Open (all)** |
| Builder Program Register click | **Open (Parth)** |
