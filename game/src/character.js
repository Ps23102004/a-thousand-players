import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { COLLISION_GROUPS, interactionGroups, registerColliderUserData } from './physics.js';
import { startKnockdown } from './ground.js';
import { direction } from './movement.js';
import { playAnimation, ANIMATIONS } from './animation.js';

let nextFighterId = 1;
export const FIGHTERS = {
  kai: { name: 'KAI', title: 'THE NIGHTHAWK', style: 'KICKBOXING', color: 0xe85437, skin: 0xc38b65, hair: 0x151b22, pants: 0x1d2730 },
  rook: { name: 'ROOK', title: 'THE IRON WALL', style: 'STREET BOXING', color: 0x86b8ac, skin: 0x78513e, hair: 0x191715, pants: 0x30393d }
};

/** Original articulated geometry. Every visible limb belongs to its animated joint. */
export function createFighterRig(scene, world, isPlayer = true, startX = 0, profile = isPlayer ? 'kai' : 'rook') {
  const def = FIGHTERS[profile] || FIGHTERS.kai;
  const root = new THREE.Group();
  root.name = def.name;
  const joints = { root };
  const mat = (color, roughness = 0.7) => new THREE.MeshStandardMaterial({ color, roughness, flatShading: true });
  const skin = mat(def.skin), cloth = mat(def.color), pants = mat(def.pants), dark = mat(0x11191f);
  const tape = mat(0xeee2cd), gold = mat(0xdbb97d, 0.4), hair = mat(def.hair);
  const mesh = (parent, geometry, material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };
  const box = (p, w, h, d, m, x = 0, y = 0, z = 0) => mesh(p, new THREE.BoxGeometry(w, h, d), m, x, y, z);
  const joint = (name, parent, x, y, z) => {
    const j = new THREE.Group(); j.name = name; j.position.set(x, y, z); parent.add(j); joints[name] = j; return j;
  };
  const hips = joint('hips', root, 0, 0.91, 0);
  box(hips, 0.38, 0.23, 0.27, pants, 0, -0.01);
  box(hips, 0.41, 0.065, 0.30, dark, 0, 0.10);
  box(hips, 0.09, 0.08, 0.025, gold, 0, 0.10, 0.16);
  const chest = joint('chest', hips, 0, 0.16, 0);
  const torso = mesh(chest, new THREE.CylinderGeometry(0.29, 0.22, 0.49, 8), cloth, 0, 0.22);
  torso.scale.z = 0.68;
  // Sleeveless jacket, zipper, piping and an embroidered back panel.
  box(chest, 0.045, 0.42, 0.035, dark, 0, 0.23, 0.19);
  box(chest, 0.018, 0.38, 0.015, gold, 0, 0.24, 0.215);
  for (const s of [-1, 1]) box(chest, 0.035, 0.44, 0.028, tape, s * 0.18, 0.23, 0.15);
  box(chest, 0.24, 0.23, 0.025, dark, 0, 0.28, -0.19);
  box(chest, 0.035, 0.19, 0.025, cloth, 0, 0.28, -0.21).rotation.z = 0.6;
  mesh(chest, new THREE.CylinderGeometry(0.085, 0.10, 0.13, 10), skin, 0, 0.51);
  const head = joint('head', chest, 0, 0.56, 0);
  const skull = mesh(head, new THREE.IcosahedronGeometry(0.19, 2), skin, 0, 0.13);
  skull.scale.set(0.87, 1.16, 0.9);
  box(head, 0.22, 0.10, 0.20, skin, 0, 0.04, 0.025);
  box(head, 0.055, 0.065, 0.06, skin, 0, 0.12, 0.17);
  for (const s of [-1, 1]) {
    box(head, 0.065, 0.025, 0.025, dark, s * 0.075, 0.17, 0.16);
    box(head, 0.058, 0.018, 0.025, tape, s * 0.075, 0.137, 0.167);
    box(head, 0.019, 0.018, 0.012, dark, s * 0.075, 0.137, 0.184);
    mesh(head, new THREE.SphereGeometry(0.04, 8, 6), skin, s * 0.17, 0.12);
  }
  box(head, 0.07, 0.012, 0.02, dark, 0, 0.03, 0.135);
  if (profile === 'kai') {
    const cap = mesh(head, new THREE.SphereGeometry(0.182, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), hair, 0, 0.24);
    cap.scale.set(0.98, 0.75, 0.95);
    for (let i = 0; i < 5; i++) {
      const spike = mesh(head, new THREE.ConeGeometry(0.07, 0.16, 4), hair, (i - 2) * 0.065, 0.35, -0.02);
      spike.rotation.z = -(i - 2) * 0.18;
    }
    box(head, 0.315, 0.045, 0.32, cloth, 0, 0.215, 0);
    const tail = box(head, 0.055, 0.32, 0.025, cloth, 0.10, 0.05, -0.19); tail.rotation.x = -0.4;
  } else {
    const cap = mesh(head, new THREE.SphereGeometry(0.178, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), hair, 0, 0.25);
    cap.scale.y = 0.3;
    box(head, 0.20, 0.07, 0.08, hair, 0, -0.005, 0.09);
    box(chest, 0.26, 0.045, 0.025, gold, 0, 0.43, 0.19);
  }
  for (const [name, s] of [['left', 1], ['right', -1]]) {
    const arm = joint(name + 'Arm', chest, s * 0.28, 0.39, 0);
    mesh(arm, new THREE.SphereGeometry(0.115, 10, 8), skin, 0, -0.06);
    mesh(arm, new THREE.CapsuleGeometry(0.084, 0.17, 4, 10), skin, 0, -0.17);
    const fore = joint(name + 'Forearm', arm, 0, -0.33, 0);
    mesh(fore, new THREE.CapsuleGeometry(0.072, 0.15, 4, 10), skin, 0, -0.13);
    mesh(fore, new THREE.CylinderGeometry(0.078, 0.079, 0.13, 10), tape, 0, -0.22);
    for (let i = 0; i < 3; i++) mesh(fore, new THREE.CylinderGeometry(0.080, 0.080, 0.012, 10), dark, 0, -0.18 - i * 0.035);
    const hand = joint(name + 'Hand', fore, 0, -0.29, 0);
    const fist = mesh(hand, new THREE.SphereGeometry(0.105, 10, 8), tape, 0, -0.035, 0.025); fist.scale.z = 1.15;
    box(hand, 0.15, 0.045, 0.025, cloth, 0, -0.04, 0.12);
    const thigh = joint(name + 'Thigh', hips, s * 0.14, -0.10, 0);
    mesh(thigh, new THREE.CapsuleGeometry(0.105, 0.22, 4, 10), pants, 0, -0.19);
    box(thigh, 0.028, 0.34, 0.12, cloth, s * 0.102, -0.19);
    const shin = joint(name + 'Shin', thigh, 0, -0.38, 0);
    mesh(shin, new THREE.CapsuleGeometry(0.078, 0.23, 4, 10), pants, 0, -0.18);
    mesh(shin, new THREE.CylinderGeometry(0.084, 0.085, 0.12, 10), tape, 0, -0.29);
    box(shin, 0.16, 0.11, 0.31, dark, 0, -0.36, 0.07);
    box(shin, 0.17, 0.025, 0.32, tape, 0, -0.405, 0.07);
  }
  if (profile === 'rook') { chest.scale.x = 1.18; head.scale.setScalar(1.04); }
  root.position.set(startX, 0, 0); root.rotation.y = isPlayer ? Math.PI / 2 : -Math.PI / 2; scene.add(root);
  const rb = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(startX, 0.9, 0).setLinearDamping(5).lockRotations());
  rb.setEnabledRotations(false, false, false, true);
  const member = isPlayer ? COLLISION_GROUPS.PLAYER_BODY : COLLISION_GROUPS.RIVAL_BODY;
  const filter = COLLISION_GROUPS.GROUND | COLLISION_GROUPS.PROP | COLLISION_GROUPS.BOUNDARY | (isPlayer ? COLLISION_GROUPS.RIVAL_BODY : COLLISION_GROUPS.PLAYER_BODY);
  const collider = world.createCollider(RAPIER.ColliderDesc.capsule(0.48, 0.32).setFriction(0).setMass(4).setCollisionGroups(interactionGroups(member, filter)), rb);
  const fighter = {
    id: nextFighterId++, isPlayer, profile, name: def.name, mesh: root, joints, rigidBody: rb, collider, scene, world,
    state: 'IDLE', currentAnim: 'IDLE', animTime: 0, animDuration: 1.2, animLoop: true, animSpeed: 1,
    aim: {x:isPlayer?1:-1,z:0}, staggerLoad:0, recoveryInvulnerability:0, health: 100, maxHealth: 100, posture: 0, maxPosture: 100, facing: isPlayer ? 1 : -1,
    isGuarding: false, hitRegistered: false, grabbedBy: null, grabbedTarget: null, carriedProp: null,
    updatePhysics(delta) {
      const t = rb.translation();
      if (this.state === 'GRABBED' && this.grabbedBy) {
        const g = this.grabbedBy.rigidBody.translation();
        const aim=direction(this.grabbedBy);
        rb.setTranslation({ x: g.x + aim.x * .7, y: this.grapple ? g.y : g.y + .3, z: g.z + aim.z * .7 }, true);
        rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
      const p = rb.translation(); root.position.set(p.x, p.y - 0.80, p.z);
      const aim=direction(this); root.rotation.y = Math.atan2(aim.x,aim.z);
      if (this.state === 'BEING_THROWN' && t.y < 0.86 && rb.linvel().y <= 0) startKnockdown(this,{landed:true});
      this.staggerLoad=Math.max(0,this.staggerLoad-delta*.45);
      this.recoveryInvulnerability=Math.max(0,this.recoveryInvulnerability-delta);
      this.posture = Math.max(0, this.posture - delta * 9);
    },
    getHurtboxBounds() {
      const p = rb.translation(); const crouch = this.isCrouching;
      return { minX: p.x - 0.30, maxX: p.x + 0.30, minY: p.y - 0.65, maxY: p.y + (crouch ? 0.05 : 1.0), minZ:p.z-.29,maxZ:p.z+.29,z:p.z };
    },
    getHitboxBounds() {
      const p=rb.translation(), anim=ANIMATIONS[this.currentAnim]||{},low=anim.isLowSweep,dir=direction(this);
      const reach=anim.reach||(this.currentAnim.includes('KICK')||low?1.35:1.05);
      const end={x:p.x+dir.x*reach,z:p.z+dir.z*reach};
      const y=low?[-.65,-.15]:anim.height==='body'?[-.25,.20]:anim.height==='high'?[.5,1.0]:[.15,.8];
      return {minX:Math.min(p.x,end.x)-.16,maxX:Math.max(p.x,end.x)+.16,minY:p.y+y[0],maxY:p.y+y[1],minZ:Math.min(p.z,end.z)-.22,maxZ:Math.max(p.z,end.z)+.22,z:end.z};
    },
    takeDamage(amount) { this.health = Math.max(0, this.health - amount); },
    applyImpulse(v) { rb.applyImpulse({ x: v.x, y: v.y || 0, z: v.z || 0 }, true); }
  };
  registerColliderUserData(collider.handle, { type: 'fighter', isPlayer, entity: fighter });
  playAnimation(fighter, 'IDLE', true);
  return fighter;
}

export function disposeFighter(fighter) {
  if (!fighter) return;
  fighter.scene.remove(fighter.mesh);
  const geometries = new Set(), materials = new Set();
  fighter.mesh.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) materials.add(o.material); });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
}
