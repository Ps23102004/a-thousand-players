import type { CrowdRow, Source } from "./advisor";

export const REVIEW_DOMAINS = ["reddit.com", "steamcommunity.com", "metacritic.com", "gamespot.com", "ign.com", "polygon.com", "eurogamer.com", "pcgamer.com", "rockpapershotgun.com", "kotaku.com"];
export const REVIEW_THEMES = ["controls", "combat feel", "camera", "difficulty", "onboarding", "visuals"] as const;
export type ReviewTheme = (typeof REVIEW_THEMES)[number];
export interface ReviewEntry {
  text: string; url: string; domain: string; query: string; retrievedAt: string;
  theme: ReviewTheme; sentiment: "liked" | "missed";
}
export type ReviewCandidate = Omit<ReviewEntry, "theme" | "sentiment">;
export interface ReviewCorpus { version: 1; placeholder: boolean; entries: ReviewEntry[] }
export interface SavedSearch { query: string; retrievedAt: string; results: { url: string; content: string }[] }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const nonempty = (v: unknown): v is string => typeof v === "string" && !!v.trim();

/** An allow-list is a scope restriction, not a claim of permission or a robots/ToS clearance. */
export function reviewDomain(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
    return REVIEW_DOMAINS.find((d) => u.hostname === d || u.hostname.endsWith(`.${d}`)) ?? null;
  } catch { return null; }
}

export function isReviewEntry(v: unknown): v is ReviewEntry {
  return object(v) && nonempty(v.text) && v.text.length <= 300 && nonempty(v.url) && reviewDomain(v.url) === v.domain &&
    nonempty(v.query) && typeof v.retrievedAt === "string" && /^\d{4}-\d\d-\d\dT/.test(v.retrievedAt) && Number.isFinite(Date.parse(v.retrievedAt)) &&
    REVIEW_THEMES.includes(v.theme as ReviewTheme) && (v.sentiment === "liked" || v.sentiment === "missed");
}

export function parseReviewCorpus(raw: unknown): ReviewCorpus {
  if (!object(raw) || raw.version !== 1 || typeof raw.placeholder !== "boolean" || !Array.isArray(raw.entries) ||
    raw.entries.some((e) => !isReviewEntry(e)) || (raw.placeholder && raw.entries.length > 0)) throw new Error("Invalid review corpus: expected short attributed quotes and valid tags/dates.");
  return raw as unknown as ReviewCorpus;
}

const THEME_WORDS: [ReviewTheme, RegExp][] = [
  ["controls", /\b(control\w*|input\w*|button\w*|responsive|unresponsive)\b/i],
  ["combat feel", /\b(combat|combo\w*|hit.?stop|impact|punch\w*|fighting|sweep\w*|exploit\w*)\b/i],
  ["camera", /\b(camera|framing|zoom|readability)\b/i],
  ["difficulty", /\b(difficult\w*|hard|easy|balance\w*|unfair|win|quit|cpu|rival)\b/i],
  ["onboarding", /\b(tutorial\w*|onboard\w*|learn\w*|beginner\w*|newcomer\w*|casual|progression)\b/i],
  ["visuals", /\b(visual\w*|graphic\w*|lighting|clutter|silhouette\w*|art|beautiful)\b/i],
];

/** Conservative keyword tagging; ambiguous or mixed opinion is omitted unless a local tagger resolves it. */
export function tagReview(text: string): Pick<ReviewEntry, "theme" | "sentiment"> | null {
  const theme = THEME_WORDS.find(([, re]) => re.test(text))?.[0];
  const liked = /\b(love\w*|like[ds]?|enjoy\w*|satisfying|excellent|great|responsive|beautiful|praise\w*)\b/i.test(text);
  const missed = /\b(dislike\w*|hate\w*|frustrat\w*|annoy\w*|clunky|unresponsive|unfair|poor|bad|awkward|wish|lack\w*|miss\w*|hides?)\b|\b(?:not|never)\s+(?:\w+\s+){0,2}(?:good|responsive|clear|fun|enjoy\w*|like\w*)\b/i.test(text);
  if (!theme || liked === missed) return null;
  return { theme, sentiment: liked ? "liked" : "missed" };
}

export function reviewCandidates(searches: SavedSearch[]): ReviewCandidate[] {
  const candidates: ReviewCandidate[] = [], seen = new Set<string>();
  for (const search of searches) {
    if (!nonempty(search.query) || !Number.isFinite(Date.parse(search.retrievedAt)) || !Array.isArray(search.results)) throw new Error("Saved searches need query, retrievedAt and results.");
    for (const r of search.results) {
      if (!object(r) || typeof r.url !== "string" || typeof r.content !== "string") continue;
      const domain = reviewDomain(r.url);
      // No paraphrase, whitespace rewriting or ellipsis: this is literally a substring of the response.
      const text = r.content.slice(0, 300).trim();
      const key = `${r.url}\n${text}`;
      if (!domain || !text || seen.has(key)) continue;
      if (!r.content.includes(text)) throw new Error("Quote is not verbatim.");
      seen.add(key);
      candidates.push({ text, url: r.url, domain, query: search.query, retrievedAt: search.retrievedAt });
    }
  }
  return candidates;
}

export function buildReviewCorpus(searches: SavedSearch[]): ReviewCorpus {
  const entries = reviewCandidates(searches).flatMap((c) => { const tags = tagReview(c.text); return tags ? [{ ...c, ...tags }] : []; });
  return parseReviewCorpus({ version: 1, placeholder: false, entries });
}

/** Stable ties preserve file order; theme scores come only from the supplied crowd findings. */
export function selectReviews(entries: ReviewEntry[], crowd: CrowdRow[]): ReviewEntry[] {
  const findings = crowd.map((r) => `${r.id} ${r.label}`).join("\n");
  const themes = new Set(THEME_WORDS.filter(([, re]) => re.test(findings)).map(([theme]) => theme));
  return entries.filter(isReviewEntry).map((entry, index) => ({ entry, index, score: themes.has(entry.theme) ? 1 : 0 }))
    .sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 8).map(({ entry }) => entry);
}

export function reviewSources(entries: ReviewEntry[]): Source[] {
  return entries.filter(isReviewEntry).map((review) => ({ kind: "review", title: `${review.domain} · ${review.sentiment}: ${review.theme}`, url: review.url, snippet: review.text, query: review.query, review }));
}
