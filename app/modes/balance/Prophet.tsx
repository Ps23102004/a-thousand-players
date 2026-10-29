"use client";
import { useState } from "react";
import type { ProphetResult } from "@/lib/prophet";
import type { Tuning } from "@/lib/types";

type Result = ProphetResult & { cached: boolean; cachedNotice?: string };
const pct = (n: number) => `${(100 * n).toFixed(1)}%`;

export default function Prophet({ tuning }: { tuning: Tuning }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setBusy(true); setResult(null); setError(null);
    try {
      const response = await fetch("/api/prophet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tuning }) });
      const body = await response.json();
      if (!response.ok) setError(body.error ?? "The crowd could not finish. Try again later.");
      else setResult(body);
    } catch { setError("The crowd request failed. Try again later."); }
    finally { setBusy(false); }
  }
  return (
    <section aria-label="Patch Prophet results" style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: "1.2rem", marginBottom: 8 }}>Patch Prophet</h2>
      <p>Compare the same recorded personas and round seeds before and after these tuning changes. No additional model call.</p>
      <button className="btn" type="button" disabled={busy} onClick={run} style={{ margin: "12px 0" }}>{busy ? "Running the crowd..." : "Run Patch Prophet"}</button>
      <div aria-live="polite" aria-busy={busy}>
        {busy && <p className="notice">Playing paired crowds on the server. This may take a minute.</p>}
        {error && <p className="notice notice-error" role="alert">{error}</p>}
        {result && <>
          <p className="notice"><strong>{result.cached ? "cached" : "Live CPU run"}</strong> · sample of {result.personas} personas, 1 round each, not the full 1000</p>
          {result.cachedNotice && <p>{result.cachedNotice}</p>}
          <p style={{ margin: "12px 0" }}>Bug rounds: {result.before.bugRounds} before → {result.after.bugRounds} after (a round counts once if any invariant fires, including a crash).</p>
          <div className="table-wrap"><table>
            <caption>Persona win rate against the CPU rival</caption>
            <thead><tr><th>Archetype</th><th className="num">Rounds each</th><th className="num">Before</th><th className="num">After</th><th className="num">Change (pp)</th><th className="num">Bug rounds before → after</th></tr></thead>
            <tbody>{result.before.byArchetype.map((row) => {
              const after = result.after.byArchetype.find((r) => r.archetype === row.archetype)!;
              const delta = 100 * (after.winRate - row.winRate);
              return <tr key={row.archetype}><th scope="row">{row.archetype}</th><td className="num">{row.rounds}</td><td className="num">{pct(row.winRate)}</td><td className="num">{pct(after.winRate)}</td><td className="num">{delta > 0 ? "+" : ""}{delta.toFixed(1)}</td><td className="num">{row.bugRounds} → {after.bugRounds}</td></tr>;
            })}</tbody>
          </table></div>
          <p style={{ color: "var(--muted)", marginTop: 12 }}>Seed {result.seed}. Both sides use the recorded-build rules. This small simulated sample can vary with the seed; it does not measure human preference or prove a fix.</p>
        </>}
      </div>
    </section>
  );
}
