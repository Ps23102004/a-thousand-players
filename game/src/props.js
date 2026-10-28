import { startKnockdown } from './ground.js';
import { direction } from './movement.js';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { COLLISION_GROUPS, interactionGroups, registerColliderUserData, lock2DCorridor } from './physics.js';
import { playAnimation } from './animation.js';

let nextPropId = 1;

/**
 * Creates a destructible clay urn / pot.
 * Positioned in the 2.5D fight corridor (Z = 0).
 */
export function createClayPot(scene, world, x = 0, y = 0.5) {
  const propId = nextPropId++;

  const potGroup = new THREE.Group();
  const potMat = new THREE.MeshStandardMaterial({
    color: 0xc2714f,
    roughness: 0.7,
    metalness: 0.1
  });

  const bodyGeo = new THREE.SphereGeometry(0.35, 12, 10);
  bodyGeo.scale(1, 1.2, 1);
  const bodyMesh = new THREE.Mesh(bodyGeo, potMat);
  bodyMesh.position.y = 0.4;
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  potGroup.add(bodyMesh);

  const rimGeo = new THREE.CylinderGeometry(0.2, 0.18, 0.15, 12);
  const rimMesh = new THREE.Mesh(rimGeo, potMat);
  rimMesh.position.y = 0.85;
  rimMesh.castShadow = true;
  potGroup.add(rimMesh);

  potGroup.position.set(x, y, 0);
  scene.add(potGroup);

  const R = world.RAPIER || (globalThis && globalThis.RAPIER) || RAPIER;
  const rbDesc = R.RigidBodyDesc.dynamic()
    .setTranslation(x, y + 0.4, 0)
    .setLinearDamping(0.8)
    .setAngularDamping(1.5);
  const rigidBody = world.createRigidBody(rbDesc);
  lock2DCorridor(rigidBody);

  const colDesc = R.ColliderDesc.cylinder(0.4, 0.35)
    .setFriction(0.6)
    .setRestitution(0.2)
    .setCollisionGroups(
      interactionGroups(
        COLLISION_GROUPS.PROP,
        COLLISION_GROUPS.GROUND | COLLISION_GROUPS.PLAYER_BODY | COLLISION_GROUPS.RIVAL_BODY | COLLISION_GROUPS.PLAYER_ATTACK | COLLISION_GROUPS.RIVAL_ATTACK | COLLISION_GROUPS.BOUNDARY
      )
    );
  const collider = world.createCollider(colDesc, rigidBody);

  const entity = {
    id: propId,
    type: 'pot',
    mesh: potGroup,
    rigidBody,
    collider,
    scene,
    world,
    isBroken: false,
    isCarried: false,
    carrier: null,
    isFlying: false,
    thrownBy: null,
    debrisPieces: [],
    health: 20
  };

  registerColliderUserData(collider.handle, {
    type: 'prop',
    propType: 'pot',
    entity
  });

  return entity;
}

/**
 * Creates a destructible wooden market cart.
 * Can be grabbed, carried, thrown, or kicked.
 */
