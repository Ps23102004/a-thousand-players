# Feedback: Nebius Token Factory and NVIDIA Nemotron

Written by the A Thousand Players team (Parth, Aman, Aashna) after building on Token Factory for the Nebius x NVIDIA hackathon. The organizers asked for five points per tool: what we used it for, what worked, what needs work, onboarding ("zero to hello world"), and whether we would build with it again. Each tool below has its own section with those five points.

**Nebius AI Cloud was not used.** We used no other Nebius product (no Serverless Jobs, Endpoints or DevPods). Every model call goes to the Token Factory API. The web app is hosted outside Nebius, on Vercel.

Tools covered: (a) Nebius Token Factory, (b) Nemotron Nano, (c) Nemotron Super, (d) Nemotron Super-VL, (e) Nemotron Ultra. A short Tavily note is at the end (Tavily is not a Nebius or NVIDIA tool, but the app calls it at runtime).

**Where the numbers come from.** Each number names its source file. Latency and throughput were measured on 2026-10-28 from one machine and vary with load ([`ai/README.md`](../ai/README.md)). Token counts for the main run are in [`data/run-main/usage.json`](../data/run-main/usage.json). Calibration numbers are in [`docs/calibration.md`](calibration.md). Items marked `[PARTH: ...]` are for Parth to fill or confirm, because the repo cannot show them.

Model ids as sent to Token Factory (`ai/models.ts`): `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`, `nvidia/nemotron-3-super-120b-a12b`, `nvidia/Nemotron-3.5-Super-VL`, `nvidia/Nemotron-3-Ultra-550b-a55b`.

---

## (a) Nebius Token Factory (the API platform)

### 1. What we used it for

Every model call in the project: persona generation, the crowd report, bug triage, exploit search, Repro, Balance, Eyes and the Design Advisor. One small `fetch` client (`ai/models.ts`) calls the OpenAI-compatible chat completions endpoint `https://api.tokenfactory.nebius.com/v1/chat/completions` for all four models. In the hosted app Token Factory is meant to serve Repro and Balance (Super), Eyes and the Advisor (Super-VL, Super) and live Triage (Ultra). [PARTH/LEAD: confirm live routes hosted]

### 2. What worked

- **The OpenAI-compatible endpoint worked with plain `fetch`.** The same client covers Nano, Super, Ultra and Super-VL. Images go to Super-VL as `image_url` data URLs, with no special API (`ai/models.ts`).
- **One switch turns thinking off on all four models.** `chat_template_kwargs: {"enable_thinking": false}` worked on Nano, Super, Ultra and Super-VL. A one-line JSON answer took 11 completion tokens and under 0.8 s on Super, Ultra and Super-VL (`ai/README.md`).
- **Concurrency.** 16 Nano requests in flight produced 1000 personas in 289 s (`ai/README.md`).
- **429 handling is workable.** When a 429 body says how long to wait, our client waits that long and retries (`ai/models.ts`, `retryDelayMs`).
- **A single 224.4K-token prompt returned.** On the planted 1000-player fixture, one Ultra call with 224.4K prompt tokens answered in 16.7 s (`ai/README.md`). The main-run call carried 220,334 prompt tokens (`README.md`, `data/run-main/findings.json`).

### 3. What needs work

1. **Thinking controls differ between models.**
   - On Nano, `reasoning_budget`, `reasoning_effort` and `/no_think` did not work. Only `chat_template_kwargs` did.
   - Super with thinking on returns its reasoning in a separate `reasoning_content` field, but the reasoning still uses completion tokens. At a small `max_tokens` the answer can come back empty.
   - Ultra with thinking on writes its reasoning straight into `content`, with no separate field. At `max_tokens` 60 the reply was all reasoning and no answer.

   **Ask:** document one thinking switch that works on every Nemotron model, and always put reasoning in `reasoning_content`. At minimum, publish a table of which control works on which model. Source: `ai/README.md`.
