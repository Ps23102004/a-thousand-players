"use client";
import { useState } from "react";
import type { Precedent } from "@/ai/precedent";

/** "Find precedent": one live Tavily search for developer writeups of a bug like this oracle's. */
export default function PrecedentButton({ description }: { description: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Precedent[] | null>(null);

  async function find() {
    setBusy(true); setError(null); setResults(null);
    try {
      const res = await fetch("/api/precedent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: description.slice(0, 300) }) });
      const body = await res.json().catch(() => ({ error: `Unexpected response (HTTP ${res.status}).` }));
      if (!res.ok) setError(`${body.error ?? "Request failed."} (HTTP ${res.status})`);
      else setResults(body.results as Precedent[]);
    } catch {
      setError("Network error. Is the server running?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div aria-live="polite">
      <button className="chip" type="button" onClick={find} disabled={busy} style={{ cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1 }}>
        {busy ? "Searching developer sites..." : "Find precedent (Tavily)"}
      </button>
      {error && <p className="notice notice-error" style={{ marginTop: 12 }}>{error}</p>}
      {results && (results.length ? (
        <ul className="precedent" style={{ marginTop: 12 }}>
          {results.map((p) => <li key={p.url + p.title}><a href={p.url} target="_blank" rel="noopener noreferrer">{p.title}</a><span>{p.snippet}</span></li>)}
        </ul>
      ) : <p className="notice" style={{ marginTop: 12 }}>No developer writeup found for this bug.</p>)}
    </div>
  );
}
