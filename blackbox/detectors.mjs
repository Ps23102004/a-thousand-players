// All pixels are screenshot samples downscaled to 64x36 RGBA. No browser/game state.
const SIZE = 64 * 36 * 4;
const STILL = 0.0001;

// Browser capability refusals are environment evidence, not proof of a game defect.
export function classifyPageError(message) {
  // Programming errors must not disappear merely because they name a browser API.
  if (/\b(?:TypeError|ReferenceError|SyntaxError)\b/i.test(message)) return null;
  const policyRefusal = /denied|not allowed|user (?:gesture|activation)|transient activation|permissions? (?:check|policy)|sandbox/i;
  if (/pointer[\s-]*lock/i.test(message) && (policyRefusal.test(message) || /root document of this element is not valid for pointer lock/i.test(message))) return 'pointer-lock-refused';
  if (/full[\s-]*screen/i.test(message) && policyRefusal.test(message)) return 'fullscreen-refused';
  if (/(?:user (?:gesture|activation).*(?:required|requires|denied)|(?:requires|required).*user (?:gesture|activation)|user (?:didn't|did not|hasn't) interact)/i.test(message)) return 'user-gesture-refused';
  if (/permissions[ -]policy/i.test(message) && /blocked|denied|disallow/i.test(message)) return 'permission-policy-refused';
  if (/NotAllowedError:.*(?:permission denied|permission dismissed)/i.test(message)) return 'permission-refused';
  if (/blocked by CORS policy|net::ERR_INTERNET_DISCONNECTED/i.test(message)) return 'network-policy-refused';
  if (/\bwebgl\b/i.test(message) && /gpu stall due to ReadPixels|software rendering/i.test(message) && !/reset|context.?lost/i.test(message)) return 'webgl-context-warning';
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
export function classifyControlsResponse(probeDiffs, expectedControlProbes = 11) {
  if (probeDiffs.some(d => d > STILL)) return 'responsive';
  return probeDiffs.length >= expectedControlProbes ? 'unresponsive' : 'inconclusive';
}
// Frames bound each diff interval. Blank pixels must never establish a freeze streak.
function visualObservation({ frames = [], diffs = [], inputsSent = [], controlDiffs = [], animationEvidence = false, intervalActivity = [], resumedIntervals = [] } = {}) {
  if (frames.some((frame, i) => i > 0 && frame.blank && frames[i - 1].blank && frame.t - frames[i - 1].t >= 5000)) return { kind: 'blank' };
  let stillIntervals = 0, freeze;
  let previouslyChanged = animationEvidence || controlDiffs.some(d => d > STILL);
  for (let i = 0; i < diffs.length; i++) {
    const nonBlank = !frames[i]?.blank && !frames[i + 1]?.blank;
    // A complete unchanged repeat suite remains evidence through adjacent still
    // intervals. Budget-truncated probes do not erase it; any response resets it.
    const controlsStill = intervalActivity[i] === false || (intervalActivity[i] == null && stillIntervals > 0);
    // An interval in which the explorer pressed a start/resume button is the game's own pause screen, not a freeze.
    stillIntervals = previouslyChanged && controlsStill && nonBlank && !resumedIntervals[i] && diffs[i] <= STILL && inputsSent[i] > 0 ? stillIntervals + 1 : 0;
    if (stillIntervals >= 2 && !freeze) freeze = { kind: 'freeze', t: frames[i + 1]?.t };
    if (diffs[i] > STILL) previouslyChanged = true;
  }
  return freeze ?? { kind: null };
}
export function classifyVisualState(observation = {}) {
  return visualObservation(observation).kind;
}
export function summarize({ frames = [], diffs = [], inputsSent = [], controlDiffs = [], animationEvidence = false, intervalActivity = [], resumedIntervals = [], expectedControlProbes = 11, events = [], started = true } = {}) {
  const findings = [], environment = [];
  const environmentKind = e => ['page-error', 'console-error', 'console-warning'].includes(e.kind) ? classifyPageError(e.message) : null;
  const notes = new Set(['resume-click', 'input-error', 'dialog', 'dialog-error', 'popup', 'popup-error', 'download', 'download-error', 'navigation-away', 'deadline-exceeded', 'budget-exhausted', 'report-write-error']);
  const noise = new Map();
  for (const e of events) {
    const kind = notes.has(e.kind) ? e.kind : environmentKind(e);
    if (kind) {
      const existing = environment.find(entry => entry.kind === kind && entry.message === e.message && entry.url === e.url);
      if (existing) existing.count++;
      else environment.push({ ...e, kind, count: 1 });
    } else if (['crash', 'page-error'].includes(e.kind)) findings.push(e);
    else if (['console-error', 'console-warning', 'failed-request'].includes(e.kind)) {
      const key = JSON.stringify([e.kind, e.url, e.message]);
      const existing = noise.get(key);
      if (existing) existing.count++;
      else noise.set(key, { ...e, count: 1 });
    }
  }
  for (const e of noise.values()) {
    const critical = e.kind === 'failed-request'
      ? ['script', 'document', 'wasm', 'json'].includes(e.resourceType) || /\.(?:js|mjs|wasm|json)(?:[?#]|$)/i.test(e.url ?? '')
      : e.kind === 'console-error' && /webgl|context|initializ(?:ation|e|ing)/i.test(e.message ?? '');
    if (e.count >= 2 || critical) findings.push({ ...e, ...(e.count === 1 ? { confidence: 'low' } : {}) });
  }
  // Uncontrolled idle animation prevents attributing screenshot changes to inputs.
  let controls = animationEvidence ? 'inconclusive' : classifyControlsResponse(controlDiffs, expectedControlProbes);
  // No start click, no idle animation and no pixel change at all: the page never visibly started (for example a level menu
  // the explorer cannot operate). Dead controls cannot be told apart from that, so say so instead of reporting deadkeys.
  if (controls === 'unresponsive' && !started) {
    controls = 'inconclusive';
    environment.push({ kind: 'not-started', message: 'The page never changed and no start control was recognised; the game may be waiting on a menu the explorer cannot operate.', count: 1 });
  }
  if (resumedIntervals.some(Boolean)) environment.push({ kind: 'self-paused', message: 'The game showed a start/resume screen during the run; the explorer pressed it. Still frames in those intervals are not counted as a freeze.', count: resumedIntervals.filter(Boolean).length });
  const frozen = frozenStreak(diffs, inputsSent);
  const visual = visualObservation({ frames, diffs, inputsSent, controlDiffs, animationEvidence, intervalActivity, resumedIntervals });
  if (!findings.some(e => e.kind === 'crash')) {
    if (visual.kind === 'blank') findings.push({ kind: 'blank', message: 'Two consecutive near black/white screenshot samples.' });
    else if (visual.kind === 'freeze') {
      const lastEvent = events.filter(e => Number.isFinite(e.t) && e.t <= visual.t).sort((a, b) => a.t - b.t).at(-1);
      const likelyCause = lastEvent && environmentKind(lastEvent);
      findings.push({ kind: 'freeze', message: 'Previously changing pixels stopped changing for at least two intervals despite inputs.', ...(likelyCause ? { likelyCause } : {}) });
    }
    else if (controls === 'unresponsive') findings.push({ kind: 'deadkeys', message: 'No visible response to initial movement probes; possible unsupported controls or blocked focus.' });
  }
  const freezeAssessment = visual.kind === 'freeze' ? 'suspected'
    : controlDiffs.length < expectedControlProbes || diffs.some((d, i) => d <= STILL && inputsSent[i] > 0 && intervalActivity[i] == null)
      ? 'inconclusive' : 'not-observed';
  return { mode: 'blackbox', replayGuaranteed: false, controls, freezeAssessment, frozenIntervals: frozen, environment, findings };
}
