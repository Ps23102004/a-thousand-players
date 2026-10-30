import type { ReproResults, MultiArmReproResults, ReproArmResult } from '../../../ai/reprobot';
import defaultRareResults from '../../../data/reprobot/results.json';
import defaultCommonResults from '../../../data/reprobot/results-common.json';

function armLabel(build: string): string {
  if (build === 'recorded') return 'recorded build';
  if (build === 'shipped') return 'shipped build';
  if (build === 'scripted' || build === 'control') return 'scripted control';
  return build;
}

function renderArmSection(multi: MultiArmReproResults, reportKind: 'rare' | 'common') {
  const isCommon = reportKind === 'common';
  const heading = isCommon ? 'Common report' : 'Rare report';
  const description = multi.oracleDescription || (multi.oracle && typeof multi.oracle === 'string' ? multi.oracle : undefined) || (isCommon
    ? 'The player is knocked down at least once in the first 30 seconds.'
    : 'The player floats upward while blocking after being released by the rival near the wall, then flies out of bounds.');

  if (multi.placeholder) {
    return (
      <div key={reportKind} style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: '1.2rem', margin: '16px 0 8px' }}>{heading}</h3>
        <p style={{ color: 'var(--muted, #888)', fontStyle: 'italic', margin: '4px 0 12px' }}>
          &ldquo;{description}&rdquo;
        </p>
        <p>Not run yet. Fresh-play results will appear here after the offline experiment.</p>
      </div>
    );
  }

  const modelName = multi.model || multi.chooser || 'local';
  const totalCalls = multi.totals?.calls ?? multi.arms.reduce((n, a) => n + a.calls, 0);
  const totalFallbacks = multi.totals?.fallbacks ?? multi.arms.reduce((n, a) => n + a.fallbacks, 0);

  const fallbackSummary = multi.arms
    .filter(a => a.calls > 0)
    .map(a => `${armLabel(a.build)} ${a.fallbacks} of ${a.calls} calls (${Math.round((a.fallbacks / a.calls) * 100)}%)`)
    .join(', ');

  return (
    <div key={reportKind} style={{ marginTop: 24 }}>
      <h3 style={{ fontSize: '1.2rem', margin: '16px 0 8px' }}>{heading}</h3>
      <p style={{ color: 'var(--muted, #888)', fontStyle: 'italic', margin: '4px 0 12px' }}>
        &ldquo;{description}&rdquo;
      </p>
      <p style={{ margin: '8px 0 16px' }}>
        <strong>Chooser model:</strong> {modelName}
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', margin: '16px 0' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border, #333)', textAlign: 'left' }}>
            <th style={{ padding: '8px 12px' }}>Arm</th>
            <th style={{ padding: '8px 12px' }}>Reproduced</th>
            <th style={{ padding: '8px 12px' }}>Calls</th>
            <th style={{ padding: '8px 12px' }}>Fallbacks</th>
          </tr>
        </thead>
        <tbody>
          {multi.arms.map((arm: ReproArmResult) => (
            <tr key={arm.build} style={{ borderBottom: '1px solid var(--border-subtle, #222)' }}>
              <td style={{ padding: '8px 12px' }}>{armLabel(arm.build)}</td>
              <td style={{ padding: '8px 12px' }}>{arm.reproduced} of {arm.completed}</td>
              <td style={{ padding: '8px 12px' }}>{arm.calls}</td>
              <td style={{ padding: '8px 12px' }}>
                {arm.fallbacks}{arm.calls > 0 ? ` (${Math.round((arm.fallbacks / arm.calls) * 100)}%)` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {fallbackSummary && (
        <p style={{ margin: '8px 0' }}>
          <strong>Fallback rates:</strong> {fallbackSummary}.
        </p>
      )}

      {isCommon ? (
        <p style={{ marginTop: 16 }}>
          Tested with a local small model ({modelName}), not Nemotron, across {multi.requestedRounds} fresh seeds; this is one report, one run, not a success rate.
          What the arms mean: the shipped and recorded builds should reproduce at similar rates because it is not a bug.
          The scripted control arm provides a baseline without model calls.
        </p>
      ) : (
        <p style={{ marginTop: 16 }}>
          Tested with a local small model ({modelName}), not Nemotron, across {multi.requestedRounds} fresh seeds for one bug report; this is one report, one run, not a success rate.
          The shipped-build arm tests the current game where the bug is fixed, so a fixed bug should reproduce 0 times.
          Base rate: that bug is rare (4 of 2,831 rounds; about 2.8% chance of one hit in 20 rounds, so 0 of 20 shows nothing).
        </p>
      )}

      {multi.aborted && (
        <p style={{ color: '#ff6b6b' }}>
          Run aborted cleanly: {multi.abortReason || 'fallbacks exceeded 30% after 40 calls'}.
        </p>
      )}
      {totalCalls > 0 && totalFallbacks / totalCalls >= 0.25 && !multi.aborted && (
        <p>High fallback rate: failed model responses led to wait actions, so this run may not represent a functioning player.</p>
      )}
    </div>
  );
}

export function FreshPlay({ results, commonResults }: { results?: ReproResults; commonResults?: ReproResults }) {
  // If old shape is passed directly, render old shape block
  if (results && !('arms' in results) && 'rounds' in results) {
    if (results.placeholder) {
      return (
        <section aria-labelledby="fresh-play-title" style={{ marginTop: 40 }}>
          <h2 id="fresh-play-title">Fresh-play experiment</h2>
          <p>Not yet run. Fresh-play results will appear here after the offline experiment.</p>
        </section>
      );
    }
    const rounds = (results as any).rounds || [];
    const completed = rounds.filter((r: any) => r.completed);
    const reproduced = completed.filter((r: any) => r.matched).length;
    const totals = (results as any).totals || { nanoCalls: 0, cacheHits: 0, fallbacks: 0 };
    const requestedRounds = results.requestedRounds ?? 20;
    const model = (results as any).model;

    return (
      <section aria-labelledby="fresh-play-title" style={{ marginTop: 40 }}>
        <h2 id="fresh-play-title">Fresh-play experiment</h2>
        <p>{reproduced} of {completed.length} completed fresh rounds reproduced the report with a {model === 'nano' ? 'Nano-driven' : 'fake-model'} player; {requestedRounds} rounds planned; this is one report, one run, not a success rate.</p>
        <p>Seeds played: {rounds.map((r: any) => `${r.seed}${r.matched ? ' (matched)' : r.completed ? '' : ' (incomplete)'}`).join(', ') || 'none'}.</p>
        <p>{totals.nanoCalls} model calls, {totals.cacheHits} cache hits, {totals.fallbacks} wait fallbacks.{(results as any).budgetHit ? ` Call budget reached after ${rounds.length} of ${requestedRounds} planned rounds: inconclusive, too few rounds to say how often a Nano player reproduces this report.` : ''}</p>
        {totals.nanoCalls > 0 && totals.fallbacks / totals.nanoCalls >= 0.25 && <p>High fallback rate: failed model responses led to wait actions, so this run may not represent a functioning player.</p>}
      </section>
    );
  }

  // If a simple placeholder object is passed
  if (results && results.placeholder && !('arms' in results)) {
    return (
      <section aria-labelledby="fresh-play-title" style={{ marginTop: 40 }}>
        <h2 id="fresh-play-title">Fresh-play experiment</h2>
        <p>Not yet run. Fresh-play results will appear here after the offline experiment.</p>
      </section>
    );
  }

  let rareData: ReproResults = (defaultRareResults as unknown) as ReproResults;
  let commonData: ReproResults = (commonResults ?? (defaultCommonResults as unknown)) as ReproResults;

  if (results) {
    if ((results as any).report === 'common') {
      commonData = results;
    } else {
      rareData = results;
    }
  }

  return (
    <section aria-labelledby="fresh-play-title" style={{ marginTop: 40 }}>
      <h2 id="fresh-play-title">Fresh-play experiment</h2>
      {renderArmSection(rareData as MultiArmReproResults, 'rare')}
      {renderArmSection(commonData as MultiArmReproResults, 'common')}
    </section>
  );
}
