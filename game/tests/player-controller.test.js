import { describe, it, expect } from 'vitest';
import { updatePlayerStateFromInput, processPlayerInput, resetInputBuffer } from '../src/player.js';
import { createFighterRig } from '../src/character.js';
import { initPhysics } from '../src/physics.js';
import * as THREE from 'three';

describe('Player Combat Controller & Input Buffer', () => {
  it('chains J -> J into 2-hit punch combo within buffer window', () => {
    let state = { comboIndex: 0, lastInputTime: 1000, currentMove: null };
    state = updatePlayerStateFromInput(state, 'J', 1100);
    expect(state.currentMove).toBe('JAB');
    expect(state.comboIndex).toBe(1);

    state = updatePlayerStateFromInput(state, 'J', 1250);
    expect(state.currentMove).toBe('CROSS');
    expect(state.comboIndex).toBe(2);
  });

  it('resets combo if input exceeds 800ms buffer window', () => {
    let state = { comboIndex: 0, lastInputTime: 1000, currentMove: null };
    state = updatePlayerStateFromInput(state, 'J', 1100);
    expect(state.currentMove).toBe('JAB');

    // 1000ms later -> exceeds 800ms combo window
    state = updatePlayerStateFromInput(state, 'J', 2100);
    expect(state.currentMove).toBe('JAB'); // Restarts at jab
    expect(state.comboIndex).toBe(1);
  });

  it('branches into roundhouse kick or low sweep with K and S+K inputs', () => {
    let state = { comboIndex: 0, lastInputTime: 1000, currentMove: null };
    state = updatePlayerStateFromInput(state, 'K', 1100, { crouch: false });
    expect(state.currentMove).toBe('ROUNDHOUSE_KICK');

    state = updatePlayerStateFromInput(state, 'K', 1200, { crouch: true });
    expect(state.currentMove).toBe('SWEEP');
  });

  it('handles movement and auto-guard when retreating away from enemy', async () => {
    const { world } = await initPhysics();
    const scene = new THREE.Scene();
    const player = createFighterRig(scene, world, true, -2.0);
    const rival = createFighterRig(scene, world, false, 2.0);

    // Player faces +X towards rival. Pressing 'A' moves left (retreating) -> auto-guard
    const keys = { KeyA: true, KeyD: false, KeyW: false, KeyS: false };
    processPlayerInput(player, keys, rival, 0.016);

    expect(player.isGuarding).toBe(true);
    expect(player.state).toBe('BLOCK');
  });
});
