import type { Metadata } from "next";
import stored from "@/data/drift/results.json";
import type { VerifiedDriftClaim } from "@/ai/drift";
import { loadStoredJudge } from "./judge.cjs";
import { DriftClaimGroups } from "./results";

export const metadata: Metadata = { title: "Spec Drift · A Thousand Players" };

export default function DriftPage() {
  const data = stored as { placeholder: boolean; source?: string; proposed: number; verified: number; dropped: number; claims: VerifiedDriftClaim[] };
  const judge = loadStoredJudge();
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
          <DriftClaimGroups claims={data.claims} judge={judge} />
        </div>
      )}
    </section>
  );
}
