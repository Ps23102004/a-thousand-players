import type { Metadata } from "next";
import stored from "@/data/drift/results.json";
import type { VerifiedDriftClaim } from "@/ai/drift";

export const metadata: Metadata = { title: "Spec Drift · A Thousand Players" };

export default function DriftPage() {
  const data: { placeholder: boolean; source?: string; proposed: number; verified: number; dropped: number; claims: VerifiedDriftClaim[] } = stored;
  return (
    <section className="section wrap" aria-labelledby="drift-title" style={{ overflowWrap: "anywhere" }}>
      <div className="kicker">Mode · Spec Drift</div>
      <h1 id="drift-title">Where did the game drift from its design?</h1>
      <p className="lede">Compare the game’s design documents with its source. An offline CLI proposes candidates and checks their references before this static page is built.</p>
      <p className="notice">Ultra proposed, code verified existence of the quote and symbol; whether the code really contradicts the doc is for a human to judge</p>
      {data.placeholder ? (
        <div className="panel" data-testid="drift-placeholder">
          <h2>Spec Drift: not run yet</h2>
          <p>No model results have been recorded. The committed results file is a placeholder.</p>
        </div>
      ) : (
        <div data-testid="drift-results">
          <p><strong>{data.verified} of {data.proposed} claims verified by code; {data.dropped} dropped</strong></p>
          <p>{data.source === "model" ? "Recorded offline Ultra call." : "Imported answer: provenance is not checked; it may be a fake fixture, not a live Ultra result."}</p>
          <p>Quotes and source locations below are copies from the checked snapshot. Symbol matching is textual and may match comments or strings; the cited line exists but need not contain the symbol. Severity and the contradiction explanation are model proposals.</p>
          {!data.claims.length && <p className="notice">No claims passed the existence checks. This does not prove the documents and code agree.</p>}
          {data.claims.map((claim, index) => (
            <article className="panel" key={`${claim.codeFile}:${claim.codeLine}:${index}`} style={{ marginTop: 20 }}>
              <h2>Candidate {index + 1}: {claim.codeSymbol}</h2>
              <p>Proposed severity: <strong>{claim.severity}</strong></p>
              <p>{claim.whatCodeDoes}</p>
              <p>Document: <code>{claim.docFile}</code> (verbatim copy)</p>
              <blockquote style={{ whiteSpace: "pre-wrap" }}>{claim.docClaim}</blockquote>
              <p>Code location: <code>{claim.codeFile}:{claim.codeLine}</code> · symbol: <code>{claim.codeSymbol}</code></p>
              <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}><code>{claim.codeLineText}</code></pre>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
