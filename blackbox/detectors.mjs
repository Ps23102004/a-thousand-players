// All pixels are screenshot samples downscaled to 64x36 RGBA. No browser/game state.
const SIZE = 64 * 36 * 4;
const STILL = 0.0001;

// Browser capability refusals are environment evidence, not proof of a game defect.
export function classifyPageError(message) {
  // Missing APIs and broken handlers are still defects even when their names mention a capability.
  if (/\b(?:TypeError|ReferenceError|SyntaxError)\b/i.test(message) && /not a function|undefined|not defined|cannot (?:read|set)|unexpected/i.test(message)) return null;
  const refusal = /refus|denied|not allowed|not valid|requires?|required|fail|permission|user (?:gesture|activation)|not supported|unsupported|not available|unable|blocked|sandbox/i;
  if (/pointer[\s-]*lock/i.test(message) && refusal.test(message)) return 'pointer-lock-refused';
  if (/full[\s-]*screen/i.test(message) && refusal.test(message)) return 'fullscreen-refused';
  if (/user (?:gesture|activation)/i.test(message) && refusal.test(message)) return 'user-gesture-refused';
  if (/\bwebgl\b/i.test(message) && /driver|gpu (?:stall|reset)|software rendering/i.test(message)) return 'webgl-context-warning';
  return null;
}
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
function visualObservation({ frames = [], diffs = [], inputsSent = [], responded = false } = {}) {
  if (frames.some((frame, i) => i > 0 && frame.blank && frames[i - 1].blank)) return { kind: 'blank' };
  let stillIntervals = 0, freeze;
  for (let i = 0; i < diffs.length; i++) {
    if (diffs[i] > STILL) responded = true;
    const nonBlank = !frames[i]?.blank && !frames[i + 1]?.blank;
    stillIntervals = responded && nonBlank && diffs[i] <= STILL && inputsSent[i] > 0 ? stillIntervals + 1 : 0;
    if (stillIntervals >= 2 && !freeze) freeze = { kind: 'freeze', t: frames[i + 1]?.t };
  }
  return freeze ?? { kind: null };
}
export function classifyVisualState(observation = {}) {
  return visualObservation(observation).kind;
}
export function summarize({ frames = [], diffs = [], inputsSent = [], controlDiffs = [], events = [] } = {}) {
  const findings = [], environment = [];
  const environmentKind = e => ['page-error', 'console-error', 'console-warning'].includes(e.kind) ? classifyPageError(e.message) : null;
  for (const e of events) {
    const kind = environmentKind(e);
    if (kind) {
      const existing = environment.find(entry => entry.kind === kind && entry.message === e.message);
      if (existing) existing.count++;
      else environment.push({ ...e, kind, count: 1 });
    } else if (['crash', 'page-error', 'console-error', 'failed-request'].includes(e.kind)) findings.push(e);
  }
  const controls = classifyControlsResponse(controlDiffs);
  const frozen = frozenStreak(diffs, inputsSent);
  const visual = visualObservation({ frames, diffs, inputsSent, responded: controls === 'responsive' });
  if (!findings.some(e => e.kind === 'crash')) {
    if (visual.kind === 'blank') findings.push({ kind: 'blank', message: 'Two consecutive near black/white screenshot samples.' });
    else if (visual.kind === 'freeze') {
      const lastEvent = events.filter(e => Number.isFinite(e.t) && e.t <= visual.t).sort((a, b) => a.t - b.t).at(-1);
      const likelyCause = lastEvent && environmentKind(lastEvent);
      findings.push({ kind: 'freeze', message: 'Previously changing pixels stopped changing for at least two intervals despite inputs.', ...(likelyCause ? { likelyCause } : {}) });
    }
    else if (controls === 'unresponsive') findings.push({ kind: 'deadkeys', message: 'No visible response to initial movement probes; possible unsupported controls or blocked focus.' });
  }
  return { mode: 'blackbox', replayGuaranteed: false, controls, frozenIntervals: frozen, environment, findings };
}
