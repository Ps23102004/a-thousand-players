// Hand-built SVG charts (no chart library). Each one has a role="img" label and a data table as its text equivalent.
import type { Summary } from "@/lib/types";

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function KoHeatmap({ heat }: { heat: Summary["koHeat"] }) {
  const { grid, xBins, tBins } = heat;
  const max = Math.max(1, ...grid.flat());
  const total = grid.flat().reduce((a, b) => a + b, 0);
  const cw = 40, ch = 30, left = 46, top = 8;
  const W = left + cw * xBins.length, H = top + ch * tBins.length + 34;
  const tStep = tBins[1] ?? 0;
  const hottest = grid.flatMap((row, ti) => row.map((c, xi) => ({ c, ti, xi }))).sort((a, b) => b.c - a.c)[0];
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Heatmap of ${total} knockouts by arena position and round time. Hottest cell: ${hottest?.c ?? 0} KOs at x ${xBins[hottest?.xi ?? 0]?.toFixed(1)} around ${Math.round((hottest?.ti ?? 0) * tStep)} s.`}>
        {grid.map((row, ti) => row.map((c, xi) => (
          <rect key={`${ti}-${xi}`} x={left + xi * cw + 1} y={top + ti * ch + 1} width={cw - 2} height={ch - 2} rx={2}
            fill={c ? "var(--accent)" : "var(--panel-2)"} fillOpacity={c ? 0.12 + 0.88 * (c / max) : 1} />
        )))}
        {tBins.map((t, ti) => <text key={ti} x={left - 8} y={top + ti * ch + ch / 2 + 3} textAnchor="end">{Math.round(t)}s</text>)}
        <line x1={left + (cw * xBins.length) / 2} x2={left + (cw * xBins.length) / 2} y1={top} y2={top + ch * tBins.length} stroke="var(--muted)" strokeDasharray="2 3" />
        <text x={left} y={H - 14}>left wall</text>
        <text x={left + (cw * xBins.length) / 2} y={H - 14} textAnchor="middle">center</text>
        <text x={W} y={H - 14} textAnchor="end">right wall</text>
        <text x={left + (cw * xBins.length) / 2} y={H - 1} textAnchor="middle">x where the loser fell (player starts left, rival right)</text>
      </svg>
      <figcaption>Where and when rounds end in a knockout. Rows are round time, columns are arena position.</figcaption>
      <details>
        <summary>Data table</summary>
        <div className="table-wrap">
          <table>
            <thead><tr><th>t from</th>{xBins.map((x) => <th key={x} className="num">{x.toFixed(1)}</th>)}</tr></thead>
            <tbody>{grid.map((row, ti) => <tr key={ti}><td className="num">{Math.round(tBins[ti])}s</td>{row.map((c, xi) => <td key={xi} className="num">{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

export function QuitFunnel({ curve, reasons }: { curve: Summary["quitCurve"]; reasons: Summary["quitReasons"] }) {
  const bw = 72, gap = 16, H = 170, top = 20;
  const W = curve.length * (bw + gap);
  return (
    <figure>
      <svg viewBox={`0 0 ${Math.max(W, 1)} ${H + 26}`} role="img" aria-label={`Engagement funnel: ${curve.map((c) => `${pct(c.remaining)} played round ${c.round}`).join(", ")}.`}>
        {curve.map((c, i) => {
          const h = c.remaining * (H - top);
          return (
            <g key={c.round}>
              <rect x={i * (bw + gap)} y={top} width={bw} height={H - top} fill="var(--panel-2)" rx={2} />
              <rect x={i * (bw + gap)} y={H - h} width={bw} height={h} fill="var(--accent)" rx={2} />
              <text x={i * (bw + gap) + bw / 2} y={H - h - 6} textAnchor="middle" style={{ fill: "var(--text)", fontSize: 13 }}>{pct(c.remaining)}</text>
              <text x={i * (bw + gap) + bw / 2} y={H + 16} textAnchor="middle">round {c.round}</text>
            </g>
          );
        })}
      </svg>
      <figcaption>
        Share of players who started each round. Session ends: {Object.entries(reasons).map(([k, v]) => `${k} ${v}`).join(", ")}.
      </figcaption>
    </figure>
  );
}

export function ArchetypeBars({ by }: { by: Summary["byArchetype"] }) {
  const rows = Object.entries(by).sort((a, b) => b[1].winRate - a[1].winRate);
  const left = 92, bw = 220, rh = 34;
  const H = rows.length * rh + 24;
  return (
    <figure>
      <svg viewBox={`0 0 ${left + bw + 60} ${H}`} role="img" aria-label={`Win and quit rate by archetype: ${rows.map(([a, s]) => `${a} wins ${pct(s.winRate)}, quits ${pct(s.quitRate)}`).join("; ")}.`}>
        {rows.map(([a, s], i) => (
          <g key={a} transform={`translate(0 ${i * rh})`}>
            <text x={left - 8} y={14} textAnchor="end" style={{ fill: "var(--text)", fontSize: 11 }}>{a}</text>
            <rect x={left} y={4} width={bw} height={10} fill="var(--panel-2)" />
            <rect x={left} y={4} width={bw * s.winRate} height={10} fill="var(--accent)" />
            <text x={left + bw + 6} y={13}>{pct(s.winRate)}</text>
            <rect x={left} y={16} width={bw} height={6} fill="var(--panel-2)" />
            <rect x={left} y={16} width={bw * s.quitRate} height={6} fill="var(--amber)" />
            <text x={left + bw + 6} y={23}>{pct(s.quitRate)}</text>
          </g>
        ))}
        <g transform={`translate(${left} ${H - 6})`}>
          <rect width={10} height={8} y={-7} fill="var(--accent)" /><text x={14}>win rate</text>
          <rect x={86} width={10} height={6} y={-6} fill="var(--amber)" /><text x={100}>quit rate (bored or frustrated)</text>
        </g>
      </svg>
      <figcaption>Each archetype is a family of synthetic personas with its own decision table.</figcaption>
      <details>
        <summary>Data table</summary>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Archetype</th><th className="num">Players</th><th className="num">Rounds</th><th className="num">Win</th><th className="num">Quit</th><th className="num">Avg s</th></tr></thead>
            <tbody>{rows.map(([a, s]) => (
              <tr key={a}><td>{a}</td><td className="num">{s.players}</td><td className="num">{s.rounds}</td><td className="num">{pct(s.winRate)}</td><td className="num">{pct(s.quitRate)}</td><td className="num">{s.avgDuration.toFixed(1)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

export function DurationHist({ hist }: { hist: Summary["durationHist"] }) {
  const max = Math.max(1, ...hist.map((b) => b.count));
  const bw = 34, H = 150, top = 16;
  const W = hist.length * bw;
  return (
    <figure>
      <svg viewBox={`0 0 ${Math.max(W, 1)} ${H + 22}`} role="img" aria-label={`Round duration histogram: ${hist.map((b, i) => `${b.bin}${i === hist.length - 1 ? "+" : ""}s ${b.count}`).join(", ")}.`}>
        {hist.map((b, i) => {
          const h = (b.count / max) * (H - top);
          return (
            <g key={b.bin}>
              <rect x={i * bw + 2} y={H - h} width={bw - 4} height={h} fill="var(--rival)" fillOpacity={0.75} rx={1} />
              {b.count > 0 && <text x={i * bw + bw / 2} y={H - h - 4} textAnchor="middle">{b.count}</text>}
              <text x={i * bw + bw / 2} y={H + 14} textAnchor="middle">{b.bin}{i === hist.length - 1 ? "+" : ""}</text>
            </g>
          );
        })}
      </svg>
      <figcaption>Rounds by length in seconds. The last bar also counts every longer round, including timeouts.</figcaption>
    </figure>
  );
}
