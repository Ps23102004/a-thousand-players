"use client";
import { useState } from "react";

/** Textarea + submit that POSTs {[field]: text} and hands the JSON result to render. Shows API errors as readable notices. */
export default function AiForm<T>({ endpoint, field, label, placeholder, example, cta, render }: {
  endpoint: string; field: string; label: string; placeholder: string; example: string; cta: string; render: (data: T) => React.ReactNode;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<T | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setData(null);
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: text }) });
      const body = await res.json().catch(() => ({ error: `Unexpected response (HTTP ${res.status}).` }));
      if (!res.ok) setError(`${body.error ?? "Request failed."} (HTTP ${res.status})`);
      else setData(body as T);
    } catch {
      setError("Network error. Is the server running?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <form className="panel" onSubmit={submit}>
        <label htmlFor={`${field}-input`}>{label}</label>
        <textarea id={`${field}-input`} rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} maxLength={4000} required />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
          <button className="btn" type="submit" disabled={busy || !text.trim()}>{busy ? "Asking the model..." : cta}</button>
          <button className="btn btn-ghost" type="button" onClick={() => setText(example)}>Use an example</button>
        </div>
      </form>
      <div aria-live="polite">
        {error && <p className="notice notice-error">{error}</p>}
        {data && render(data)}
      </div>
    </div>
  );
}
