import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { classifyPageError, frameDiff, isBlank, summarize } from './detectors.mjs';

export const INPUT_KEYS = ['w', 'a', 's', 'd', 'Space', 'Shift', 'r', 'e', '1', '2', '3', '4', 'Enter', 'Escape', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];
export function isSafeStartLabel(text) {
  if (/\b(restart|quit|exit|reset|delete|buy|purchase|download|share|new\s+game|sign\s+in|log\s+in)\b/i.test(text)) return false;
  return /\b(start|play|new|continue|ok|accept|begin|resume|deploy|retry|launch|enter|go|got\s+it|close)\b/i.test(text);
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
async function screenshotCapture(page, decoder, path) {
  const rects = await page.locator('canvas').evaluateAll(nodes => nodes.map(node => {
    const r = node.getBoundingClientRect(); const s = getComputedStyle(node);
    return { x: r.x, y: r.y, width: r.width, height: r.height, visible: s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0' };
  }));
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  const clip = selectCanvasClip(rects, viewport);
  const png = await page.screenshot({ path, timeout: 3000, ...(clip ? { clip } : {}) });
  const bytes = await decoder.evaluate(async ({ base64 }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${base64}`;
    await img.decode();
    const c = document.createElement('canvas'); c.width = 64; c.height = 36;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, 64, 36);
    return Array.from(ctx.getImageData(0, 0, 64, 36).data);
  }, { base64: png.toString('base64') });
  return { png, pixels: Uint8Array.from(bytes), region: clip ? 'largest-visible-canvas' : 'viewport' };
}

/** Only page UI, screenshots, and browser events. capture/clock injection keeps tests offline. */
export async function explore({ page, url, seconds = 60, seed = 1, out = 'reports/blackbox', capture, now = () => performance.now(), sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isInteger(seed)) throw new TypeError('Invalid seconds or seed');
  await mkdir(out, { recursive: true });
  const start = now(), random = rng(seed), inputs = [], events = [], frames = [], diffs = [], inputsSent = [], controlDiffs = [], startupClicks = [];
  let decoder, crashed = false, keyboardOnly = false, status = 'completed', previous, lastInputCount = 0, shotIndex = 0, imageCount = 0;
  const t = () => Math.round(now() - start);
  const event = (kind, fields) => events.push({ t: t(), kind, ...fields });
  const crash = message => { if (!crashed) event('crash', { message }); crashed = true; };
  const handlers = {
    console: msg => {
      if (msg.type() === 'error') event('console-error', { message: msg.text() });
      else if (msg.type() === 'warning' && classifyPageError(msg.text())) event('console-warning', { message: msg.text() });
    },
    pageerror: err => event('page-error', { message: err.message }),
    requestfailed: req => event('failed-request', { url: req.url(), message: req.failure()?.errorText ?? 'request failed' }),
    response: res => { if (res.status() >= 400) event('failed-request', { url: res.url(), message: `HTTP ${res.status()}` }); },
    crash: () => crash('Browser reported a page crash'),
    close: () => crash('Game page closed'),
    framenavigated: frame => { if (frame === page.mainFrame() && frame.url() === 'about:blank') crash('Game navigated to about:blank'); },
  };
  for (const [name, fn] of Object.entries(handlers)) page.on(name, fn);
  async function send(type, fields, action) {
    const input = { t: t(), type, ...fields, status: 'attempted' }; inputs.push(input);
    try { await action(); input.status = 'sent'; }
    catch (error) { input.status = 'failed'; input.message = error.message; throw error; }
  }
  async function shot(label, periodic = false) {
    const file = `frame-${String(imageCount++).padStart(4, '0')}.png`;
    const sampled = await capture(join(out, file));
    frames.push({ t: t(), file, label, blank: isBlank(sampled.pixels), region: sampled.region ?? 'viewport' });
    // Fakes can return PNG bytes without writing; production screenshot already writes the same file.
    await writeFile(join(out, file), sampled.png);
    if (periodic) {
      const count = inputs.filter(i => i.status === 'sent' && ['keydown', 'mousemove', 'mousedown'].includes(i.type)).length;
      if (previous) { diffs.push(frameDiff(previous, sampled.pixels)); inputsSent.push(count - lastInputCount); }
      previous = sampled.pixels; lastInputCount = count; shotIndex++;
    }
    return sampled.pixels;
  }
  async function hold(key, ms) {
    await send('keydown', { key }, () => page.keyboard.down(key));
    await sleep(ms);
    if (!crashed) await send('keyup', { key }, () => page.keyboard.up(key));
  }
  try {
    if (!capture) {
      decoder = await page.context().newPage();
      capture = path => screenshotCapture(page, decoder, path);
      await page.bringToFront();
    }
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    // A bounded number of rounds handles a consent dialog followed by a start menu.
    const clicked = new Set();
    for (let round = 0; round < 3 && !crashed; round++) {
      const buttons = page.locator('button, a[href], [role="button"], [role="link"], input[type="button"], input[type="submit"]');
      let didClick = false;
      for (let i = 0, n = Math.min(await buttons.count(), 100); i < n && !crashed; i++) {
        const button = buttons.nth(i);
        if (!await button.isVisible() || !await button.isEnabled()) continue;
        const text = (await button.textContent() || await button.getAttribute('value') || await button.getAttribute('aria-label') || '').trim();
        if (!isSafeStartLabel(text) || clicked.has(text)) continue;
        const click = { t: t(), text, status: 'attempted' }; startupClicks.push(click);
        clicked.add(text);
        try {
          await send('startup-click', { text }, () => button.click({ timeout: 1500 }));
          click.status = 'sent'; didClick = true;
        } catch (error) {
          click.status = 'failed'; event('click-intercepted', { text, message: error.message });
          continue;
        }
        break; // Re-query after menus mutate.
      }
      if (!didClick) break;
    }
    const canvas = page.locator('canvas');
    for (let i = 0, n = await canvas.count(); i < n; i++) {
      if (await canvas.nth(i).isVisible()) {
        const target = canvas.nth(i);
        try {
          await send('canvas-click', {}, () => target.click({ timeout: 1500 }));
        } catch (error) {
          event('click-intercepted', { message: error.message });
          try {
            const box = await target.boundingBox({ timeout: 1500 });
            if (!box) throw new Error('Canvas has no visible bounding box');
            const x = box.x + box.width / 2, y = box.y + box.height / 2;
            await send('canvas-click', { x, y, fallback: true }, () => page.mouse.click(x, y));
          } catch {
            keyboardOnly = true;
          }
        }
        break;
      }
    }
    const playStart = now(), deadline = playStart + seconds * 1000;
    let before = await shot('initial', true);
    for (const key of ['w', 'a', 's', 'd']) {
      if (crashed || now() >= deadline) break;
      await hold(key, Math.min(180, deadline - now()));
      if (crashed) break;
      const after = await shot(`control-probe:${key}`);
      controlDiffs.push(frameDiff(before, after)); before = after;
    }
    let step = 0;
    while (now() < deadline && !crashed) {
      if (page.isClosed()) { crash('Game page closed'); break; }
      if (now() >= playStart + shotIndex * 5000) await shot('periodic', true);
      const key = INPUT_KEYS[step++ % INPUT_KEYS.length];
      await hold(key, Math.min(180 + Math.floor(random() * 140), Math.max(0, deadline - now())));
      if (crashed) break;
      if (keyboardOnly) continue;
      const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
      const x = Math.floor(random() * viewport.width), y = Math.floor(random() * viewport.height);
      await send('mousemove', { x, y }, () => page.mouse.move(x, y));
      if (step % 4 === 0) {
        await send('mousedown', { button: 'left' }, () => page.mouse.down({ button: 'left' }));
        await send('mouseup', { button: 'left' }, () => page.mouse.up({ button: 'left' }));
      }
    }
    if (!crashed) await shot('final');
  } catch (error) {
    if (page.isClosed()) crash('Game page closed');
    if (!crashed) { status = 'incomplete'; event('explorer-error', { message: error.message }); }
  } finally {
    if (crashed) status = 'crashed';
    for (const [name, fn] of Object.entries(handlers)) page.off(name, fn);
    if (decoder) await decoder.close().catch(() => {});
  }
  // Periodic frames drive time-based detectors; probe/final images remain evidence only.
  const periodicFrames = frames.filter(f => f.label === 'initial' || f.label === 'periodic');
  const report = { url, seed, seconds, durationMs: t(), status, startupClicks, frames, diffs, inputsSent, controlDiffs, events,
    ...summarize({ frames: periodicFrames, diffs, inputsSent, controlDiffs, events }) };
  await writeFile(join(out, 'inputs.json'), JSON.stringify(inputs, null, 2) + '\n');
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}
