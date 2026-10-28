import { GamepadControls } from './gamepad.js';
import * as THREE from 'three';
import { initPhysics, stepPhysics, removeRigidBody } from './physics.js';
import { createMarketEnvironment } from './world.js';
import { createCardboardBox, updateProps } from './props.js';
import { createFighterRig, disposeFighter, FIGHTERS } from './character.js';
import { playAnimation, updateAnimation } from './animation.js';
import { checkHitCollisions, resolveDamageAndImpulse, updateHitStop } from './combat.js';
import { initPlayerControls, updatePlayer, clearInputKeys } from './player.js';
import { updateRivalAI, resetRivalAI } from './ai.js';
import { createTownfolkCrowd, updateCrowd, handleCombatEventForCrowd } from './crowd.js';
import { updateGround, updateMount, releaseMount, setMountObstacles } from './ground.js';
import { combatFraming } from './camera.js';
import { updateGrapple, releaseGrapple } from './grapple.js';
import { initAudio, playSound, setSoundEnabled } from './audio.js';
import { initHUD, updateHUD, getHUDState, resetHUDState, updateGrappleHUD } from './hud.js';

const $ = id => document.getElementById(id);
class GameApp {
  constructor() {
    this.scene = null; this.camera = null; this.renderer = null; this.world = null;
    this.clock = new THREE.Clock(); this.running = false; this.gameStarted = false;
    this.player = null; this.rival = null; this.props = []; this.crowd = null;
    this.shakeAmount = 0; this.selectedFighter = 'kai'; this.screen = 'menu'; this.paused = false;
    this.countdown = 0; this.time = 0; this.effects = []; this.feedbackTimer = 0;
    this.inputMode='keyboard';
    this.soundEnabled = true; this.cheerTimer = 5; this.accumulator = 0;
  }
  async init() {
    try {
      const physics = await initPhysics(); this.world = physics.world;
      this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x111e2a);
      this.scene.fog = new THREE.FogExp2(0x111e2a, 0.025);
      this.camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
      this.camera.position.set(0, 2.5, 8.5); this.camera.lookAt(0, 1.35, 0);
      this.renderer = new THREE.WebGLRenderer({ canvas: $('webgl-canvas'), antialias: true, powerPreference: 'high-performance' });
      this.renderer.setSize(innerWidth, innerHeight); this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05; this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.environment = createMarketEnvironment(this.scene, this.world);
      this.crowd = createTownfolkCrowd(this.scene);
      this.spawnEntities();
      initHUD(() => this.startGame(), () => this.resetGame());
      this.bindEvents(); this.initController(); this.running = true; this.animate();
      $('btn-start-duel').disabled = false; $('btn-start-duel').innerHTML = 'ENTER THE CIRCUIT <span>↗</span>';
      $('loading').classList.add('ready'); $('loading').setAttribute('aria-hidden','true');
    } catch (error) {
      console.error(error); $('loading-label').textContent = 'Unable to load WebGL / physics. Please open in a current browser using a local server.';
      document.querySelector('.loading-line').style.display = 'none';
    }
  }
  spawnEntities() {
    this.controlsCleanup?.();
    releaseGrapple(this.player?.grapple || this.rival?.grapple);
    releaseMount(this.player?.mount || this.rival?.mount);
    $('grapple-hud')?.classList.add('hidden');
    for (const fighter of [this.player, this.rival]) if (fighter) { removeRigidBody(fighter.rigidBody, this.world); disposeFighter(fighter); }
    for (const p of this.props) {
      if (p.mesh) disposeFighter(p);
      if (p.rigidBody?.isValid()) removeRigidBody(p.rigidBody, this.world);
      for (const d of p.debrisPieces || []) { if (d.mesh) { this.scene.remove(d.mesh); d.mesh.geometry?.dispose(); d.mesh.material?.dispose(); } if (d.rigidBody?.isValid()) removeRigidBody(d.rigidBody, this.world); }
    }
    this.effects.forEach(e => this.disposeEffect(e)); this.effects = [];
    this.player = createFighterRig(this.scene, this.world, true, -1.0, this.selectedFighter);
    this.rival = createFighterRig(this.scene, this.world, false, 1.0, this.selectedFighter === 'kai' ? 'rook' : 'kai');
    this.player.inputEnabled = false;
    this.player.onThrow = () => getHUDState().registerComboHit();
    for(const f of [this.player,this.rival]) {
      f.onAttackStart=name=>{if(this.screen==='fight'&&this.countdown<=0)playSound('whoosh',{heavy:name.includes('KICK'),pan:Math.max(-.7,Math.min(.7,(f.mesh.position.x-this.camera.position.x)/4))})};
      f.onGroundEvent=event=>{
        const labels={'knockdown':'KNOCKDOWN','slam':'HEAVY LANDING','mount':'GROUND CONTROL','ground-strike':'GROUND & POUND','mount-reversal':'MOUNT REVERSED','ground-escape':'ESCAPED','tech-rise':'TECHNICAL RISE','slow-rise':'RECOVERING'};
        this.feedback(labels[event.type]||'');
        if(event.type==='slam'){this.controller?.rumble(.6,160);playSound('slam');this.triggerScreenShake(.17)}
        if(event.type==='ground-strike'){
          this.controller?.rumble(.35,100);playSound(event.action==='BODY'?'body':'punch');this.triggerScreenShake(.11);
          const p=event.defender.rigidBody.translation();this.impact({x:p.x,y:.45,z:p.z});
          if(event.actor.isPlayer){getHUDState().registerComboHit();getHUDState().damageDealt+=event.damage}
        }
        if(['mount','mount-reversal','knockdown'].includes(event.type))handleCombatEventForCrowd(this.crowd,{type:'COMBO_3'});
      };
    }
    this.player.onGrappleEvent = this.rival.onGrappleEvent = event => {
      const names = {grab:'CLINCH',strike:event.action==='KNEE'?'KNEE STRIKE':'CLINCH PUNCH',throw:'JUDO THROW',escape:event.actor?.isPlayer?'ESCAPED':'RIVAL ESCAPED',reversal:event.actor?.isPlayer?'COUNTERTHROW!':'RIVAL REVERSAL',release:'RELEASED'};
      this.feedback(names[event.type] || 'CLINCH');
      if (['strike','throw','reversal'].includes(event.type)) {
        this.controller?.rumble(.4,120);playSound(event.type==='strike'?(event.action==='KNEE'?'body':'punch'):'slam'); this.triggerScreenShake(event.type==='strike'?0.09:0.2);
        const victim=event.actor===event.defender?event.attacker:event.defender;
        const p = victim.rigidBody.translation(); this.impact({x:p.x,y:p.y+0.5,z:p.z});
        if(event.type==='strike' && event.actor?.isPlayer)getHUDState().registerComboHit();
        handleCombatEventForCrowd(this.crowd,{type:'COMBO_3'});
      }
    };
    this.props = [createCardboardBox(this.scene, this.world, -7.5, 0.4), createCardboardBox(this.scene, this.world, 7.5, 0.4)];
    setMountObstacles(() => this.props);
    this.controlsCleanup = initPlayerControls(this.player);
    $('player-name').textContent = this.player.name; $('rival-name').textContent = this.rival.name;
    updateHitStop(1); resetRivalAI(); clearInputKeys();
  }
  bindEvents() {
    window.addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(innerWidth, innerHeight);
    });
    document.querySelectorAll('[data-fighter]').forEach(button => button.addEventListener('click', () => {
      if (this.screen !== 'menu') return;
      this.selectedFighter = button.dataset.fighter;
      document.querySelectorAll('[data-fighter]').forEach(b => { const selected = b === button; b.classList.toggle('selected', selected); b.setAttribute('aria-pressed', selected); });
      const def = FIGHTERS[this.selectedFighter]; $('preview-name').innerHTML = `${def.name}<span>${this.selectedFighter === 'kai' ? '01' : '02'}</span>`;
      $('preview-title').textContent = def.title; this.spawnEntities();
    }));
    $('btn-how').onclick = $('btn-controls').onclick = () => this.openHelp();
    $('btn-close-help').onclick = () => this.closeHelp();
    $('btn-pause').onclick = () => this.togglePause(); $('btn-resume').onclick = () => this.togglePause();
    $('btn-menu').onclick = $('btn-end-menu').onclick = () => this.returnToMenu();
    $('btn-sound').onclick = () => {
      this.soundEnabled = !this.soundEnabled; setSoundEnabled(this.soundEnabled);
      if (this.soundEnabled) { initAudio(); playSound('cheer'); }
      $('btn-sound').textContent = this.soundEnabled ? '◖ SOUND ON' : '◖ SOUND OFF'; $('btn-sound').setAttribute('aria-pressed', this.soundEnabled);
    };
    window.addEventListener('keydown', e => {
      if (e.code === 'Escape') {
        if (!$('help-modal').classList.contains('hidden')) this.closeHelp();
        else this.togglePause();
      }
      if (e.code === 'KeyH' && !e.repeat) { e.preventDefault(); if($('help-modal').classList.contains('hidden'))this.openHelp();else this.closeHelp(); }
      if (e.code === 'Enter' && this.screen === 'menu' && $('help-modal').classList.contains('hidden') && !e.target.closest('button,a')) this.startGame();
    });
    window.addEventListener('blur', () => { if (this.gameStarted && !this.paused && !getHUDState().gameOver) this.togglePause(); clearInputKeys(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.gameStarted && !this.paused && !getHUDState().gameOver) this.togglePause(); });
    document.querySelectorAll('[data-key]').forEach(b => {
      const dispatch = type => window.dispatchEvent(new KeyboardEvent(type, { code: b.dataset.key, bubbles: true }));
      b.onpointerdown = e => { e.preventDefault(); b.setPointerCapture(e.pointerId); dispatch('keydown'); };
      b.onpointerup = b.onpointercancel = () => dispatch('keyup');
    });
  }
  initController() {
    this.controller=new GamepadControls({
      context:()=>this.controllerContext(),
      emitKey:(code,pressed)=>{const event=new KeyboardEvent(pressed?'keydown':'keyup',{code,bubbles:true});Object.defineProperty(event,'controllerInput',{value:true});window.dispatchEvent(event)},
      onInput:()=>this.setInputMode('controller'),
      onAction:action=>this.controllerAction(action),
      onStatus:state=>{
        const messages={waiting:'PS5 CONTROLLER · CONNECT, CLICK THE GAME, THEN PRESS ✕',connected:'CONTROLLER CONNECTED · ✕ CONFIRM · CREATE CONTROLS',unmapped:'CONTROLLER DETECTED · STANDARD BUTTON MAPPING NEEDED',unavailable:'CONTROLLER API UNAVAILABLE · USE A GAMEPAD-CAPABLE BROWSER'};
        $('controller-status').textContent=messages[state];$('controller-status').dataset.state=state;
        if(state==='connected'){this.setInputMode('controller');if(this.screen==='menu'&&$('help-modal').classList.contains('hidden'))$('btn-start-duel').focus()}
        else this.setInputMode('keyboard');
      },
      onDisconnect:()=>{if(this.screen==='fight'&&!this.paused&&!getHUDState().gameOver)this.togglePause();if(this.paused)$('pause-modal').querySelector('p').textContent='Controller disconnected. Reconnect, then press ✕ to resume.';clearInputKeys()}
    });
    window.addEventListener('keydown',e=>{if(!e.controllerInput)this.setInputMode('keyboard')});
    window.addEventListener('pointerdown',()=>{if(this.soundEnabled){initAudio();playSound('step',{volume:0})}});
    $('btn-guide-controller').onclick=()=>this.setHelpGuide('controller');
    $('btn-guide-keyboard').onclick=()=>this.setHelpGuide('keyboard');
  }
  controllerContext() {
    if(document.hidden||!document.hasFocus())return 'inactive';
    if(!$('help-modal').classList.contains('hidden'))return 'help';
    if(this.screen==='menu')return 'menu';
    if(getHUDState().gameOver)return 'end';
    if(this.paused)return 'pause';
    return this.countdown>0?'countdown':'fight';
  }
  setHelpGuide(mode) {
    $('help-modal').dataset.controlView=mode;
    for(const name of ['controller','keyboard'])$('btn-guide-'+name).setAttribute('aria-pressed',name===mode);
  }
  setInputMode(mode) {
    if(this.inputMode===mode)return;
    this.inputMode=mode;document.body.dataset.input=mode;this.setHelpGuide(mode);
    $('btn-controls').innerHTML=mode==='controller'?'? <small>CONTROLS · CREATE</small>':'? <small>CONTROLS · H</small>';
    $('btn-pause').innerHTML=mode==='controller'?'Ⅱ <small>OPTIONS</small>':'Ⅱ <small>ESC</small>';
    updateGrappleHUD(this.player);
  }
  controllerAction(action) {
    const context=this.controllerContext();if(context==='inactive')return;
    if(action==='help'){if(context==='help')this.closeHelp();else this.openHelp();return}
    if(action==='pause'){if(context==='help')this.closeHelp();else if(context==='menu'||context==='end')this.controllerAction('confirm');else this.togglePause();return}
    if(action==='restart'){if(this.screen==='fight')this.resetGame();return}
    if(action==='sound'){$('btn-sound').click();return}
    if(context==='fight'||context==='countdown')return;
    if(action==='back'){if(context==='help')this.closeHelp();else if(context==='pause')this.togglePause();else if(context==='end')this.returnToMenu();return}
    if(context==='menu'&&['left','right'].includes(action)){
      document.querySelector(`[data-fighter="${this.selectedFighter==='kai'?'rook':'kai'}"]`).click();return;
    }
    const root=$(context==='help'?'help-modal':context==='pause'?'pause-modal':context==='end'?'end-modal':'story-modal');
    const buttons=[...root.querySelectorAll('button')].filter(b=>!b.disabled&&b.getClientRects().length>0);
    if(action==='confirm'){
      const fallback=$(context==='menu'?'btn-start-duel':context==='help'?'btn-close-help':context==='pause'?'btn-resume':'btn-restart');
      (buttons.includes(document.activeElement)?document.activeElement:fallback).click();return;
    }
    if(['up','down','left','right'].includes(action)&&buttons.length){
      const step=action==='up'||action==='left'?-1:1,current=buttons.indexOf(document.activeElement);
      const target=buttons[(current+step+buttons.length)%buttons.length];target.focus();target.scrollIntoView({block:'nearest'});
    }
  }
  openHelp() {
    this.helpPaused = this.screen === 'fight' && !this.paused && !getHUDState().gameOver;
    if(this.helpPaused)this.togglePause();
    $('help-modal').classList.remove('hidden'); $('btn-close-help').focus();
  }
  closeHelp() {
    $('help-modal').classList.add('hidden');
    if(this.helpPaused && this.paused)this.togglePause();
    this.helpPaused=false;
    (this.screen==='menu'?$('btn-how'):$('btn-controls')).focus();
  }
  startGame() {
    if (this.screen === 'fight' && !getHUDState().gameOver) return;
    this.screen = 'fight'; document.body.dataset.screen = 'fight'; this.paused = false;
    $('help-modal').classList.add('hidden'); this.helpPaused=false;
    $('story-modal').classList.add('hidden'); $('end-modal').classList.add('hidden'); $('pause-modal').classList.add('hidden'); $('hud-overlay').classList.remove('hidden');
    this.spawnEntities(); resetHUDState(); this.gameStarted = true; this.countdown = 2.0; this.accumulator = 0;
    this.player.mesh.scale.setScalar(1); this.rival.mesh.scale.setScalar(1);
    setSoundEnabled(this.soundEnabled);
    if (this.soundEnabled) { initAudio(); playSound('cheer'); }
  }
  resetGame() { this.screen = 'menu'; this.startGame(); }
  returnToMenu() {
    this.gameStarted = false; this.screen = 'menu'; this.paused = false; this.player.inputEnabled = false; clearInputKeys();
    document.body.dataset.screen = 'menu'; $('story-modal').classList.remove('hidden'); $('hud-overlay').classList.add('hidden');
    $('pause-modal').classList.add('hidden'); $('end-modal').classList.add('hidden'); $('fight-announcement').textContent = '';
    this.spawnEntities(); $('btn-start-duel').focus();
  }
  togglePause() {
    if (!this.gameStarted || getHUDState().gameOver) return;
    this.paused = !this.paused; this.player.inputEnabled = !this.paused && this.countdown <= 0; clearInputKeys();
    $('pause-modal').classList.toggle('hidden', !this.paused);
    if (this.paused) $('btn-resume').focus(); else $('webgl-canvas').focus();
  }
  updateCamera(dt) {
    const pp=this.player.rigidBody.translation(),rp=this.rival.rigidBody.translation();
    const ground=this.player.mount?'mount':this.player.ground||this.rival.ground?'down':false;
    const frame=combatFraming(pp,rp,this.camera.aspect,ground),ease=1-Math.exp(-dt*5);
    this.camera.position.lerp(new THREE.Vector3(frame.position.x,frame.position.y,frame.position.z),ease);
    this.shakeAmount = Math.max(0, this.shakeAmount - dt * 0.8);
    this.camera.position.x += (Math.random() - 0.5) * this.shakeAmount;
    this.camera.position.y += (Math.random() - 0.5) * this.shakeAmount;
    this.camera.lookAt(frame.target.x,frame.target.y,frame.target.z);
  }
  triggerScreenShake(intensity = 0.12) { this.shakeAmount = Math.max(this.shakeAmount, intensity); }
  feedback(text) { $('hit-feedback').textContent = text; this.feedbackTimer = 0.7; }
  impact(point, blocked = false) {
    const geo = new THREE.BufferGeometry(); const coords = new Float32Array(22 * 3); const velocities = [];
    for (let i = 0; i < 22; i++) { const a = i / 22 * Math.PI * 2; velocities.push(new THREE.Vector3(Math.cos(a) * (2 + Math.random() * 2), Math.sin(a) * 3, (Math.random() - 0.5) * 2)); }
    geo.setAttribute('position', new THREE.BufferAttribute(coords, 3));
    const p = new THREE.Points(geo, new THREE.PointsMaterial({ color: blocked ? 0xb6e6d5 : 0xffc582, size: 0.075, transparent: true, depthWrite: false }));
    p.position.set(point.x, point.y, (point.z||0)+.12); this.scene.add(p); this.effects.push({ mesh: p, age: 0, velocities });
  }
  disposeEffect(e) { this.scene.remove(e.mesh); e.mesh.geometry.dispose(); e.mesh.material.dispose(); }
  resolveHits(attacker, defender) {
    for (const hit of checkHitCollisions(attacker, defender, this.props)) {
      const res = resolveDamageAndImpulse(hit); if (!res) continue;
      this.impact(hit.contactPoint, res.blocked || res.parried);
      if(hit.type==='fighter')this.controller?.rumble((res.blocked||res.parried)? .15 : .35,90);
      if (res.parried) { playSound('parry'); this.feedback('PARRY'); this.triggerScreenShake(0.06); }
      else if (res.propShattered) { playSound('cart_smash'); if (attacker.isPlayer) getHUDState().propsBroken++; this.feedback('CRATE BREAK'); handleCombatEventForCrowd(this.crowd, { type: 'CART_SMASH', x: hit.contactPoint.x }); }
      else if (res.blocked) { playSound('block'); this.feedback('BLOCK'); }
      else {
        playSound(res.cue||'punch',{pan:Math.max(-.7,Math.min(.7,(hit.contactPoint.x-this.camera.position.x)/4))}); if(res.knockedDown)this.feedback('KNOCKDOWN'); this.triggerScreenShake(attacker.currentAnim.includes('KICK') ? 0.17 : 0.09);
        if (attacker.isPlayer) { const hud = getHUDState(); hud.registerComboHit(); hud.damageDealt += res.damage;
          if (hud.comboCount >= 3) { handleCombatEventForCrowd(this.crowd, { type: 'COMBO_3' }); this.feedback('CLEAN COMBINATION'); playSound('cheer'); }
        }
      }
    }
  }
  updateFight(dt) {
    if (this.countdown > 0) {
      this.countdown -= dt; $('fight-announcement').textContent = this.countdown > 1.05 ? 'ROUND 01' : this.countdown > 0.1 ? 'FIGHT' : '';
      this.player.inputEnabled = this.countdown <= 0;
      stepPhysics(dt); this.player.updatePhysics(dt); this.rival.updatePhysics(dt);
      updateAnimation(this.player, dt); updateAnimation(this.rival, dt); this.updateCamera(dt); return;
    }
    this.player.inputEnabled = true;
    for(const fighter of [this.player,this.rival])fighter.grappleCooldown=Math.max(0,(fighter.grappleCooldown||0)-dt);
    updateGrapple(this.player.grapple || this.rival.grapple,dt);
    updateMount(this.player.mount || this.rival.mount,dt);
    for(const f of [this.player,this.rival])updateGround(f,dt);
    updateHitStop(dt); updatePlayer(this.player, this.rival, this.props, dt); updateRivalAI(this.rival, this.player, this.props, dt);
    stepPhysics(dt);
    for (const fighter of [this.player, this.rival]) { fighter.updatePhysics(dt); updateAnimation(fighter, dt);
      if(!fighter.ground&&!fighter.mount&&fighter.currentAnim==='WALK'&&Math.hypot(fighter.rigidBody.linvel().x,fighter.rigidBody.linvel().z)>.8){fighter.stepTime=(fighter.stepTime||0)+dt;if(fighter.stepTime>.32){playSound('step',{volume:.55});fighter.stepTime=0}} }
    this.resolveHits(this.player, this.rival); this.resolveHits(this.rival, this.player);
    updateProps(this.props, dt, [this.player, this.rival]); updateHUD(this.player, this.rival, dt); updateGrappleHUD(this.player); this.updateCamera(dt);
    if (getHUDState().gameOver) { releaseMount(this.player.mount || this.rival.mount); releaseGrapple(this.player.grapple || this.rival.grapple); updateGrappleHUD(this.player); this.player.inputEnabled = false; clearInputKeys(); handleCombatEventForCrowd(this.crowd, { type: 'VICTORY' }); playSound('cheer'); }
    this.cheerTimer -= dt;
    if (this.cheerTimer <= 0) { playSound('cheer'); this.cheerTimer = 8 + Math.random() * 5; handleCombatEventForCrowd(this.crowd, { type: 'COMBO_3' }); }
  }
  animate() {
    if (!this.running) return;
    requestAnimationFrame(() => this.animate());
    this.controller?.poll();
    const dt = Math.min(this.clock.getDelta(), 0.05); this.time += dt;
    if (!this.paused) {
      this.environment.update(this.time); updateCrowd(this.crowd, dt);
      if (this.screen === 'menu') {
        this.player.mesh.position.set(1.05, -0.05, 1.1); this.player.mesh.rotation.y = -0.32; this.player.mesh.scale.setScalar(1.25);
        this.rival.mesh.position.set(2.7, 0.0, -0.5); this.rival.mesh.rotation.y = -0.65; this.rival.mesh.scale.setScalar(1.12);
        updateAnimation(this.player, dt); updateAnimation(this.rival, dt);
        const narrow = Math.max(1, 1.3 / this.camera.aspect);
        this.camera.position.lerp(new THREE.Vector3(0.1, 2.1, 7.8 * narrow), 1 - Math.exp(-dt * 4)); this.camera.lookAt(0, 1.1, 0);
      } else if (!getHUDState().gameOver) {
        // Fixed 60Hz simulation: inputs, animation windows and physics share the same clock.
        this.accumulator += dt;
        while (this.accumulator >= 1 / 60) { this.updateFight(1 / 60); this.accumulator -= 1 / 60; if (getHUDState().gameOver) { this.accumulator = 0; break; } }
      }
      for (const e of this.effects) {
        e.age += dt; const attr = e.mesh.geometry.attributes.position;
        for (let i = 0; i < e.velocities.length; i++) { const v = e.velocities[i]; attr.setXYZ(i, v.x * e.age, v.y * e.age - 3 * e.age * e.age, v.z * e.age); }
        attr.needsUpdate = true; e.mesh.material.opacity = Math.max(0, 1 - e.age / 0.35);
      }
      this.effects = this.effects.filter(e => { if (e.age > 0.35) { this.disposeEffect(e); return false; } return true; });
      if (this.feedbackTimer > 0) { this.feedbackTimer -= dt; if (this.feedbackTimer <= 0) $('hit-feedback').textContent = ''; }
    }
    this.renderer.render(this.scene, this.camera);
  }
}
if (typeof window !== 'undefined') window.addEventListener('DOMContentLoaded', () => { const app = new GameApp(); window.gameApp = app; app.init(); });
export { GameApp };
