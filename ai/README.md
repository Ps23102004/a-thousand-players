# ai/ — the Nemotron layer

Everything here talks to NVIDIA Nemotron models on Nebius Token Factory (OpenAI-compatible chat completions) plus Tavily search.
Other code imports only `ai/index.ts`. Numbers below were measured on 2026-10-28 from this machine; latencies vary with load.

| Function | Model | Settings that work | Measured |
|---|---|---|---|
| `generatePersonas` | Nano 30B | thinking off, temperature 0.9, max_tokens 6000, 20 personas per call, 16 calls in flight | n=100: 50 s, 11 calls, 4.4K in / 16.9K out tokens, 82% valid on first pass. n=1000: **289 s**, 69 calls, 29.7K in / 183.5K out tokens, 79.9% valid on first pass, 56 duplicate rule sets dropped, 3 repair rounds, exactly 1000 returned |
| `analyzeCrowd` | Ultra 550B | thinking off, temperature 0.2, max_tokens 12000, answer in one fenced json block | 150-player fixture: 35.2K prompt tokens, 3.1K out, **9.8 s**. 1000-player fixture (2,556 rounds): **224.4K prompt tokens**, 3.5K out, **16.7 s**, est. $0.23 at the unverified price |
| `attachPrecedent` | Tavily | basic depth, 4 results, keep 3 | 7 searches, about 4.5 s total with 4 in flight |
| `bugReportToOracle` | Super 120B | thinking off, temperature 0.1, max_tokens 1500, one retry with the validation error | 0.7-1.6 s per report |
| `patchNotesToTuning` | Super 120B | same as above; the full tuning table (82 keys) is in the prompt | 1.3 s |
| `describeFrames` | Super-VL | thinking off, max_tokens 600, PNGs as `image_url` data URLs | 5.2 s for one 1.6K-token frame |
| `chooseAction` | Nano 30B | thinking off, max_tokens 6, temperature 0.5, 15 s timeout, no retries | median 3.5 s per uncached call, 3 tokens out; 30% cache hit rate (12/40) on a 40-step synthetic sequence, 0 fallbacks |

## What we learned about each model

- **`chat_template_kwargs: {"enable_thinking": false}` works on all four models** (Nano, Super, Ultra, Super-VL). A one-line JSON answer took 11 completion tokens and under 0.8 s on Super, Ultra and VL with it. `reasoning_budget`, `reasoning_effort` and `/no_think` did not work on Nano.
- **Super with thinking on** returns its reasoning in a separate `reasoning_content` field (185 chars for a trivial question) and spends completion tokens on it: at small max_tokens the answer can come back empty. We always turn it off for Super: the tasks are structured translation, not deep reasoning.
- **Ultra with thinking on** writes its reasoning straight into `content` (no separate field). At max_tokens 60 the reply was all reasoning, no answer. So the report call uses thinking off, and the parser takes the LAST fenced json block anyway.
- **Ultra long context**: earlier probes accepted ~300K prompt tokens; a 900K probe hit the per-minute token quota (HTTP 429), so 1M is unproven. The client waits for as long as the 429 says and retries. Node's default fetch times out at 5 minutes, so `models.ts` installs an undici Agent with 15-minute header/body timeouts.
- **Token estimate**: the corpus is dense with numbers and ids, and tokenizes at about **1.6 characters per token** (54,764 chars became ~34.5K prompt tokens). The common chars/3.3 rule undercounts by 2x, so `estimateTokens` uses chars/1.6. On the 1000-player corpus the estimate was 219,280 against 224,420 real prompt tokens (system prompt included), so it is within ~2%. The default budget of 220,000 stays inside the ~300K that was proven.
- **Nano persona JSON**: about 1 in 5 personas fails validation on the first pass (bio too short or long, a non-number trait, or a hallucinated field). The validator drops them, the repair loop asks again for the shortfall plus 2. Bios are all unique but names repeat (401 unique names in 1000).
- **Super oracle quirk**: once it put a position ("LEFT_CORNER") into `arg`, which the engine cannot match. The prompt now says `arg` is only a move or state name. Off-topic input ("banana bread recipe", cosmetic-only patch notes) is rejected with a clear `RejectedInput` error instead of a made-up oracle.

