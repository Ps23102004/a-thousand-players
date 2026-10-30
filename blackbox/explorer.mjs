import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { frameDiff, isBlank, summarize } from './detectors.mjs';

// One cleanup guard per game page, replaced by its next exploration.
const lateGuards = new WeakMap();

export const CONTROL_KEYS = ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Space', 'Enter'];
export const INPUT_KEYS = ['w', 'a', 's', 'd', 'Space', 'Shift', 'r', 'e', '1', '2', '3', '4', 'Enter', 'Escape', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];
export function isSafeStartLabel(text) {
  text = text.replace(/[-_]+/g, ' ');
  if (/\b(?:trial|premium|deposit|real\s+money|bet|wager|forfeit|abandon|unlock|google|facebook|apple)\b/i.test(text)) return false;
  if (/\b(?:donat\w*|shop\w*|order\w*|start\s+over|close|restart\w*|quit\w*|exit\w*|reset\w*|delet\w*|eras\w*|remov\w*|wip\w*|clear\w*|overwrit\w*|buy\w*|purchas\w*|download\w*|shar\w*|sign\s*in|log\s*in|pay\w*|checkout|subscrib\w*|store|cart|upgrad\w*|install\w*|updat\w*|uninstall\w*)\b/i.test(text)) return false;
  if (/\bnew\s+game\s*(?:\+|plus\b)/i.test(text)) return false;
  return /\b(start|play|new|continue|ok|accept|begin|resume|deploy|retry|launch|enter|go|got\s+it)\b/i.test(text);
}

// Inspect destinations before clicking; script-triggered departures are guarded at input time too.
export function isSafeStartTarget({ href, target, download, formAction, formTarget }, startURL) {
  if (download != null || [target, formTarget].some(value => value && !['_self', '_top', '_parent'].includes(value.toLowerCase()))) return false;
  return [href, formAction].every(value => {
    if (value == null) return true;
    try { const dest = new URL(value, startURL); return /^https?:$/.test(dest.protocol) && dest.origin === new URL(startURL).origin; }
    catch { return false; }
  });
}

