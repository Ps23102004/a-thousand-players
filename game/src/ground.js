import { playAnimation } from './animation.js';
import { RULES } from './tuning.js';

export const GROUND_RULES = Object.freeze({fallTime:.48,getUpWindow:2.4,mountRange:1.65,promptTime:1.25,reverseTime:.40,maxStrikes:3});
const keys=['KeyJ','KeyK','KeyL'];
const pos=f=>f.rigidBody?.translation()||f.mesh.position;
const stop=f=>f.rigidBody?.setLinvel({x:0,y:0,z:0},true);
const emit=(f,type,extra={})=>f.onGroundEvent?.({type,...extra});
const rotate=(f,name,x=0,y=0,z=0)=>f.joints?.[name]?.rotation.set(x,y,z);
const mix=(a,b,t)=>a+(b-a)*t;
function resetPose(f) {
 if(f.joints?.hips){f.joints.hips.position.set(0,.91,0);f.joints.hips.rotation.set(0,0,0)}
 playAnimation(f,'IDLE',true);
}
function pronePose(f,t=1) {
 const h=f.joints?.hips;
 if(h){h.position.set(0,mix(.91,.24,t),0);h.rotation.set(-Math.PI/2*t,0,0)}
 rotate(f,'chest',.08,0,0);rotate(f,'head',.2*t);
 rotate(f,'leftArm',-.4*t,0,.5*t);rotate(f,'rightArm',-.45*t,0,-.5*t);
 rotate(f,'leftForearm',-1.05);rotate(f,'rightForearm',-1.05);
 rotate(f,'leftThigh',-.35*t,0,.12);rotate(f,'rightThigh',-.5*t,0,-.12);
 rotate(f,'leftShin',.65*t);rotate(f,'rightShin',.85*t);
}
export function startKnockdown(f,{rng=Math.random,source=null,landed=false}={}) {
 if(!f || f.ground || f.mount || f.grapple)return false;
 f.pendingAttack=null;f.attackQueue=[];f.isGuarding=false;f.isCrouching=false;f.staggerLoad=0;
 playAnimation(f,'KNOCKDOWN');
 f.ground={phase:'FALL',elapsed:landed?GROUND_RULES.fallTime:0,rng,requiredKey:keys[Math.floor(rng()*keys.length)%keys.length],window:GROUND_RULES.getUpWindow,remaining:GROUND_RULES.getUpWindow};
 emit(f,'knockdown',{actor:source,defender:f});return true;
}
function rise(f,fast) {
 const g=f.ground;if(!g)return;
 g.phase='GETUP';g.elapsed=0;g.duration=fast?.60:1.05;g.fast=fast;f.state='GETUP';
 emit(f,fast?'tech-rise':'slow-rise',{actor:f});
}
export function updateGround(f,dt) {
 const g=f?.ground;if(!g||f.mount)return;
 g.elapsed+=dt;
 if(g.phase==='FALL'){
  pronePose(f,Math.min(1,g.elapsed/GROUND_RULES.fallTime));
  if(g.elapsed>=GROUND_RULES.fallTime && pos(f).y<1.08){g.phase='DOWNED';g.elapsed=0;f.state='DOWNED';stop(f);emit(f,'slam',{defender:f})}
  // A body knocked onto a crate rests at y 1.2 to 1.4 and never gets under 1.08; knockdownOnPropFix also ends FALL once it is at rest (asleep).
  // A separate branch so the line above stays byte-identical: data/run-main/fixes/bug4.json (Ultra's patch) finds it by exact text.
  else if(RULES.knockdownOnPropFix && g.elapsed>=GROUND_RULES.fallTime && f.rigidBody?.isSleeping()){g.phase='DOWNED';g.elapsed=0;f.state='DOWNED';stop(f);emit(f,'slam',{defender:f})}
 }else if(g.phase==='DOWNED'){
  pronePose(f);stop(f);g.remaining=Math.max(0,g.window-g.elapsed);
  if(f.health>0 && ((!f.isPlayer && g.elapsed>1.65)||g.remaining<=0))rise(f,false);
 }else if(g.phase==='GETUP'){
  const t=Math.min(1,g.elapsed/g.duration);
  // Roll to one hip, bring a knee under the torso, then stand back into guard.
  pronePose(f,1-t);
  rotate(f,'chest',Math.sin(t*Math.PI)*.65);
  rotate(f,'leftThigh',-.6*Math.sin(t*Math.PI));rotate(f,'leftShin',1.5*Math.sin(t*Math.PI));
  rotate(f,'rightThigh',-1.0*Math.sin(t*Math.PI));rotate(f,'rightShin',1.7*Math.sin(t*Math.PI));
  if(f.joints?.hips)f.joints.hips.rotation.z=Math.sin(t*Math.PI)*.42;
  if(t>=1){f.ground=null;f.recoveryInvulnerability=.4;resetPose(f)}
 }
}
function armMount(m,exclude=null) {
 const options=keys.filter(k=>k!==exclude&&k!==m.lastKey);const candidates=options.length?options:keys;
 m.requiredKey=candidates[Math.floor(m.rng()*candidates.length)%candidates.length];m.lastKey=m.requiredKey;
 m.phase='CONTEST';m.elapsed=0;m.window=GROUND_RULES.promptTime;m.remaining=m.window;
}
function chooseMount(m) {
 m.phase='CHOOSE';m.elapsed=0;m.window=1.8;m.remaining=m.window;m.requiredKey=null;
 if(!m.top.isPlayer){m.action=m.rng()<.5?'HEAD':'BODY';armMount(m)}
}
export function beginMount(top,bottom,{rng=Math.random}={}) {
 if(!top||!bottom||top.health<=0||bottom.health<=0||top.mount||bottom.mount||top.ground||top.grapple||bottom.grapple||top.carriedProp)return null;
 if(bottom.ground?.phase!=='DOWNED'||!['IDLE','BLOCK','CROUCH'].includes(top.state))return null;
 const a=pos(top),b=pos(bottom);if(Math.hypot(a.x-b.x,a.z-b.z)>GROUND_RULES.mountRange||a.y>1.08)return null;
 const m={top,bottom,rng,closed:false,strikes:0,lastKey:null,strikeLanded:false};
 top.mount=bottom.mount=m;top.pendingAttack=bottom.pendingAttack=null;top.attackQueue=bottom.attackQueue=[];
 top.isGuarding=bottom.isGuarding=false;top.isCrouching=bottom.isCrouching=false;
 for(const f of [top,bottom]){stop(f);f.collider?.setSensor(true);f.rigidBody?.setGravityScale(0,true)}
 top.facing=-bottom.facing;top.aim={x:-(bottom.aim?.x??bottom.facing),z:-(bottom.aim?.z??0)};
 top.state='MOUNT';bottom.state='PINNED';chooseMount(m);poseMount(m);
 emit(top,'mount',{actor:top,defender:bottom});return m;
}
// Props the released fighter must not be placed inside (set by the match: main.js, engine/sim.mjs).
let obstacles=()=>[];
export const setMountObstacles=fn=>{obstacles=fn};
// Landing spot for the top fighter: 1.1 m in front of the pinned one, else behind; a spot inside a crate would be
// ejected upward by the solver at ~7 m/s (crate next to the wall launched the fighter out of the arena).
function releaseSpot(base,aim){
 const at=s=>({x:Math.max(-9.8,Math.min(9.8,base.x+aim.x*1.1*s)),z:Math.max(-1.35,Math.min(1.35,base.z+aim.z*1.1*s))});
 const clear=c=>obstacles().every(p=>{if(p.isBroken)return true;const t=p.rigidBody?.translation();return !t||Math.hypot(t.x-c.x,t.z-c.z)>1});
 return (RULES.mountReleaseFix&&[at(1),at(-1)].find(clear))||at(1);
}
export function releaseMount(m,{separate=true}={}) {
 if(!m||m.closed)return;m.closed=true;
 const base=pos(m.bottom),aim=m.bottom.aim||{x:m.bottom.facing,z:0};
 for(const f of [m.top,m.bottom]){
  f.mount=null;f.collider?.setSensor(false);f.rigidBody?.setGravityScale(1,true);stop(f);
  // A body held still for the mount can be asleep; waking it by changing gravity leaves its floor contact stale, so it sinks
  // through the floor for ~0.3 s and is then ejected upward (next to the wall that ends outside the arena).
  if(RULES.mountReleaseFix){f.rigidBody?.sleep();f.rigidBody?.wakeUp()}f.attackQueue=[];f.animSpeed=1;
 }
 if(separate){const s=releaseSpot(base,aim);m.top.rigidBody?.setTranslation({x:s.x,y:.82,z:s.z},true)}
 m.top.ground=null;resetPose(m.top);
 if(m.bottom.ground){m.bottom.ground.phase='GETUP';m.bottom.ground.elapsed=0;m.bottom.ground.duration=.8;m.bottom.state='GETUP'}else resetPose(m.bottom);
}
function reverseMount(m) {
 const oldTop=m.top;m.top=m.bottom;m.bottom=oldTop;
 m.top.ground=null;m.bottom.ground={phase:'DOWNED',elapsed:0,window:2.4,remaining:2.4,rng:m.rng,requiredKey:'KeyJ'};
 m.top.facing=-m.bottom.facing;m.top.aim={x:-(m.bottom.aim?.x??m.bottom.facing),z:-(m.bottom.aim?.z??0)};
 m.top.state='MOUNT';m.bottom.state='PINNED';chooseMount(m);poseMount(m);emit(m.top,'mount-reversal',{actor:m.top,defender:m.bottom});
}
function failMount(m) {
 if(!m.top.isPlayer){m.phase='STRIKE';m.elapsed=0;m.window=.5;m.remaining=.5;m.strikeLanded=false}
 else if(m.rng()<.45)reverseMount(m);
 else{emit(m.bottom,'ground-escape',{actor:m.bottom});releaseMount(m)}
}
export function handleGroundInput(player,code,{repeat=false}={}) {
 const m=player?.mount,g=player?.ground;if(!m&&!g)return false;if(repeat)return true;
 if(m){
  if(!['KeyJ','KeyK','KeyL','KeyF','KeyG'].includes(code))return true;
  if(m.phase==='CHOOSE' && m.top===player){
   if(['KeyF','KeyG','KeyL'].includes(code)){releaseMount(m);return true}
   m.action=code==='KeyJ'?'HEAD':'BODY';armMount(m,code);
  }else if(m.phase==='CONTEST'){
   if(code!==m.requiredKey){failMount(m);return true}
   if(m.top===player){m.phase='STRIKE';m.elapsed=0;m.window=.5;m.remaining=.5;m.strikeLanded=false}
   else if(m.elapsed<=GROUND_RULES.reverseTime)reverseMount(m);
   else{emit(player,'ground-escape',{actor:player});releaseMount(m)}
  }
 }else if(g.phase==='DOWNED' && keys.includes(code))rise(player,code===g.requiredKey);
 return true;
}
function poseMount(m) {
 const a=m.top,d=m.bottom,p=pos(d);stop(a);stop(d);
 a.rigidBody?.setTranslation({x:p.x,y:.82,z:p.z},true);
 d.rigidBody?.setTranslation({x:p.x,y:.82,z:p.z},true);
 pronePose(d);
 const wave=m.phase==='STRIKE'?Math.sin(Math.min(1,m.elapsed/.5)*Math.PI):0;
 if(a.joints?.hips){a.joints.hips.position.set(0,.54,0);a.joints.hips.rotation.set(0,0,0)}
 rotate(a,'chest',.18+wave*.6,.08+wave*.2);rotate(a,'head',-.1);
 rotate(a,'leftThigh',-1.3,0,.75);rotate(a,'rightThigh',-1.3,0,-.75);
 rotate(a,'leftShin',2.05);rotate(a,'rightShin',2.05);
 rotate(a,'leftArm',-.75,0,.25);rotate(a,'leftForearm',-1.2);
 rotate(a,'rightArm',-1.9+wave*(m.action==='BODY'?1.9:1.5),-.1,-.2);
 rotate(a,'rightForearm',-1.25+wave*1.15);
 rotate(d,'head',wave*-.25);rotate(d,'leftArm',-1.3,0,.12);rotate(d,'rightArm',-1.3,0,-.12);
}
export function updateMount(m,dt) {
 if(!m||m.closed)return;
 if(m.top.health<=0||m.bottom.health<=0){releaseMount(m);return}
 m.elapsed+=dt;m.remaining=Math.max(0,m.window-m.elapsed);poseMount(m);
 if(m.phase==='STRIKE'){
  if(m.elapsed>=.22&&!m.strikeLanded){m.strikeLanded=true;const damage=m.action==='BODY'?10:8;m.bottom.takeDamage(damage);m.strikes++;emit(m.top,'ground-strike',{actor:m.top,defender:m.bottom,action:m.action,damage})}
  if(m.remaining<=0){if(m.strikes>=GROUND_RULES.maxStrikes||m.bottom.health<=0)releaseMount(m);else chooseMount(m)}
 }else if(m.remaining<=0){if(m.phase==='CHOOSE')releaseMount(m);else failMount(m)}
}
export function getGroundPrompt(player) {
 const m=player?.mount,g=player?.ground;
 if(m&&!m.closed){const attacking=m.top===player;return {phase:m.phase,role:attacking?'ATTACKER':'DEFENDER',ratio:m.remaining/m.window,remaining:m.remaining,key:m.requiredKey?.replace('Key','')||'',choices:'J / K / F',title:m.phase==='CHOOSE'?'GROUND CONTROL':m.phase==='STRIKE'?'GROUND & POUND':attacking?'CONFIRM GROUND STRIKE':'ESCAPE THE MOUNT',detail:m.phase==='CHOOSE'?'J: head punch  ·  K: body punch  ·  F: stand up':m.phase==='STRIKE'?`${m.strikes} / 3 strikes · The defender gets another escape chance.`:attacking?'Match the shown key. A missed timing can reverse the mount.':'Match the key to escape. Within 0.40s: roll over and reverse the mount.'}}
 if(g?.phase==='DOWNED')return {phase:'CONTEST',role:'DEFENDER',ratio:g.remaining/g.window,remaining:g.remaining,key:g.requiredKey.replace('Key',''),title:'GET BACK UP',detail:'Press the shown key for a quick technical rise. Miss it and your recovery is slower.'};
 return null;
}
