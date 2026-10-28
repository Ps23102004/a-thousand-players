import { COMBAT_MOVES } from './moves.js';
/**
 * Parametric Skeletal Keyframe Animation System for 3D Humanoid Martial Artists.
 *
 * Frame-data breakdown:
 * - STARTUP: Windup before hitboxes become active.
 * - ACTIVE: Hitbox active window where damage & impulses register.
 * - RECOVERY: Follow-through frames where fighter is vulnerable to whiff punishment.
 */

export const ANIMATIONS = {
  IDLE: {
    duration: 1.2,
    loop: true,
    type: 'stance',
    startup: 0,
    active: 0,
    recovery: 1.2,
    keyframes: [
      {
        t: 0.0,
        chest: { x: 0.05, y: -0.15, z: 0 },
        head: { x: -0.05, y: 0.15, z: 0 },
        leftArm: { x: -0.8, y: 0.2, z: 0.4 },
        leftForearm: { x: -1.2, y: 0, z: 0 },
        rightArm: { x: -0.9, y: -0.2, z: -0.4 },
        rightForearm: { x: -1.3, y: 0, z: 0 },
        leftThigh: { x: 0.25, y: 0, z: 0 },
        leftShin: { x: -0.3, y: 0, z: 0 },
        rightThigh: { x: -0.2, y: 0, z: 0 },
        rightShin: { x: 0.35, y: 0, z: 0 }
      },
      {
        t: 0.6,
        chest: { x: 0.08, y: -0.15, z: 0 },
        head: { x: -0.08, y: 0.15, z: 0 },
        leftArm: { x: -0.75, y: 0.2, z: 0.38 },
        leftForearm: { x: -1.15, y: 0, z: 0 },
        rightArm: { x: -0.85, y: -0.2, z: -0.38 },
        rightForearm: { x: -1.25, y: 0, z: 0 },
        leftThigh: { x: 0.28, y: 0, z: 0 },
        leftShin: { x: -0.35, y: 0, z: 0 },
        rightThigh: { x: -0.22, y: 0, z: 0 },
        rightShin: { x: 0.4, y: 0, z: 0 }
      },
      {
        t: 1.2,
        chest: { x: 0.05, y: -0.15, z: 0 },
        head: { x: -0.05, y: 0.15, z: 0 },
        leftArm: { x: -0.8, y: 0.2, z: 0.4 },
        leftForearm: { x: -1.2, y: 0, z: 0 },
        rightArm: { x: -0.9, y: -0.2, z: -0.4 },
        rightForearm: { x: -1.3, y: 0, z: 0 },
        leftThigh: { x: 0.25, y: 0, z: 0 },
        leftShin: { x: -0.3, y: 0, z: 0 },
        rightThigh: { x: -0.2, y: 0, z: 0 },
        rightShin: { x: 0.35, y: 0, z: 0 }
      }
    ]
  },

  WALK: {
    duration: 0.7,
    loop: true,
    type: 'movement',
    startup: 0,
    active: 0,
    recovery: 0.7,
    keyframes: [
      {
        t: 0.0,
        leftThigh: { x: 0.45, y: 0, z: 0 },
        leftShin: { x: -0.5, y: 0, z: 0 },
        rightThigh: { x: -0.4, y: 0, z: 0 },
        rightShin: { x: 0.2, y: 0, z: 0 },
        chest: { x: 0.1, y: 0.1, z: 0 }
      },
      {
        t: 0.35,
        leftThigh: { x: -0.4, y: 0, z: 0 },
        leftShin: { x: 0.2, y: 0, z: 0 },
        rightThigh: { x: 0.45, y: 0, z: 0 },
        rightShin: { x: -0.5, y: 0, z: 0 },
        chest: { x: 0.1, y: -0.1, z: 0 }
      },
      {
        t: 0.7,
        leftThigh: { x: 0.45, y: 0, z: 0 },
        leftShin: { x: -0.5, y: 0, z: 0 },
        rightThigh: { x: -0.4, y: 0, z: 0 },
        rightShin: { x: 0.2, y: 0, z: 0 },
        chest: { x: 0.1, y: 0.1, z: 0 }
      }
    ]
  },

  JAB: {
    duration: 0.26,
    loop: false,
    type: 'attack',
    startup: 0.06,
    active: 0.14, // from 0.06 to 0.14 = active window
    recovery: 0.26,
    damage: 10,
    hitStop: 3,
    impulse: { x: 3.5, y: 0.5, z: 0 },
    hitLimb: 'leftHand',
    keyframes: [
      { t: 0.0, leftArm: { x: -0.8, y: 0.2, z: 0.4 }, leftForearm: { x: -1.2, y: 0, z: 0 } },
      { t: 0.08, leftArm: { x: -1.57, y: 0.1, z: 0.0 }, leftForearm: { x: -0.05, y: 0, z: 0 }, chest: { x: 0.05, y: 0.3, z: 0 } },
      { t: 0.14, leftArm: { x: -1.5, y: 0.1, z: 0.0 }, leftForearm: { x: -0.1, y: 0, z: 0 } },
      { t: 0.26, leftArm: { x: -0.8, y: 0.2, z: 0.4 }, leftForearm: { x: -1.2, y: 0, z: 0 }, chest: { x: 0.05, y: -0.15, z: 0 } }
    ]
  },

  CROSS: {
    duration: 0.36,
    loop: false,
    type: 'attack',
    startup: 0.10,
    active: 0.20,
    recovery: 0.36,
    damage: 18,
    hitStop: 5,
    impulse: { x: 7.0, y: 1.2, z: 0 },
    hitLimb: 'rightHand',
    keyframes: [
      { t: 0.0, rightArm: { x: -0.9, y: -0.2, z: -0.4 }, chest: { x: 0.05, y: -0.15, z: 0 } },
      { t: 0.08, rightArm: { x: -0.5, y: -0.4, z: -0.6 }, chest: { x: 0.0, y: -0.4, z: 0 } }, // windup
      { t: 0.15, rightArm: { x: -1.6, y: -0.1, z: 0.1 }, rightForearm: { x: -0.05, y: 0, z: 0 }, chest: { x: 0.1, y: 0.5, z: 0 } },
      { t: 0.20, rightArm: { x: -1.55, y: -0.1, z: 0.1 }, rightForearm: { x: -0.1, y: 0, z: 0 } },
      { t: 0.36, rightArm: { x: -0.9, y: -0.2, z: -0.4 }, chest: { x: 0.05, y: -0.15, z: 0 } }
    ]
  },

  ROUNDHOUSE_KICK: {
    duration: 0.44,
    loop: false,
    type: 'attack',
    startup: 0.12,
    active: 0.24,
    recovery: 0.44,
    damage: 24,
    hitStop: 6,
    impulse: { x: 9.5, y: 2.2, z: 0 },
    hitLimb: 'rightShin',
    keyframes: [
      { t: 0.0, rightThigh: { x: -0.2, y: 0, z: 0 }, rightShin: { x: 0.35, y: 0, z: 0 }, chest: { x: 0.05, y: 0, z: 0 } },
      { t: 0.10, rightThigh: { x: 0.6, y: -0.5, z: 0.4 }, rightShin: { x: 1.5, y: 0, z: 0 }, chest: { x: -0.2, y: -0.4, z: -0.2 } },
      { t: 0.18, rightThigh: { x: -1.4, y: 0.6, z: 0.2 }, rightShin: { x: -0.1, y: 0, z: 0 }, chest: { x: -0.3, y: 0.8, z: -0.4 } },
      { t: 0.24, rightThigh: { x: -1.3, y: 0.5, z: 0.2 }, rightShin: { x: -0.2, y: 0, z: 0 } },
      { t: 0.44, rightThigh: { x: -0.2, y: 0, z: 0 }, rightShin: { x: 0.35, y: 0, z: 0 }, chest: { x: 0.05, y: 0, z: 0 } }
    ]
  },

  SWEEP: {
    duration: 0.38,
    loop: false,
    type: 'attack',
    startup: 0.08,
    active: 0.18,
    recovery: 0.38,
    damage: 16,
    hitStop: 4,
    impulse: { x: 6.0, y: 3.5, z: 0 },
    isLowSweep: true,
    hitLimb: 'leftShin',
    keyframes: [
      { t: 0.0, hips: { y: 0.85 }, chest: { x: 0 } },
      { t: 0.08, hips: { y: 0.45 }, chest: { x: 0.6 }, leftThigh: { x: -0.8, y: 0, z: 0.5 }, rightThigh: { x: 0.8, y: 0, z: 0 } },
      { t: 0.14, hips: { y: 0.40 }, leftThigh: { x: -1.5, y: 0, z: -0.2 }, leftShin: { x: 0, y: 0, z: 0 } },
      { t: 0.20, hips: { y: 0.45 }, leftThigh: { x: -1.2, y: 0, z: -0.1 } },
      { t: 0.38, hips: { y: 0.85 }, chest: { x: 0.05 }, leftThigh: { x: 0.25, y: 0, z: 0 } }
    ]
  },

  BLOCK: {
    duration: 0.5,
    loop: true,
    type: 'guard',
    startup: 0.02,
    active: 0.5,
    recovery: 0.5,
    keyframes: [
      {
        t: 0.0,
        chest: { x: 0.1, y: 0, z: 0 },
        leftArm: { x: -1.3, y: 0.4, z: 0.5 },
        leftForearm: { x: -1.6, y: 0, z: 0 },
        rightArm: { x: -1.3, y: -0.4, z: -0.5 },
        rightForearm: { x: -1.6, y: 0, z: 0 }
      },
      {
        t: 0.5,
        chest: { x: 0.1, y: 0, z: 0 },
        leftArm: { x: -1.3, y: 0.4, z: 0.5 },
        leftForearm: { x: -1.6, y: 0, z: 0 },
        rightArm: { x: -1.3, y: -0.4, z: -0.5 },
        rightForearm: { x: -1.6, y: 0, z: 0 }
      }
    ]
  },

  PARRY: {
    duration: 0.25,
    loop: false,
    type: 'parry',
    startup: 0.02,
    active: 0.12,
    recovery: 0.25,
    keyframes: [
      { t: 0.0, leftArm: { x: -0.8, y: 0.2, z: 0.4 }, leftForearm: { x: -1.2, y: 0, z: 0 } },
      { t: 0.06, leftArm: { x: -1.4, y: 0.5, z: 0.2 }, leftForearm: { x: -0.6, y: 0.3, z: 0 }, chest: { x: -0.1, y: 0.2, z: 0 } },
      { t: 0.12, leftArm: { x: -1.2, y: 0.4, z: 0.1 } },
      { t: 0.25, leftArm: { x: -0.8, y: 0.2, z: 0.4 }, leftForearm: { x: -1.2, y: 0, z: 0 } }
    ]
  },

  HIT_STUN: {
    duration: 0.32,
    loop: false,
    type: 'reaction',
    startup: 0,
    active: 0,
    recovery: 0.32,
    keyframes: [
      { t: 0.0, head: { x: -0.3, y: 0.2, z: 0 }, chest: { x: -0.35, y: -0.1, z: 0 }, leftArm: { x: -0.4, y: 0.4, z: 0.6 }, rightArm: { x: -0.4, y: -0.4, z: -0.6 } },
      { t: 0.12, head: { x: -0.4, y: 0.1, z: 0 }, chest: { x: -0.45, y: -0.1, z: 0 } },
      { t: 0.32, head: { x: -0.05, y: 0.15, z: 0 }, chest: { x: 0.05, y: -0.15, z: 0 }, leftArm: { x: -0.8, y: 0.2, z: 0.4 }, rightArm: { x: -0.9, y: -0.2, z: -0.4 } }
    ]
  },

  KNOCKDOWN: {
    duration: 0.75,
    loop: false,
    type: 'reaction',
    startup: 0,
    active: 0,
    recovery: 0.75,
    keyframes: [
      { t: 0.0, hips: { y: 0.8 }, chest: { x: -0.4 }, leftThigh: { x: 0.8 }, rightThigh: { x: 0.8 } },
      { t: 0.25, hips: { y: 0.2, z: -0.5 }, chest: { x: -1.4 }, head: { x: -0.5 } }, // back slams ground
      { t: 0.50, hips: { y: 0.25 }, chest: { x: -0.8 } }, // kip-up start
      { t: 0.75, hips: { y: 0.85 }, chest: { x: 0.05 } } // back on feet
    ]
  },

  GRAB_HOLD: {
    duration: 0.6,
    loop: false,
    type: 'grab',
    startup: 0.05,
    active: 0.5,
    recovery: 0.6,
    keyframes: [
      { t: 0.0, chest: { x: 0.1, y: 0, z: 0 }, leftArm: { x: -1.2, y: 0.2, z: 0.3 }, rightArm: { x: -1.2, y: -0.2, z: -0.3 } },
      { t: 0.3, chest: { x: 0.15, y: 0, z: 0 }, leftArm: { x: -1.5, y: 0.3, z: 0.2 }, rightArm: { x: -1.5, y: -0.3, z: -0.2 } },
      { t: 0.6, chest: { x: 0.1, y: 0, z: 0 }, leftArm: { x: -1.2, y: 0.2, z: 0.3 }, rightArm: { x: -1.2, y: -0.2, z: -0.3 } }
    ]
  },

  THROW_PERSON: {
    duration: 0.65,
    loop: false,
    type: 'attack',
    startup: 0.08,
    active: 0.32,
    recovery: 0.65,
    damage: 32,
    hitStop: 6,
    impulse: { x: 13.0, y: 5.5, z: 0 },
    hitLimb: 'rightHand',
    keyframes: [
      { t: 0.0, chest: { x: 0.1, y: -0.3, z: 0 }, leftArm: { x: -1.4, y: 0.3, z: 0.2 }, rightArm: { x: -1.4, y: -0.3, z: -0.2 } },
      { t: 0.15, chest: { x: -0.2, y: 0.8, z: 0.1 }, hips: { y: 0.75 }, leftArm: { x: -2.0, y: 0.4, z: 0.1 }, rightArm: { x: -2.0, y: -0.2, z: -0.1 } }, // hoist
      { t: 0.30, chest: { x: 0.6, y: -0.5, z: 0 }, hips: { y: 0.7 }, leftArm: { x: 0.4, y: 0, z: 0 }, rightArm: { x: 0.4, y: 0, z: 0 } }, // whip down throw
      { t: 0.65, chest: { x: 0.05, y: 0, z: 0 }, hips: { y: 0.85 }, leftArm: { x: -0.8, y: 0.2, z: 0.4 }, rightArm: { x: -0.9, y: -0.2, z: -0.4 } }
    ]
  },

  BEING_THROWN: {
    duration: 0.75,
    loop: false,
    type: 'reaction',
    startup: 0,
    active: 0,
    recovery: 0.75,
    keyframes: [
      { t: 0.0, hips: { y: 1.2, z: 0 }, chest: { x: -0.8, y: 0, z: 0 } },
      { t: 0.25, hips: { y: 1.8, z: 1.5 }, chest: { x: -1.6, y: 0, z: 0 }, leftArm: { x: 1.2 }, rightArm: { x: 1.2 } }, // airborne flip
      { t: 0.50, hips: { y: 0.3, z: 3.14 }, chest: { x: -1.2 }, leftThigh: { x: 1.0 }, rightThigh: { x: 1.0 } }, // impact
      { t: 0.75, hips: { y: 0.85, z: 0 }, chest: { x: 0.05 } }
    ]
  },

  CARRY_PROP: {
    duration: 0.8,
    loop: true,
    type: 'stance',
    startup: 0,
    active: 0,
    recovery: 0.8,
    keyframes: [
      { t: 0.0, chest: { x: -0.1, y: 0, z: 0 }, leftArm: { x: -2.0, y: 0.3, z: 0.3 }, rightArm: { x: -2.0, y: -0.3, z: -0.3 } },
      { t: 0.4, chest: { x: -0.12, y: 0, z: 0 }, leftArm: { x: -2.05, y: 0.3, z: 0.3 }, rightArm: { x: -2.05, y: -0.3, z: -0.3 } },
      { t: 0.8, chest: { x: -0.1, y: 0, z: 0 }, leftArm: { x: -2.0, y: 0.3, z: 0.3 }, rightArm: { x: -2.0, y: -0.3, z: -0.3 } }
    ]
  },

  THROW_PROP: {
    duration: 0.45,
    loop: false,
    type: 'attack',
    startup: 0.08,
    active: 0.22,
    recovery: 0.45,
    damage: 35,
    hitStop: 5,
    impulse: { x: 15.0, y: 3.0, z: 0 },
    hitLimb: 'rightHand',
    keyframes: [
      { t: 0.0, chest: { x: -0.2, y: 0, z: 0 }, leftArm: { x: -2.1, y: 0.2, z: 0.2 }, rightArm: { x: -2.1, y: -0.2, z: -0.2 } },
      { t: 0.12, chest: { x: 0.3, y: 0, z: 0 }, leftArm: { x: -1.2, y: 0.1, z: 0 }, rightArm: { x: -1.2, y: -0.1, z: 0 } }, // push launch
      { t: 0.22, chest: { x: 0.4, y: 0, z: 0 }, leftArm: { x: -0.4, y: 0, z: 0 }, rightArm: { x: -0.4, y: 0, z: 0 } },
      { t: 0.45, chest: { x: 0.05, y: 0, z: 0 }, leftArm: { x: -0.8, y: 0.2, z: 0.4 }, rightArm: { x: -0.9, y: -0.2, z: -0.4 } }
    ]
  }
};