export function createDestructibleCart(scene, world, x = 0) {
  const propId = nextPropId++;
  const cartGroup = new THREE.Group();
  const fallbackCart = new THREE.Group();
  cartGroup.add(fallbackCart);

  const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.8 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x3d2714, roughness: 0.7 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.4, metalness: 0.6 });

  // Main Cart Basin (bed & walls)
  const bedGeo = new THREE.BoxGeometry(1.6, 0.12, 0.9);
  const bed = new THREE.Mesh(bedGeo, woodMat);
  bed.position.y = 0.5;
  bed.castShadow = true;
  fallbackCart.add(bed);

  // Side slats
  for (let sz of [-0.4, 0.4]) {
    const slatGeo = new THREE.BoxGeometry(1.6, 0.45, 0.08);
    const slat = new THREE.Mesh(slatGeo, woodMat);
    slat.position.set(0, 0.75, sz);
    slat.castShadow = true;
    fallbackCart.add(slat);
  }

  // End boards
  for (let sx of [-0.78, 0.78]) {
    const endGeo = new THREE.BoxGeometry(0.08, 0.45, 0.88);
    const endMesh = new THREE.Mesh(endGeo, woodMat);
    endMesh.position.set(sx, 0.75, 0);
    endMesh.castShadow = true;
    fallbackCart.add(endMesh);
  }

  // Two Large Wooden Spoke Wheels
  for (let wz of [-0.5, 0.5]) {
    const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.12, 12);
    wheelGeo.rotateX(Math.PI / 2);
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(-0.25, 0.38, wz);
    wheel.castShadow = true;
    fallbackCart.add(wheel);

    const rimGeo = new THREE.TorusGeometry(0.38, 0.03, 8, 16);
    const rim = new THREE.Mesh(rimGeo, ironMat);
    rim.position.copy(wheel.position);
    fallbackCart.add(rim);
  }

  // Wooden Cart Handles
  const handleGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.1, 8);
  handleGeo.rotateZ(-Math.PI / 6);
  const handle = new THREE.Mesh(handleGeo, woodMat);
  handle.position.set(0.9, 0.7, 0);
  handle.castShadow = true;
  fallbackCart.add(handle);

  cartGroup.position.set(x, 0, 0);
  scene.add(cartGroup);

  const R = world.RAPIER || (globalThis && globalThis.RAPIER) || RAPIER;
  const rbDesc = R.RigidBodyDesc.dynamic()
    .setTranslation(x, 0.5, 0)
    .setLinearDamping(0.6)
    .setAngularDamping(1.2);
  const rigidBody = world.createRigidBody(rbDesc);
  lock2DCorridor(rigidBody);

  const colDesc = R.ColliderDesc.cuboid(0.85, 0.45, 0.5)
    .setFriction(0.55)
    .setRestitution(0.15)
    .setCollisionGroups(
      interactionGroups(
        COLLISION_GROUPS.PROP,
        COLLISION_GROUPS.GROUND | COLLISION_GROUPS.PLAYER_BODY | COLLISION_GROUPS.RIVAL_BODY | COLLISION_GROUPS.PLAYER_ATTACK | COLLISION_GROUPS.RIVAL_ATTACK | COLLISION_GROUPS.BOUNDARY
      )
    );
  const collider = world.createCollider(colDesc, rigidBody);

  const entity = {
    id: propId,
    type: 'cart',
    mesh: cartGroup,
    rigidBody,
    collider,
    scene,
    world,
    isBroken: false,
    isCarried: false,
    carrier: null,
    isFlying: false,
    thrownBy: null,
    debrisPieces: [],
    health: 60
  };

  registerColliderUserData(collider.handle, {
    type: 'prop',
    propType: 'cart',
    entity
  });

  // Asynchronously load real 3D cart model in browser

  return entity;
}

/**
 * Creates a destructible market cardboard box.
 */
export function createCardboardBox(scene, world, x = 0, y = 0.3) {
  const propId = nextPropId++;
  const boxGroup = new THREE.Group();
  const fallbackBox = new THREE.Group();
  boxGroup.add(fallbackBox);

  const boxMat = new THREE.MeshStandardMaterial({ color: 0x926c45, roughness: 0.9 });
  const boxGeo = new THREE.BoxGeometry(0.7, 0.6, 0.7);
  const boxMesh = new THREE.Mesh(boxGeo, boxMat);
  boxMesh.position.y = 0.3;
  boxMesh.castShadow = true;
  boxMesh.receiveShadow = true;
  fallbackBox.add(boxMesh);

  boxGroup.position.set(x, y, 0);
  scene.add(boxGroup);

  const R = world.RAPIER || (globalThis && globalThis.RAPIER) || RAPIER;
  const rbDesc = R.RigidBodyDesc.dynamic()
    .setTranslation(x, y + 0.3, 0)
    .setLinearDamping(0.8)
    .setAngularDamping(1.5);
  const rigidBody = world.createRigidBody(rbDesc);
  lock2DCorridor(rigidBody);

  const colDesc = R.ColliderDesc.cuboid(0.35, 0.3, 0.35)
    .setFriction(0.6)
    .setRestitution(0.1)
    .setCollisionGroups(
      interactionGroups(
        COLLISION_GROUPS.PROP,
        COLLISION_GROUPS.GROUND | COLLISION_GROUPS.PLAYER_BODY | COLLISION_GROUPS.RIVAL_BODY | COLLISION_GROUPS.PLAYER_ATTACK | COLLISION_GROUPS.RIVAL_ATTACK | COLLISION_GROUPS.BOUNDARY
      )
    );
  const collider = world.createCollider(colDesc, rigidBody);

  const entity = {
    id: propId,
    type: 'box',
    mesh: boxGroup,
    rigidBody,
    collider,
    scene,
    world,
    isBroken: false,
    isCarried: false,
    carrier: null,
    isFlying: false,
    thrownBy: null,
    debrisPieces: [],
    health: 25
  };

  registerColliderUserData(collider.handle, {
    type: 'prop',
    propType: 'box',
    entity
  });

  // Asynchronously load real 3D cardboard box model in browser

  return entity;
}

