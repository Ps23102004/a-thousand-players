import type { TutorResults } from '../../../ai/tutor';
const pct = (n:number) => `${(n*100).toFixed(1)}%`;
export function TutorContent({data}:{data:TutorResults}) {
  return <section className="section wrap" aria-labelledby="tutor-title" style={{overflowWrap:'anywhere'}}>
    <div className="kicker">Mode · Tutorial Director</div>
    <h1 id="tutor-title">Where do new players struggle?</h1>
    <p className="lede">Recorded synthetic players suggest where to draft onboarding aids. Paired simulations measure tuning changes, not whether the text teaches.</p>
    <p className="notice">Round 1 only, 200 personas; the quit/frustration model is NOT re-simulated; an aid that raises casual win rate may still not teach anything; real new players are not involved.</p>
    <h2>Recorded struggle table</h2>
    <p>Win rate is wins per recorded round. Quit rate is sessions ending from synthetic frustration or boredom per player. Round 2 duration is the median among players who reached it.</p>
    <div style={{overflowX:'auto'}}><table><thead><tr><th>Archetype</th><th>Players</th><th>Rounds</th><th>Win rate</th><th>Quit rate</th><th>Round 2 median</th></tr></thead><tbody>{data.struggleTable.map(row=><tr key={row.archetype}><th scope="row">{row.archetype}</th><td>{row.players}</td><td>{row.rounds}</td><td>{pct(row.winRate)} ({row.wins}/{row.rounds})</td><td>{pct(row.quitRate)} ({row.quits}/{row.players})</td><td>{row.medianRound2Seconds === null ? '—' : `${row.medianRound2Seconds.toFixed(2)} s (n=${row.round2Count})`}</td></tr>)}</tbody></table></div>
    {data.placeholder ? <div className="panel" data-testid="tutor-placeholder"><h2>Not run yet</h2><p>No measured aids have been recorded.</p></div> : <div data-testid="tutor-results">
      <h2>Measured proposals</h2><p>{data.source === 'model' ? 'Recorded offline model proposal.' : 'Imported proposal: provenance is not checked; it may be a fake fixture.'} Ranked by casual win-rate change. Proposed text and rationale are not verified as teaching effective skills.</p>
      {data.aids.length === 0 && <p>No proposals passed validation; no comparison was run.</p>}
      {data.aids.map(({aid,measurement},i)=><article className="panel" key={i}><h3>{aid.title}</h3><p><strong>Player-facing text:</strong> {aid.playerFacingText}</p><p><strong>Proposed rationale ({aid.archetype}):</strong> {aid.rationale}</p><p><strong>Overrides:</strong> {Object.entries(aid.tuningOverrides).map(([k,v])=>`${k}: ${v}`).join(', ')}</p>
        <p>{measurement.personas} personas, {measurement.roundsEach} round each, seed {measurement.seed}; wall time {(measurement.wallMs/1000).toFixed(2)} s. Bug rounds: {measurement.before.bugRounds} → {measurement.after.bugRounds}.</p>
        <div style={{overflowX:'auto'}}><table><thead><tr><th>Archetype</th><th>Before</th><th>After</th><th>Change</th></tr></thead><tbody>{measurement.before.byArchetype.map(b=>{const a=measurement.after.byArchetype.find(x=>x.archetype===b.archetype); return <tr key={b.archetype}><th scope="row">{b.archetype}</th><td>{pct(b.winRate)} ({b.wins}/{b.rounds})</td><td>{a ? `${pct(a.winRate)} (${a.wins}/${a.rounds})` : '—'}</td><td>{a ? `${((a.winRate-b.winRate)*100).toFixed(1)} percentage points` : '—'}</td></tr>;})}</tbody></table></div>
      </article>)}
    </div>}
  </section>;
}
