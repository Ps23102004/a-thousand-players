import { describe, it, expect } from 'vitest';
import { decideRivalAction, updateRivalAI } from '../src/ai.js';
import { createFighterRig } from '../src/character.js';
import { createClayPot } from '../src/props.js';
import { initPhysics, stepPhysics } from '../src/physics.js';
import * as THREE from 'three';

describe('Rival AI Decision Engine & Whiff Punish', () => {
  it('triggers instant counter-attack when player enters recovery after missing attack', () => {
    const player = { state: 'RECOVERY', distance: 1.2, isGuarding: false };
    const rival = { state: 'IDLE', health: 100, posture: 10 };
    const action = decideRivalAction(rival, player, []);

    expect(['LUNGE_PUNCH', 'ROUNDHOUSE', 'CROSS']).toContain(action.type);
    expect(action.target).toBe('player');
  });

  it('raises block or parries when player begins attack startup at close range', () => {
    const player = { state: 'STARTUP', distance: 1.1, isGuarding: false };
    const rival = { state: 'IDLE', health: 100, posture: 10 };
    const action = decideRivalAction(rival, player, []);

    expect(['BLOCK', 'PARRY', 'RETREAT']).toContain(action.type);
  });

  it('kicks nearest prop if player is turtling in block at medium distance', () => {
    const player = { state: 'BLOCK', distance: 2.8, isGuarding: true };
    const rival = { state: 'IDLE', health: 100, posture: 0 };
    const mockProp = { id: 1, isBroken: false, distanceToRival: 1.0 };
    const action = decideRivalAction(rival, player, [mockProp]);

    expect(action.type).toBe('KICK_PROP');
    expect(action.prop).toBe(mockProp);
  });

  it('maintains distance spacing outside player jab reach during neutral play', async () => {
    const { world } = await initPhysics();
    const scene = new THREE.Scene();
    const player = createFighterRig(scene, world, true, 0.0);
    const rival = createFighterRig(scene, world, false, 0.8); // Too close (<1.5m)

    // Update AI: should backstep to maintain spacing
    updateRivalAI(rival, player, [], 0.016);
    const vel = rival.rigidBody.linvel();
    expect(vel.x).toBeGreaterThan(0); // Moves right away from player
  });
});
