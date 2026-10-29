# Legal, licenses and paperwork

**This is a fact sheet, not legal advice.** It records what we know from the repo and the official rules (verified 2026-10-29) and lists what is still open. **Owner: Aman.** Where a row says "open", Aman finds the answer, writes it into `docs/team/aman/work.md`, and tells Parth.

## 1. What we publish and under which license

| Item | License / owner | Evidence | State |
|---|---|---|---|
| This repository's own code | **MIT**, "Copyright (c) 2026 Parth Singh" | `LICENSE` (21 lines) | OK. **Open:** once Aman and Aashna contribute, decide whether the line should read "Parth Singh and contributors". Everyone must agree. |
| Three.js (in `game/vendor/three`) | MIT | `game/vendor/three/LICENSE` | OK, notice kept |
| Rapier physics (in `game/vendor/rapier`) | Apache-2.0 | `game/vendor/rapier/LICENSE` | OK, notice kept |
| Homeground physics (in `adapters/homeground/vendor`) | MIT, from the upstream project | `adapters/homeground/vendor/LICENSE`, `UPSTREAM_COMMIT` | OK. Parth's own project per `docs/generality.md`; confirm. |
| Clean Getaway (adapter reads it **by path**, nothing copied) | **No LICENSE file** in that project | `docs/generality.md` | **Open.** Per our notes both extra games are Parth's own: if so, Parth can simply add a license to that project, or the `/games` page can describe it without publishing its code. Confirm the owner. |
| Market Brawl game (`game/`) | Parth's own **CSCI 310 coursework** | `game/README.md` | **Open, important: see section 3.** |
| `game/assets/art/midnight-circuit.png` | **AI-generated** concept art (used in the game's help panel) | `game/README.md` "Assets and assistance" | **Open:** which tool made it, and do its terms allow public, commercial-neutral use of the output? Record the tool and date. If unsure, remove the image (the game still works). |
| Old 3D models and textures (162 files, 27 MB) | **Unknown license** (names like `GN_Bully01.gltf` suggest material taken from another game) | `game/README.md` says "licensing was not established" | **Removed from the tree and from all git history on 2026-10-28.** Never loaded by the game. **Do not put them back.** Two backup bundles in `~/Developer/` (`sparring-backup-*.bundle`) still contain them: never share or upload those; delete after the repo is public. |
| Fonts: Chakra Petch, IBM Plex Mono and Sans | SIL Open Font License (Google Fonts) | `app/layout.tsx` uses `next/font/google` | Normally fine. **Open (quick):** confirm each font's license on fonts.google.com. |
| Project images in `docs/media` | Our own screenshots of our own app | | OK |
| npm dependencies | Direct: MIT (next, react, react-dom, three, undici, tsx, types) and Apache-2.0 (rapier, typescript). Transitive installed: 27 MIT, 8 Apache-2.0, 2 ISC, 1 BSD-3, 1 0BSD, **1 CC-BY-4.0 (`caniuse-lite`, browser data)**, **LGPL-3.0-or-later (`@img/sharp-libvips-darwin-arm64`, `@img/sharp-wasm32`)** | Checked by script on 2026-10-29 | We do **not** ship `node_modules`; users install them. The LGPL packages come with Next's image optimizer (`sharp`) as platform binaries. **Open:** Aman confirms this is acceptable and adds a short `THIRD-PARTY-NOTICES.md` listing direct dependencies and licenses. |

## 2. What the rules require us to be able to say

From the Official Rules (§4, §7):

- The submission must be **original work, solely owned by the entrant**, not violating anyone's IP, privacy or publicity rights. Open source may be used if its licenses are followed and we build something that enhances it. **Third-party technical assistance is allowed** if the result is the entrant's own work.
- **Third-party SDKs, APIs and data must be used in line with their terms.** We use: Nebius Token Factory, Tavily, Next.js, React, Three.js, Rapier, Google Fonts.
- **No third-party trademarks or copyrighted music or material in the video** without permission.
- The sponsor may use the **name, likeness, voice and image** of everyone who contributed, for three years, in promotion.
- Content must contain **no malicious code**. (Our live triage runs model-written patches in a sandbox with no network and no secrets; that is a safety feature, not a risk to disclose, but say it plainly if asked.)

## 3. The open questions (Aman works through these today)

| # | Question | Why it matters | How to find out | Done? |
|---|---|---|---|---|
| L1 | **Who owns Market Brawl, and may it be published under MIT?** It is a CSCI 310 course project. | Rules require sole ownership and no third-party rights. Universities sometimes claim rights in coursework or forbid publishing it. | Read the course syllabus and the university's student IP and academic-integrity policies. If unclear, ask the instructor in writing (a short email) and keep the reply. | ☐ |
| L2 | **Is it honest and allowed to enter a project that includes coursework?** | The rules ask for an explanation of what existed before and what is new. | Write that explanation (L5). | ☐ |
| L3 | The game README ends with a note addressed to the student ("Review the code and adapt the developer notebook to describe your own learning and observations honestly"). | It reads like a leftover template instruction and looks odd in a public repo. | Decide with Parth: delete the sentence, or keep the AI-assistance disclosure and remove only the instruction. Make the change on a branch. | ☐ |
| L4 | **Disclose AI assistance.** Much of the code was written with AI assistants. | The rules allow it; judges and the organizers encourage AI tools; honesty is our policy. | One sentence in the README and the Devpost text: what AI tools were used for. | ☐ |
| L5 | **"What existed before / what is new" paragraph** for the Devpost form. | Required if any part of the project predates Aug 26. | Draft: the game (Market Brawl) is a course project from before the hackathon and is the test subject; everything else (engine, crowd runner, Nemotron layer, web app, adapters, tests) was built from Oct 28 2026 on (first commit 2026-10-28). Check dates with `git log --reverse`. Put it in `docs/devpost.md`. | ☐ |
| L6 | **Nebius and Tavily terms of service** | Rules: use third-party APIs "in accordance with their terms". Look for limits on public demos, caching or showing outputs, and key sharing. | Read the Token Factory terms and the Tavily terms. Note the clause numbers that matter. | ☐ |
| L7 | **Eligibility of each of the three of us** (age of majority; not resident in Brazil, Quebec or a sanctioned country; not related to a judge or an organizer employee) | Rules §3. An ineligible team member can void the entry. | Each person confirms in writing in their `work.md`. Cross-check the judge list on the hackathon page. | ☐ |
| L8 | **Representative and prize split** | One Representative enters and receives any prize; the rules leave the split to the team. | Agree in writing (a short message thread saved into `docs/team/aman/work.md` is enough) who the Representative is and how a prize would be shared. | ☐ |
| L9 | **Winner paperwork** | Winners must pass identity and role verification, sign an affidavit, and file tax forms (US: W-9; others: W-8BEN) within 10 business days. | Know it now; nothing to do before submission. | ☐ |
| L10 | **Privacy notice for the live app** | Text a judge types into Repro, Balance, Advisor is sent to Nebius Token Factory and Tavily. | Aashna confirms nothing is stored (only in-memory rate-limit counters; failures are logged without personal data). Then add one line on the pages: "Text you enter is sent to Nebius Token Factory (and Tavily for search). We do not store it." | ☐ |
| L11 | **Trademarks in the video and README** | Rules forbid third-party trademarks in the video. | Watch the final cut frame by frame for logos (NVIDIA, Nebius, Tavily, Vercel, YouTube, GitHub). Names as plain text are normal descriptive use; logos are not. Confirm no music. | ☐ |
| L12 | **GitHub repo hygiene at flip time** | Secrets, private info. | Already scanned: whole history, 0 matches for our real keys. Re-run the scan on the final commit (Aashna). Check no personal emails or paths beyond what is intended. | ☐ |
| L13 | **After the deadline: freeze** | "Do not edit your code repo, video, or any project materials after the deadline." | Follow the freeze steps in SUBMISSION-RUNBOOK.md. | ☐ |

## 4. Paperwork list (what Aman prepares)

1. `THIRD-PARTY-NOTICES.md` (new file in the repo root): direct dependencies, vendored code, fonts, with license names and links.
2. The Devpost text additions: Built With list, track, AI assistance disclosure, "what existed before / what is new", how to test (no login needed), a note that the app stays up until Dec 15.
3. A one-page **eligibility and consent record** (in Aman's `work.md`): for each person, eligibility confirmed, §7 and §10 publicity consent read and accepted, Representative named, prize split agreed.
4. A saved copy (PDF or dated markdown) of the rules and updates pages as of submission day, in case the pages change later.
5. The written answer to L1 (course ownership), saved in `docs/team/aman/` (no personal emails; summarize and keep the original outside the repo).