/**
 * Grabs a prop and attaches it to a fighter.
 */
export function grabProp(prop, fighter) {
  if (!prop || prop.isBroken || prop.isCarried) return false;

  prop.rigidBody?.setEnabledTranslations(true,true,true,true);
  prop.isCarried = true;
  prop.carrier = fighter;
  prop.isFlying = false;
  prop.thrownBy = null;
  fighter.carriedProp = prop;

  playAnimation(fighter, 'CARRY_PROP', true);
  return true;
}

/**
 * Throws a prop in the fighter's facing direction.
 */
export function throwProp(prop, fighter, velX = 14, velY = 3.5) {
  if (!prop || !fighter) return false;

  prop.isCarried = false;
  prop.carrier = null;
  prop.isFlying = true;
  prop.thrownBy = fighter;
  fighter.carriedProp = null;

  playAnimation(fighter, 'THROW_PROP');
  fighter.hitRegistered=true; // Damage belongs to the physical projectile, once.

  const pPos = fighter.rigidBody ? fighter.rigidBody.translation() : fighter.mesh.position;
  const dir=direction(fighter);
  const throwX = pPos.x + dir.x * .9, throwZ=pPos.z+dir.z*.9;
  const throwY = pPos.y + 0.8;

  if (prop.rigidBody) {
    prop.rigidBody.setTranslation({ x: throwX, y: throwY, z: throwZ }, true);
    prop.rigidBody.setLinvel({ x: dir.x*Math.abs(velX), y: velY, z: dir.z*Math.abs(velX) }, true);
    prop.rigidBody.setAngvel({ x: 0, y: 0, z: -fighter.facing * 12 }, true);
  }
  return true;
}

/**
 * Breaks a prop on impact, spawning physical splinter/shard debris with outward velocity.
 */
export function breakProp(propEntity, impulseVector = { x: 0, y: 3, z: 0 }) {
  if (!propEntity || propEntity.isBroken) return;
  propEntity.isBroken = true;
  propEntity.isCarried = false;
  propEntity.isFlying = false;

  const { scene, world, mesh, rigidBody } = propEntity;
  const pos = rigidBody ? rigidBody.translation() : mesh.position;
  const R = world.RAPIER || (globalThis && globalThis.RAPIER) || RAPIER;

  // 1. Remove intact mesh & primary physics body
  if (mesh.parent) {
    mesh.parent.remove(mesh);
  }
  if (rigidBody && world.removeRigidBody) {
    world.removeRigidBody(rigidBody);
  }

  // 2. Spawn physical debris chunks
  const pieceCount = propEntity.type === 'cart' ? 8 : 5;
  const debrisMat = propEntity.type === 'cart'
    ? new THREE.MeshStandardMaterial({ color: 0x4a3224, roughness: 0.9 })
    : new THREE.MeshStandardMaterial({ color: 0xad5834, roughness: 0.8 });

  for (let i = 0; i < pieceCount; i++) {
    const isCart = propEntity.type === 'cart';
    const sizeX = isCart ? 0.2 + Math.random() * 0.4 : 0.12 + Math.random() * 0.15;
    const sizeY = isCart ? 0.08 + Math.random() * 0.1 : 0.12 + Math.random() * 0.15;
    const sizeZ = isCart ? 0.15 + Math.random() * 0.2 : 0.08 + Math.random() * 0.1;

    const geo = isCart ? new THREE.BoxGeometry(sizeX, sizeY, sizeZ) : new THREE.DodecahedronGeometry(sizeX);
    const pieceMesh = new THREE.Mesh(geo, debrisMat);
    pieceMesh.position.set(
      pos.x + (Math.random() - 0.5) * 0.6,
      pos.y + (Math.random() - 0.5) * 0.4,
      0
    );
    pieceMesh.castShadow = true;
    scene.add(pieceMesh);

    // Physics body for debris
    const debrisRbDesc = R.RigidBodyDesc.dynamic()
      .setTranslation(pieceMesh.position.x, pieceMesh.position.y, 0)
      .setLinearDamping(0.8)
      .setAngularDamping(1.5);
    const debrisRb = world.createRigidBody(debrisRbDesc);
    lock2DCorridor(debrisRb);

    const debrisColDesc = R.ColliderDesc.cuboid(sizeX / 2, sizeY / 2, sizeZ / 2)
      .setFriction(0.6)
      .setRestitution(0.3)
      .setCollisionGroups(
        interactionGroups(COLLISION_GROUPS.DEBRIS, COLLISION_GROUPS.GROUND | COLLISION_GROUPS.BOUNDARY)
      );
    const debrisCol = world.createCollider(debrisColDesc, debrisRb);

    const spreadX = (impulseVector.x || 0) * 0.4 + (Math.random() - 0.5) * 6;
    const spreadY = (impulseVector.y || 2) * 0.6 + Math.random() * 4;
    debrisRb.applyImpulse(new R.Vector3(spreadX, spreadY, 0), true);
    debrisRb.applyTorqueImpulse(new R.Vector3(0, 0, (Math.random() - 0.5) * 2), true);

    propEntity.debrisPieces.push({
      mesh: pieceMesh,
      rigidBody: debrisRb,
      collider: debrisCol,
      spawnTime: performance.now()
    });
  }
}

