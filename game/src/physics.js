import RAPIER from '@dimforge/rapier3d-compat';

let R = null;
let world = null;
let eventQueue = null;
const collisionListeners = new Set();
const colliderUserDataMap = new Map();

/**
 * 32-bit collision interaction bitmasks for Rapier.
 * High 16 bits = membership, Low 16 bits = filter.
 */
export const COLLISION_GROUPS = {
  GROUND: 0x0001,
  PLAYER_BODY: 0x0002,
  PLAYER_ATTACK: 0x0004,
  RIVAL_BODY: 0x0008,
  RIVAL_ATTACK: 0x0010,
  PROP: 0x0020,
  DEBRIS: 0x0040,
  BOUNDARY: 0x0080
};

export function interactionGroups(memberships, filter) {
  return ((memberships & 0xffff) << 16) | (filter & 0xffff);
}

export function registerColliderUserData(handle, data) {
  if (handle !== undefined && handle !== null) {
    colliderUserDataMap.set(handle, data);
  }
}

export function unregisterColliderUserData(handle) {
  colliderUserDataMap.delete(handle);
}

export function getColliderUserData(handle) {
  return colliderUserDataMap.get(handle) || null;
}

/**
 * Lock Z-translation and X/Y rotations to confine bodies to the 2.5D action plane (Z ≈ 0).
 */
export function lock2DCorridor(rigidBody) {
  if (!rigidBody) return;
  // Enable X and Y translations, disable Z translation
  rigidBody.setEnabledTranslations(true, true, false, true);
  // Enable Z rotation only (for knockbacks / flips on the plane), disable X and Y tilt
  rigidBody.setEnabledRotations(false, false, true, true);
}

/**
 * Initializes the Rapier3D physics engine and simulation world with gravity (0, -9.81, 0).
 */
export async function initPhysics() {
  await RAPIER.init();
  R = RAPIER;

  const gravity = new R.Vector3(0.0, -9.81, 0.0);
  world = new R.World(gravity);
  eventQueue = new R.EventQueue(true);

  return { world, RAPIER: R, eventQueue };
}

export function getWorld() {
  return world;
}

export function getRapier() {
  return R;
}

export function getEventQueue() {
  return eventQueue;
}

/**
 * Register a collision event listener callback(handle1, handle2, started).
 * Returns an unsubscribe function.
 */
export function onCollision(callback) {
  collisionListeners.add(callback);
  return () => collisionListeners.delete(callback);
}

/**
 * Advances the simulation by deltaTime and drains collision events.
 */
export function stepPhysics(deltaTime = 1 / 60) {
  if (!world) return;

  const dt = Math.min(deltaTime, 0.1);
  world.timestep = dt;

  if (eventQueue) {
    world.step(eventQueue);
    eventQueue.drainCollisionEvents((handle1, handle2, started) => {
      for (const listener of collisionListeners) {
        try {
          listener(handle1, handle2, started);
        } catch (err) {
          console.error('Collision listener error:', err);
        }
      }
    });
  } else {
    world.step();
  }
}

/**
 * Creates static boundary colliders (ground, left/right street limits, front/back corridor depth)
 * to confine characters and destructible props to the 2.5D combat corridor.
 */
export function createCorridorBoundary(targetWorld = world, {
  streetLength = 50.0,
  streetWidth = 3.0,
  wallHeight = 10.0
} = {}) {
  const w = targetWorld || world;
  const r = R || RAPIER;
  if (!w || !r) throw new Error('Physics world is not initialized');

  const halfLength = streetLength / 2;
  const halfDepth = streetWidth / 2;

  // Ground plane: centered at y = -0.5 with thickness 1.0 -> surface at y = 0.0
  const groundBodyDesc = r.RigidBodyDesc.fixed().setTranslation(0.0, -0.5, 0.0);
  const groundBody = w.createRigidBody(groundBodyDesc);
  const groundColliderDesc = r.ColliderDesc.cuboid(halfLength + 5.0, 0.5, halfDepth + 5.0)
    .setFriction(0.8)
    .setRestitution(0.05);
  const groundCollider = w.createCollider(groundColliderDesc, groundBody);
  registerColliderUserData(groundCollider.handle, { type: 'ground' });

  // Boundary walls (Left, Right, Back, Front)
  const walls = [];

  const wallConfigs = [
    // Left boundary
    { pos: [-halfLength, wallHeight / 2, 0], hx: 0.5, hy: wallHeight / 2, hz: halfDepth + 2.0, name: 'left_boundary' },
    // Right boundary
    { pos: [halfLength, wallHeight / 2, 0], hx: 0.5, hy: wallHeight / 2, hz: halfDepth + 2.0, name: 'right_boundary' },
    // Back depth boundary (prevents drift into background)
    { pos: [0, wallHeight / 2, -halfDepth], hx: halfLength, hy: wallHeight / 2, hz: 0.5, name: 'back_boundary' },
    // Front depth boundary (prevents drift towards camera)
    { pos: [0, wallHeight / 2, halfDepth], hx: halfLength, hy: wallHeight / 2, hz: 0.5, name: 'front_boundary' }
  ];

  for (const cfg of wallConfigs) {
    const wallBodyDesc = r.RigidBodyDesc.fixed().setTranslation(...cfg.pos);
    const wallBody = w.createRigidBody(wallBodyDesc);
    const wallColDesc = r.ColliderDesc.cuboid(cfg.hx, cfg.hy, cfg.hz)
      .setFriction(0.2)
      .setRestitution(0.1);
    const wallCol = w.createCollider(wallColDesc, wallBody);
    registerColliderUserData(wallCol.handle, { type: 'boundary', name: cfg.name });
    walls.push({ body: wallBody, collider: wallCol, name: cfg.name });
  }

  return { ground: { body: groundBody, collider: groundCollider }, walls };
}

/**
 * Removes a rigid body and unregisters all of its colliders' user data.
 */
export function removeRigidBody(rigidBody, targetWorld = world) {
  const w = targetWorld || world;
  if (!w || !rigidBody) return;
  for (let i = 0; i < rigidBody.numColliders(); i++) {
    const col = rigidBody.collider(i);
    if (col) unregisterColliderUserData(col.handle);
  }
  w.removeRigidBody(rigidBody);
}
