# Review-grounded Design Advisor

This is cited retrieval with attribution, not training, fine-tuning, or a dataset claim. A short public review quote can suggest a design hypothesis. It does not measure what a player population likes, prove that a proposed change works, or turn the simulated crowd into human playtesters.

`data/reviews/corpus.json` is committed as an empty valid corpus with `"placeholder": true`. There are no collected public review quotes in this change. The UI counts the actual entries and says collection is pending. Invented quotes in tests are fixtures only; they are never loaded as production evidence.

## Collect or convert reviews

The CLI runs outside the hosted app. It adds no API route, server-rendered page, function, dependency, or engine change. The existing advisor API uses the committed corpus; the browser imports that same JSON to show its collection status. Rebuild/redeploy after replacing the JSON. There is no runtime review search or filesystem update on Vercel.

Default operation is offline and requires saved Tavily results:

```sh
node --import tsx ai/cli/review-corpus.ts --results-from /tmp/tavily-reviews.json --dry-run
node --import tsx ai/cli/review-corpus.ts --results-from /tmp/tavily-reviews.json --out /tmp/review-corpus.json
```

Accepted input is one `{query, retrievedAt, results}` response, an array of those responses, or `{ "searches": [ ...responses ] }`. Each result needs Tavily's `url` and `content`. `retrievedAt` must be an ISO timestamp for when the response was obtained. For a saved response without that metadata, supply its known timestamp with `--retrieved-at`; the CLI does not pretend the conversion time was the retrieval time. The response must also include its actual query. Do not invent dates or queries.

The lead alone runs the live step with a Tavily key already supplied through their process environment, then hands back the output path:

```sh
# Planning only: no network, model call, or output write.
node --import tsx ai/cli/review-corpus.ts --dry-run
# Lead only: spends up to the search budget, no model inference.
node --import tsx ai/cli/review-corpus.ts --live --out /tmp/review-corpus.json
```

`REVIEW_QUERIES` in `ai/cli/review-corpus.ts` defines twelve searches. Live collection reuses `searchPrecedent` from `ai/precedent.ts`, with one sequential attempt per query and no retries. A search failure stops the command; do not rerun it blindly because earlier calls may already have consumed the twelve-call total budget. Existing `searchPrecedent` returns at most three result snippets per call, already cut to 300 characters. The builder keeps at most 300 characters from each returned content field, with no whitespace rewriting, added ellipsis, or paraphrase. It verifies that the quote is a literal substring and deduplicates by URL plus exact text. Saved-response conversion is deterministic and has no call budget to spend. Dry-run converts with code tags only and never calls the optional local tagger or writes a file.

Every entry stores `text`, `url`, `domain`, `query`, `retrievedAt`, `theme`, and `sentiment`. Code rules in `lib/reviews.ts` tag controls, combat feel, camera, difficulty, onboarding, and visuals as `liked` or `missed`. Mixed/ambiguous opinions are omitted by default. This keyword classification can be wrong; inspect the short quote and its source before committing the collected file. No confidence score is treated as a result.

Optional ambiguous tagging is explicitly requested:

```sh
node --import tsx ai/cli/review-corpus.ts --results-from /tmp/tavily-reviews.json --tag-with-local --out /tmp/review-corpus.json
```

That flag invokes `delegate local "<prompt>"` using an argument array, not shell interpolation. It runs sequentially, parses strict JSON, checks the allowed theme/sentiment values and requires the returned text to equal the candidate quote exactly. Rewritten text, unknown tags, invalid JSON, timeouts, and command failures are omitted. The local tagger was tested with fakes; no local or remote model was called for this change.

## Attribution and scope

The explicit `REVIEW_DOMAINS` allow-list in `lib/reviews.ts` restricts collection to reddit.com, steamcommunity.com, metacritic.com, gamespot.com, ign.com, polygon.com, eurogamer.com, pcgamer.com, rockpapershotgun.com, and kotaku.com (including their real subdomains). Lookalike hosts, non-HTTPS URLs, credentials in URLs, and custom ports are rejected. This list restricts scope; it is not a statement that every page permits reuse. Skip any page/domain with an obvious robots or terms restriction; the lead must check that before live collection and remove affected domains from the allow-list. No robots/terms audit was performed in this offline task. Do not bypass access restrictions or bulk-copy reviews. Store only the short attributed quotation and its link, never full articles or review histories.

