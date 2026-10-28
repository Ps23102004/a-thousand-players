import { ANIMATIONS } from './animation.js';
export const attackPhase = f => ['STARTUP','ACTIVE','RECOVERY'].includes(f.state);
export function direction(f) { return f.aim || {x:f.facing>=0?1:-1,z:0}; }
export function faceOpponent(f, other) {
 if (!other || f.ground || f.mount || f.grapple || attackPhase(f)) return;
 const a=f.rigidBody.translation(),b=other.rigidBody.translation(),d=Math.hypot(b.x-a.x,b.z-a.z);
 if(d<.05)return;
 f.aim={x:(b.x-a.x)/d,z:(b.z-a.z)/d}; f.facing=b.x>=a.x?1:-1;
}
export function applyAttackMotion(f) {
 if(!attackPhase(f)||!f.rigidBody)return;
 const a=ANIMATIONS[f.currentAnim],dir=direction(f),v=f.rigidBody.linvel();
 const speed=(f.animTime<a.active?(a.drive||0):0)*(f.animSpeed??1);
 f.rigidBody.setLinvel({x:dir.x*speed,y:v.y,z:dir.z*speed},true);
}
