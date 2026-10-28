import { describe, it, expect } from 'vitest';
import { checkHitCollisions, resolveDamageAndImpulse, applyHitStop, updateHitStop } from '../src/combat.js';

describe('Combat Solver & Tekken Hit-Stop', () => {
  it('detects attack capsule overlap and applies kinetic knockback impulse', () => {
    const mockAttacker = {
      isPlayer: true,
      facing: 1,
      state: 'ACTIVE',
      currentAnim: 'CROSS',
      getHitboxBounds: () => ({ minX: 0, maxX: 1.0, minY: 0.8, maxY: 1.6, z: 0 }),
      hitRegistered: false
    };
    const mockDefender = {
      isPlayer: false,
      health: 100,
      posture: 0,
      isGuarding: false,
      state: 'IDLE',
      getHurtboxBounds: () => ({ minX: 0.4, maxX: 1.1, minY: 0.6, maxY: 1.8, z: 0 }),
      applyImpulse: (vec) => { mockDefender.lastImpulse = vec; },
      takeDamage: (amt) => { mockDefender.health -= amt; }
    };

    const hits = checkHitCollisions(mockAttacker, mockDefender, []);
    expect(hits.length).toBe(1);

    resolveDamageAndImpulse(hits[0]);
    expect(mockDefender.health).toBe(82); // 100 - 18
    expect(mockDefender.lastImpulse.x).toBeGreaterThan(0);
    expect(mockAttacker.hitRegistered).toBe(true);
  });

  it('reduces damage by 80% and applies posture damage when defender is guarding', () => {
    const mockAttacker = {
      isPlayer: true,
      facing: 1,
      state: 'ACTIVE',
      currentAnim: 'CROSS',
      getHitboxBounds: () => ({ minX: 0, maxX: 1.0, minY: 0.8, maxY: 1.6, z: 0 }),
      hitRegistered: false
    };
    const mockDefender = {
      isPlayer: false,
      health: 100,
      posture: 10,
      isGuarding: true,
      state: 'BLOCK',
      getHurtboxBounds: () => ({ minX: 0.4, maxX: 1.1, minY: 0.6, maxY: 1.8, z: 0 }),
      applyImpulse: (vec) => { mockDefender.lastImpulse = vec; },
      takeDamage: (amt) => { mockDefender.health -= amt; }
    };

    const hits = checkHitCollisions(mockAttacker, mockDefender, []);
    resolveDamageAndImpulse(hits[0]);

    // Cross damage = 18. Blocked = 18 * 0.2 = 3.6 -> 4 damage
    expect(mockDefender.health).toBe(96);
    expect(mockDefender.posture).toBeGreaterThan(10);
  });

  it('triggers parry counter-stagger if defender is in active parry window', () => {
    const mockAttacker = {
      isPlayer: false,
      facing: -1,
      state: 'ACTIVE',
      currentAnim: 'JAB',
      getHitboxBounds: () => ({ minX: -1.0, maxX: 0, minY: 0.8, maxY: 1.6, z: 0 }),
      hitRegistered: false,
      stagger: () => { mockAttacker.isStaggered = true; }
    };
    const mockDefender = {
      isPlayer: true,
      health: 100,
      posture: 0,
      state: 'PARRY',
      getHurtboxBounds: () => ({ minX: -0.8, maxX: 0.2, minY: 0.6, maxY: 1.8, z: 0 }),
      takeDamage: (amt) => { mockDefender.health -= amt; }
    };

    const hits = checkHitCollisions(mockAttacker, mockDefender, []);
    resolveDamageAndImpulse(hits[0]);

    expect(mockDefender.health).toBe(100); // 0 damage on parry
    expect(mockAttacker.isStaggered).toBe(true);
  });

  it('dilates fighter animation speeds during hit-stop and restores after duration', () => {
    const f1 = { animSpeed: 1.0 };
    const f2 = { animSpeed: 1.0 };

    applyHitStop(f1, f2, 4); // 4 frames = ~0.066s
    expect(f1.animSpeed).toBeCloseTo(0.05);
    expect(f2.animSpeed).toBeCloseTo(0.05);

    updateHitStop(0.03); // half duration
    expect(f1.animSpeed).toBeCloseTo(0.05);

    updateHitStop(0.05); // completes hit-stop
    expect(f1.animSpeed).toBe(1.0);
    expect(f2.animSpeed).toBe(1.0);
  });
});
