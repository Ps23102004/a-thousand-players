# Feedback: Nebius Token Factory and NVIDIA Nemotron

Written by the A Thousand Players team after building on Token Factory for the Nebius x NVIDIA hackathon. Every number comes from measurements in [`ai/README.md`](../ai/README.md) (measured 2026-10-28 from one machine; latency varies with load) or from the run log in `data/run-main/usage.json`.

## What worked well

- **The OpenAI-compatible endpoint just worked.** One small `fetch` client (`ai/models.ts`) covers Nano, Super, Ultra and Super-VL. Images go to Super-VL as `image_url` data URLs, with no special API.
- **One switch turns thinking off on all four models.** `chat_template_kwargs: {"enable_thinking": false}` worked on Nano, Super, Ultra and Super-VL. A one-line JSON answer took 11 completion tokens and under 0.8 s on Super, Ultra and VL.
- **Ultra's long context is the reason this project works.** One call read a 1000-player corpus (2,556 rounds) of 224.4K prompt tokens and answered in 16.7 s with 3.5K tokens out. On a planted fixture it found all four stories, including the single sweep-spamming player out of 1000. No chunking strategy could see patterns across players like that.
- **Nano is fast enough for bulk work.** 1000 personas in 289 s over 69 calls (29.7K in / 183.5K out tokens), with 16 calls in flight.
- **Super is reliable for structured translation.** Bug report to oracle predicate in 0.7 to 1.6 s; patch notes to tuning overrides (with an 82-key table in the prompt) in 1.3 s.

## Problems we hit, and what would help

1. **Thinking controls are inconsistent between models.**
   - On Nano, `reasoning_budget`, `reasoning_effort` and `/no_think` did not work. Only `chat_template_kwargs` did.
   - Super with thinking on returns its reasoning in a separate `reasoning_content` field, but the reasoning still uses up completion tokens. At a small `max_tokens`, the answer can come back empty.
   - Ultra with thinking on writes its reasoning straight into `content`, with no separate field. At `max_tokens` 60, the reply was all reasoning and no answer.

   **Ask:** document one thinking switch that works on every Nemotron model, and always put reasoning in `reasoning_content`. At minimum, publish a table of which control works on which model.

2. **The 1M-token context is hard to reach in practice.** Ultra accepted about 300K prompt tokens. A 900K probe hit the per-minute token quota (HTTP 429), so we could not confirm 1M. **Ask:** publish per-model tokens-per-minute limits, and offer a way to raise them for a single long-context call.

3. **Long calls outlast default client timeouts.** Node's default `fetch` times out after 5 minutes, so we had to install an undici Agent with 15-minute timeouts. **Ask:** mention this in the docs, or support streaming responses for long-context calls in the examples.

4. **Token counts are hard to predict.** Our corpus is dense with numbers and ids. It came to about 1.6 characters per token (54,764 characters became about 34.5K prompt tokens). The common "characters / 3.3" rule undercounts by 2x. **Ask:** a token-count endpoint, or a published tokenizer, so callers can size a prompt before sending it.

5. **We could not find verified prices.** Our cost numbers use an unverified aggregator price for Ultra ($1/M input, $3/M output). We report tokens only for the other models. **Ask:** a clear per-model price table, or price per call in the response.

6. **JSON output needs our own validation.** We did not use constrained decoding; we parse the last fenced JSON block and validate it ourselves.
   - Nano: about 1 in 5 personas failed validation on the first pass (79.9% valid at n=1000). Failures were bios that were too short or too long, non-number traits, and fields we never asked for. 56 duplicate rule sets were dropped, and it took 3 repair rounds to get exactly 1000.
   - Ultra in bug triage: for 2 of 4 bug clusters, the answer failed validation 3 times. Once, the patch's `find` text did not exist in the source file. Once, required fields were missing.
   - Super once put a position (`LEFT_CORNER`) into a field meant for a move name.

   **Ask:** document whether JSON-schema-constrained output (structured outputs) is supported for each Nemotron model on Token Factory, with an example.

## Notes on the models

- **Nano 30B** is the right choice for thousands of cheap calls. For live action picking, the median was 3.5 s per uncached call with 3 tokens out. That is fine for a spotlight player, but too slow to drive 1000 players move by move, so crowd players run Nano-written policies natively instead.
- **Super 120B** handled the "English to engine config" jobs well, and it rejected off-topic input (a banana bread recipe, cosmetic-only patch notes) instead of making something up.
- **Ultra 550B** is the reason this project works. But its narrative prose is less reliable than its structured claims. On a fixture, every structured claim was correct, but the prose said "10/18 Round 1s end in draws" (there were 3) and made up a hit count. In the main run, 31 of 31 claims checked out, but 13 cited seeds did not exist. We recommend that anyone building on Ultra check its claims with code.
- **Super-VL** described a 1.6K-token frame in 5.2 s.

## Usage for the main run

From `data/run-main/usage.json`:

| Model | Calls | Tokens in | Tokens out | USD estimate |
|---|---|---|---|---|
| Nemotron Ultra 550B | 14 | 555,498 | 9,983 | 0.5855 (unverified price) |
| Nemotron Nano 30B | 3 | 1,849 | 6,225 | not priced |
| Nemotron Super 120B | 1 | 1,276 | 183 | not priced |
