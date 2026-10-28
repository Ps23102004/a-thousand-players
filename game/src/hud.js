import { controllerText } from './gamepad.js';
import { getGroundPrompt } from './ground.js';
import { getGrapplePrompt } from './grapple.js';
/** Match scoring, timer, feedback and lifecycle. */
export function formatGameTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60), s = Math.floor(totalSeconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}
export function calculateScore({ damageDealt = 0, maxCombo = 0, propsBroken = 0, timeSeconds = 0, isVictory = false }) {
  return damageDealt * 10 + maxCombo * 150 + propsBroken * 250 + (isVictory ? 1000 + Math.max(0, 1000 - Math.floor(timeSeconds * 10)) : 0);
}
export function createHUDState() {
  return {
    playerHealth: 100, rivalHealth: 100, playerPosture: 0, rivalPosture: 0, comboCount: 0, comboTimer: 0,
    maxCombo: 0, propsBroken: 0, damageDealt: 0, gameTime: 0, gameOver: false, victory: false,
    registerComboHit() { this.comboCount++; this.comboTimer = 2; this.maxCombo = Math.max(this.maxCombo, this.comboCount); },
    update(delta) { if (this.gameOver) return; this.gameTime += delta; if (this.comboTimer > 0) { this.comboTimer -= delta; if (this.comboTimer <= 0) this.comboCount = 0; } }
  };
}
let hudState = createHUDState();
export function getHUDState() { return hudState; }
export function resetHUDState() { hudState = createHUDState(); updateHUDDOM(); }
export function initHUD(onStartGame, onRestartGame) {
  if (typeof document === 'undefined') return;
  document.getElementById('btn-start-duel')?.addEventListener('click', onStartGame);
  document.getElementById('btn-restart')?.addEventListener('click', onRestartGame);
  window.addEventListener('keydown', e => {
    const app = window.gameApp;
    if (e.code === 'KeyR' && !e.repeat && app?.screen === 'fight') { e.preventDefault(); onRestartGame?.(); }
  });
}
export function updateHUD(player, rival, delta = 0.016) {
  if (hudState.gameOver) return;
  hudState.update(delta);
  if (player) { hudState.playerHealth = player.health; hudState.playerPosture = player.posture || 0; }
  if (rival) { hudState.rivalHealth = rival.health; hudState.damageDealt = Math.max(0, 100 - rival.health); hudState.rivalPosture = rival.posture || 0; }
  updateHUDDOM();
  if (rival?.health <= 0) triggerGameOver(true);
  else if (player?.health <= 0) triggerGameOver(false);
  else if (hudState.gameTime >= 99) triggerGameOver(hudState.playerHealth > hudState.rivalHealth, hudState.playerHealth === hudState.rivalHealth);
}
function updateHUDDOM() {
  if (typeof document === 'undefined') return;
  for (const [who, hp, posture] of [['player', hudState.playerHealth, hudState.playerPosture], ['rival', hudState.rivalHealth, hudState.rivalPosture]]) {
    const el = document.getElementById(`${who}-health-bar`);
    if (el) { el.style.width = `${Math.max(0, hp)}%`; el.parentElement?.setAttribute('aria-valuenow', Math.round(hp)); }
    const guard = document.getElementById(`${who}-posture-bar`); if (guard) guard.style.width = `${Math.max(0, 100 - posture)}%`;
    const state = document.getElementById(`${who}-state`); const fighter = window.gameApp?.[who];
    if (state && fighter) state.textContent = fighter.isGuarding ? 'GUARDING' : fighter.state.replaceAll('_', ' ');
  }
  const timer = document.getElementById('hud-timer'); if (timer) timer.textContent = String(Math.max(0, Math.ceil(99 - hudState.gameTime))).padStart(2, '0');
  document.getElementById('combo-hud')?.classList.toggle('active', hudState.comboCount >= 2);
  const combo = document.getElementById('combo-number'); if (combo) combo.textContent = hudState.comboCount;
  const score = document.getElementById('live-score'); if (score) score.textContent = String(calculateScore({ ...hudState, isVictory: false })).padStart(5, '0');
}
function triggerGameOver(isVictory, draw = false) {
  hudState.gameOver = true; hudState.victory = isVictory;
  if (typeof document === 'undefined') return;
  const title = document.getElementById('end-title');
  if (title) { title.textContent = draw ? 'DEAD HEAT.' : isVictory ? 'VICTORY.' : 'DEFEATED.'; title.style.color = isVictory ? 'var(--mint)' : 'var(--accent)'; }
  const score = calculateScore({ damageDealt: 100 - hudState.rivalHealth, maxCombo: hudState.maxCombo, propsBroken: hudState.propsBroken, timeSeconds: hudState.gameTime, isVictory });
  const summary = document.getElementById('end-summary');
  if (summary) summary.textContent = draw ? 'The lanterns witnessed an even match. Settle it in a rematch.' : isVictory ? 'You found your opening. The night market knows your name.' : 'Every fighter starts somewhere. Find the rhythm, then come back swinging.';
  const stats = document.getElementById('end-stats'); if (stats) stats.innerHTML = `<span><strong>${score.toLocaleString()}</strong>POINTS</span><span><strong>${hudState.maxCombo}</strong>BEST COMBO</span><span><strong>${formatGameTime(hudState.gameTime)}</strong>FIGHT TIME</span>`;
  document.getElementById('end-modal')?.classList.remove('hidden'); document.getElementById('btn-restart')?.focus();
}

export function updateGrappleHUD(player) {
  if(typeof document==='undefined')return;
  const root=document.getElementById('grapple-hud');if(!root)return;
  const prompt=getGroundPrompt(player)||getGrapplePrompt(player);root.classList.toggle('hidden',!prompt);if(!prompt)return;
  document.getElementById('grapple-title').textContent=prompt.title;
  const label=text=>controllerText(text,document.body.dataset.input==='controller');
  document.getElementById('grapple-detail').textContent=label(prompt.detail);
  document.getElementById('grapple-key').textContent=label(prompt.phase==='CONTEST'?prompt.key:prompt.phase==='STRIKE'?'✦':prompt.choices);
  document.getElementById('grapple-time').textContent=prompt.remaining.toFixed(1)+'s';
  document.getElementById('grapple-progress').style.width=(prompt.ratio*100)+'%';
  root.dataset.role=prompt.role;
  document.getElementById('grapple-key').setAttribute('aria-label',document.body.dataset.input==='controller'?'Required controller button '+label(prompt.key||prompt.choices):'Required timing key '+(prompt.key||prompt.choices));
}