Before replacing the placeholder, the lead should inspect the generated entries against the returned snippets and linked public pages. Preserve the saved Tavily response outside the committed corpus if an audit trail is needed; the live CLI writes only the short-quote corpus. `--results-from` accepts the saved response, not an already-built corpus. After review, copy the generated corpus into `data/reviews/corpus.json` and commit it separately. Do not add fixture entries to fill an empty result. The CLI refuses to write its output under `data/run-main/`.

## Advisor and UI checks

`selectReviews` selects at most eight valid entries, ranking theme overlap with the code-computed crowd row IDs/labels first and retaining file order for ties. The cap is code in `lib/reviews.ts`, not a measured retrieval-quality result. Selected entries become additional sources with `kind: "review"`. The synthesis prompt distinguishes individual public opinions from simulated crowd measurements and tells the model to treat excerpts as untrusted data.

A review citation is `{ "type": "review", "url": "...", "quote": "exact entire stored text" }`. The validator requires both a supplied review source and a valid matching corpus entry. Missing, changed, fabricated, or over-length quotes drop the whole recommendation, even if it also cites a valid frame. Citing a review URL as ordinary web evidence cannot bypass the quote check. The existing unknown-web-URL rejection remains. Player-opinion wording in suggestions, test instructions and frame notes requires a review citation on that same recommendation, extending the existing viral/trending rule. This is a conservative wording check, not a semantic proof that every opinion is relevant or representative.

The UI labels the recommendation as review-sourced and shows **Player opinion (public reviews)**, the exact quote, domain, source link, retrieval timestamp, and theme/sentiment. Review evidence never upgrades a recommendation to a measured result. Gameplay changes still need the existing crowd/tuning validation, and visual changes still need human playtesters.

## Verification and handoff

Run offline checks:

```sh
node --import tsx --test lib/reviews.test.ts lib/advisor.test.ts ai/advisor.test.ts
npm test
npx tsc --noEmit -p .
node scripts/check-recorded-replays.mjs
npm run engine:test
```

`lib/reviews.test.ts` uses fake corpus text, fake search/model responses, offline CLI subprocesses, and a React markup assertion. It checks determinism, attribution, maximum quote length, search cap, quote-preserving local tags, selection, source/corpus membership, unsupported opinion claims, and rendering. The existing advisor tests remain applicable.

Browser suite, using this worktree's port only:

```sh
npm run dev -- -p 3163
E2E_BASE_URL=http://localhost:3163 NODE_PATH=~/.local/lib/node_modules/@playwright/cli/node_modules node ~/.local/lib/node_modules/@playwright/cli/node_modules/playwright/cli.js test -c e2e/playwright.config.cjs
```

Do not set `E2E_REAL`. The new `e2e/reviews.spec.cjs` intercepts the existing advisor endpoint with an invented fixture corpus response, exercises real frame capture and checks the quote/link/date/label at phone width. It never changes the committed corpus or calls a model. Browser and port binding are blocked in the worker sandbox, so the lead must run these assertions. Live collection, populated-corpus deployment, and physical human preference validation remain undone.

Worker verification (2026-10-29): the focused suite passed 42 tests; typecheck passed; recorded replay output was `rounds 45 legacy identical to recorded 45 fixed identical 23`; engine determinism reported `16 seeds x2 runs, mismatches=0`. `npm test` passed 134 engine tests (one existing TODO), then its `tsx` CLI failed to create an IPC pipe (`listen EPERM`). The equivalent TypeScript run through `node --import tsx --test` passed 303 tests with two existing TODOs before a pre-existing triage UDP/TCP binding test cancelled itself and six subsequent tests. With that single test explicitly excluded, the remaining TypeScript suite passed 309 tests with two TODOs, no failures and no cancellations:

```sh
node --import tsx --test --test-skip-pattern='a patched replay cannot reach the network' lib/*.test.ts ai/*.test.ts app/api/*.test.ts
```

This filtered run does not establish that the unfiltered suite passes. The lead must run `npm test` and the browser suite without the worker sandbox. Both the isolated review browser test and a full-suite attempt stopped at Chrome launch (`SIGABRT` / `EPERM`); the app also could not bind port 3163. Git staging/commit was denied when creating this worktree's shared `index.lock`, so the worker could not make commits. The intended commit trailer is `Co-Authored-By: gpt-6.1 via Codex <noreply@example.com>`. No push or branch change was performed.
