import { playAnimation } from './animation.js';
import { breakProp } from './props.js';
import { faceOpponent, applyAttackMotion, direction } from './movement.js';
import { beginMount } from './ground.js';
import { beginGrapple } from './grapple.js';
import { RULES } from './tuning.js';

let memories = new WeakMap();
const ATTACKS = ['JAB','CROSS','HOOK','UPPERCUT','BODY_JAB','BODY_HOOK','ROUNDHOUSE','HIGH_KICK','BACK_KICK','SWEEP'];
const KICKS = ['ROUNDHOUSE','HIGH_KICK','BACK_KICK','SWEEP'];
export function createAIMemory() {
  return { time:0, nextDecision:0, history:[], observedMoves:[], lastSerial:-1, guardTime:0, attacksSinceKick:0, nextParry:0, nextGrab:0, followUp:null, lastAction:'IDLE', previousPlayerPhase:null, previousPlayerTime:0 };
}
export function resetRivalAI() { memories = new WeakMap(); }
export function recordAIAction(memory,type) {
  memory.lastAction = type;
  if (ATTACKS.includes(type) || type==='THROW_PERSON') {
    memory.history.push(type); if(memory.history.length>10) memory.history.shift();
    memory.attacksSinceKick = KICKS.includes(type)?0:memory.attacksSinceKick+1;
  }
}
function weighted(choices,rng) {
  const total=choices.reduce((s,c)=>s+c[1],0);let r=rng()*total;
  for(const [type,weight] of choices){r-=weight;if(r<0)return {type,target:'player'}}
  return {type:choices.at(-1)[0],target:'player'};
}

/** Range, recent history, observed habits and small combinations drive tactical choices. */
export function decideRivalAction(rival,player,nearbyProps=[],{rng=Math.random}={}) {
  const dist=player.distance??2, m=rival.aiMemory||createAIMemory();
  const last=m.history.at(-1), grabReady=(rival.grappleCooldown||0)<=0 && m.time>=m.nextGrab;
  const prop=nearbyProps.find(p=>!p.isBroken && (p.distanceToRival??1)<1.8);
  if((player.isGuarding||player.state==='BLOCK') && dist>1.65 && prop) return {type:'KICK_PROP',prop};
  if(dist>1.62) return {type:'ADVANCE'};
  if(player.state==='STARTUP' || player.state==='ACTIVE') {
    if(dist>1.4)return {type:'RETREAT'};
    const choices=[['BLOCK',4],['RETREAT',3]];
    if(m.time>=m.nextParry)choices.push(['PARRY',1]);
    return weighted(choices,rng);
  }
  if(player.state==='RECOVERY') return {type:dist<=1.32 && last!=='CROSS' && m.attacksSinceKick<2?'CROSS':last==='ROUNDHOUSE'?'SWEEP':'ROUNDHOUSE',target:'player'};
  if(player.isGuarding||player.state==='BLOCK') {
    if(player.isCrouching && dist>1.25)return {type:'ADVANCE'};
    const options=[['SWEEP',4],['ROUNDHOUSE',player.isCrouching?0.2:1]];
    if(grabReady && dist<=1.25)options.push(['THROW_PERSON',m.guardTime>0.6?5:2]);
    return weighted(options.filter(([type])=>type!==last),rng);
  }
  // Boundary awareness stops endless backing into a wall.
  if(dist<0.9 && Math.abs(rival.x||0)<9.2)return {type:'RETREAT'};
  if(m.followUp && m.followUp!==last && dist<=1.45 && player.state!=='STARTUP')return {type:m.followUp,target:'player'};
  if(m.attacksSinceKick>=2) return {type:player.isCrouching?'SWEEP':'ROUNDHOUSE',target:'player'};
  const repeated=m.observedMoves.slice(-4);
  const spammedPunch=repeated.length>=3 && repeated.filter(x=>['JAB','CROSS','HOOK','UPPERCUT','BODY_JAB','BODY_HOOK'].includes(x)).length>=3;
  const spammedSweep=repeated.length>=3 && repeated.filter(x=>x==='SWEEP').length>=3;
  if(spammedSweep && dist<=1.25 && grabReady)return {type:'THROW_PERSON',target:'player'};
  if(spammedPunch && m.lastAction!=='FEINT' && rng()<0.35)return {type:'FEINT'};
  if(rival.health<30 && player.health>rival.health && m.lastAction!=='RETREAT' && rng()<0.2)return {type:'RETREAT'};
  let options=dist>1.28?[['ROUNDHOUSE',6],['SWEEP',3],['ADVANCE',2]]:[['JAB',4],['CROSS',3],['HOOK',2],['UPPERCUT',1],['BODY_JAB',2],['ROUNDHOUSE',4],['HIGH_KICK',2],['BACK_KICK',1],['SWEEP',2],['FEINT',1]];
  if(grabReady && dist<=1.2)options.push(['THROW_PERSON',1.1]);
  options=options.filter(([type])=>type!==last);
  return weighted(options,rng);
}

