import { faceOpponent, direction } from './movement.js';
import { playAnimation } from './animation.js';

export const GRAPPLE_RULES = Object.freeze({ range: 1.30, chooseTime: 1.6, promptTime: 1.25, reverseTime: 0.45, maxStrikes: 2, cooldown: 2.2 });
const PROMPT_KEYS = ['KeyJ', 'KeyK', 'KeyL'];
const stop = f => f.rigidBody?.setLinvel({ x: 0, y: 0, z: 0 }, true);
const position = f => f.rigidBody ? f.rigidBody.translation() : f.mesh.position;
const emit = (g, type, extra = {}) => (g.attacker.onGrappleEvent || g.defender.onGrappleEvent)?.({ type, attacker: g.attacker, defender: g.defender, ...extra });

/** Shared contest state; exactly one update per simulation tick, never wall-clock time. */
export function beginGrapple(attacker, defender, { rng = Math.random } = {}) {
  if (!attacker || !defender || attacker.health <= 0 || defender.health <= 0 || attacker.grapple || defender.grapple || attacker.ground || defender.ground || attacker.mount || defender.mount) return null;
  if ((attacker.grappleCooldown || 0) > 0 || (defender.grappleCooldown || 0) > 0 || attacker.carriedProp || defender.carriedProp) return null;
  if (['STARTUP','ACTIVE','RECOVERY','HIT_STUN','KNOCKDOWN','BEING_THROWN','GRABBED'].includes(attacker.state)) return null;
  if (['KNOCKDOWN','BEING_THROWN','GRABBED'].includes(defender.state)) return null;
  const a = position(attacker), d = position(defender);
  if (Math.hypot(a.x-d.x,a.z-d.z) > GRAPPLE_RULES.range || Math.abs(a.y-d.y) > 0.3 || a.y > 1.08 || d.y > 1.08) return null;
  const g = { attacker, defender, rng, phase: 'CHOOSE', action: null, requiredKey: null, elapsed: 0, remaining: GRAPPLE_RULES.chooseTime, window: GRAPPLE_RULES.chooseTime, strikes: 0, lastKey: null, closed: false, totalTime: 0 };
  faceOpponent(attacker,defender);faceOpponent(defender,attacker);
  attacker.attackQueue=defender.attackQueue=[];
  attacker.grapple = defender.grapple = g;
  attacker.grabbedTarget = defender; defender.grabbedBy = attacker;
  attacker.pendingAttack = defender.pendingAttack = null;
  attacker.isGuarding = defender.isGuarding = false;
  attacker.isCrouching = defender.isCrouching = false;
  attacker.facing = d.x >= a.x ? 1 : -1; defender.facing = -attacker.facing;
  playAnimation(attacker, 'BLOCK', true); playAnimation(defender, 'IDLE', true);
  attacker.state = 'GRAB'; defender.state = 'GRABBED'; stop(attacker); stop(defender);
  emit(g, 'grab');
  if (!attacker.isPlayer) {
    const roll = rng(); g.action = roll < 0.5 ? 'THROW' : roll < 0.75 ? 'PUNCH' : 'KNEE';
    armPrompt(g);
  }
  poseGrapple(g);
  return g;
}

function armPrompt(g, exclude = null) {
  const choices = PROMPT_KEYS.filter(key => key !== exclude && key !== g.lastKey);
  const keys = choices.length ? choices : PROMPT_KEYS;
  g.requiredKey = keys[Math.min(keys.length-1, Math.floor(g.rng()*keys.length))];
  g.lastKey = g.requiredKey; g.phase = 'CONTEST'; g.elapsed = 0;
  g.window = GRAPPLE_RULES.promptTime; g.remaining = g.window;
}

