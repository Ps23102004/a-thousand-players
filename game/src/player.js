import { playAnimation } from './animation.js';
import { grabProp, throwProp } from './props.js';
import { handleGroundInput, beginMount } from './ground.js';
import { faceOpponent, applyAttackMotion } from './movement.js';
import { beginGrapple, handleGrappleInput } from './grapple.js';
export { executeThrowOpponent } from './grapple.js';

const COMBO_WINDOW_MS = 800;

export function resetInputBuffer() {
  return {
    comboIndex: 0,
    lastInputTime: 0,
    currentMove: null
  };
}

let playerInputState = resetInputBuffer();
const activeKeys = {};
const keyboardKeys={},controllerKeys={};
function setKey(code,pressed,controller=false){
  (controller?controllerKeys:keyboardKeys)[code]=pressed;
  activeKeys[code]=!!(keyboardKeys[code]||controllerKeys[code]);
}

/**
 * Pure function to calculate combo transitions from input key and timestamps.
 */
export function updatePlayerStateFromInput(state, key, now, modifiers = {}) {
  const dt = now - (state.lastInputTime || 0);
  const next = { ...state, lastInputTime: now };

  if (key === 'J' || key === 'K') {
    const chainKey=(modifiers.crouch?'LOW_':'')+key;
    const chain=key==='J'?(modifiers.crouch?['BODY_JAB','BODY_HOOK']:['JAB','CROSS','HOOK','UPPERCUT']):(modifiers.crouch?['SWEEP']:['ROUNDHOUSE_KICK','HIGH_KICK','BACK_KICK']);
    const continuing=dt<=COMBO_WINDOW_MS && state.comboIndex>0 && (!state.chainKey || state.chainKey===chainKey);
    next.comboIndex=continuing?state.comboIndex%chain.length+1:1;
    next.currentMove=chain[next.comboIndex-1];next.chainKey=chainKey;
  } else if (key === 'L') {
    next.comboIndex = 0;
    next.currentMove = 'PARRY';
  } else if (key === 'Space') {
    next.comboIndex = 0;
    next.currentMove = 'DODGE_ROLL';
  } else if (key === 'F' || key === 'G') {
    next.comboIndex = 0;
    next.currentMove = 'THROW_PERSON';
  }

  return next;
}

/**
 * Attaches browser keyboard listeners.
 */
export function clearInputKeys() {
  for (const key of Object.keys(activeKeys)) delete activeKeys[key];
  for(const source of [keyboardKeys,controllerKeys])for(const key of Object.keys(source))delete source[key];
  playerInputState = resetInputBuffer();
}

export function initPlayerControls(player, onAttackCallback = null) {
  if (typeof window === 'undefined') return () => {};
  clearInputKeys();
  const keydown = e => {
    if (player.inputEnabled === false || player.health <= 0) return;
    if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
    setKey(e.code,true,e.controllerInput);
    // L1/crouch must affect the same-frame attack before the next simulation tick.
    player.isCrouching=!!(activeKeys.KeyS||activeKeys.ArrowDown);
    if (handleGroundInput(player,e.code,{repeat:e.repeat})) return;
    if (player.grapple) { handleGrappleInput(player, e.code, {repeat:e.repeat}); return; }
    if (e.repeat) return;
    const actions = ['KeyJ','KeyK','KeyL','KeyE','KeyF','KeyG'];
    if (!actions.includes(e.code)) return;
    if (['HIT_STUN','KNOCKDOWN','BEING_THROWN','GRABBED'].includes(player.state)) return;
    if (player.carriedProp) { throwProp(player.carriedProp, player, player.facing * 16, 3.8); return; }
    if (['STARTUP','ACTIVE','RECOVERY'].includes(player.state)) {
      if (e.code === 'KeyJ' || e.code === 'KeyK') {
        const queue=player.attackQueue ||= [];
        if(queue.length<3){
          playerInputState=updatePlayerStateFromInput(playerInputState,e.code==='KeyJ'?'J':'K',performance.now(),{crouch:!!activeKeys.KeyS});
          queue.push({move:playerInputState.currentMove,ttl:2.2});
        }
      }
      return;
    }
    if (e.code === 'KeyE') { player.onInteractProp?.(); return; }
    if (e.code === 'KeyF' || e.code === 'KeyG') { player.onGrabOpponent?.(); return; }
    const key = e.code === 'KeyJ' ? 'J' : e.code === 'KeyK' ? 'K' : 'L';
    playerInputState = updatePlayerStateFromInput(playerInputState, key, performance.now(), { crouch: !!activeKeys.KeyS });
    player.isGuarding = false;
    player.rigidBody?.setLinvel({ x: 0, y: player.rigidBody.linvel().y, z: 0 }, true);
    playAnimation(player, playerInputState.currentMove); onAttackCallback?.(playerInputState.currentMove);
  };
  const keyup = e => { setKey(e.code,false,e.controllerInput); };
  window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup);
  return () => { window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); clearInputKeys(); };
}

