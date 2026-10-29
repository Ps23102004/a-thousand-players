# Submission runbook: the final stretch, in order

**Hard deadline: Friday 2026-10-30, 10:00 PT.** Convert to your own time zone now and write it down. Aim to be **fully submitted by 08:00 PT**: Devpost can be slow near the deadline, and after 10:00 nothing can change. Drafts can be saved on Devpost and edited until the deadline.

Legend: **P** Parth, **AM** Aman, **AS** Aashna. "Evidence" is what you paste into your work log so we know it is really done.

## Phase 1: today, as soon as possible

| # | Step | Owner | Evidence |
|---|---|---|---|
| 1 | Invite Aman and Aashna to the private GitHub repo (Settings, Collaborators). | P | Both can clone. |
| 2 | Aman and Aashna create free **Devpost accounts** (needed to be added to the team) and register for the hackathon ("Join Hackathon"). | AM, AS | Screenshot of the registered state. |
| 3 | Aman: eligibility check for all three (LEGAL L7), Representative named (L8). | AM | Written confirmations in `aman/work.md`. |
| 4 | Aman: re-read the live rules and updates pages, mark each row in REQUIREMENTS.md "re-checked <date>". Decide and recommend the **track**. | AM | Updated REQUIREMENTS.md on a branch. |
| 5 | **Deploy the app** (Vercel): import the repo, set `NEBIUS_API_KEY` and `TAVILY_API_KEY` as environment variables (never in the repo), Node 22. | P | The live URL. |
| 6 | **Smoke-test the hosted app** from a logged-out browser (see `aashna/README.md`, "Smoke test"). | AS | Checklist with pass/fail per page and per live route, plus screenshots. |
| 7 | Aman: write the Devpost text additions (Built With, track, AI disclosure, what existed before and what is new, testing instructions) in `docs/devpost.md`. | AM | PR merged. |
| 8 | Aman: restructure the feedback (REQUIREMENTS section C). | AM, AS | PR merged. |
| 9 | **Record the voice-over**, rebuild the Models scene (see `docs/video-voiceover.md`), export the final video under 3:00. Frame-by-frame check for logos and music (LEGAL L11). | P, AM checks | Final file, length, checked list. |
| 10 | **Upload the video to YouTube as Public today.** Do not wait. Test the link in a private window. | P | The YouTube URL. |

## Phase 2: submission night or morning

| # | Step | Owner | Evidence |
|---|---|---|---|
| 11 | Put the live URL and the YouTube URL into `README.md` (replace "link added at submission") and `docs/devpost.md`; commit to main. | P | Commit. |
| 12 | Final checks on the last commit: `npm test`, `npx tsc --noEmit -p .`, secret scan (Aashna runs the scan below), fresh-clone install and build. | AS | Outputs pasted. |
| 13 | **Make the repo public.** GitHub, Settings, Danger zone, Change visibility. Then open the repo page logged out: README renders, images show, **"MIT license" appears in the About box**. | P, AM verifies | Screenshot. |
| 14 | Create the Devpost submission: all fields, **track**, URLs, images, Built With (Nebius Token Factory, NVIDIA Nemotron, Next.js, Three.js, Rapier, Tavily, Vercel, TypeScript), feedback, "what was updated". Add **teammates** to the form. | AM prepares, P (Representative) submits | Draft saved. |
| 15 | Teammates **accept the Devpost invitation**. | AM, AS | Team page shows all three. |
| 16 | Re-open the hosted URL and run the smoke test once more. Check the model credit balance. | AS, P | Pass list; balance noted. |
| 17 | **Submit** on Devpost, ideally by 08:00 PT. Open the public submission page and check every link works. | P | Screenshot of the submitted state. |

## Phase 3: freeze (from the moment you submit)

The organizers say: **do not edit the code repo, the video or any project materials after the deadline**, even minor changes. So:

1. Tag the final commit: `git tag submission-2026-10-30 && git push origin submission-2026-10-30`.
2. Turn off automatic deploys from `main` in Vercel (or deploy only from the tag) so nothing changes the live app.
3. Do **not** push to the public repo, edit the README, replace the video, or delete anything until the judging period ends (Dec 15) unless the organizers ask. Work on a private fork if you want to keep building.
4. **Keep the hosted app up and free to use until Dec 15.** Check it weekly. Keep enough Token Factory and Tavily credit (the daily caps in `lib/ai-route.ts` are there to protect it). Decide who watches it.

## Quick checks you can run

```bash
# secret scan of the whole history: prints nothing if clean (values are never printed)
git log --all -p | grep -E "(sk-[A-Za-z0-9_-]{16,}|tvly-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{12,})" | cut -c1-6 | sort | uniq -c
# expected harmless matches: minified Rapier code and the fake test key "tvly-test-not-real"

npm test && npx tsc --noEmit -p .      # all offline
node scripts/check-recorded-replays.mjs  # must say: legacy identical to recorded 45 of 45
```
