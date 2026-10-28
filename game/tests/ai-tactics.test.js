import {describe,it,expect} from 'vitest';
import {createAIMemory,recordAIAction,decideRivalAction,updateRivalAI,resetRivalAI} from '../src/ai.js';
import {createFighterRig} from '../src/character.js';
import {initPhysics} from '../src/physics.js';
import * as THREE from 'three';
const rival=m=>({health:100,grappleCooldown:0,aiMemory:m});
const player=(x={})=>({health:100,state:'IDLE',distance:1.1,...x});
describe('AI tactical variety',()=>{
 it('uses a kick after two punches rather than endlessly repeating punches',()=>{
  const m=createAIMemory();recordAIAction(m,'JAB');recordAIAction(m,'CROSS');
  expect(['ROUNDHOUSE','SWEEP']).toContain(decideRivalAction(rival(m),player(),[],{rng:()=>0}).type);
 });
 it('never selects the same neutral strike twice in a row',()=>{
  for(const previous of ['JAB','CROSS','ROUNDHOUSE','SWEEP']){
   const m=createAIMemory();recordAIAction(m,previous);
   for(const roll of [0,.2,.5,.8,.99])expect(decideRivalAction(rival(m),player(),[],{rng:()=>roll}).type).not.toBe(previous);
  }
 });
 it('varies repeated recovery punishment at kicking distance',()=>{
  const m=createAIMemory();recordAIAction(m,'ROUNDHOUSE');
  expect(decideRivalAction(rival(m),player({state:'RECOVERY',distance:1.5})).type).toBe('SWEEP');
 });
 it('selects kicks at kicking distance and closes instead of punching empty air',()=>{
  const m=createAIMemory();expect(decideRivalAction(rival(m),player({distance:1.5}),[],{rng:()=>0}).type).toBe('ROUNDHOUSE');
  expect(decideRivalAction(rival(m),player({distance:3,state:'RECOVERY'})).type).toBe('ADVANCE');
 });
 it('can break prolonged guard with a grab but honors the throw cooldown',()=>{
  const m=createAIMemory();m.guardTime=2;
  expect(decideRivalAction(rival(m),player({state:'BLOCK',isGuarding:true}),[],{rng:()=>.99}).type).toBe('THROW_PERSON');
  expect(decideRivalAction({...rival(m),grappleCooldown:2},player({state:'BLOCK',isGuarding:true}),[],{rng:()=>.99}).type).not.toBe('THROW_PERSON');
 });
 it('changes tactics when the player repeatedly sweeps or punches',()=>{
  const m=createAIMemory();m.observedMoves=['SWEEP','SWEEP','SWEEP'];
  expect(decideRivalAction(rival(m),player()).type).toBe('THROW_PERSON');
  m.observedMoves=['JAB','JAB','CROSS'];expect(decideRivalAction(rival(m),player(),[],{rng:()=>.1}).type).toBe('FEINT');
 });
 it('executes real kick animations and stores move observations per rival',async()=>{
  resetRivalAI();const {world}=await initPhysics(),s=new THREE.Scene(),p=createFighterRig(s,world,true,-.7),r=createFighterRig(s,world,false,.7);
  updateRivalAI(r,p,[],.02);expect(['ROUNDHOUSE_KICK','SWEEP']).toContain(r.currentAnim);expect(r.aiMemory.history.length).toBe(1);
 });
});
