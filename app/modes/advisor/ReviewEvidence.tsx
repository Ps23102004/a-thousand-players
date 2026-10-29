import type { ReviewEntry } from "@/lib/reviews";

type AttributedQuote = Pick<ReviewEntry, "text" | "url" | "domain" | "retrievedAt" | "theme" | "sentiment">;

export default function ReviewEvidence({ review }: { review: AttributedQuote }) {
  return (
    <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
      <strong>Player opinion (public reviews)</strong>
      <blockquote style={{ margin: "8px 0", paddingLeft: 12, borderLeft: "2px solid var(--muted)" }}>{review.text}</blockquote>
      <a href={review.url} target="_blank" rel="noreferrer noopener">{review.domain}</a>
      <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}> · {review.sentiment}: {review.theme} · Retrieved <time dateTime={review.retrievedAt}>{review.retrievedAt}</time></span>
    </div>
  );
}
