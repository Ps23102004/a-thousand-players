// All pixels are screenshot samples downscaled to 64x36 RGBA. No browser/game state.
const SIZE = 64 * 36 * 4;
const STILL = 0.0001;
function validate(frame) {
  if (!(frame instanceof Uint8Array || frame instanceof Uint8ClampedArray) || frame.length !== SIZE) {
    throw new TypeError('Expected a 64x36 RGBA byte buffer');
  }
}
export function frameDiff(a, b) {
  validate(a); validate(b);
  let delta = 0;
  for (let i = 0; i < SIZE; i += 4) for (let c = 0; c < 3; c++) delta += Math.abs(a[i + c] - b[i + c]);
  return delta / (64 * 36 * 3 * 255);
}
export function isBlank(frame) {
  validate(frame);
  let dark = 0, light = 0;
  for (let i = 0; i < SIZE; i += 4) {
    if (Math.max(frame[i], frame[i + 1], frame[i + 2]) <= 8) dark++;
    if (Math.min(frame[i], frame[i + 1], frame[i + 2]) >= 247) light++;
  }
  return Math.max(dark, light) / (64 * 36) >= 0.995;
}
// Number of trailing still sample intervals that each had delivered inputs.
export function frozenStreak(diffs, inputsSent) {
  let streak = 0;
  for (let i = diffs.length - 1; i >= 0 && diffs[i] <= STILL && inputsSent[i] > 0; i--) streak++;
  return streak;
}
export function classifyControlsResponse(probeDiffs) {
  if (probeDiffs.some(d => d > STILL)) return 'responsive';
  return probeDiffs.length >= 4 ? 'unresponsive' : 'inconclusive';
}
// Frames bound each diff interval. Blank pixels must never establish a freeze streak.
export function classifyVisualState({ frames = [], diffs = [], inputsSent = [], responded = false } = {}) {
  if (frames.some((frame, i) => i > 0 && frame.blank && frames[i - 1].blank)) return 'blank';
  let stillIntervals = 0, observedFreeze = false;
  for (let i = 0; i < diffs.length; i++) {
    if (diffs[i] > STILL) responded = true;
    const nonBlank = !frames[i]?.blank && !frames[i + 1]?.blank;
    stillIntervals = responded && nonBlank && diffs[i] <= STILL && inputsSent[i] > 0 ? stillIntervals + 1 : 0;
    if (stillIntervals >= 2) observedFreeze = true;
  }
  return observedFreeze ? 'freeze' : null;
}
export function summarize({ frames = [], diffs = [], inputsSent = [], controlDiffs = [], events = [] } = {}) {
  const findings = events.filter(e => ['crash', 'page-error', 'console-error', 'failed-request'].includes(e.kind));
  const controls = classifyControlsResponse(controlDiffs);
  const frozen = frozenStreak(diffs, inputsSent);
  const visual = classifyVisualState({ frames, diffs, inputsSent, responded: controls === 'responsive' });
  if (!findings.some(e => e.kind === 'crash')) {
    if (visual === 'blank') findings.push({ kind: 'blank', message: 'Two consecutive near black/white screenshot samples.' });
    else if (visual === 'freeze') findings.push({ kind: 'freeze', message: 'Previously changing pixels stopped changing for at least two intervals despite inputs.' });
    else if (controls === 'unresponsive') findings.push({ kind: 'deadkeys', message: 'No visible response to initial movement probes; possible unsupported controls or blocked focus.' });
  }
  return { mode: 'blackbox', replayGuaranteed: false, controls, frozenIntervals: frozen, findings };
}
