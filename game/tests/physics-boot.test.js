import { describe, it, expect } from 'vitest';
import {
  initPhysics,
  stepPhysics,
  createCorridorBoundary,
  lock2DCorridor,
  getWorld,
  getRapier
} from '../src/physics.js';
import { GameApp } from '../src/main.js';

describe('Physics Bootstrapper', () => {
  it('initializes Rapier world with gravity [0, -9.81, 0]', async () => {
    const { world, RAPIER } = await initPhysics();
    expect(world).toBeDefined();
    expect(RAPIER).toBeDefined();
    expect(world.gravity.y).toBeCloseTo(-9.81);
    expect(getWorld()).toBe(world);
    expect(getRapier()).toBe(RAPIER);
  });

  it('steps physics simulation over deltaTime without error', async () => {
    const { world, RAPIER } = await initPhysics();
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 5, 0);
    const body = world.createRigidBody(bodyDesc);
    const colDesc = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5);
    world.createCollider(colDesc, body);

    const initialY = body.translation().y;
    stepPhysics(1 / 60);
    const afterY = body.translation().y;

    // Body should accelerate downwards under gravity
    expect(afterY).toBeLessThan(initialY);
  });

  it('creates 2.5D corridor boundaries preventing out-of-bounds movement', async () => {
    const { world } = await initPhysics();
    const initialColliderCount = world.colliders.len();

    const boundary = createCorridorBoundary(world);
    expect(boundary).toBeDefined();
    expect(world.colliders.len()).toBeGreaterThan(initialColliderCount);
  });

  it('locks Z-translation for 2.5D combat bodies to prevent drift off action plane', async () => {
    const { world, RAPIER } = await initPhysics();
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 2, 0);
    const body = world.createRigidBody(bodyDesc);
    lock2DCorridor(body);

    // Apply an impulse along Z axis
    body.applyImpulse({ x: 0, y: 0, z: 100 }, true);
    stepPhysics(1 / 60);

    // Body should remain strictly at Z = 0
    expect(body.translation().z).toBeCloseTo(0, 5);
  });

  it('exports GameApp engine bootstrapper class', () => {
    expect(GameApp).toBeDefined();
    const app = new GameApp();
    expect(app.running).toBe(false);
    expect(typeof app.init).toBe('function');
  });
});
