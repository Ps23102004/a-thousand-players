// The pure report contract runs without a browser: node e2e/game-ui.spec.cjs --logic-test
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { controlReport, fakePadFrame } = require('./helpers.cjs');

// /games statically imports this JSON: identical observations must not trigger dev-server reloads.
function writeControlReport(outputPath, catalog, observations) {
  const content = JSON.stringify(controlReport(catalog, observations), null, 2) + '\n';
  try {
    if (fs.readFileSync(outputPath, 'utf8') === content) return false;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  fs.writeFileSync(outputPath, content);
  return true;
}

function controlReportOutput(testInfo, mutation) {
  return mutation ? testInfo.outputPath('controls-broken-button.json') : reportPath;
}

if (process.argv.includes('--logic-test')) {
  const { test } = require('node:test');
  test('report creates and updates content, with no rewrite when identical and no timestamp', t => {
    const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'controls-report-test-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const output = path.join(dir, 'report.json');
    const catalog = [{ control: 'pause', input: 'Escape', expected: 'time stops' }];
    assert.equal(writeControlReport(output, catalog, []), true);
    const observations = [{ control: 'pause', observed: 'time unchanged', works: true }];
    assert.equal(writeControlReport(output, catalog, observations), true);
    const content = JSON.stringify(controlReport(catalog, observations), null, 2) + '\n';
    assert.equal(fs.readFileSync(output, 'utf8'), content);
    const sentinel = new Date('2000-01-01T00:00:00Z');
    fs.utimesSync(output, sentinel, sentinel);
    const before = fs.statSync(output).mtimeMs;
    assert.equal(writeControlReport(output, catalog, observations), false);
    assert.equal(fs.statSync(output).mtimeMs, before);
    assert.equal(fs.readFileSync(output, 'utf8'), content);
  });
  test('mutation reports go only to test output and leave the committed report untouched', t => {
    const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'controls-mutation-test-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const before = fs.readFileSync(reportPath, 'utf8');
    const mtime = fs.statSync(reportPath).mtimeMs;
    const testInfo = { outputPath: name => path.join(dir, name) };
    assert.equal(controlReportOutput(testInfo, undefined), reportPath);
    const output = controlReportOutput(testInfo, 'btn-pause');
    assert.equal(output, path.join(dir, 'controls-broken-button.json'));
    writeControlReport(output, [{ control: 'btn-pause', input: 'click', expected: 'paused' }], [{ control: 'btn-pause', observed: 'not paused', works: false }]);
    assert.equal(JSON.parse(fs.readFileSync(output, 'utf8'))[0].works, false);
    assert.equal(fs.readFileSync(reportPath, 'utf8'), before);
    assert.equal(fs.statSync(reportPath).mtimeMs, mtime);
  });
  test('unexecuted controls never count as working or broken', () => {
    const rows = controlReport([{ control: 'pause', input: 'Escape', expected: 'time stops' }], []);
    assert.deepEqual(rows, [{ control: 'pause', input: 'Escape', expected: 'time stops', observed: 'Not run in a browser', works: null }]);
  });
  test('report retains actual successes and failures, rejects unknown and duplicate observations', () => {
    const catalog = [{ control: 'pause', input: 'Escape', expected: 'time stops' }];
    assert.equal(controlReport(catalog, [{ control: 'pause', observed: 'time advanced', works: false }])[0].works, false);
    assert.equal(controlReport(catalog, [{ control: 'pause', observed: 'time unchanged', works: true }])[0].works, true);
    assert.throws(() => controlReport(catalog, [{ control: 'invented', works: true }]), /Unknown/);
    assert.throws(() => controlReport(catalog, [{ control: 'pause', works: true }, { control: 'pause', works: false }]), /Duplicate/);
  });
  test('catalog covers the actual HUD IDs and every keyboard guide key', () => {
    const html = fs.readFileSync(path.join(__dirname, '../game/index.html'), 'utf8');
    const ids = [...html.matchAll(/id="(btn-[^"]+)"/g)].map(match => match[1]).sort();
    assert.deepEqual(ids, [...HUD].sort());
    for (const id of ids) assert.ok(module.exports.catalog.some(row => row.control === id));
    const guide = html.split('controls-grid keyboard-guide')[1].split('controls-grid controller-guide')[0];
    const keys = [...new Set([...guide.matchAll(/<kbd>([^<]+)<\/kbd>/g)].map(match => match[1]))].sort();
    assert.deepEqual(keys, ['A', 'D', 'E', 'ESC', 'F', 'G', 'H', 'J', 'K', 'L', 'Q', 'R', 'S', 'V', 'W'].sort());
    assert.equal(new Set(module.exports.catalog.map(row => row.control)).size, module.exports.catalog.length);
  });
  test('real gamepad mapper emits the documented buttons, modifiers and axes', async () => {
    const { GamepadControls, PS_BUTTONS } = await import('../game/src/gamepad.js');
    let frame = fakePadFrame();
    const events = [], actions = [];
    const controls = new GamepadControls({ read: () => [null, null, frame], emitKey: (code, down) => events.push([code, down]), onAction: action => actions.push(action) });
    controls.poll();
    for (const [button, code] of Object.entries(PS_BUTTONS)) {
      frame = fakePadFrame({ buttons: [+button] }); controls.poll();
      assert.deepEqual(events.at(-1), [code, true]);
      frame = fakePadFrame(); controls.poll(); assert.deepEqual(events.at(-1), [code, false]);
    }
    frame = fakePadFrame({ buttons: [2, 4] }); controls.poll();
    assert.deepEqual(events.slice(-2), [['KeyS', true], ['KeyJ', true]]);
    frame = fakePadFrame(); controls.poll();
    frame = fakePadFrame({ axes: [-.9, .9] }); controls.poll();
    assert.deepEqual(events.slice(-2), [['KeyA', true], ['KeyV', true]]);
    frame = fakePadFrame(); controls.poll();
    for (const [button, action] of [[8, 'help'], [17, 'help'], [9, 'pause'], [11, 'restart'], [10, 'sound']]) {
      frame = fakePadFrame({ buttons: [button] }); controls.poll(); assert.equal(actions.at(-1), action);
      frame = fakePadFrame(); controls.poll();
    }
  });
  test('games page statically imports measured report and exposes its counts', () => {
    const source = fs.readFileSync(path.join(__dirname, '../app/games/page.tsx'), 'utf8');
    assert.match(source, /import controlsReport from ["']@\/docs\/controls-report\.json["']/);
    assert.match(source, /data-controls-report/);
    assert.match(source, /controls checked:/);
    assert.match(source, /works === true/);
    assert.match(source, /works === null/);
  });
  // Fixture validation only: this is not a control row or mapping evidence in the report.
  test('fixture validation: fake standard pad preserves buttons, analog values, axes, and neutral release', () => {
    const frame = fakePadFrame({ buttons: [2, 4], analog: { 6: .8 }, axes: [-.9, .9] });
    assert.equal(frame.mapping, 'standard');
    assert.equal(frame.index, 2);
    assert.equal(frame.buttons[2].pressed, true);
    assert.equal(frame.buttons[4].pressed, true);
    assert.deepEqual(frame.buttons[6], { pressed: false, value: .8 });
    assert.deepEqual(frame.axes, [-.9, .9, 0, 0]);
    assert.ok(fakePadFrame().buttons.every(b => !b.pressed && b.value === 0));
    assert.notEqual(frame.buttons[0], frame.buttons[1]);
  });
}

const cases = [];
const add = (control, input, expected, run) => cases.push({ control, input, expected, run });
const HUD = ['btn-start-duel', 'btn-pause', 'btn-resume', 'btn-restart', 'btn-menu', 'btn-end-menu', 'btn-how', 'btn-controls', 'btn-close-help', 'btn-guide-keyboard', 'btn-guide-controller', 'btn-sound'];

async function ticks(page, count = 1) {
  await page.evaluate(count => {
    const app = window.gameApp;
    for (let i = 0; i < count; i++) if (!app.paused && app.screen === 'fight' && !window.__controls.hud.getHUDState().gameOver) app.updateFight(1 / 60);
  }, count);
}
async function pad(page, frame = {}) {
  await page.evaluate(frame => { window.__crawlerPad = frame; window.gameApp.controller.poll(); }, fakePadFrame(frame));
}
async function release(page) {
  await page.evaluate(() => { window.__crawlerPad = null; window.gameApp.controller.poll(); window.__controls.player.clearInputKeys(); });
}
async function fight(page, close = false) {
  await release(page);
  await page.evaluate(close => {
    const app = window.gameApp;
    app.resetGame(); app.countdown = 0; app.player.inputEnabled = true; app.rival.aiDisabled = true;
    app.trace = []; app.events = [];
    const oldAttack = app.player.onAttackStart;
    app.player.onAttackStart = name => { oldAttack?.(name); app.trace.push(name); };
    for (const fighter of [app.player, app.rival]) {
      for (const name of ['onGrappleEvent', 'onGroundEvent']) {
        const old = fighter[name];
        fighter[name] = event => { old?.(event); app.events.push(event.type); };
      }
    }
    for (const [f, x] of [[app.player, -.48], [app.rival, close ? .48 : 5]]) {
      f.rigidBody.setTranslation({ x, y: .81, z: 0 }, true);
      f.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
  }, close);
  await ticks(page, 12);
}
async function menu(page) {
  await release(page);
  await page.evaluate(() => { window.gameApp.closeHelp(); window.gameApp.returnToMenu(); });
}
async function input(page, source, code, { held = false, low = false } = {}) {
  if (source === 'keyboard') {
    if (low) await page.keyboard.down('s');
    await page.keyboard.down(code);
    if (!held) await page.keyboard.up(code);
    if (low && !held) await page.keyboard.up('s');
  } else {
    const map = { j: 2, k: 3, l: 1, f: 5, w: 0, s: 4, e: 7, r: 11, h: 8, Escape: 9 };
    await pad(page); await pad(page); // consume a context transition before the fresh edge
    await pad(page, { buttons: [...(low ? [4] : []), map[code]] });
    if (!held) await pad(page);
  }
}
async function neutral(page, source, code, low = false) {
  if (source === 'keyboard') { await page.keyboard.up(code); if (low) await page.keyboard.up('s'); }
  else await pad(page);
}
async function state(page) {
  return page.evaluate(() => {
    const app = window.gameApp, p = app.player, h = window.__controls.hud.getHUDState();
    return { screen: app.screen, paused: app.paused, time: h.gameTime, hp: [p.health, app.rival.health], anim: p.currentAnim, state: p.state, position: p.rigidBody.translation(), guarding: p.isGuarding, crouching: p.isCrouching, trace: app.trace, events: app.events };
  });
}
async function finish(page) {
  await page.evaluate(() => { const app = window.gameApp; app.rival.health = 0; window.__controls.hud.updateHUD(app.player, app.rival, 0); app.player.inputEnabled = false; });
}
async function resetAssertion(page) {
  const s = await state(page);
  assert.deepEqual(s.hp, [100, 100]); assert.equal(s.time, 0); assert.equal(s.screen, 'fight');
  assert.equal(await page.locator('#hud-timer').textContent(), '99');
  for (const who of ['player', 'rival']) assert.equal(await page.locator(`#${who}-health-bar`).evaluate(el => el.parentElement.getAttribute('aria-valuenow')), '100');
  return JSON.stringify(s);
}
async function assertPausedModal(page, context) {
  assert.equal((await state(page)).screen, 'fight', `Precondition: ${context} opened during a fight`);
  assert.equal((await state(page)).paused, true, `Precondition: ${context} paused the fight`);
  assert.equal(await page.locator(`#${context}-modal`).isVisible(), true, `Precondition: ${context} modal is visible`);
}
async function assertPausedClock(page, paused) {
  const { renderFrames } = require('./helpers.cjs');
  assert.equal((await state(page)).paused, paused);
  const before = (await state(page)).time;
  // Exercise the actual requestAnimationFrame loop, including its pause gate.
  await page.evaluate(() => { window.gameApp.running = true; window.gameApp.clock.getDelta(); window.gameApp.animate(); });
  try {
    if (paused) {
      await renderFrames(page, 12);
      assert.equal((await state(page)).time, before);
    } else {
      await page.waitForFunction(before => window.__controls.hud.getHUDState().gameTime > before, before);
    }
  } finally {
    await page.evaluate(() => { window.gameApp.running = false; });
    await renderFrames(page, 2);
  }
  return JSON.stringify({ before, after: (await state(page)).time, paused });
}

for (const id of HUD) add(id, `click #${id}`, {
  'btn-start-duel': 'starts fight', 'btn-pause': 'pauses and stops clock', 'btn-resume': 'resumes clock',
  'btn-restart': 'resets both HP and timer from game over', 'btn-menu': 'pause to fighter menu', 'btn-end-menu': 'game over to fighter menu',
  'btn-how': 'menu help opens', 'btn-controls': 'fight help opens and pauses', 'btn-close-help': 'help closes and fight resumes',
  'btn-guide-keyboard': 'keyboard tab selected and visible', 'btn-guide-controller': 'controller tab selected and visible', 'btn-sound': 'sound flag, label and aria toggle both ways',
}[id], async page => {
  if (['btn-how', 'btn-start-duel', 'btn-sound'].includes(id)) await menu(page); else await fight(page);
  if (['btn-resume', 'btn-menu'].includes(id)) await page.locator('#btn-pause').click();
  if (['btn-restart', 'btn-end-menu'].includes(id)) await finish(page);
  if (['btn-close-help', 'btn-guide-keyboard', 'btn-guide-controller'].includes(id)) await page.locator('#btn-controls').click();
  if (id === 'btn-guide-keyboard') await page.locator('#btn-guide-controller').click();
  if (id === 'btn-sound') {
    const initial = await page.evaluate(() => window.gameApp.soundEnabled);
    for (const enabled of [!initial, initial]) {
      await page.locator('#btn-sound').click();
      assert.equal(await page.evaluate(() => window.gameApp.soundEnabled), enabled);
      assert.equal(await page.locator('#btn-sound').getAttribute('aria-pressed'), String(enabled));
      assert.match(await page.locator('#btn-sound').textContent(), enabled ? /SOUND ON/ : /SOUND OFF/);
    }
    return `sound toggled and restored to ${initial}`;
  }
  await page.locator(`#${id}`).click();
  if (id === 'btn-pause' || id === 'btn-resume') return assertPausedClock(page, id === 'btn-pause');
  if (id === 'btn-restart') return resetAssertion(page);
  if (id.startsWith('btn-guide-')) {
    const name = id.replace('btn-guide-', ''), other = name === 'keyboard' ? 'controller' : 'keyboard';
    assert.equal(await page.locator(`#${id}`).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator(`#btn-guide-${other}`).getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator(`.${name}-guide`).isVisible(), true);
    assert.equal(await page.locator(`.${other}-guide`).isVisible(), false);
    return `${name} visible; ${other} hidden`;
  }
  if (['btn-how', 'btn-controls', 'btn-close-help'].includes(id)) {
    assert.equal(await page.locator('#help-modal').isVisible(), id !== 'btn-close-help');
    if (id !== 'btn-how') assert.equal((await state(page)).paused, id !== 'btn-close-help');
  } else {
    assert.equal((await state(page)).screen, id === 'btn-start-duel' ? 'fight' : 'menu');
    assert.equal(await page.locator('#story-modal').isVisible(), id !== 'btn-start-duel');
    assert.equal(await page.locator('#end-modal').isVisible(), false);
  }
  return JSON.stringify(await state(page));
});

for (const source of ['keyboard', 'gamepad']) {
  for (const [code, axis, delta] of [['a', 'x', -1], ['d', 'x', 1], ['q', 'z', -1], ['v', 'z', 1]]) {
    add(`${source}-move-${code}`, source === 'keyboard' ? code.toUpperCase() : `left stick ${code === 'a' ? 'left' : code === 'd' ? 'right' : code === 'q' ? 'up' : 'down'}`, `moves ${axis} ${delta < 0 ? 'negative' : 'positive'}${code === 'a' ? ' and guards away' : ''}`, async page => {
      await fight(page); const before = (await state(page)).position[axis];
      if (source === 'keyboard') await page.keyboard.down(code);
      else { await pad(page); await pad(page, { axes: [axis === 'x' ? delta * .9 : 0, axis === 'z' ? delta * .9 : 0] }); }
      await ticks(page, 12); const after = await state(page);
      assert.ok((after.position[axis] - before) * delta > .1);
      if (code === 'a') assert.equal(after.guarding, true);
      await neutral(page, source, code); await ticks(page);
      const velocity = await page.evaluate(axis => window.gameApp.player.rigidBody.linvel()[axis], axis);
      assert.ok(Math.abs(velocity) < .1, 'release stops movement');
      return JSON.stringify({ before, after: after.position[axis], velocity, guarding: after.guarding });
    });
  }
  for (const [code, low, moves] of [['j', false, ['JAB', 'CROSS', 'HOOK', 'UPPERCUT']], ['k', false, ['ROUNDHOUSE_KICK', 'HIGH_KICK', 'BACK_KICK']], ['j', true, ['BODY_JAB', 'BODY_HOOK']], ['k', true, ['SWEEP']]]) {
    add(`${source}-${low ? 'low-' : ''}${code}-chain`, `${source}: ${low ? 'S / L1 + ' : ''}${code === 'j' ? 'J / square' : 'K / triangle'} x${moves.length}`, moves.join(' → '), async page => {
      await fight(page);
      for (let i = 0; i < moves.length; i++) await input(page, source, code, { low });
      await ticks(page, 150);
      const trace = (await state(page)).trace;
      assert.deepEqual(trace.slice(0, moves.length), moves);
      return JSON.stringify(trace);
    });
  }
  for (const code of ['s', 'w', 'l']) add(`${source}-${code}`, `${source}: ${code.toUpperCase()} / ${code === 's' ? 'L1' : code === 'w' ? 'cross' : 'circle'}`, code === 's' ? 'crouches while held, releases' : code === 'w' ? 'jumps above floor' : 'starts parry animation', async page => {
    await fight(page);
    await input(page, source, code, { held: code !== 'l' });
    await ticks(page, code === 'w' ? 10 : 1);
    const observed = await state(page);
    if (code === 's') assert.equal(observed.crouching, true);
    if (code === 'w') assert.ok(observed.position.y > 1);
    if (code === 'l') assert.equal(observed.anim, 'PARRY');
    await neutral(page, source, code); await ticks(page);
    if (code === 's') assert.equal((await state(page)).crouching, false);
    return JSON.stringify(observed);
  });
  add(`${source}-crate`, `${source}: E / R2 twice`, 'picks up nearby crate then throws it', async page => {
    await fight(page);
    await page.evaluate(() => { const app = window.gameApp, p = app.player.rigidBody.translation(); app.props[0].rigidBody.setTranslation({ x: p.x - 1.2, y: .4, z: p.z }, true); });
    await input(page, source, 'e');
    assert.equal(await page.evaluate(() => !!window.gameApp.player.carriedProp), true);
    await input(page, source, 'e');
    assert.equal(await page.evaluate(() => !!window.gameApp.player.carriedProp), false);
    const speed = await page.evaluate(() => Math.abs(window.gameApp.props[0].rigidBody.linvel().x));
    assert.ok(speed > 1); return `picked up, released; thrown speed=${speed}`;
  });
  for (const code of source === 'keyboard' ? ['f', 'g'] : ['f']) add(`${source}-grab-${code}`, `${source}: ${code.toUpperCase()} / R1`, 'grabs a nearby standing rival', async page => {
    await fight(page, true); await input(page, source, code);
    assert.equal(await page.evaluate(() => window.gameApp.player.grapple?.phase), 'CHOOSE');
    assert.equal((await state(page)).state, 'GRAB'); return JSON.stringify(await state(page));
  });
  for (const [code, action] of [['j', 'PUNCH'], ['k', 'KNEE'], ['f', 'THROW'], ['l', 'RELEASE']]) add(`${source}-clinch-${action}`, `${source}: clinch ${code.toUpperCase()} / ${code === 'j' ? 'square' : code === 'k' ? 'triangle' : code === 'f' ? 'R1' : 'circle'} + shown prompt`, `clinch ${action.toLowerCase()} changes rival health or releases`, async page => {
    await fight(page, true); await input(page, source, 'f');
    assert.equal(await page.evaluate(() => window.gameApp.player.grapple?.phase), 'CHOOSE', 'Precondition: clinch opened before choosing an action');
    assert.equal((await state(page)).state, 'GRAB');
    if (action === 'RELEASE') assert.equal((await state(page)).events.includes('release'), false);
    await input(page, source, code);
    if (action !== 'RELEASE') {
      assert.equal(await page.evaluate(() => window.gameApp.player.grapple?.action), action);
      await confirmPrompt(page, source); await ticks(page, 14);
      assert.ok((await state(page)).hp[1] < 100);
      if (action === 'THROW') assert.equal(await page.evaluate(() => !!window.gameApp.player.grapple), false);
    } else {
      assert.equal(await page.evaluate(() => !!window.gameApp.player.grapple), false);
      assert.ok((await state(page)).events.includes('release'), 'Release input must emit a release event');
    }
    return JSON.stringify(await state(page));
  });
  for (const [code, action] of [['j', 'HEAD'], ['k', 'BODY'], ['f', 'STAND']]) add(`${source}-mount-${action}`, `${source}: F / R1 then ${code.toUpperCase()} + shown prompt`, `mount and ${action.toLowerCase()}`, async page => {
    await fight(page, true);
    await down(page, 'rival'); await input(page, source, 'f');
    assert.equal(await page.evaluate(() => window.gameApp.player.mount?.phase), 'CHOOSE');
    await input(page, source, code);
    if (action === 'STAND') assert.equal(await page.evaluate(() => !!window.gameApp.player.mount), false);
    else { await confirmPrompt(page, source); await ticks(page, 15); assert.equal((await state(page)).hp[1], action === 'BODY' ? 90 : 92); }
    return JSON.stringify(await state(page));
  });
  for (const kind of ['rise', 'counterthrow', 'grab-escape', 'mount-reversal', 'mount-escape']) add(`${source}-${kind}`, `${source}: match displayed J/K/L or square/triangle/circle (${kind})`, kind, async page => {
    await fight(page, true);
    await page.evaluate(kind => {
      const app = window.gameApp, m = window.__controls;
      if (kind === 'rise') { m.ground.startKnockdown(app.player, { rng: () => 0, landed: true }); m.ground.updateGround(app.player, 1 / 60); }
      else if (kind.startsWith('mount')) {
        m.ground.startKnockdown(app.player, { rng: () => 0, landed: true }); m.ground.updateGround(app.player, 1 / 60);
        const mount = m.ground.beginMount(app.rival, app.player, { rng: () => 0 });
        assertFixture(mount, 'mount'); mount.elapsed = kind === 'mount-escape' ? .6 : 0;
      } else {
        const grapple = m.grapple.beginGrapple(app.rival, app.player, { rng: () => 0 });
        assertFixture(grapple, 'grapple'); grapple.elapsed = kind === 'grab-escape' ? .6 : 0;
      }
      function assertFixture(value, name) { if (!value) throw new Error(`Failed ${name} fixture`); }
      m.hud.updateGrappleHUD(app.player);
    }, kind);
    await confirmPrompt(page, source);
    if (kind === 'rise') assert.equal(await page.evaluate(() => window.gameApp.player.ground?.fast), true);
    if (kind === 'counterthrow') { assert.ok((await state(page)).hp[1] < 100); assert.equal(await page.evaluate(() => !!window.gameApp.player.grapple), false); }
    if (kind === 'grab-escape') { assert.equal(await page.evaluate(() => !!window.gameApp.player.grapple), false); assert.deepEqual((await state(page)).hp, [100, 100]); }
    if (kind === 'mount-reversal') assert.equal(await page.evaluate(() => window.gameApp.player.mount?.top === window.gameApp.player), true);
    if (kind === 'mount-escape') assert.equal(await page.evaluate(() => !!window.gameApp.player.mount), false);
    return JSON.stringify(await state(page));
  });
  add(`${source}-pause`, `${source}: Escape / OPTIONS twice`, 'pause stops time, resume advances time', async page => {
    await fight(page); await input(page, source, 'Escape');
    const paused = await assertPausedClock(page, true);
    await input(page, source, 'Escape'); const resumed = await assertPausedClock(page, false);
    return `${paused}; ${resumed}`;
  });
  add(`${source}-help`, `${source}: H / CREATE twice`, 'help pauses fight and closing resumes', async page => {
    await fight(page); await input(page, source, 'h');
    assert.equal(await page.locator('#help-modal').isVisible(), true); assert.equal((await state(page)).paused, true);
    await input(page, source, 'h');
    assert.equal(await page.locator('#help-modal').isVisible(), false); assert.equal((await state(page)).paused, false);
    return 'help opened/closed; pause true/false';
  });
  add(`${source}-restart`, `${source}: R / R3`, 'resets damaged fighters and elapsed timer', async page => {
    await fight(page); await page.evaluate(() => { const app = window.gameApp; app.player.health = 31; app.rival.health = 42; window.__controls.hud.updateHUD(app.player, app.rival, 20); });
    await input(page, source, 'r'); return resetAssertion(page);
  });
}
async function down(page, who) {
  await page.evaluate(who => { const m = window.__controls, f = window.gameApp[who]; m.ground.startKnockdown(f, { rng: () => 0, landed: true }); m.ground.updateGround(f, 1 / 60); }, who);
}
async function confirmPrompt(page, source) {
  if (source === 'gamepad') { await pad(page); await pad(page); await pad(page, { buttons: [6] }); await pad(page); }
  else await page.keyboard.press('Shift');
  await page.evaluate(() => window.__controls.hud.updateGrappleHUD(window.gameApp.player));
  const code = await page.evaluate(() => { const p = window.gameApp.player; return p.mount?.requiredKey || p.grapple?.requiredKey || p.ground?.requiredKey; });
  assert.ok(['KeyJ', 'KeyK', 'KeyL'].includes(code), `Expected real timing prompt, got ${code}`);
  const label = await page.locator('#grapple-key').textContent();
  assert.ok(label.includes(source === 'keyboard' ? code.slice(3) : ({ KeyJ: '□', KeyK: '△', KeyL: '○' })[code]), `Prompt label ${label} must match input mode`);
  await input(page, source, code.slice(3).toLowerCase());
}

for (const [button, axis, sign] of [[14, 'x', -1], [15, 'x', 1], [12, 'z', -1], [13, 'z', 1]]) add(`gamepad-dpad-${button}`, `D-pad button ${button}`, `moves ${axis} ${sign < 0 ? 'negative' : 'positive'}`, async page => {
  await fight(page); const before = (await state(page)).position[axis];
  await pad(page); await pad(page, { buttons: [button] }); await ticks(page, 12);
  const after = (await state(page)).position[axis]; assert.ok((after - before) * sign > .1);
  await pad(page); await ticks(page);
  assert.ok(Math.abs(await page.evaluate(axis => window.gameApp.player.rigidBody.linvel()[axis], axis)) < .1);
  return JSON.stringify({ before, after, released: true });
});
add('gamepad-guard', 'analog L2 value=.8', 'holds standing guard then releases', async page => {
  await fight(page); await pad(page); await pad(page, { analog: { 6: .8 } }); await ticks(page);
  assert.equal((await state(page)).guarding, true);
  await pad(page); await ticks(page); assert.equal((await state(page)).guarding, false);
  return 'guard true then false';
});
add('gamepad-touchpad', 'touchpad button 17 twice', 'help opens and closes', async page => {
  await fight(page); await pad(page); await pad(page, { buttons: [17] });
  assert.equal(await page.locator('#help-modal').isVisible(), true);
  await pad(page); await pad(page); await pad(page, { buttons: [17] });
  assert.equal(await page.locator('#help-modal').isVisible(), false); assert.equal((await state(page)).paused, false);
  return 'help opened/closed, fight resumed';
});
add('gamepad-sound', 'L3 button 10 twice', 'sound flag and aria toggle twice', async page => {
  await menu(page); await pad(page); const before = await page.evaluate(() => window.gameApp.soundEnabled);
  for (const target of [!before, before]) {
    await pad(page, { buttons: [10] });
    assert.equal(await page.evaluate(() => window.gameApp.soundEnabled), target);
    assert.equal(await page.locator('#btn-sound').getAttribute('aria-pressed'), String(target)); await pad(page);
  }
  return `sound toggled and restored to ${before}`;
});
add('keyboard-escape-help', 'Escape while help open', 'closes help and resumes fight', async page => {
  await fight(page); await page.keyboard.press('h');
  await assertPausedModal(page, 'help');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#help-modal').isVisible(), false); assert.equal((await state(page)).paused, false);
  return 'help closed, fight resumed';
});
// main.js toggles Kai/Rook for both directions; index.html orders Kai then Rook.
// Two choices cannot distinguish a reversed direction. Pin each starting point and destination.
for (const [direction, before, expected] of [['left', 'rook', 'kai'], ['right', 'kai', 'rook']]) for (const device of ['stick', 'dpad']) add(`gamepad-select-${device}-${direction}`, `${device} ${direction} in fighter menu`, `selects ${expected} from ${before}`, async page => {
  await menu(page);
  await page.locator(`[data-fighter="${before}"]`).click(); await pad(page);
  assert.equal((await state(page)).screen, 'menu', 'Precondition: fighter menu is open');
  assert.equal(await page.evaluate(() => window.gameApp.selectedFighter), before, 'Precondition: known starting fighter');
  assert.equal(await page.locator(`[data-fighter="${before}"]`).getAttribute('aria-pressed'), 'true');
  await pad(page, device === 'stick' ? { axes: [direction === 'left' ? -.9 : .9, 0] } : { buttons: [direction === 'left' ? 14 : 15] });
  const after = await page.evaluate(() => window.gameApp.selectedFighter); assert.equal(after, expected);
  assert.equal(await page.locator(`[data-fighter="${expected}"]`).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator(`[data-fighter="${before}"]`).getAttribute('aria-pressed'), 'false');
  return `${before} → ${after}`;
});
for (const context of ['menu', 'pause', 'help', 'end']) add(`gamepad-confirm-${context}`, `cross button 0 in ${context}`, `confirms ${context === 'menu' ? 'start' : context === 'end' ? 'restart' : context === 'pause' ? 'resume' : 'close help'}`, async page => {
  if (context === 'menu') await menu(page); else await fight(page);
  if (context === 'pause') await page.locator('#btn-pause').click();
  if (context === 'help') await page.locator('#btn-controls').click();
  if (context === 'end') await finish(page);
  await pad(page); await pad(page);
  if (context === 'pause' || context === 'help') await assertPausedModal(page, context);
  await pad(page, { buttons: [0] });
  if (context === 'end' || context === 'menu') return resetAssertion(page);
  assert.equal((await state(page)).paused, false); assert.equal(await page.locator('#help-modal').isVisible(), false);
  assert.equal(await page.locator('#pause-modal').isVisible(), false);
  return JSON.stringify(await state(page));
});
for (const context of ['pause', 'help', 'end']) add(`gamepad-back-${context}`, `circle button 1 in ${context}`, context === 'end' ? 'returns to menu' : 'returns to fight', async page => {
  await fight(page);
  if (context === 'pause') await page.locator('#btn-pause').click();
  if (context === 'help') await page.locator('#btn-controls').click();
  if (context === 'end') await finish(page);
  await pad(page); await pad(page);
  if (context === 'pause' || context === 'help') await assertPausedModal(page, context);
  await pad(page, { buttons: [1] });
  assert.equal((await state(page)).screen, context === 'end' ? 'menu' : 'fight');
  assert.equal((await state(page)).paused, false); assert.equal(await page.locator('#help-modal').isVisible(), false);
  assert.equal(await page.locator('#pause-modal').isVisible(), false);
  return JSON.stringify(await state(page));
});
for (const device of ['stick', 'dpad']) for (const direction of ['up', 'down']) add(`gamepad-menu-${device}-${direction}`, `${device} ${direction} in pause menu + cross`, 'moves focus to menu button and activates it', async page => {
  await fight(page); await page.locator('#btn-pause').click(); await pad(page); await pad(page);
  const before = await page.evaluate(() => document.activeElement.id);
  await pad(page, device === 'stick' ? { axes: [0, direction === 'up' ? -.9 : .9] } : { buttons: [direction === 'up' ? 12 : 13] });
  const after = await page.evaluate(() => document.activeElement.id);
  assert.equal(before, 'btn-resume'); assert.equal(after, 'btn-menu');
  await pad(page); await pad(page, { buttons: [0] }); assert.equal((await state(page)).screen, 'menu');
  return `${before} → ${after} → menu`;
});

module.exports.catalog = cases.map(({ control, input, expected }) => ({ control, input, expected }));
const reportPath = path.join(__dirname, '../docs/controls-report.json');
if (process.argv.includes('--init-report')) {
  assert.ok(!process.env.E2E_BREAK_CONTROL, 'Cannot initialize the committed report in mutation mode');
  writeControlReport(reportPath, module.exports.catalog, []);
  console.log(`Inventoried ${cases.length} controls; 0 browser observations (works=null).`);
} else if (!process.argv.includes('--logic-test')) {
  const { test, expect } = require('playwright/test');
  const { renderFrames } = require('./helpers.cjs');
  test('playable game: every HUD, guide key and virtual controller action', async ({ page, baseURL }, testInfo) => {
    test.setTimeout(300_000);
    const observations = [];
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    const mutation = process.env.E2E_BREAK_CONTROL;
    if (mutation) assert.ok(HUD.includes(mutation), 'E2E_BREAK_CONTROL must name a real HUD button');
    const outputPath = controlReportOutput(testInfo, mutation);
    const write = () => writeControlReport(outputPath, module.exports.catalog, observations);
    await page.addInitScript(() => {
      window.__crawlerPad = null;
      Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => window.__crawlerPad ? [null, null, window.__crawlerPad] : [] });
    });
    // No AI/network API calls; only assets from the assigned local origin may load.
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/') ? route.continue() : route.abort();
    });
    try {
      await page.goto('/game/index.html');
      await page.bringToFront();
      await page.waitForFunction(() => window.gameApp?.running && !document.getElementById('btn-start-duel').disabled, null, { timeout: 45_000 });
      await page.evaluate(async () => {
        window.__controls = {
          hud: await import('/game/src/hud.js'), player: await import('/game/src/player.js'),
          ground: await import('/game/src/ground.js'), grapple: await import('/game/src/grapple.js'),
        };
        window.gameApp.running = false; window.gameApp.soundEnabled = false;
      });
      await renderFrames(page, 2);
      await page.waitForFunction(() => document.hasFocus() && !document.hidden);
      // Deliberate mutation stays in this page only, never source or the checked-in report.
      if (mutation) await page.evaluate(id => {
        const old = document.getElementById(id), broken = old.cloneNode(true);
        old.replaceWith(broken); // strips both onclick and addEventListener handlers
      }, mutation);
      const ids = await page.locator('button[id^="btn-"]').evaluateAll(nodes => nodes.map(n => n.id).sort());
      assert.deepEqual(ids, [...HUD].sort(), 'New HUD buttons must be added to the crawler');
      for (const row of mutation ? cases.filter(row => row.control === mutation) : cases) {
        const errorCount = pageErrors.length;
        let observed, works;
        try {
          observed = await row.run(page);
          assert.deepEqual(pageErrors.slice(errorCount), [], 'No uncaught game errors during control check'); works = true;
        } catch (error) {
          observed = `${error.message}\nstate=${JSON.stringify(await state(page).catch(() => null))}`; works = false;
        } finally {
          await page.evaluate(() => { if (window.gameApp) window.gameApp.running = false; }).catch(() => {});
          await renderFrames(page, 2).catch(() => {});
          for (const key of ['a', 'd', 'q', 'v', 's', 'w', 'j', 'k', 'l', 'f', 'g', 'e', 'r', 'h', 'Escape']) await page.keyboard.up(key).catch(() => {});
        }
        observations.push({ control: row.control, observed, works });
        testInfo.annotations.push({ type: 'control', description: JSON.stringify(observations.at(-1)) });
        expect.soft(works, `${row.control}: ${observed}`).toBe(true);
      }
    } finally {
      write(); await testInfo.attach('controls-report', { path: outputPath, contentType: 'application/json' });
      console.log(`Controls: ${observations.filter(r => r.works).length} of ${cases.length} work; ${observations.filter(r => !r.works).length} failed; ${cases.length - observations.length} untested.`);
    }
  });
  test('/games shows counts from the static controls report', async ({ page }) => {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    await page.goto('/games');
    await expect(page.locator('[data-controls-report]')).toContainText(`controls checked: ${report.filter(r => r.works === true).length} of ${report.length} work`);
  });
}
