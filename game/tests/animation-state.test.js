import { describe, it, expect } from 'vitest';
import { createFighterRig } from '../src/character.js';
import { playAnimation, updateAnimation, ANIMATIONS } from '../src/animation.js';
import { initPhysics, stepPhysics } from '../src/physics.js';
import * as THREE from 'three';

describe('Character Hierarchy & Animation State Machine', () => {
  it('creates articulated humanoid fighter rig with joint hierarchy and Rapier body', async () => {
    const { world } = await initPhysics();
    const scene = new THREE.Scene();
    const fighter = createFighterRig(scene, world, true, -2.5);

    expect(fighter).toBeDefined();
    expect(fighter.isPlayer).toBe(true);
    expect(fighter.rigidBody).toBeDefined();
    expect(fighter.mesh).toBeDefined();
    expect(fighter.joints).toBeDefined();

    // Core articulated bones
    expect(fighter.joints.root).toBeDefined();
    expect(fighter.joints.hips).toBeDefined();
    expect(fighter.joints.chest).toBeDefined();
    expect(fighter.joints.head).toBeDefined();
    expect(fighter.joints.leftArm).toBeDefined();
    expect(fighter.joints.rightArm).toBeDefined();
    expect(fighter.joints.leftForearm).toBeDefined();
    expect(fighter.joints.rightForearm).toBeDefined();
    expect(fighter.joints.leftHand).toBeDefined();
    expect(fighter.joints.rightHand).toBeDefined();
    expect(fighter.joints.leftThigh).toBeDefined();
    expect(fighter.joints.rightThigh).toBeDefined();
    expect(fighter.joints.leftShin).toBeDefined();
    expect(fighter.joints.rightShin).toBeDefined();
  });

  it('correctly transitions from IDLE to JAB and steps through STARTUP, ACTIVE, and RECOVERY', async () => {
    const { world } = await initPhysics();
    const scene = new THREE.Scene();
    const fighter = createFighterRig(scene, world, true, -2.0);

    expect(fighter.state).toBe('IDLE');

    playAnimation(fighter, 'JAB');
    expect(fighter.currentAnim).toBe('JAB');
    expect(fighter.state).toBe('STARTUP');

    // Advance 0.08s -> reaches ACTIVE phase
    updateAnimation(fighter, 0.08);
    expect(fighter.state).toBe('ACTIVE');

    // Advance 0.12s -> reaches RECOVERY phase
    updateAnimation(fighter, 0.12);
    expect(fighter.state).toBe('RECOVERY');

    // Advance remaining frames -> returns to IDLE
    updateAnimation(fighter, 0.20);
    expect(fighter.state).toBe('IDLE');
  });

  it('supports full combat moveset (JAB, CROSS, ROUNDHOUSE_KICK, SWEEP, BLOCK, PARRY, HIT_STUN)', async () => {
    const { world } = await initPhysics();
    const scene = new THREE.Scene();
    const fighter = createFighterRig(scene, world, false, 2.0);

    const moves = ['JAB', 'CROSS', 'ROUNDHOUSE_KICK', 'SWEEP', 'BLOCK', 'PARRY', 'HIT_STUN', 'KNOCKDOWN'];
    for (let move of moves) {
      expect(ANIMATIONS[move]).toBeDefined();
      playAnimation(fighter, move);
      expect(fighter.currentAnim).toBe(move);
    }
  });

  it('syncs 3D mesh position with Rapier physics translation', async () => {
    const { world } = await initPhysics();
    const scene = new THREE.Scene();
    const fighter = createFighterRig(scene, world, true, -3.0);

    // Initial position
    expect(fighter.mesh.position.x).toBeCloseTo(-3.0, 1);

    // Apply small movement impulse to body and step
    fighter.rigidBody.setLinvel({ x: 2.0, y: 0.0, z: 0.0 }, true);
    stepPhysics(1 / 60);
    fighter.updatePhysics(1 / 60);

    const bodyPos = fighter.rigidBody.translation();
    expect(fighter.mesh.position.x).toBeCloseTo(bodyPos.x, 2);
  });
});