2. **The 1M-token context is hard to reach.** Ultra accepted about 300K prompt tokens. A 900K probe hit the per-minute token quota (HTTP 429), so we could not confirm 1M. We do not claim 1M anywhere. **Ask:** publish per-model tokens-per-minute limits, and offer a way to raise them for a single long-context call. Source: `ai/README.md`.
3. **Long calls outlast default client timeouts.** Node's default `fetch` gives up after 5 minutes, so we installed an undici Agent with 15-minute header and body timeouts. **Ask:** say so in the docs, or show streaming for long-context calls in the examples. Source: `ai/models.ts`, `ai/README.md`.
4. **Token counts are hard to predict.** Our corpus is dense with numbers and ids and came to about 1.6 characters per token (54,764 characters became about 34.5K prompt tokens). The common "characters / 3.3" rule undercounts by 2x. On the 1000-player corpus our chars/1.6 estimate was 219,280 against 224,420 real prompt tokens. **Ask:** a token-count endpoint or a published tokenizer, so callers can size a prompt before sending it. Source: `ai/README.md`.
5. **We could not find verified prices.** Our cost figure uses an unverified aggregator price for Ultra ($1/M input, $3/M output): 27 calls, 892,282 tokens in, 16,225 out, $0.941. We report tokens only for the other models. **Ask:** a clear per-model price table, or the price per call in the response. Source: `data/run-main/usage.json`.
6. **Structured output is unclear.** We did not use constrained decoding. We parse the last fenced JSON block and validate it ourselves, and the failure rates are in the model sections below. **Ask:** document whether JSON-schema-constrained output is supported for each Nemotron model on Token Factory, with an example.

### 4. Onboarding, "zero to hello world"

What the repo shows: one environment variable (`NEBIUS_API_KEY`), one URL, one JSON body. The first commit of this repo (`5794356`, 2026-10-28 00:59 -0400) already contains `ai/models.ts` with all four models and image input. The repo does not record when the account was made, when the first call succeeded, or what went wrong first. The hackathon promo code and the Builder Program credits are described in `docs/team/CREDITS-AND-PROGRAM.md`.

`[PARTH: fill the real onboarding story: time from sign-up to the first successful call, which docs page you used, the first error you hit, how the credit arrived, anything that was confusing.]`

### 5. Would we build with it again?

Draft from the evidence: yes. One OpenAI-compatible client served four models including image input, and one 220K-token call replaced a chunked pipeline. What would stop us from depending on it for a paid product: no price table we could verify, unpublished token-per-minute limits, and no clear statement on structured outputs. `[PARTH: confirm, and add your own reason.]`

---

## (b) NVIDIA Nemotron Nano (30B-A3B)

### 1. What we used it for

- Writing the 1000 player personas (archetype, skill, reaction time, patience, frustration tolerance, a bio, and sparse decision rules). Settings: thinking off, temperature 0.9, `max_tokens` 6000, 20 personas per call, 16 calls in flight (`ai/README.md`, `ai/personas.ts`).
- Proposing and evolving bot strategies for exploit search: 32 strategies over 2 generations (`data/run-main/exploit.json`).
- An optional live "spotlight" player that picks each action (`ai/spotlight.ts`). It is implemented and measured, and not part of the main run.

### 2. What worked

- **Bulk writing.** 1000 personas in 289 s over 69 calls (29.7K tokens in, 183.5K out); 100 personas in 50 s over 11 calls (`ai/README.md`).
- **The thinking-off switch worked** with `chat_template_kwargs` (see section a).

### 3. What needs work