export function releaseGrapple(g, { separate = true } = {}) {
  if (!g || g.closed) return;
  g.closed = true;
  const { attacker, defender } = g;
  for (const f of [attacker, defender]) {
    f.grapple = null; f.grabbedBy = null; f.grabbedTarget = null;
    f.attackQueue=[]; f.pendingAttack = null; f.isGuarding = false; f.grappleCooldown = GRAPPLE_RULES.cooldown;
    f.animSpeed = 1; stop(f); playAnimation(f, 'IDLE', true);
  }
  if (separate) {
    const dir=direction(attacker);
    attacker.rigidBody?.setLinvel({x:-dir.x*1.8,y:0,z:-dir.z*1.8},true);
    defender.rigidBody?.setLinvel({x:dir.x*1.8,y:0,z:dir.z*1.8},true);
  }
}

/** Public physical throw primitive, also used by the unit tests. */
export function executeThrowOpponent(attacker, defender) {
  if (!attacker || !defender || attacker.health <= 0 || defender.health <= 0) return;
  const g = attacker.grapple || defender.grapple;
  if (g) releaseGrapple(g, {separate:false});
  playAnimation(attacker, 'THROW_PERSON'); playAnimation(defender, 'BEING_THROWN');
  attacker.state = 'ACTIVE'; attacker.hitRegistered = true;
  attacker.grabbedTarget = null; defender.grabbedBy = null;
  attacker.isGuarding = defender.isGuarding = false;
  if (defender.rigidBody) {
    const dir=direction(attacker);
    defender.rigidBody.setLinvel({x:dir.x*14.5,y:6.2,z:dir.z*14.5},true);
    defender.rigidBody.setAngvel?.({x:0,y:0,z:-attacker.facing*8.5},true);
  }
  defender.takeDamage(32); attacker.onThrow?.(defender);
}

function startStrike(g) {
  g.phase = 'STRIKE'; g.elapsed = 0; g.window = 0.42; g.remaining = g.window; g.strikeLanded = false;
}
function finishAction(g) {
  if (g.action === 'THROW') {
    const a = g.attacker, d = g.defender;
    executeThrowOpponent(a,d); emit(g,'throw',{actor:a});
  } else startStrike(g);
}
function failContest(g, reason) {
  if (!g.attacker.isPlayer) { finishAction(g); return; }
  if (g.rng() < 0.45) {
    const counter = g.defender, victim = g.attacker;
    executeThrowOpponent(counter,victim); emit(g,'reversal',{actor:counter,reason});
  } else { releaseGrapple(g); emit(g,'escape',{actor:g.defender,reason}); }
}

/** Fresh presses only. Holding a key or pressing unrelated movement never clears a prompt. */
export function handleGrappleInput(player, code, {repeat=false} = {}) {
  const g = player?.grapple;
  if (!g || g.closed) return false;
  if (repeat) return true;
  if (code === 'KeyG') code = 'KeyF';
  if (!['KeyJ','KeyK','KeyL','KeyF'].includes(code)) return true;
  if (g.phase === 'STRIKE') return true;
  if (g.phase === 'CHOOSE') {
    if (!g.attacker.isPlayer) return true;
    if (code === 'KeyL') { releaseGrapple(g); emit(g,'release'); return true; }
    if (g.strikes >= GRAPPLE_RULES.maxStrikes && code !== 'KeyF') return true;
    g.action = code === 'KeyJ' ? 'PUNCH' : code === 'KeyK' ? 'KNEE' : 'THROW';
    armPrompt(g,code); return true;
  }
  if (g.phase === 'CONTEST') {
    if (code !== g.requiredKey) { failContest(g,'wrong-key'); return true; }
    if (g.attacker.isPlayer) finishAction(g);
    else if (g.elapsed <= GRAPPLE_RULES.reverseTime) {
      executeThrowOpponent(player,g.attacker); emit(g,'reversal',{actor:player});
    } else { releaseGrapple(g); emit(g,'escape',{actor:player}); }
    return true;
  }
  return true;
}