/**
 * Per-frame player input processing: lateral walk, auto-guard, jump, and prop interactions.
 */
export function processPlayerInput(player, keys, opponent = null, delta = 0.016) {
  if (!player || player.health <= 0 || player.grapple || player.ground || player.mount) return;

  // Stun/Hit/Grab locks prevent player movement
  if (player.state === 'HIT_STUN' || player.state === 'KNOCKDOWN' || player.state === 'BEING_THROWN' || player.state === 'GRABBED' || player.state === 'GRAB') return;

  const moveSpeed = player.carriedProp ? 3.0 : 4.4;
  const rb = player.rigidBody;
  let vx = 0;

  faceOpponent(player,opponent);
  if (['STARTUP','ACTIVE','RECOVERY'].includes(player.state)) { applyAttackMotion(player); return; }

  const left = keys['KeyA'] || keys['ArrowLeft'];
  const right = keys['KeyD'] || keys['ArrowRight'];
  const crouch = keys['KeyS'] || keys['ArrowDown'];
  const jump = keys['KeyW'] || keys['ArrowUp'];
  player.isCrouching = !!crouch;

  if (left) {
    vx -= moveSpeed;
  }
  if (right) {
    vx += moveSpeed;
  }

  // Check auto-guard: holding away from facing direction (only if not carrying prop)
  const isRetreating = (player.facing > 0 && vx < 0) || (player.facing < 0 && vx > 0);
  if ((isRetreating || keys.ShiftLeft) && !player.carriedProp && player.state !== 'GRAB') {
    player.isGuarding = true;
    if (player.currentAnim !== 'BLOCK') playAnimation(player, 'BLOCK', true);
    player.state = 'BLOCK';
  } else {
    player.isGuarding = false;
    if (vx !== 0 || keys.KeyQ || keys.KeyV) {
      if (!player.carriedProp && player.currentAnim !== 'WALK') playAnimation(player, 'WALK', true);
    } else if (crouch && !player.carriedProp) {
      if (player.currentAnim !== 'IDLE') playAnimation(player, 'IDLE', true);
      player.state = 'CROUCH';
    } else {
      if (!player.carriedProp && (player.currentAnim === 'WALK' || player.state === 'BLOCK' || player.state === 'CROUCH')) {
        playAnimation(player, 'IDLE', true);
      }
    }
  }

  // Apply horizontal velocity to Rapier rigid body
  if (rb) {
    const curVel = rb.linvel();
    const grounded = rb.translation().y < 0.88 && Math.abs(curVel.y) < 0.2;
    const jumpVel = jump && !player.jumpHeld && grounded ? 6.0 : curVel.y;
    player.jumpHeld = !!jump;
    const vz=((keys.KeyV?1:0)-(keys.KeyQ?1:0))*2.8;
    rb.setLinvel({ x: vx, y: jumpVel, z: vz }, true);
  }
}

/**
 * Complete player update hook executed inside main animation loop.
 */
export function updatePlayer(player, opponent, props = [], delta = 0.016) {
  if (player.grapple || player.ground || player.mount) return;
  if (['HIT_STUN','BEING_THROWN'].includes(player.state)) player.attackQueue=[];
  if(player.attackQueue?.length){
    player.attackQueue=player.attackQueue.filter(input=>(input.ttl-=delta)>0);
    if(['IDLE','BLOCK','CROUCH'].includes(player.state) && player.attackQueue.length){
      const input=player.attackQueue.shift();player.isGuarding=false;playAnimation(player,input.move);
    }
  }
  processPlayerInput(player, activeKeys, opponent, delta);

  // Setup 'E' prop interact / pick up handler
  player.onInteractProp = () => {
    // If already carrying a prop, throw it!
    if (player.carriedProp) {
      throwProp(player.carriedProp, player, player.facing * 16, 4.0);
      return;
    }

    const pPos = player.rigidBody ? player.rigidBody.translation() : player.mesh.position;

    // Check nearest intact prop to pick up
    let nearest = null;
    let nearestDist = 2.0;

    for (let prop of props) {
      if (prop.isBroken || prop.isCarried) continue;
      const pos = prop.rigidBody ? prop.rigidBody.translation() : prop.mesh.position;
      const dist = Math.hypot(pos.x - pPos.x, pos.y - pPos.y, pos.z-pPos.z);
      if (dist < nearestDist) {
        nearest = prop;
        nearestDist = dist;
      }
    }

    if (nearest) {
      grabProp(nearest, player);
    }
  };

  player.onGrabOpponent = () => opponent.ground ? beginMount(player,opponent) : beginGrapple(player, opponent);
}
