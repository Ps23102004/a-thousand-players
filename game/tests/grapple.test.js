import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {initPhysics} from '../src/physics.js';
import {createFighterRig} from '../src/character.js';
import {beginGrapple,handleGrappleInput,updateGrapple,releaseGrapple,getGrapplePrompt,GRAPPLE_RULES} from '../src/grapple.js';

async function pair() {
 const {world}=await initPhysics();const scene=new THREE.Scene();
 return [createFighterRig(scene,world,true,-.5),createFighterRig(scene,world,false,.5)];
}
function step(g,time){for(let t=0;t<time;t+=1/60)updateGrapple(g,1/60)}
describe('Clinch contests and escapes',()=>{
 it('requires close, grounded fighters and respects grab cooldown',async()=>{
  const [p,r]=await pair();r.rigidBody.setTranslation({x:3,y:.9,z:0},true);expect(beginGrapple(p,r)).toBe(null);
  r.rigidBody.setTranslation({x:.5,y:.9,z:0},true);p.grappleCooldown=1;expect(beginGrapple(p,r)).toBe(null);
  p.grappleCooldown=0;p.rigidBody.setTranslation({x:-.5,y:2,z:0},true);expect(beginGrapple(p,r)).toBe(null);
 });
 it('holds with one arm while the free hand punches exactly once',async()=>{
  const [p,r]=await pair(),g=beginGrapple(p,r,{rng:()=>.7});
  expect(p.state).toBe('GRAB');expect(r.state).toBe('GRABBED');
  handleGrappleInput(p,'KeyJ');expect(g.phase).toBe('CONTEST');expect(r.health).toBe(100);
  handleGrappleInput(p,g.requiredKey);step(g,.2);
  expect(r.health).toBe(92);expect(p.joints.leftArm.rotation.x).toBeCloseTo(-1.2);
  expect(p.joints.rightForearm.rotation.x).toBeGreaterThan(-.3);
  step(g,.3);expect(r.health).toBe(92);expect(g.phase).toBe('CHOOSE');expect(p.grapple).toBe(g);
 });
 it('animates a held knee and limits a clinch to two strikes',async()=>{
  const [p,r]=await pair(),g=beginGrapple(p,r,{rng:()=>.7});
  for(let i=0;i<2;i++){handleGrappleInput(p,'KeyK');handleGrappleInput(p,g.requiredKey);step(g,.2);expect(p.joints.rightThigh.rotation.x).toBeLessThan(-1);step(g,.3)}
  expect(r.health).toBe(78);handleGrappleInput(p,'KeyJ');expect(g.phase).toBe('CHOOSE');expect(getGrapplePrompt(p).detail).toContain('F: throw');
 });
 it('requires a fresh confirmation key before a player throw',async()=>{
  const [p,r]=await pair(),g=beginGrapple(p,r,{rng:()=>.7});handleGrappleInput(p,'KeyF');
  expect(r.health).toBe(100);handleGrappleInput(p,g.requiredKey,{repeat:true});expect(r.health).toBe(100);
  handleGrappleInput(p,g.requiredKey);expect(r.health).toBe(68);expect(r.state).toBe('BEING_THROWN');expect(p.grapple).toBe(null);
 });
 it('allows an idle held rival to escape instead of remaining trapped forever',async()=>{
  const [p,r]=await pair(),g=beginGrapple(p,r,{rng:()=>.9});step(g,1.7);
  expect(g.closed).toBe(true);expect(p.grapple).toBe(null);expect(r.grabbedBy).toBe(null);expect(r.grappleCooldown).toBe(GRAPPLE_RULES.cooldown);
 });
 it('can reverse a missed attack prompt into a CPU counterthrow',async()=>{
  const [p,r]=await pair(),g=beginGrapple(p,r,{rng:()=>.1});handleGrappleInput(p,'KeyJ');step(g,1.3);
  expect(p.health).toBe(68);expect(p.state).toBe('BEING_THROWN');expect(g.closed).toBe(true);
 });
 it('lets a fast defender reverse the AI grab',async()=>{
  const [p,r]=await pair(),g=beginGrapple(r,p,{rng:()=>.1});expect(getGrapplePrompt(p).role).toBe('DEFENDER');
  updateGrapple(g,.2);handleGrappleInput(p,g.requiredKey);
  expect(r.health).toBe(68);expect(p.health).toBe(100);expect(r.state).toBe('BEING_THROWN');
 });
 it('lets a slower correct response escape without guaranteed reversal',async()=>{
  const [p,r]=await pair(),g=beginGrapple(r,p,{rng:()=>.1});updateGrapple(g,.6);handleGrappleInput(p,g.requiredKey);
  expect(p.grapple).toBe(null);expect(p.health).toBe(100);expect(r.health).toBe(100);
 });
 it('punishes missed defense, ignores unrelated movement and repeat presses',async()=>{
  const [p,r]=await pair(),g=beginGrapple(r,p,{rng:()=>.1});
  handleGrappleInput(p,'KeyW');handleGrappleInput(p,g.requiredKey,{repeat:true});expect(g.closed).toBe(false);
  step(g,1.3);expect(p.health).toBe(68);expect(g.closed).toBe(true);
 });
 it('releases both bodies if a fighter dies during the contest',async()=>{
  const [p,r]=await pair(),g=beginGrapple(p,r);r.health=0;updateGrapple(g,.1);expect(g.closed).toBe(true);expect(p.grabbedTarget).toBe(null);
  expect(()=>releaseGrapple(g)).not.toThrow();
 });
});