/** One arm holds the torso while the free arm punches or the rear knee drives up. */
function poseGrapple(g) {
  const a = g.attacker, d = g.defender;
  const rotate = (f,name,x=0,y=0,z=0) => f.joints?.[name]?.rotation.set(x,y,z);
  const wave = g.phase === 'STRIKE' ? Math.sin(Math.min(1,g.elapsed/g.window)*Math.PI) : 0;
  rotate(a,'chest',0.08,0.1+wave*0.2,0);
  rotate(a,'leftArm',-1.20,0.15,0.10); rotate(a,'leftForearm',-0.35,0,0);
  rotate(a,'rightArm',g.action==='PUNCH'?-0.9-wave*0.7:-0.9,-0.2,-0.2);
  rotate(a,'rightForearm',g.action==='PUNCH'?-1.25+wave*1.2:-1.25,0,0);
  rotate(a,'leftThigh',0.2); rotate(a,'leftShin',0.15);
  rotate(a,'rightThigh',g.action==='KNEE'?-0.2-wave*1.25:-0.2);
  rotate(a,'rightShin',g.action==='KNEE'?0.25+wave*1.8:0.25);
  rotate(d,'chest',0.12-wave*0.25); rotate(d,'head',wave*0.2);
  rotate(d,'leftArm',-0.6,0,0.15); rotate(d,'rightArm',-0.6,0,-0.15);
  rotate(d,'leftForearm',-1.25); rotate(d,'rightForearm',-1.25);
}

export function updateGrapple(g, delta) {
  if (!g || g.closed) return;
  if (g.attacker.health <= 0 || g.defender.health <= 0) { releaseGrapple(g); return; }
  g.elapsed += delta; g.totalTime += delta; g.remaining = Math.max(0,g.window-g.elapsed);
  stop(g.attacker); stop(g.defender); poseGrapple(g);
  if (g.phase === 'STRIKE') {
    if (g.elapsed >= 0.18 && !g.strikeLanded) {
      g.strikeLanded = true;
      const damage = g.action === 'KNEE' ? 11 : 8;
      g.defender.takeDamage(damage); g.strikes++;
      emit(g,'strike',{actor:g.attacker,action:g.action,damage});
      if (g.defender.health <= 0) { releaseGrapple(g,{separate:false}); return; }
    }
    if (g.remaining <= 0) {
      if (!g.attacker.isPlayer) { releaseGrapple(g); return; }
      g.phase = 'CHOOSE'; g.requiredKey = null; g.action = null; g.elapsed = 0;
      g.window = GRAPPLE_RULES.chooseTime; g.remaining = g.window;
    }
  } else if (g.remaining <= 0) failContest(g,'timeout');
}

export function getGrapplePrompt(player) {
  const g = player?.grapple;
  if (!g || g.closed) return null;
  const attacking = g.attacker === player;
  const action = g.action === 'KNEE' ? 'KNEE STRIKE' : g.action === 'PUNCH' ? 'CLINCH PUNCH' : 'THROW';
  return {
    phase:g.phase, role:attacking?'ATTACKER':'DEFENDER', ratio:Math.max(0,g.remaining/g.window), remaining:g.remaining,
    key:g.requiredKey?.replace('Key','') || '',
    title:g.phase==='CHOOSE'?'YOUR CLINCH':g.phase==='STRIKE'?(attacking?'HOLD & STRIKE':'TAKING A HIT'):attacking?`CONFIRM ${action}`:'BREAK THE GRAB',
    detail:g.phase==='CHOOSE'?(g.strikes>=GRAPPLE_RULES.maxStrikes?'F: throw  ·  L: release':'J: punch  ·  K: knee  ·  F: throw  ·  L: release'):g.phase==='STRIKE'?'One arm holds. The other follows through.':attacking?'Press the shown key once. Miss it and your rival can escape or reverse.':'Press the shown key. React within 0.45s to counterthrow; otherwise escape.',
    choices:g.strikes>=GRAPPLE_RULES.maxStrikes?'F / L':'J / K / F / L',
    strikes:g.strikes
  };
}