- **Output validity.** About 1 in 5 personas failed our validator on the first pass (79.9% valid at n=1000; 82% at n=100). Failures: a bio too short or too long, a trait that was not a number, and fields we never asked for. 56 duplicate rule sets were dropped, and it took 3 repair rounds to get exactly 1000 (`ai/README.md`).
- **Repeated names.** The 1000 bios are unique, but there are only 401 unique names (`ai/README.md`).
- **Live per-move use is too slow for a crowd.** Picking an action took a median 3.5 s per uncached call, with 3 tokens out, and 30% of calls were cache hits (12 of 40 on a synthetic 40-step sequence, 0 fallbacks). That is fine for one spotlight player and too slow to drive 1000 players move by move, so crowd players run Nano-written policies natively instead (`ai/README.md`).
- **Token accounting gap.** The 69 persona calls ran before usage logging was added, so `usage.json` shows only 3 Nano calls (1,849 in, 6,225 out) and understates Nano. We have no price for Nano either (`README.md`).
- **Reasoning controls.** `reasoning_budget`, `reasoning_effort` and `/no_think` did not work on Nano (section a, item 1).

### 4. Onboarding, "zero to hello world"

Same endpoint and key as section (a); the model id is the only difference. The repo shows no separate Nano setup step. `[PARTH: fill the real onboarding story for Nano: first call, first surprise.]`

### 5. Would we build with it again?

Draft: yes, for bulk structured generation where a validator and a repair loop are acceptable. We would not use it for per-decision control of many agents at 3.5 s per call. `[PARTH: confirm.]`

---

## (c) NVIDIA Nemotron Super (120B-A12B)

### 1. What we used it for

- **Bug report to oracle.** An English bug report becomes a predicate over the engine's event log; plain code then runs it over all 2831 recorded rounds (`ai/nl.ts`, `lib/oracle.ts`). Settings: thinking off, temperature 0.1, `max_tokens` 1500, one retry with the validation error.
- **Patch notes to tuning.** English patch notes become tuning overrides, with the 85-key tuning table in the prompt (`ai/nl.ts`).
- **Explaining why the winning exploit strategies win**, and the **Design Advisor's** cited suggestions (one Super call, at most 6 suggestions).

### 2. What worked

- **Speed on structured translation.** 0.7 to 1.6 s per bug report; 1.3 s for patch notes (`ai/README.md`).
- **Precision when the report names a clear event.** In a test of 10 bug reports, 3 clear reports (floated out past the wall, never got up after a knockdown, CPU swept me 3+ times) gave oracles with 100% precision and recall. 4 of the 5 oracles that matched any round had 100% precision. It refused the off-topic report ("checkout page charged my card twice") and one too vague to check, and it correctly found nothing for the two reports of things that did not happen (`docs/calibration.md` section 3). Ten reports and 11 calls is a small sample.
- **It rejects off-topic input** (a banana bread recipe, cosmetic-only patch notes) with a clear error instead of making something up (`ai/README.md`).

### 3. What needs work

- **Causal explanation from rule text alone.** Asked why 32 bot strategies beat the CPU, with only their rule text and the CPU code, it blamed "recovery-state grabs". The engine's hit log shows sweep spam into mount (117 SWEEP hits and 49 GROUND hits for the top strategy). With the measured hit tally in the prompt its prose names the sweep and the guard rule, but it still over-reads the grabs (`README.md`, `docs/devpost.md`).
- **One inverted oracle in 10.** A report about the absence of hits ("nobody could land a hit") became a predicate on their presence and matched 2,880 rounds, 1 of them correct (`docs/calibration.md` section 3).
- **A crash report was rejected**, but that one is our bug: the oracle prompt in `ai/nl.ts` does not list the `crash` event, so Super could not know it exists (`docs/calibration.md` section 3).
- **Format slip.** Once it put a position (`LEFT_CORNER`) into a field meant for a move name (`ai/README.md`).
- **Thinking on empties short answers.** With thinking on, the reasoning goes to `reasoning_content` and still spends completion tokens (section a, item 1).
- **Unmeasured.** The Advisor's suggestions were tested live on Market Brawl only and are not measured (`README.md`).

### 4. Onboarding, "zero to hello world"

Same endpoint and key as section (a). `[PARTH: fill the real onboarding story for Super, if it differed from Nano.]`

### 5. Would we build with it again?