Object.assign(ANIMATIONS, COMBAT_MOVES);
ANIMATIONS.HIT_STUN.keyframes[0].hips={y:.85,x:-.18,turn:.10,shift:-.05};
ANIMATIONS.HIT_STUN.keyframes[1].hips={y:.83,x:-.20,turn:.15,shift:-.08};
ANIMATIONS.HIT_STUN.keyframes[1].leftThigh={x:-.2};
ANIMATIONS.HIT_STUN.keyframes[1].leftShin={x:.5};
ANIMATIONS.BODY_HIT={duration:.36,loop:false,type:'reaction',keyframes:[
 {t:0,hips:{y:.75,x:.12},chest:{x:.5},head:{x:-.25},leftArm:{x:-.7},rightArm:{x:-.7},leftThigh:{x:-.5},leftShin:{x:1},rightThigh:{x:-.3},rightShin:{x:.7}},
 {t:.15,hips:{y:.70,x:.2},chest:{x:.65},head:{x:-.4},leftArm:{x:-.55},rightArm:{x:-.55},leftThigh:{x:-.65},leftShin:{x:1.1},rightThigh:{x:-.35},rightShin:{x:.8}},
 {...ANIMATIONS.IDLE.keyframes[0],t:.36,hips:{y:.91,x:0}}
]};
ANIMATIONS.BEING_THROWN.keyframes=[
 {t:0,hips:{y:.91,x:-.2},chest:{x:-.15},leftThigh:{x:-.5},leftShin:{x:1},rightThigh:{x:-.4},rightShin:{x:.8}},
 {t:.25,hips:{y:1,x:-.8},chest:{x:0},leftArm:{x:-.3,z:.7},rightArm:{x:-.3,z:-.7},leftThigh:{x:-.65},leftShin:{x:1.3},rightThigh:{x:-.5},rightShin:{x:1.1}},
 {t:.55,hips:{y:.7,x:-1.5},chest:{x:.08},leftArm:{x:-.4,z:.5},rightArm:{x:-.4,z:-.5},leftThigh:{x:-.35},leftShin:{x:.65},rightThigh:{x:-.5},rightShin:{x:.85}},
 {t:.75,hips:{y:.4,x:-Math.PI/2},chest:{x:.08},leftArm:{x:-.4,z:.5},rightArm:{x:-.4,z:-.5},leftThigh:{x:-.35},leftShin:{x:.65},rightThigh:{x:-.5},rightShin:{x:.85}}
];
ANIMATIONS.SWEEP.drive = .65;
ANIMATIONS.SWEEP.reach = 1.4;

