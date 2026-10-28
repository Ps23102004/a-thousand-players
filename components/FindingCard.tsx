import type { Claim, Finding } from "@/lib/types";
import { getData, replayHref } from "@/lib/data";

const METRIC: Record<Claim["metric"], string> = {
  winRate: "win rate", quitRate: "quit rate", avgDuration: "avg round", koShare: "KO share", meanHpLoss: "mean hp loss",
};
const fmt = (c: Claim, v: number) => (c.metric === "avgDuration" ? `${v.toFixed(1)} s` : c.metric === "meanHpLoss" ? v.toFixed(1) : `${Math.round(v * 100)}%`);
const scope = (c: Claim) => [c.scope.archetype ?? "everyone", c.scope.round ? `round ${c.scope.round}` : ""].filter(Boolean).join(", ");

export default function FindingCard({ f }: { f: Finding }) {
  return (
    <article className="panel finding" aria-labelledby={`${f.id}-title`}>
      <div className="finding-top">
        <span className={`sev sev-${f.severity}`}>{f.severity === "med" ? "medium" : f.severity}</span>
        <span className="chip">{f.kind}</span>
        <span className="chip">confidence {Math.round(f.confidence * 100)}%</span>
      </div>
      <h3 id={`${f.id}-title`}>{f.title}</h3>
      <p>{f.narrative}</p>

      <div>
        <div className="label">Claims</div>
        <ul className="chips" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {f.claims.map((c, i) => {
            const v = f.verified?.find((x) => x.claim.metric === c.metric && JSON.stringify(x.claim.scope) === JSON.stringify(c.scope));
            const text = `${METRIC[c.metric]} ${scope(c)}: ${fmt(c, c.value)}`;
            if (v?.ok) return <li key={i} className="chip chip-ok" title={`Recomputed from the runs: ${fmt(c, v.actual)}`}><span aria-hidden="true">✓</span>{text}<span className="sr-only">, verified by code</span></li>;
            return (
              <li key={i} className="chip chip-warn" title={v ? `Recomputed value ${fmt(c, v.actual)} does not match` : "Not checked against the runs"}>
                <span aria-hidden="true">!</span>{text} <span>{v ? `(actual ${fmt(c, v.actual)})` : "unverified"}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <div className="label">Replay the evidence</div>
        <div className="chips">
          {f.seeds.map((s) => (
            // A seed the runs do not contain was invented by the model: show it, say so, do not link it.
            getData().runs.get(`${s.p}:${s.round}`)?.seed === s.seed ? (
              <a key={`${s.p}-${s.round}`} className="chip" href={replayHref(s.p, s.round)} title={s.why}>
                ▶ seed {s.seed} <span style={{ color: "var(--muted)" }}>{s.p} r{s.round}</span>
              </a>
            ) : (
              <span key={`${s.p}-${s.round}`} className="chip chip-warn" title="This round is not in the recorded runs, so it cannot be replayed.">
                <span aria-hidden="true">!</span> seed {s.seed} <span>{s.p} r{s.round}, not in this run</span>
              </span>
            )
          ))}
        </div>
      </div>

      <div>
        <div className="label">Suggested fix</div>
        <p>{f.suggestion}</p>
      </div>

      {f.precedent && f.precedent.length > 0 && (
        <div>
          <div className="label">Related reading (Tavily web search results, not reviewed)</div>
          <ul className="precedent">
            {f.precedent.map((p) => (
              <li key={p.url + p.title}><a href={p.url} target="_blank" rel="noopener noreferrer">{p.title}</a><span>{p.snippet}</span></li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