Draft: yes, for English-to-config jobs where code validates the result, because it was fast and refused off-topic input. We would not trust its causal explanations without recorded evidence in the prompt. `[PARTH: confirm.]`

---

## (d) NVIDIA Nemotron Super-VL

### 1. What we used it for

Describing frames from the game. In the **Eyes** panel it gets three frames captured from the live replay (640 px JPEGs). In the **Design Advisor** it looks at four frames of a recorded round. It is a description aid: the engine's invariant checks decide what counts as a bug (`README.md`).

### 2. What worked

- **Images went through the same `image_url` route without trouble.** Three 640 px JPEG frames worked (`README.md`). JPEG needs the matching data-URL type (`image/jpeg`), which `ai/models.ts` sets from the base64 header.
- **Latency.** 5.2 s for one 1.6K-token frame, with thinking off, `max_tokens` 600 (`ai/README.md`).
- **A small test flagged all three bug rounds and none of three clean rounds.** It named the real bug in 2 of the 3 bug rounds (`docs/calibration.md` section 4). Six rounds is too few to rely on.

### 3. What needs work

- **It missed a floating fighter.** On the first demo round (seed 634310) it said nothing floated, because the pulled-back camera made both fighters tiny. In the calibration run on `p0537:1` it flagged a crate overlapping a downed fighter and missed the floating fighter visible in frame 1. These are the same round (seed 634310 is `p0537:1`), seen in two runs, so this is one missed round, not two (`README.md`, `docs/calibration.md` section 4). Framing mattered more than model size for this check.
- **No price and no main-run usage row.** Super-VL reports tokens only, and the main-run `usage.json` has no Super-VL row, because Super-VL is only called from the hosted app's Eyes and Advisor (`data/run-main/usage.json`, `README.md`).

### 4. Onboarding, "zero to hello world"

Same endpoint and key as section (a). The repo's first commit (2026-10-28 00:59 -0400) already had `ai/vision.ts` and image input in `ai/models.ts`. The Eyes panel came in commit `d6acf19` (2026-10-28 11:04 -0400). `[PARTH: fill the real onboarding story for Super-VL: first image call, anything about the image format or size limits.]`

### 5. Would we build with it again?

Draft: yes, as a description aid next to a deterministic check, and not as a detector. We would test it on more than 6 rounds first. `[PARTH: confirm.]`

---

## (e) NVIDIA Nemotron Ultra (550B-A55B)

### 1. What we used it for

- **The crowd report.** One call read a summary of all 1000 players and 2,831 rounds (220,334 prompt tokens, 4,439 out) and returned 8 findings, each with structured claims and seeds (`data/run-main/findings.json`). Settings: thinking off, temperature 0.2, `max_tokens` 12000, answer in one fenced JSON block (`ai/README.md`).
- **Bug triage.** Ultra reads a 10 Hz timeline re-simulated from the seed plus the relevant game source, and proposes a root cause and a patch. In the hosted app, **Triage this (Ultra)** makes one call of about 27K prompt tokens (up to two calls per click). The Ultra call took 2.6 to 6.0 s in the three recorded live runs and the whole click 4.9 to 7.1 s (`footage/08-repro*.live.json`); the page itself tells users to expect about 20-40 s. [PARTH/LEAD: confirm live routes hosted] Code applies the patch to a temp copy and replays the seed; the replay decides the verdict (`README.md`).

### 2. What worked

