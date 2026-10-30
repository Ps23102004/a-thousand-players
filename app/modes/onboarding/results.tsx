import type { TutorResults } from '../../../ai/tutor';
import type { TutorReplicationResults } from '../../../ai/tutor-replication';

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const formatDiff = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;

export function TutorContent({
  data,
  replication,
}: {
  data: TutorResults;
  replication?: TutorReplicationResults;
}) {
  const isRepPlaceholder = !replication || replication.placeholder;

  return (
    <section className="section wrap" aria-labelledby="tutor-title" style={{ overflowWrap: 'anywhere' }}>
      <div className="kicker">Mode · Tutorial Director</div>
      <h1 id="tutor-title">Where do new players struggle?</h1>
      <p className="lede">
        Recorded synthetic players suggest where to draft onboarding aids. Paired simulations measure tuning changes, not whether the text teaches.
      </p>
      <p className="notice">
        Round 1 only, 200 personas; the quit/frustration model is NOT re-simulated; an aid that raises casual win rate may still not teach anything; real new players are not involved. One seed, not replicated: differences of a few wins out of 200 are within noise.
      </p>
      <h2>Recorded struggle table</h2>
      <p>
        Win rate is wins per recorded round. Quit rate is sessions ending from synthetic frustration or boredom per player. Round 2 duration is the median among players who reached it.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Archetype</th>
              <th>Players</th>
              <th>Rounds</th>
              <th>Win rate</th>
              <th>Quit rate</th>
              <th>Round 2 median</th>
            </tr>
          </thead>
          <tbody>
            {data.struggleTable.map((row) => (
              <tr key={row.archetype}>
                <th scope="row">{row.archetype}</th>
                <td>{row.players}</td>
                <td>{row.rounds}</td>
                <td>{pct(row.winRate)} ({row.wins}/{row.rounds})</td>
                <td>{pct(row.quitRate)} ({row.quits}/{row.players})</td>
                <td>{row.medianRound2Seconds === null ? '—' : `${row.medianRound2Seconds.toFixed(2)} s (n=${row.round2Count})`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.placeholder ? (
        <div className="panel" data-testid="tutor-placeholder">
          <h2>Not run yet</h2>
          <p>No measured aids have been recorded.</p>
        </div>
      ) : (
        <div data-testid="tutor-results">
          <h2>Measured proposals</h2>
          <p>
            {data.source === 'model'
              ? 'Recorded offline model proposal.'
              : 'Imported proposal: provenance is not checked; it may be a fake fixture.'}{' '}
            Ranked by casual win-rate change. Proposed text and rationale are not verified as teaching effective skills.
          </p>
          {data.aids.length === 0 && <p>No proposals passed validation; no comparison was run.</p>}
          {data.aids.map(({ aid, measurement }, i) => {
            const rep = !isRepPlaceholder
              ? replication?.aids?.find((r) => r.aidTitle === aid.title)
              : undefined;

            return (
              <article className="panel" key={i}>
                <h3>{aid.title}</h3>
                <p><strong>Player-facing text:</strong> {aid.playerFacingText}</p>
                <p><strong>Proposed rationale ({aid.archetype}):</strong> {aid.rationale}</p>
                <p><strong>Overrides:</strong> {Object.entries(aid.tuningOverrides).map(([k, v]) => `${k}: ${v}`).join(', ')}</p>
                <p>
                  {measurement.personas} personas, {measurement.roundsEach} round each, seed {measurement.seed}; wall time {(measurement.wallMs / 1000).toFixed(2)} s. Bug rounds: {measurement.before.bugRounds} → {measurement.after.bugRounds}.
                </p>
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Archetype</th>
                        <th>Before</th>
                        <th>After</th>
                        <th>Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {measurement.before.byArchetype.map((b) => {
                        const a = measurement.after.byArchetype.find((x) => x.archetype === b.archetype);
                        return (
                          <tr key={b.archetype}>
                            <th scope="row">{b.archetype}</th>
                            <td>{pct(b.winRate)} ({b.wins}/{b.rounds})</td>
                            <td>{a ? `${pct(a.winRate)} (${a.wins}/${a.rounds})` : '—'}</td>
                            <td>{a ? `${((a.winRate - b.winRate) * 100).toFixed(1)} percentage points` : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border, #333)' }}>
                  <h4>Replication (seeds 1–8)</h4>
                  <p className="notice" style={{ fontSize: '0.85em' }}>
                    Honest caveat: still round 1 only, quit model not re-simulated, no real new players.
                  </p>
                  {isRepPlaceholder ? (
                    <p data-testid="replication-not-run"><strong>Replication:</strong> not run yet.</p>
                  ) : rep ? (
                    <div style={{ overflowX: 'auto' }}>
                      <table data-testid="aid-replication-table">
                        <thead>
                          <tr>
                            <th>Mean paired difference</th>
                            <th>95% Interval (t-based)</th>
                            <th>Seeds (improved / tied / worsened)</th>
                            <th>Verdict</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>{formatDiff(rep.meanDiff)} wins</td>
                            <td>[{formatDiff(rep.interval.lower)}, {formatDiff(rep.interval.upper)}]</td>
                            <td>{rep.signSummary} ({rep.improved} improved, {rep.tied} tied, {rep.worsened} worsened)</td>
                            <td><strong>{rep.verdict}</strong></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p>No replication data for this aid.</p>
                  )}
                </div>
              </article>
            );
          })}

          <div style={{ marginTop: '2rem' }}>
            <h2>Replication across seeds 1–8</h2>
            {isRepPlaceholder ? (
              <div className="panel" data-testid="replication-placeholder-panel">
                <p><strong>Replication:</strong> not run yet.</p>
                <p className="notice" style={{ fontSize: '0.85em' }}>
                  Honest caveat: still round 1 only, quit model not re-simulated, no real new players.
                </p>
              </div>
            ) : (
              <div className="panel" data-testid="replication-summary-panel">
                <p>
                  Replication across {replication?.seeds?.length ?? 8} seeds
                  {replication?.wallMs ? ` (wall time: ${(replication.wallMs / 1000).toFixed(2)} s)` : ''}.
                </p>
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Aid</th>
                        <th>Mean paired difference</th>
                        <th>95% Interval (t-based)</th>
                        <th>Seeds (improved / tied / worsened)</th>
                        <th>Verdict</th>
                      </tr>
                    </thead>
                    <tbody>
                      {replication?.aids?.map((r) => (
                        <tr key={r.aidTitle}>
                          <th scope="row">{r.aidTitle}</th>
                          <td>{formatDiff(r.meanDiff)} wins</td>
                          <td>[{formatDiff(r.interval.lower)}, {formatDiff(r.interval.upper)}]</td>
                          <td>{r.signSummary}</td>
                          <td><strong>{r.verdict}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="notice" style={{ fontSize: '0.85em', marginTop: '0.75rem' }}>
                  Honest caveat: still round 1 only, quit model not re-simulated, no real new players.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