/**
 * Initiates an animation on a fighter entity.
 */
export function playAnimation(fighter, animName, loop = false) {
  const anim = ANIMATIONS[animName];
  if (!anim) return;

  if (fighter.currentAnim === 'BACK_KICK' && fighter.joints?.hips) fighter.joints.hips.rotation.y = Math.atan2(Math.sin(fighter.joints.hips.rotation.y),Math.cos(fighter.joints.hips.rotation.y));
  fighter.currentAnim = animName;
  fighter.animTime = 0;
  fighter.animDuration = anim.duration;
  fighter.animLoop = loop || anim.loop || false;

  // Set initial phase
  if (anim.type === 'attack') {
    fighter.state = 'STARTUP';
    fighter.onAttackStart?.(animName);
    fighter.attackSerial = (fighter.attackSerial || 0) + 1;
    fighter.hitRegistered = false;
  } else if (anim.type === 'guard') {
    fighter.state = 'BLOCK';
  } else if (anim.type === 'parry') {
    fighter.state = 'PARRY';
  } else if (anim.type === 'grab') {
    fighter.state = 'GRAB';
  } else if (anim.type === 'reaction') {
    fighter.state = animName === 'KNOCKDOWN' ? 'KNOCKDOWN' : animName === 'BEING_THROWN' ? 'BEING_THROWN' : 'HIT_STUN';
  } else if (animName === 'CARRY_PROP') {
    fighter.state = 'CARRY_PROP';
  } else {
    fighter.state = 'IDLE';
  }
}

