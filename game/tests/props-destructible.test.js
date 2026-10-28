import { describe, it, expect } from 'vitest';
import { createClayPot, createDestructibleCart, breakProp, updateProps } from '../src/props.js';
import { createMarketEnvironment } from '../src/world.js';
import { initPhysics, stepPhysics } from '../src/physics.js';
import * as THREE from 'three';

describe('Market World and Destructible Props', () => {
  it('creates market environment with ground, storefronts, and lanterns', async () => {
    const { world } = await initPhysics();
    const scene = new THREE.Scene();
    const env = createMarketEnvironment(scene, world);

    expect(env).toBeDefined();
    expect(env.groundCollider).toBeDefined();
    expect(env.storefronts.length).toBeGreaterThan(0);
    expect(env.lanterns.length).toBeGreaterThan(0);
    expect(scene.children.length).toBeGreaterThan(5);
  });

  it('breaks clay pot into physical debris pieces on impact', async () => {
    const { world } = await initPhysics();
    const scene = new THREE.Scene();
    const pot = createClayPot(scene, world, 2.0, 0.5);

    expect(pot.isBroken).toBe(false);
    expect(pot.rigidBody).toBeDefined();

    breakProp(pot, { x: 5, y: 2, z: 0 });

    expect(pot.isBroken).toBe(true);
    expect(pot.debrisPieces.length).toBeGreaterThanOrEqual(4);

    // Debris pieces have active rigid bodies and meshes
    expect(pot.debrisPieces[0].rigidBody).toBeDefined();
    expect(pot.debrisPieces[0].mesh.parent).toBe(scene);
  });

  it('creates and breaks a wooden pushcart into timber planks', async () => {
    const { world } = await initPhysics();
    const scene = new THREE.Scene();
    const cart = createDestructibleCart(scene, world, 4.0);

    expect(cart.isBroken).toBe(false);
    expect(cart.rigidBody).toBeDefined();

    breakProp(cart, { x: 12, y: 3, z: 0 });

    expect(cart.isBroken).toBe(true);
    expect(cart.debrisPieces.length).toBeGreaterThanOrEqual(6);
  });

  it('syncs prop meshes with Rapier rigid bodies during updateProps', async () => {
    const { world } = await initPhysics();
    const scene = new THREE.Scene();
    const pot = createClayPot(scene, world, 0.0, 2.0);

    // Run physics step
    stepPhysics(1 / 60);
    updateProps([pot], 1 / 60);

    // Pot should fall due to gravity or match body position
    const bodyPos = pot.rigidBody.translation();
    expect(pot.mesh.position.x).toBeCloseTo(bodyPos.x, 2);
    expect(pot.mesh.position.y).toBeCloseTo(bodyPos.y, 2);
  });
});
