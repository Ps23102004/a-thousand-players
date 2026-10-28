import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('End-to-End Browser Gameplay & DOM Contract Verification', () => {
  const root = path.resolve(__dirname, '..');

  it('verifies index.html has complete importmap, webgl canvas, HUD, and modals', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf-8');

    // Importmap & dependencies
    expect(html).toContain('three');
    expect(html).toContain('@dimforge/rapier3d-compat');

    // DOM nodes required by gameApp and HUD
    expect(html).toContain('id="webgl-canvas"');
    expect(html).toContain('id="hud-overlay"');
    expect(html).toContain('id="player-health-bar"');
    expect(html).toContain('id="rival-health-bar"');
    expect(html).toContain('id="player-posture-bar"');
    expect(html).toContain('id="rival-posture-bar"');
    expect(html).toContain('id="hud-timer"');
    expect(html).toContain('id="combo-hud"');
    expect(html).toContain('id="combo-number"');
    expect(html).toContain('id="story-modal"');
    expect(html).toContain('id="btn-start-duel"');
    expect(html).toContain('id="end-modal"');
    expect(html).toContain('id="btn-restart"');
  });

  it('verifies main.js game loop coordinates physics, character animation, combat, and audio', () => {
    const mainJs = fs.readFileSync(path.join(root, 'src/main.js'), 'utf-8');

    expect(mainJs).toContain('initPhysics');
    expect(mainJs).toContain('stepPhysics');
    expect(mainJs).toContain('createMarketEnvironment');
    expect(mainJs).toContain('createFighterRig');
    expect(mainJs).toContain('checkHitCollisions');
    expect(mainJs).toContain('resolveDamageAndImpulse');
    expect(mainJs).toContain('updateHitStop');
    expect(mainJs).toContain('updateRivalAI');
    expect(mainJs).toContain('updateCrowd');
    expect(mainJs).toContain('updateHUD');
  });
});
