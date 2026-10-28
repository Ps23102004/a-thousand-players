import { describe,it,expect } from 'vitest';
import * as THREE from 'three';
import { initPhysics,stepPhysics } from '../src/physics.js';
import { createFighterRig } from '../src/character.js';
import { playAnimation,updateAnimation } from '../src/animation.js';
import { resolveDamageAndImpulse } from '../src/combat.js';
import { createCardboardBox,breakProp } from '../src/props.js';
import { updateRivalAI,resetRivalAI } from '../src/ai.js';
import { createHUDState,updateHUD,resetHUDState,getHUDState } from '../src/hud.js';

describe('Fighting game regressions',()=>{
  it('moves the visible fist when its shoulder joint animates',async()=>{
    const {world}=await initPhysics(); const f=createFighterRig(new THREE.Scene(),world);
    const fist=f.joints.leftHand.children.find(c=>c.isMesh);
    f.mesh.updateMatrixWorld(true); const before=fist.getWorldPosition(new THREE.Vector3());
    f.joints.leftArm.rotation.x=-1.4; f.mesh.updateMatrixWorld(true);
    expect(fist.getWorldPosition(new THREE.Vector3()).distanceTo(before)).toBeGreaterThan(.2);
  });
  it('uses hip height as translation and completes reaction into looping neutral',async()=>{
    const {world}=await initPhysics();const f=createFighterRig(new THREE.Scene(),world);
    playAnimation(f,'SWEEP');updateAnimation(f,.1);expect(f.joints.hips.position.y).toBeLessThan(.8);// Pelvis yaw now deliberately pivots during the sweep; height remains a translation.
    updateAnimation(f,1);expect(f.currentAnim).toBe('IDLE');expect(f.animLoop).toBe(true);expect(f.animTime).toBe(0);
  });
  it('applies one knockback impulse and expires the parry window',()=>{
    let impulses=0;
    const a={facing:1,currentAnim:'JAB'},d={state:'PARRY',animTime:.2,health:100,takeDamage(n){this.health-=n},applyImpulse(){impulses++}};
    const res=resolveDamageAndImpulse({type:'fighter',attacker:a,defender:d,attackData:{damage:10,impulse:{x:3,y:1}}});
    expect(res.parried).toBe(false);expect(d.health).toBe(90);expect(impulses).toBe(1);
  });
  it('allows a sweep through standing guard but reduces damage with low guard',()=>{
    const hit=low=>{const d={state:'BLOCK',isGuarding:true,isCrouching:low,health:100,takeDamage(n){this.health-=n}};return resolveDamageAndImpulse({type:'fighter',attacker:{facing:1},defender:d,attackData:{damage:16,isLowSweep:true}})};
    expect(hit(false).blocked).toBe(false);expect(hit(true).blocked).toBe(true);
  });
  it('ends a match at 99 seconds and freezes the score clock afterward',()=>{
    resetHUDState();updateHUD({health:75},{health:50},99);expect(getHUDState().gameOver).toBe(true);expect(getHUDState().victory).toBe(true);
    const t=getHUDState().gameTime;updateHUD({health:75},{health:50},5);expect(getHUDState().gameTime).toBe(t);resetHUDState();
  });
  it('ducking removes the head from a high punch hitbox',async()=>{
    const {world}=await initPhysics();const f=createFighterRig(new THREE.Scene(),world);
    f.isCrouching=true;const bounds=f.getHurtboxBounds();
    expect(bounds.maxY).toBeLessThan(f.rigidBody.translation().y+.15);
  });
  it('AI never reads the removed rigid body of a broken crate',async()=>{
    const {world}=await initPhysics();const scene=new THREE.Scene();const a=createFighterRig(scene,world,true,-1),b=createFighterRig(scene,world,false,1);
    const box=createCardboardBox(scene,world,3,.4);breakProp(box);box.rigidBody={translation(){throw new Error('removed body accessed')}};resetRivalAI();
    expect(()=>updateRivalAI(b,a,[box],.6)).not.toThrow();
  });
  it('solid fighter capsules cannot walk through each other',async()=>{
    const {world}=await initPhysics();const scene=new THREE.Scene();const a=createFighterRig(scene,world,true,-.5),b=createFighterRig(scene,world,false,.5);
    for(let i=0;i<30;i++){a.rigidBody.setLinvel({x:2,y:0,z:0},true);b.rigidBody.setLinvel({x:-2,y:0,z:0},true);stepPhysics(1/60)}
    expect(b.rigidBody.translation().x-a.rigidBody.translation().x).toBeGreaterThan(.5);
  });
});
