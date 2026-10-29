import type { VerifiedDriftClaim } from "@/ai/drift";
import { groupDriftClaims, type DriftJudge, type IndexedDriftClaim } from "./grouping";

function ClaimCard({ item }: { item: IndexedDriftClaim }) {
  const { claim, index, judgment } = item;
  return (
    <article className="panel" data-claim-index={index} style={{ marginTop: 20 }}>
      <h3>Candidate {index}: {claim.codeSymbol}</h3>
      <p>Second-model verdict: <strong>{judgment?.verdict ?? "not second-checked"}</strong></p>
      {judgment && <p><strong>Second-model reason:</strong> {judgment.reason}</p>}
      <p>Proposed severity: <strong>{claim.severity}</strong></p>
      <p>{claim.whatCodeDoes}</p>
      <p>Document: <code>{claim.docFile}</code> (verbatim copy)</p>
      <blockquote style={{ whiteSpace: "pre-wrap" }}>{claim.docClaim}</blockquote>
      <p>Code location: <code>{claim.codeFile}:{claim.codeLine}</code> · symbol: <code>{claim.codeSymbol}</code></p>
      <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}><code>{claim.codeLineText}</code></pre>
    </article>
  );
}

export function DriftClaimGroups({ claims, judge }: { claims: VerifiedDriftClaim[]; judge?: DriftJudge | null }) {
  const { confirmed, vague, notDrift, unchecked, counts } = groupDriftClaims(claims, judge);
  return (
    <>
      <p className="notice" data-testid="drift-judge-counts" style={{ borderLeftColor: "var(--accent)" }}>
        <strong>{counts.confirmed} of {counts.total} confirmed, {counts.vague} vague, {counts.notDrift} not drift{counts.unchecked > 0 && `; ${counts.unchecked} not second-checked`}</strong>
      </p>
      <p data-testid="drift-judge-source">{judge?.judge ? `Second-model check: ${judge.judge}.` : "No second-model snapshot is available."} This is one second opinion, not ground truth.</p>
      <section data-testid="drift-confirmed" data-drift-group="confirmed" aria-labelledby="drift-confirmed-title" style={{ marginTop: 32, borderLeft: "4px solid var(--accent)", paddingLeft: 16 }}>
        <h2 id="drift-confirmed-title" style={{ color: "var(--accent)" }}>Confirmed by a second model</h2>
        {confirmed.map(item => <ClaimCard key={item.index} item={item} />)}
        {!confirmed.length && <p>No candidates were confirmed by a second model.</p>}
      </section>
      <section data-testid="drift-vague" data-drift-group="vague" aria-labelledby="drift-vague-title" style={{ marginTop: 32 }}>
        <h2 id="drift-vague-title">Doc wording is vague</h2>
        {vague.map(item => <ClaimCard key={item.index} item={item} />)}
        {!vague.length && <p>No candidates were marked as vague.</p>}
      </section>
      <details data-testid="drift-not-drift" data-drift-group="not-drift" style={{ marginTop: 32 }}>
        <summary>Second model disagrees ({counts.notDrift})</summary>
        {notDrift.map(item => <ClaimCard key={item.index} item={item} />)}
        {!notDrift.length && <p>No candidates were marked as not drift.</p>}
      </details>
      {unchecked.length > 0 && (
        <section data-testid="drift-unchecked" data-drift-group="unchecked" aria-labelledby="drift-unchecked-title" style={{ marginTop: 32 }}>
          <h2 id="drift-unchecked-title">Not second-checked</h2>
          {unchecked.map(item => <ClaimCard key={item.index} item={item} />)}
        </section>
      )}
    </>
  );
}