## The report path: Ultra reads everything, code checks Ultra

1. `buildCorpus` writes a header of exact aggregates computed by code (win/quit/KO rate by archetype, by round, archetype x round, duration quartiles, end reasons, top events) and then one line per player with every round and its seed.
2. Over budget, it trims the least interesting players first (no bug events, no unhappy quit, mixed results): full detail, then counts only, then outcome only. Seeds stay at every level. Only if outcome-only lines still do not fit are players left out, and the corpus says how many (aggregates still include them).
3. Ultra returns 4-8 findings with **claims** (metric, scope, value) and **seeds**.
4. `verifyFindings` recomputes every claim from the raw runs and removes any seed that does not exist. A finding left with no real seed has confidence capped at 0.3. The counts go into the summary text.

Metric definitions (shared by the corpus header, the Ultra prompt and the verifier): winRate = wins / rounds in scope; koShare = rounds lost by KO / rounds; avgDuration = mean round seconds; meanHpLoss = mean of 100 - player's final hp; **quitRate** counts only sessions that ended for `frustration` or `boredom` (`satisfied` and `cap` are not quits). With a round in scope it is: among players who played that round, the fraction who quit right after it.

### Proof on a planted fixture (real Ultra call)
`ai/cli/make-fixture.ts` builds 150 synthetic players x up to 3 rounds with four planted stories. Ultra found all four:
- rushers collapse in round 2 (win rate 67% -> 4%, 67% quit right after it) — found, all numbers verified;
- one cheeser (p0085) wins every round in ~17 s by spamming SWEEP — found and cited with all three of its seeds;
- three turtle rounds log a `stuck` BLOCK invariant violation and time out — found as a high-severity bug with the exact three seeds;
- turtle rounds are long and turtles quit from boredom — found.
21 of 21 claims verified within tolerance; 1 invented seed was caught and removed. A deliberately wrong claim (rusher round-2 win rate 0.9) is flagged `ok: false` in `ai/logic.test.ts`.

The same stories planted in a **1000-player** crowd (`--n 1000 --dir data/fixtures-ai/big`, one Ultra call over 224K tokens) were all found again, including the single sweep-spammer (p0561) among 1000 players and the exact three `stuck` seeds. 23 of 24 claims verified. The one failure is a real catch: Ultra claimed the cheeser archetype's round-1 average is 16.9 s, which is p0561's own time; the archetype average is 43.5 s. 2 invented seeds were removed.

## Limits (say these out loud)
- Only the claims and seeds are machine-checked. Ultra's narrative prose can still contain wrong numbers: on the fixture it wrote "10/18 Round 1s end in draws" (there were 3) and "611 rival hits" (made up), while every structured claim was correct. The UI should show verified claims, not prose numbers, as the evidence.
- Ultra sometimes generalizes one player into an archetype story (it framed the single sweep-spammer as "cheesers exploit sweep").
- Prices: only Ultra has a cost estimate, at an unverified aggregator rate ($1/M in, $3/M out). Other models report tokens only.
- Players are synthetic. Findings are hypotheses to replay and check, not proof that real humans behave this way.

## Commands
```
npx tsx --env-file=.env ai/cli/personas.ts --n 1000 --out data/run-main/personas.json   # progress on stderr
npx tsx --env-file=.env ai/cli/report.ts --dir data/run-main                              # writes findings.json + usage.json
npx tsx ai/cli/make-fixture.ts [--n 150] [--dir data/fixtures-ai]                         # synthetic crowd with planted stories
npx tsx --test ai/*.test.ts                                                               # logic tests, no network
```