/**
 * Updates fighter joint rotations and state phases based on current animation keyframes.
 */
export function updateAnimation(fighter, delta) {
  if (!fighter || !fighter.currentAnim || fighter.ground || fighter.mount || fighter.state === 'GRABBED' || fighter.state === 'GRAB') return;

  const anim = ANIMATIONS[fighter.currentAnim];
  if (!anim) return;

  const speed = fighter.animSpeed !== undefined ? fighter.animSpeed : 1.0;
  fighter.animTime += delta * speed;

  // Phase updates for attacks
  if (anim.type === 'attack') {
    if (fighter.animTime < anim.startup) {
      fighter.state = 'STARTUP';
    } else if (fighter.animTime >= anim.startup && fighter.animTime < anim.active) {
      fighter.state = 'ACTIVE';
    } else {
      fighter.state = 'RECOVERY';
    }
  }

  // Check end of animation
  if (fighter.animTime >= anim.duration) {
    if (fighter.currentAnim==='BEING_THROWN' && fighter.rigidBody?.translation().y>.86) {
      // Landing is a physics event; a shorter clip must not restore control in mid-air.
      fighter.animTime=anim.duration-.000001;
    } else if (fighter.animLoop) {
      fighter.animTime = fighter.animTime % anim.duration;
    } else {
      playAnimation(fighter, 'IDLE', true);
      return;
    }
  }

  // Keyframe Interpolation
  const keyframes = anim.keyframes;
  if (!keyframes || keyframes.length === 0) return;

  // Find surrounding keyframes
  let k1 = keyframes[0];
  let k2 = keyframes[keyframes.length - 1];

  for (let i = 0; i < keyframes.length - 1; i++) {
    if (fighter.animTime >= keyframes[i].t && fighter.animTime <= keyframes[i + 1].t) {
      k1 = keyframes[i];
      k2 = keyframes[i + 1];
      break;
    }
  }

  const range = k2.t - k1.t;
  const alpha = range > 0 ? (fighter.animTime - k1.t) / range : 0;

  // Blend a complete pose. Hip height is translation; its z is a reaction rotation.
  const neutral = ANIMATIONS.IDLE.keyframes[0];
  const jointKeys = ['chest','head','leftArm','leftForearm','rightArm','rightForearm','leftThigh','leftShin','rightThigh','rightShin','hips'];
  for (const name of jointKeys) {
    const j = fighter.joints[name]; if (!j) continue;
    const base = neutral[name] || {};
    const a = { ...base, ...(k1[name] || {}) }, b = { ...base, ...(k2[name] || k1[name] || {}) };
    const blend = Math.min(1, delta * 30);
    if (name === 'hips') {
      const heightA = a.y ?? 0.91, heightB = b.y ?? 0.91;
      j.position.y += ((heightA + (heightB - heightA) * alpha) - (fighter.isCrouching && !['SWEEP','KNOCKDOWN','BODY_JAB','BODY_HOOK'].includes(fighter.currentAnim) ? 0.22 : 0) - j.position.y) * blend;
      j.rotation.x += ((a.x || 0) + ((b.x || 0) - (a.x || 0)) * alpha - j.rotation.x) * blend;
      j.rotation.y += ((a.turn || 0) + ((b.turn || 0) - (a.turn || 0)) * alpha - j.rotation.y) * blend;
      j.position.z += ((a.shift || 0) + ((b.shift || 0) - (a.shift || 0)) * alpha - j.position.z) * blend;
      j.rotation.z += ((a.z || 0) + ((b.z || 0) - (a.z || 0)) * alpha - j.rotation.z) * blend;
    } else {
      for (const axis of ['x','y','z']) j.rotation[axis] += ((a[axis] || 0) + ((b[axis] || 0) - (a[axis] || 0)) * alpha - j.rotation[axis]) * blend;
    }
  }
}
