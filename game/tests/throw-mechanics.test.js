import { describe, it, expect } from 'vitest';
import { initPhysics, stepPhysics } from '../src/physics.js';
import { createFighterRig } from '../src/character.js';
import { createDestructibleCart, createCardboardBox, grabProp, throwProp, updateProps } from '../src/props.js';
import { executeThrowOpponent } from '../src/player.js';
import * as THREE from 'three';

describe('2.5D Throw Mechanics: Person & Prop', () => {
  it('executes a judo throw on an opponent, applying high airborne impulse and damage', async () => {
    const { world } = await initPhysics();
    const scene = new THREE.Scene();

    const attacker = createFighterRig(scene, world, true, -1.0);
    const defender = createFighterRig(scene, world, false, 0.2);

    expect(defender.health).toBe(100);
    expect(attacker.facing).toBe(1);

    executeThrowOpponent(attacker, defender);

    // Defender should take heavy throw damage
    expect(defender.health).toBe(68); // 100 - 32
    expect(defender.state).toBe('BEING_THROWN');
    expect(attacker.state).toBe('ACTIVE');

    // Defender rigid body should have positive forward X and upward Y velocity
    const linvel = defender.rigidBody.linvel();
    expect(linvel.x).toBeGreaterThan(10);
    expect(linvel.y).toBeGreaterThan(4);
    expect(linvel.z).toBe(0); // Strictly constrained to 2.5D plane
  });

  it('allows fighter to pick up and throw a prop as a projectile', async () => {
    const { world } = await initPhysics();
    const scene = new THREE.Scene();

    const fighter = createFighterRig(scene, world, true, -2.0);
    const cart = createDestructibleCart(scene, world, -1.5);

    expect(cart.isCarried).toBe(false);

    // 1. Pick up prop
    const grabbed = grabProp(cart, fighter);
    expect(grabbed).toBe(true);
    expect(cart.isCarried).toBe(true);
    expect(fighter.carriedProp).toBe(cart);

    // 2. Throw prop
    const thrown = throwProp(cart, fighter, fighter.facing * 16, 4.0);
    expect(thrown).toBe(true);
    expect(cart.isCarried).toBe(false);
    expect(cart.isFlying).toBe(true);
    expect(cart.thrownBy).toBe(fighter);
    expect(fighter.carriedProp).toBe(null);

    const cartVel = cart.rigidBody.linvel();
    expect(cartVel.x).toBeGreaterThan(12);
    expect(cartVel.y).toBeGreaterThan(2);
    expect(cartVel.z).toBe(0); // 2.5D locked
  });

  it('damages target and shatters when a flying prop hits a fighter', async () => {
    const { world } = await initPhysics();
    const scene = new THREE.Scene();

    const attacker = createFighterRig(scene, world, true, -2.0);
    const target = createFighterRig(scene, world, false, 1.0);
    const box = createCardboardBox(scene, world, 0.8, 0.5);

    // Mark box as flying from attacker
    box.isFlying = true;
    box.thrownBy = attacker;

    expect(target.health).toBe(100);
    expect(box.isBroken).toBe(false);

    // Update props with target in list
    updateProps([box], 0.016, [attacker, target]);

    // Box should shatter and target should take damage
    expect(target.health).toBeLessThan(100);
    expect(box.isBroken).toBe(true);
    expect(box.debrisPieces.length).toBeGreaterThan(0);
  });

  it('shatters a prop when an airborne thrown fighter crashes into it', async () => {
    const { world } = await initPhysics();
    const scene = new THREE.Scene();

    const thrownFighter = createFighterRig(scene, world, false, 0.0);
    thrownFighter.state = 'BEING_THROWN';
    thrownFighter.health = 70;

    const cart = createDestructibleCart(scene, world, 0.3);
    expect(cart.isBroken).toBe(false);

    updateProps([cart], 0.016, [thrownFighter]);

    expect(cart.isBroken).toBe(true);
    expect(thrownFighter.health).toBe(50); // Extra 20 crash damage
  });
});
