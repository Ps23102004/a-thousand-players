import { startKnockdown } from './ground.js';
import { direction } from './movement.js';
import { ANIMATIONS, playAnimation } from './animation.js';
import { breakProp } from './props.js';
import { RULES } from './tuning.js';

let activeHitStop = null;

/**
 * Checks for collision between active attack hitboxes, defender hurtboxes, and interactive props.
 */
export function checkHitCollisions(attacker, defender, props = []) {
  const hits = [];
  if (!attacker || attacker.grapple || attacker.ground || attacker.mount || defender?.grapple || defender?.ground || defender?.mount || defender?.recoveryInvulnerability>0 || attacker.health === 0 || attacker.state !== 'ACTIVE' || attacker.hitRegistered) {
    return hits;
  }

  const anim = ANIMATIONS[attacker.currentAnim];
  if (!anim || anim.type !== 'attack') {
    return hits;
  }

  const hitBounds = attacker.getHitboxBounds();

  // 1. Check defender hurtbox
  if (defender && defender.health > 0) {
    const hurtBounds = defender.getHurtboxBounds();
    const overlapX = hitBounds.minX < hurtBounds.maxX && hitBounds.maxX > hurtBounds.minX;
    const overlapY = hitBounds.minY < hurtBounds.maxY && hitBounds.maxY > hurtBounds.minY;

    const overlapZ=hitBounds.minZ===undefined || hurtBounds.minZ===undefined || (hitBounds.minZ<hurtBounds.maxZ && hitBounds.maxZ>hurtBounds.minZ);
    if (overlapX && overlapY && overlapZ) {
      hits.push({
        type: 'fighter',
        attacker,
        defender,
        attackData: anim,
        contactPoint: {
          x: (Math.max(hitBounds.minX, hurtBounds.minX) + Math.min(hitBounds.maxX, hurtBounds.maxX)) / 2,
          y: (Math.max(hitBounds.minY, hurtBounds.minY) + Math.min(hitBounds.maxY, hurtBounds.maxY)) / 2,
          z: ((hitBounds.z||0)+(hurtBounds.z||0))/2
        }
      });
    }
  }

  // 2. Check nearby props
  for (let prop of props) {
    if (prop.isBroken) continue;
    const propPos = prop.rigidBody ? prop.rigidBody.translation() : prop.mesh.position;
    const propHalfW = prop.type === 'cart' ? 0.9 : 0.4;
    const propHalfH = prop.type === 'cart' ? 0.6 : 0.5;

    const overlapX = hitBounds.minX < propPos.x + propHalfW && hitBounds.maxX > propPos.x - propHalfW;
    const overlapY = hitBounds.minY < propPos.y + propHalfH && hitBounds.maxY > propPos.y - propHalfH;

    if (overlapX && overlapY && (hitBounds.minZ===undefined || (hitBounds.minZ<propPos.z+.5 && hitBounds.maxZ>propPos.z-.5))) {
      hits.push({
        type: 'prop',
        attacker,
        prop,
        attackData: anim,
        contactPoint: { x: propPos.x, y: propPos.y, z: 0 }
      });
    }
  }

  return hits;
}

/**
 * Applies Tekken-style hit-stop (micro-freeze) to fighters involved in impact.
 */
export function applyHitStop(attacker, defender, frames = 4) {
  if (activeHitStop) for (const f of activeHitStop.fighters) f.animSpeed = 1;
  const duration = (frames / 60); // 4 frames at 60fps = ~0.066s
  activeHitStop = {
    timer: duration,
    fighters: [attacker, defender].filter(Boolean)
  };

  for (let f of activeHitStop.fighters) {
    f.animSpeed = 0.05;
  }
}

/**
 * Updates hit-stop countdown and restores normal animation speed on expiration.
 */
export function updateHitStop(delta) {
  if (!activeHitStop) return;

  activeHitStop.timer -= delta;
  if (activeHitStop.timer <= 0) {
    for (let f of activeHitStop.fighters) {
      f.animSpeed = 1.0;
    }
    activeHitStop = null;
  }
}

/**
 * Resolves damage, guard deflection, posture drain, and physics knockback impulses.
 */
export function resolveDamageAndImpulse(hitResult) {
  if (!hitResult) return;
  const { attacker, attackData, defender, prop } = hitResult;

  attacker.hitRegistered = true;

  if (hitResult.type === 'fighter') {
    // Check if defender is in PARRY window
    if (defender.state === 'PARRY' && (defender.animTime === undefined || defender.animTime <= ANIMATIONS.PARRY.active)) {
      applyHitStop(attacker, defender, 8); // Extended dramatic parry freeze
      if (typeof attacker.stagger === 'function') {
        attacker.stagger();
      } else {
        playAnimation(attacker, 'HIT_STUN');
      }
      return { parried: true, damage: 0 };
    }

    // Check Guard / Block
    let finalDamage = attackData.damage || 10;
    let postureDamage = RULES.postureOnBlock;
    const isGuarding = (defender.isGuarding || defender.state === 'BLOCK') && (!attackData.isLowSweep || defender.isCrouching);

    if (isGuarding) {
      finalDamage = Math.round(finalDamage * RULES.guardDamageMultiplier); // default: 80% damage reduction
      defender.posture = (defender.posture || 0) + postureDamage;
      applyHitStop(attacker, defender, 2);
    } else {
      defender.posture = (defender.posture || 0) + RULES.postureOnHit;
      applyHitStop(attacker, defender, attackData.hitStop || 4);

      defender.staggerLoad=(defender.staggerLoad||0)+(attackData.damage>=22?1.4:1);
      if (attackData.isLowSweep || attackData.knockdown || defender.staggerLoad>=RULES.staggerKnockdownLoad) {
        startKnockdown(defender,{source:attacker});
      } else {
        playAnimation(defender, attackData.height==='body'?'BODY_HIT':'HIT_STUN');
      }
    }

    // Calculate knockback impulse
    const dir = direction(attacker);
    const baseImpulse = attackData.impulse || { x: 5, y: 1 };
    const knockback = {
      x: baseImpulse.x * dir.x * (isGuarding ? 0.4 : 1.0),
      y: baseImpulse.y * (isGuarding ? 0.2 : 1.0),
      z: baseImpulse.x * dir.z * (isGuarding ? .4 : 1)
    };

    if (typeof defender.takeDamage === 'function') {
      defender.takeDamage(finalDamage);
    } else if (defender.health !== undefined) {
      defender.health = Math.max(0, defender.health - finalDamage);
    }
    defender.isGuarding = isGuarding;
    if (defender.posture >= 100) { defender.posture = 0; defender.isGuarding = false; playAnimation(defender, attackData.height==='body'?'BODY_HIT':'HIT_STUN'); }
    if (typeof defender.applyImpulse === 'function') {
      defender.applyImpulse(knockback);
    }

    return {
      parried: false,
      blocked: isGuarding,
      damage: finalDamage,
      knockback, knockedDown:!!defender.ground, cue:attacker.currentAnim?.includes('KICK')||attackData.isLowSweep?'kick':attackData.height==='body'?'body':'punch'
    };
  } else if (hitResult.type === 'prop') {
    applyHitStop(attacker, null, 3);
    const dir = attacker.facing > 0 ? 1 : -1;
    const impulse = {
      x: (attackData.impulse ? attackData.impulse.x : 6) * dir * 1.5,
      y: (attackData.impulse ? attackData.impulse.y : 2) * 1.2,
      z: 0
    };
    breakProp(prop, impulse);
    return { propShattered: true };
  }
}