export function updateRivalAI(rival,player,props=[],delta=0.016) {
  if(!rival||!player||rival.health<=0||player.health<=0||rival.aiDisabled)return;
  let m=memories.get(rival);if(!m){m=createAIMemory();memories.set(rival,m);rival.aiMemory=m;}
  m.time+=delta;
  if(rival.ground || rival.mount || player.mount || rival.grapple || player.grapple || ['HIT_STUN','KNOCKDOWN','BEING_THROWN','GRABBED','GRAB'].includes(rival.state))return;
  const rp=rival.rigidBody?.translation()||rival.mesh.position,pp=player.rigidBody?.translation()||player.mesh.position;
  const dist=Math.hypot(pp.x-rp.x,pp.z-rp.z);faceOpponent(rival,player);
  if(['STARTUP','ACTIVE','RECOVERY'].includes(rival.state)){applyAttackMotion(rival);return}
  if(player.ground){
    if(player.ground.phase==='DOWNED' && dist<=1.65){beginMount(rival,player);return}
    const aim=direction(rival);rival.rigidBody?.setLinvel({x:dist>1.1?aim.x*2.5:0,y:rival.rigidBody.linvel().y,z:dist>1.1?aim.z*2.5:0},true);
    if(rival.currentAnim!=='WALK')playAnimation(rival,'WALK',true);return;
  }
  m.guardTime=(player.isGuarding||player.state==='BLOCK')?m.guardTime+delta:Math.max(0,m.guardTime-delta*2);
  const newAttack=player.state==='STARTUP' && (player.attackSerial!==undefined?player.attackSerial!==m.lastSerial:m.previousPlayerPhase!=='STARTUP'||player.animTime<m.previousPlayerTime);
  if(newAttack){m.observedMoves.push(player.currentAnim);if(m.observedMoves.length>8)m.observedMoves.shift();m.lastSerial=player.attackSerial;}
  m.previousPlayerPhase=player.state;m.previousPlayerTime=player.animTime;
  if(['STARTUP','ACTIVE','RECOVERY','PARRY'].includes(rival.state)||m.time<m.nextDecision)return;
  const enriched=props.filter(p=>!p.isBroken).map(p=>({...p,entity:p,distanceToRival:Math.abs((p.rigidBody?.translation()||p.mesh.position).x-rp.x)}));
  const action=decideRivalAction({...rival,x:rp.x,aiMemory:m},{...player,distance:dist},enriched);
  m.followUp=null;
  m.nextDecision=m.time+RULES.decisionDelayMin+Math.random()*0.15;
  const rb=rival.rigidBody;
  if(!['ADVANCE','RETREAT'].includes(action.type))rb?.setLinvel({x:0,y:rb.linvel().y,z:0},true);
  if(action.type==='ADVANCE'||action.type==='RETREAT'){
    const away=action.type==='RETREAT';
    rb?.setLinvel({x:direction(rival).x*(away?-2.6:2.9),y:rb.linvel().y,z:direction(rival).z*(away?-2.6:2.9)},true);
    if(rival.currentAnim!=='WALK')playAnimation(rival,'WALK',true);
    rival.isGuarding=away;
  }else if(action.type==='BLOCK'){
    rival.isGuarding=true;if(rival.currentAnim!=='BLOCK')playAnimation(rival,'BLOCK',true);
  }else if(action.type==='PARRY'){
    rival.isGuarding=false;playAnimation(rival,'PARRY');m.nextParry=m.time+2.5;
  }else if(action.type==='THROW_PERSON'){
    rival.isGuarding=false;
    if(beginGrapple(rival,player)){m.nextGrab=m.time+4.5;m.nextDecision=m.time+0.5;}
  }else if(action.type==='KICK_PROP'){
    rival.isGuarding=false;breakProp(action.prop.entity||action.prop,{x:rival.facing*14,y:3.5,z:0});playAnimation(rival,'ROUNDHOUSE_KICK');
  }else if(ATTACKS.includes(action.type)){
    rival.isGuarding=false;
    playAnimation(rival,action.type==='ROUNDHOUSE'?'ROUNDHOUSE_KICK':action.type);
    if(action.type==='JAB')m.followUp=Math.random()<0.55?'CROSS':'ROUNDHOUSE';
    if(action.type==='CROSS')m.followUp='HOOK';
    if(action.type==='HOOK')m.followUp='UPPERCUT';
    if(action.type==='HIGH_KICK')m.followUp='BACK_KICK';
    m.nextDecision=m.time+0.22;
  }else{
    rival.isGuarding=false;playAnimation(rival,'IDLE',true);m.nextDecision=m.time+0.22;
    if(action.type==='FEINT')m.followUp='ROUNDHOUSE';
  }
  recordAIAction(m,action.type);
}