- **The long-context read is why the project works.** One call over the whole crowd summary, with no chunking. On the planted 1000-player fixture (2,556 rounds, 224.4K prompt tokens, 16.7 s) it found all four hidden stories, including the single sweep-spamming player out of 1000 (`ai/README.md`). On a 150-player fixture: 35.2K prompt tokens, 9.8 s (`ai/README.md`).
- **Structured claims were right.** Main run: 31 of 31 claims matched the values code recomputed. Caveat: all 31 are cells of a table code also put in the prompt, so this shows Ultra read correctly, not that it discovered anything (`docs/calibration.md` section 2). On the planted fixture 23 of 24 verified, and the one failure was a real error the verifier caught (the cheeser round-1 average stated as 16.9 s, one player's time; the archetype average is 43.5 s).
- **Two of four bug clusters got a replay-verified Ultra patch:** bug3 (3 of 3 seeds clean) and bug4 (1 of 1; not shipped because the patch removes a height guard) (`README.md`, `data/run-main/triage.json`).

### 3. What needs work

- **Prose is less reliable than claims.** On the fixture the narrative said "10/18 Round 1s end in draws" (there were 3) and "611 rival hits" (made up). In the main run, 13 cited seeds did not exist and were removed or repaired (`ai/README.md`, `README.md`). We recommend checking Ultra's claims with code.
- **Its stated confidence is not informative.** In triage it said 85 to 95% every time. Across 24 measured triages with a replay verdict, 3 patches fixed the round: 2 of 15 with the first prompt (Brier 0.70, against 0.12 for a constant), and 1 of 9 with the line-range prompt (stated 0.85) (`docs/calibration.md` sections 1 and 6). Read the replay verdict, not the number.
- **Patch validity.** With the first prompt, 5 of 12 single-attempt answers proposed a `find` text that is not in the source. With the line-range prompt that fell to 0 of 12, but 4 of 12 asked for more than 12 lines, and the fixed rate did not measurably improve (`docs/calibration.md` section 6). One of the 3 credited fixes clamps a fighter's height rather than finding the cause.
- **It sometimes edits a shipped fix.** In 3 of 7 controlled answers it patched inside a rule guard the replay forces off, so the patch is not credited (`docs/calibration.md` section 1).
- **Thinking on writes reasoning into `content`**, so a small `max_tokens` returns no answer (section a, item 1).
- **Context.** About 300K prompt tokens worked; a 900K probe hit the per-minute quota (HTTP 429), so we do not claim 1M (section a, item 2).

### 4. Onboarding, "zero to hello world"

Same endpoint and key as section (a). One detail for newcomers: the `ai/models.ts` comment records that Ultra can take more than 5 minutes on a 300K-token prompt, which is longer than Node's default `fetch` timeout. `[PARTH: fill the real onboarding story for Ultra: first long call, quota surprises.]`

### 5. Would we build with it again?

Draft: yes, for reading a large structured corpus in one pass, with code checking every claim. We would not rely on it for unattended code fixes at the rate we measured (3 of 24), or on its self-reported confidence. `[PARTH: confirm.]`

---

## Tavily (not a Nebius or NVIDIA tool; called at runtime)

- **Used for:** (live in the hosted app: [PARTH/LEAD: confirm live routes hosted]) the **Find precedent** button on a Repro match (one search, developer sites only, top 3 writeups) and the Design Advisor (3 searches per run). The server words every query; nothing comes from the client (`ai/precedent.ts`, `README.md`).
- **Measured:** 7 searches took about 4.5 s in total with 4 in flight, at basic depth, 4 results, keep 3 (`ai/README.md`).
- **Needs work:** results are sometimes off-topic (`docs/team/aashna/README.md`), and the topic phrase at the start of the query steers the results far more than the suffix does (`ai/precedent.ts` comment, tuned live on 2026-10-28).
- **Onboarding and build again:** `[PARTH: fill in.]`

---

## Usage for the main run

From `data/run-main/usage.json`. The Ultra row includes the 27 calls of the report and bug triage. Nano and Super cover only the calls logged after usage logging was added: the 69 persona calls are not in it.

| Model | Calls | Tokens in | Tokens out | USD estimate |
|---|---|---|---|---|
| Nemotron Ultra 550B | 27 | 892,282 | 16,225 | 0.941 (unverified price) |
| Nemotron Nano 30B | 3 | 1,849 | 6,225 | not priced |
| Nemotron Super 120B | 2 | 2,579 | 479 | not priced |