/**
 * Updates positions of all intact props, carried props, and debris pieces.
 * Handles projectile collision against fighters.
 */
export function updateProps(props = [], deltaTime = 0.016, fighters = []) {
  const now = performance.now();

  for (let prop of props) {
    if (prop.isBroken) {
      // Debris pieces cleanup
      for (let i = prop.debrisPieces.length - 1; i >= 0; i--) {
        const p = prop.debrisPieces[i];
        if (p.rigidBody && p.mesh) {
          const pos = p.rigidBody.translation();
          const rot = p.rigidBody.rotation();
          p.mesh.position.set(pos.x, pos.y, 0);
          p.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
        }

        if (now - p.spawnTime > 4000) {
          if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
          if (p.rigidBody && prop.world.removeRigidBody) {
            prop.world.removeRigidBody(p.rigidBody);
          }
          prop.debrisPieces.splice(i, 1);
        }
      }
      continue;
    }

    // Carried prop: position attached to carrier's chest/hands
    if (prop.isCarried && prop.carrier) {
      const c = prop.carrier;
      const cPos = c.rigidBody ? c.rigidBody.translation() : c.mesh.position;
      const dir=direction(c),holdX=cPos.x+dir.x*.65,holdZ=cPos.z+dir.z*.65;
      const holdY = cPos.y + 0.6;
      prop.mesh.position.set(holdX, holdY, holdZ);
      if (prop.rigidBody) {
        prop.rigidBody.setTranslation({ x: holdX, y: holdY, z: holdZ }, true);
      }
      continue;
    }

    // Free or flying prop: sync with physics body
    if (prop.rigidBody && prop.mesh) {
      const pos = prop.rigidBody.translation();
      const rot = prop.rigidBody.rotation();
      prop.mesh.position.set(pos.x, pos.y, pos.z);
      prop.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);

      // Flying projectile check: did flying prop hit an opponent?
      if (prop.isFlying && fighters.length > 0) {
        for (let f of fighters) {
          if (f === prop.thrownBy || f.health <= 0) continue;
          const fPos = f.rigidBody ? f.rigidBody.translation() : f.mesh.position;
          const dist = Math.hypot(pos.x - fPos.x, pos.y - fPos.y,pos.z-fPos.z);

          if (dist < 1.1) {
            // Impact! Damage fighter and shatter prop
            f.takeDamage(35);
            f.applyImpulse?.({ x: (prop.thrownBy ? prop.thrownBy.facing : 1) * 10, y: 3 });
            startKnockdown(f,{source:prop.thrownBy});
            breakProp(prop, { x: (prop.thrownBy ? prop.thrownBy.facing : 1) * 12, y: 4, z: 0 });
            break;
          }
        }
      }

      // Check if a fighter in BEING_THROWN state crashed into this prop
      for (let f of fighters) {
        if (f.state === 'BEING_THROWN') {
          const fPos = f.rigidBody ? f.rigidBody.translation() : f.mesh.position;
          const dist = Math.hypot(pos.x - fPos.x, pos.y - fPos.y,pos.z-fPos.z);
          if (dist < 1.3) {
            // Prop shatters under the thrown body!
            f.takeDamage(20);
            breakProp(prop, { x: f.facing * 14, y: 4, z: 0 });
            break;
          }
        }
      }
    }
  }
}