function rng(seed) {
  let s = seed >>> 0;
  return () => { s += 0x6D2B79F5; let t = Math.imul(s ^ s >>> 15, 1 | s); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// Choose by visible area and return a viewport-clipped rectangle for screenshots.
export function selectCanvasClip(rects, viewport) {
  let clip = null, largestArea = 0;
  for (const rect of rects) {
    if (!rect.visible || ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) continue;
    const x = Math.max(0, rect.x), y = Math.max(0, rect.y);
    const width = Math.min(viewport.width, rect.x + rect.width) - x;
    const height = Math.min(viewport.height, rect.y + rect.height) - y;
    if (width <= 0 || height <= 0 || width * height <= largestArea) continue;
    clip = { x, y, width, height }; largestArea = width * height;
  }
  return clip;
}

// Decode our own screenshot in an isolated blank page, never the game's JS or canvas state.
// Cropping the largest visible canvas avoids static HUD chrome hiding a blank game frame.
async function screenshotCapture(page, decoder, path, bounded) {
  const rects = await bounded(() => page.locator('canvas').evaluateAll(nodes => nodes.map(node => {
    const r = node.getBoundingClientRect(); const s = getComputedStyle(node);
    return { x: r.x, y: r.y, width: r.width, height: r.height, visible: s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0' };
  })));
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  const clip = selectCanvasClip(rects, viewport);
  const png = await bounded(() => page.screenshot({ path, timeout: 3000, ...(clip ? { clip } : {}) }));
  const bytes = await bounded(() => decoder.evaluate(async ({ base64 }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${base64}`;
    await img.decode();
    const c = document.createElement('canvas'); c.width = 64; c.height = 36;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, 64, 36);
    return Array.from(ctx.getImageData(0, 0, 64, 36).data);
  }, { base64: png.toString('base64') }));
  return { png, pixels: Uint8Array.from(bytes), region: clip ? 'largest-visible-canvas' : 'viewport' };
}

/** Only page UI, screenshots, and browser events. capture/clock injection keeps tests offline. */
export async function explore({ page, url, seconds = 60, seed = 1, out = 'reports/blackbox', capture, now = () => performance.now(), sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isInteger(seed)) throw new TypeError('Invalid seconds or seed');
  lateGuards.get(page)?.();
  const handlerWork = new Set();
  const start = now(), random = rng(seed), inputs = [], events = [], frames = [], diffs = [], inputsSent = [], controlDiffs = [], intervalActivity = [], resumedIntervals = [], startupClicks = [];
  let animationEvidence = false;
  let decoder, crashed = false, keyboardOnly = false, status = 'completed', previous, lastInputCount = 0, lastPeriodicAt = start, imageCount = 0;
  const deadline = start + seconds * 1000;
  let stopped = false, finalized = false, timer, captureGraceTimer, budgetExpired = false;
  const attemptedKeys = new Set();
  let mouseAttempted = false;
  const onStartOrigin = () => !page.isClosed() && (!page.url || new URL(page.url()).origin === startOrigin);
  const deadlineError = new Error('Exploration deadline exceeded');
  // The budget ends exploration, not an in-flight screenshot or input dispatch.
  // A separate 3s stall bound allows those commands to finish and save evidence.
  const cancelled = new Promise((_, reject) => {
    timer = setTimeout(() => {
      budgetExpired = true;
      captureGraceTimer = setTimeout(() => { stopped = true; reject(deadlineError); }, 3000);
    }, seconds * 1000);
  });
  async function bounded(action) {
    if (stopped) throw deadlineError;
    return Promise.race([Promise.resolve().then(action), cancelled]);
  }
  async function pause(ms) {
    await bounded(() => sleep(ms));
  }
  const t = () => Math.round(now() - start);
  const event = (kind, fields) => { if (!finalized) events.push({ t: t(), kind, ...fields }); };
  const crash = message => { if (!crashed) event('crash', { message }); crashed = true; };
  let startURL = url, startOrigin = new URL(url).origin, initialNavigation = true;
  let leftPage = false, restoringNavigation = false, restorationAttempts = 0;
  const fromStartPage = owner => initialNavigation || (onStartOrigin() && (!owner?.url || new URL(owner.url()).origin === startOrigin));
  function requestFromStartPage(req) {
    let frame;
    // Service-worker requests may have no frame; use the current page in that case.
    try { frame = req?.frame?.(); } catch {}
    return fromStartPage(frame);
  }
  const restorationError = new Error('Start origin restoration limit exceeded (2 attempts)');
  async function ensureStartPage() {
    if (crashed) return;
    if (leftPage || (page.url && new URL(page.url()).origin !== startOrigin)) {
      if (restorationAttempts >= 2) throw restorationError;
      restorationAttempts++;
      restoringNavigation = true;
      try { await bounded(() => page.goto(startURL, { waitUntil: 'domcontentloaded', timeout: 15000 })); }
      finally { restoringNavigation = false; }
      if (new URL(page.url()).origin !== startOrigin) return ensureStartPage();
      leftPage = false;
      await startSequence();
    }
  }
  const handlers = {
    popup: async popup => {
      event('popup', { url: popup.url(), action: 'close' });
      try { await popup.close(); if (!stopped) await page.bringToFront?.(); }
      catch (error) { event('popup-error', { message: error.message }); }
    },
    download: async download => {
      event('download', { url: download.url(), action: 'cancel' });
      try { await download.cancel(); }
      catch (error) { event('download-error', { message: error.message }); }
    },
    dialog: async dialog => {
      const action = dialog.type() === 'beforeunload' && restoringNavigation ? 'accept' : 'dismiss';
      event('dialog', { type: dialog.type(), message: dialog.message(), action });
      try { await dialog[action](); }
      catch (error) { event('dialog-error', { message: error.message }); }
    },
    console: msg => {
      if (!fromStartPage(msg.page?.())) return;
      if (msg.type() === 'error') event('console-error', { message: msg.text() });
      else if (msg.type() === 'warning') event('console-warning', { message: msg.text() });
    },
    pageerror: err => event('page-error', { message: err.message }),
    requestfailed: req => {
      if (!requestFromStartPage(req)) return;
      const message = req.failure()?.errorText ?? 'request failed';
      if (restoringNavigation && message === 'net::ERR_ABORTED') return;
      event('failed-request', { url: req.url(), resourceType: req.resourceType?.(), message });
    },
    response: res => {
      const req = res.request?.();
      if (requestFromStartPage(req) && res.status() >= 400) event('failed-request', { url: res.url(), resourceType: req?.resourceType?.(), message: `HTTP ${res.status()}` });
    },
    crash: () => crash('Browser reported a page crash'),
    close: () => crash('Game page closed'),
    framenavigated: frame => {
      if (frame !== page.mainFrame()) return;
      if (frame.url() === 'about:blank') crash('Game navigated to about:blank');
      else if (!initialNavigation && new URL(frame.url()).origin !== startOrigin) {
        leftPage = true; event('navigation-away', { url: frame.url(), action: 'return-to-start' });
      }
    },
  };
  for (const name of ['popup', 'download', 'dialog']) {
    const handle = handlers[name];
    handlers[name] = value => {
      const work = Promise.resolve().then(() => handle(value));
      handlerWork.add(work);
      work.finally(() => handlerWork.delete(work)).catch(() => {});
      return work;
    };
  }
  for (const [name, fn] of Object.entries(handlers)) page.on(name, fn);
  async function send(type, fields, action, recover = false) {
    if (stopped) throw deadlineError;
    await ensureStartPage();
    if (crashed) return;
    const input = { t: t(), type, ...fields, status: 'attempted' }; inputs.push(input);
    if (type === 'keydown') attemptedKeys.add(fields.key);
    if (type === 'mousedown') mouseAttempted = true;
    try {
      await bounded(async () => {
        try { return await action(); }
        finally {
          // A dispatch may settle after the bounded cleanup has returned.
          if (stopped && onStartOrigin()) {
            if (type === 'keydown') await page.keyboard.up(fields.key).catch(() => {});
            if (type === 'mousedown') await page.mouse.up({ button: fields.button }).catch(() => {});
          }
        }
      }); input.status = 'sent';
      return true;
    }
    catch (error) {
      input.status = 'failed'; input.message = error.message;
      if (error === deadlineError || !recover) throw error;
      event('input-error', { type, ...fields, message: error.message });
      return false;
    }
  }
  async function shot(label, periodic = false) {
    await ensureStartPage();
    const file = `frame-${String(imageCount++).padStart(4, '0')}.png`;
    const sampled = await bounded(() => capture(join(out, file)));
    frames.push({ t: t(), file, label, blank: isBlank(sampled.pixels), region: sampled.region ?? 'viewport' });
    // Fakes can return PNG bytes without writing; production screenshot already writes the same file.
    await bounded(() => writeFile(join(out, file), sampled.png));
    if (periodic) {
      const count = inputs.filter(i => i.status === 'sent' && ['keydown', 'mousemove', 'mousedown'].includes(i.type)).length;
      if (previous) { diffs.push(frameDiff(previous, sampled.pixels)); inputsSent.push(count - lastInputCount); intervalActivity.push(null); }
      previous = sampled.pixels; lastInputCount = count; lastPeriodicAt = now();
    }
    return sampled.pixels;
  }
  async function hold(key, ms) {
    const down = await send('keydown', { key }, () => page.keyboard.down(key), true);
    await pause(ms);
    const up = !crashed && await send('keyup', { key }, () => page.keyboard.up(key), true);
    return down && up;
  }
  async function probeControls(before) {
    const responses = [];
    for (const key of [...CONTROL_KEYS, 'mouse']) {
      if (crashed || budgetExpired || now() >= deadline) break;
      let sent;
      if (key === 'mouse') {
        if (keyboardOnly) break;
        const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
        const moved = await send('mousemove', { x: viewport.width / 2, y: viewport.height / 2 }, () => page.mouse.move(viewport.width / 2, viewport.height / 2), true);
        const down = await send('mousedown', { button: 'left' }, () => page.mouse.down({ button: 'left' }), true);
        const up = await send('mouseup', { button: 'left' }, () => page.mouse.up({ button: 'left' }), true);
        sent = moved && down && up;
        await pause(Math.min(180, Math.max(0, deadline - now())));
      } else sent = await hold(key, Math.min(180, deadline - now()));
      if (crashed || now() >= deadline - 5) break;
      const after = await shot(`control-probe:${key}`);
      if (sent) responses.push(frameDiff(before, after));
      before = after;
    }
    return { responses, after: before };
  }
  async function startSequence({ canvasClick = true } = {}) {
    // A bounded number of rounds handles a consent dialog followed by a start menu.
    const clicked = new Set();
    let sentClicks = 0;
    for (let round = 0; round < 3 && !crashed; round++) {
      const buttons = page.locator('button, a[href], [role="button"], [role="link"], input[type="button"], input[type="submit"]');
      let didClick = false;
      for (let i = 0, n = Math.min(await bounded(() => buttons.count()), 100); i < n && !crashed; i++) {
        const button = buttons.nth(i);
        if (!await bounded(() => button.isVisible()) || !await bounded(() => button.isEnabled())) continue;
        const text = (await bounded(() => button.textContent()) || await bounded(() => button.getAttribute('value')) || await bounded(() => button.getAttribute('aria-label')) || '').trim();
        if (!isSafeStartLabel(text) || clicked.has(text)) continue;
        if (button.evaluate && !isSafeStartTarget(await bounded(() => button.evaluate(node => ({
          href: node.href ?? node.getAttribute('href'), target: node.getAttribute('target'), download: node.getAttribute('download'),
          formAction: node.form ? (node.getAttribute('formaction') != null ? node.formAction : node.form.action) : null,
          formTarget: node.getAttribute('formtarget') ?? node.form?.target,
        }))), startURL)) continue;
        const click = { t: t(), text, status: 'attempted' }; startupClicks.push(click);
        clicked.add(text);
        try {
          await send('startup-click', { text }, () => button.click({ timeout: 1500 }));
          click.status = 'sent'; didClick = true; sentClicks++;
          await ensureStartPage();
        } catch (error) {
          if (error === deadlineError || error === restorationError) throw error;
          click.status = 'failed'; event('click-intercepted', { text, message: error.message });
          continue;
        }
        break; // Re-query after menus mutate.
      }
      if (!didClick) break;
    }
    if (!canvasClick) return sentClicks;
    const canvas = page.locator('canvas');
    for (let i = 0, n = await bounded(() => canvas.count()); i < n; i++) {
      if (await bounded(() => canvas.nth(i).isVisible())) {
        const target = canvas.nth(i);
        try {
          await send('canvas-click', {}, () => target.click({ timeout: 1500 }));
        } catch (error) {
          if (error === deadlineError || error === restorationError) throw error;
          event('click-intercepted', { message: error.message });
          try {
            const box = await bounded(() => target.boundingBox({ timeout: 1500 }));
            if (!box) throw new Error('Canvas has no visible bounding box');
            const x = box.x + box.width / 2, y = box.y + box.height / 2;
            await send('canvas-click', { x, y, fallback: true }, () => page.mouse.click(x, y));
          } catch (error) {
            if (error === deadlineError || error === restorationError) throw error;
            keyboardOnly = true;
          }
        }
        break;
      }
    }
  }
  async function run() {
    await bounded(() => mkdir(out, { recursive: true }));
    if (!capture) {
      decoder = await bounded(() => {
        const creation = page.context().newPage();
        // The race cannot cancel newPage: close its eventual result after timeout.
        creation.then(created => { if (stopped) return created.close(); }).catch(() => {});
        return creation;
      });
      capture = path => screenshotCapture(page, decoder, path, bounded);
      await bounded(() => page.bringToFront());
    }
    await bounded(() => page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }));
    startURL = page.url?.() ?? url; startOrigin = new URL(startURL).origin; initialNavigation = false;
    await ensureStartPage();
    await startSequence();
    const initial = await shot('initial', true);
    if (budgetExpired || now() >= deadline - 5) return;
    await pause(Math.min(180, Math.max(0, deadline - now())));
    if (budgetExpired || now() >= deadline - 5) return;
    const idle = await shot('idle-probe');
    animationEvidence = frameDiff(initial, idle) > 0.0001;
    const initialProbes = await probeControls(idle);
    controlDiffs.push(...initialProbes.responses);
    // Recheck idle pixels after input: animation may have started during probes.
    if (!budgetExpired && now() < deadline - 185) {
      await pause(180);
      const afterIdle = await shot('post-control-idle');
      animationEvidence ||= frameDiff(initialProbes.after, afterIdle) > 0.0001;
    }
    let step = 0;
    while (!budgetExpired && now() < deadline - 5 && !crashed) {
      if (page.isClosed()) { crash('Game page closed'); break; }
      if (now() - lastPeriodicAt >= 5000) {
        const pixels = await shot('periodic', true);
        if (diffs.at(-1) <= 0.0001) {
          // A game can pause itself mid-run (e.g. when automated Chrome refuses pointer lock). Press its safe start/resume
          // control again; that interval is then a self-pause, not a freeze.
          const pressed = await startSequence({ canvasClick: false });
          if (pressed) { resumedIntervals[diffs.length - 1] = true; event('resume-click', { message: startupClicks.at(-1)?.text ?? '' }); }
          const { responses } = await probeControls(pixels);
          intervalActivity[intervalActivity.length - 1] = responses.some(d => d > 0.0001) ? true : responses.length === CONTROL_KEYS.length + (keyboardOnly ? 0 : 1) ? false : null;
        }
      }
      if (crashed || budgetExpired || now() >= deadline - 5) break;
      const key = INPUT_KEYS[step++ % INPUT_KEYS.length];
      await hold(key, Math.min(180 + Math.floor(random() * 140), Math.max(0, deadline - now())));
      if (crashed || now() >= deadline - 5) break;
      if (keyboardOnly) continue;
      const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
      const x = Math.floor(random() * viewport.width), y = Math.floor(random() * viewport.height);
      await send('mousemove', { x, y }, () => page.mouse.move(x, y), true);
      if (step % 4 === 0) {
        await send('mousedown', { button: 'left' }, () => page.mouse.down({ button: 'left' }), true);
        await send('mouseup', { button: 'left' }, () => page.mouse.up({ button: 'left' }), true);
      }
    }
    if (!crashed && now() < deadline - 5) await shot('final');
  }
  try {
    // Each awaited operation is bounded; budget expiry stops new exploration.
    await run();
  } catch (error) {
    if (page.isClosed()) crash('Game page closed');
    if (!crashed) {
      status = 'incomplete';
      event(error === deadlineError ? 'deadline-exceeded' : 'explorer-error', { message: error.message });
    }
  } finally {
    stopped = true; clearTimeout(timer); clearTimeout(captureGraceTimer);
    if (crashed) status = 'crashed';
    for (const [name, fn] of Object.entries(handlers)) page.off(name, fn);
    // Keep cleanup-only guards until page closure (or the next run) for late events.
    const closeLate = popup => { Promise.resolve().then(() => popup.close()).catch(() => {}); };
    const cancelLate = download => { Promise.resolve().then(() => download.cancel()).catch(() => {}); };
    const detach = () => {
      page.off('popup', closeLate); page.off('download', cancelLate); page.off('close', detach);
      lateGuards.delete(page);
    };
    if (!page.isClosed()) {
      page.on('popup', closeLate); page.on('download', cancelLate); page.on('close', detach);
      lateGuards.set(page, detach);
    }
    // Release inputs on the game origin only; bound all cleanup to 100ms.
    const cleanup = [...handlerWork];
    if (onStartOrigin()) {
      const release = (type, fields, action) => {
        const input = { t: t(), type, ...fields, cleanup: true, status: 'attempted' }; inputs.push(input);
        cleanup.push(Promise.resolve().then(action).then(() => { if (!finalized) input.status = 'sent'; }, error => {
          if (!finalized) { input.status = 'failed'; input.message = error.message; event('input-error', { type, ...fields, message: error.message }); }
        }));
      };
      for (const key of attemptedKeys) release('keyup', { key }, () => page.keyboard.up(key));
      if (mouseAttempted) release('mouseup', { button: 'left' }, () => page.mouse.up({ button: 'left' }));
    }
    if (decoder) cleanup.push(Promise.resolve().then(() => decoder.close()).catch(() => {}));
    let cleanupTimer;
    await Promise.race([Promise.allSettled(cleanup), new Promise(resolve => { cleanupTimer = setTimeout(resolve, 100); })]);
    clearTimeout(cleanupTimer);
    for (const input of inputs) if (input.status === 'attempted') { input.status = 'failed'; input.message = 'Deadline reached before input completion'; }
  }
  try {
    await mkdir(out, { recursive: true });
    await writeFile(join(out, 'inputs.json'), JSON.stringify(inputs, null, 2) + '\n');
  } catch (error) { status = crashed ? 'crashed' : 'incomplete'; event('report-write-error', { file: 'inputs.json', message: error.message }); }
  // Periodic frames drive time-based detectors; probe/final images remain evidence only.
  const periodicFrames = frames.filter(f => f.label === 'initial' || f.label === 'periodic');
  const expectedControlProbes = CONTROL_KEYS.length + (keyboardOnly ? 0 : 1);
  const report = { expectedControlProbes, restorationAttempts, resumedIntervals, url, seed, seconds, durationMs: t(), status, startupClicks, frames, diffs, inputsSent, controlDiffs, animationEvidence, intervalActivity, events,
    ...summarize({ frames: periodicFrames, diffs, inputsSent, controlDiffs, animationEvidence, intervalActivity, resumedIntervals, expectedControlProbes, events,
      started: startupClicks.some(c => c.status === 'sent') || animationEvidence || diffs.some(d => d > 0.0001) || controlDiffs.some(d => d > 0.0001) }) };
  try { await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); }
  catch (error) { report.status = 'incomplete'; event('report-write-error', { file: 'report.json', message: error.message }); }
  finalized = true;
  return report;
}
