import type { ReproResults } from '../../../ai/reprobot';

export function FreshPlay({ results }: { results: ReproResults }) {
  const completed = results.rounds.filter(r => r.completed);
  const reproduced = completed.filter(r => r.matched).length;
  return <section aria-labelledby="fresh-play-title" style={{ marginTop: 40 }}>
    <h2 id="fresh-play-title">Fresh-play experiment</h2>
    {results.placeholder ? <p>Not yet run. Fresh-play results will appear here after the offline experiment.</p> : <>
      <p>{reproduced} of {completed.length} completed fresh rounds reproduced the report with a {results.model === 'nano' ? 'Nano-driven' : 'fake-model'} player; {results.requestedRounds} rounds planned; this is one report, one run, not a success rate.</p>
      <p>Seeds played: {results.rounds.map(r => `${r.seed}${r.matched ? ' (matched)' : r.completed ? '' : ' (incomplete)'}`).join(', ') || 'none'}.</p>
      <p>{results.totals.nanoCalls} model calls, {results.totals.cacheHits} cache hits, {results.totals.fallbacks} wait fallbacks.{results.budgetHit ? ` Call budget reached after ${results.rounds.length} of ${results.requestedRounds} planned rounds: inconclusive, too few rounds to say how often a Nano player reproduces this report.` : ''}</p>
      {results.totals.nanoCalls > 0 && results.totals.fallbacks / results.totals.nanoCalls >= 0.25 && <p>High fallback rate: failed model responses led to wait actions, so this run may not represent a functioning player.</p>}
    </>}
  </section>;
}
