/** Run with a server at GAME_URL (default localhost:5173) and installed Playwright.
 * PLAYWRIGHT_MODULE may point to an existing Playwright installation; no download is performed.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_EXECUTABLE} : {})});
const context=await browser.newContext({viewport:{width:1440,height:900}});
const page=await context.newPage();const errors=[];const checks=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.log('BROWSER ERROR',m.text())}});
const check=(name,condition)=>{assert.ok(condition,name);checks.push(name);console.log('PASS',name)};
try {
  await page.goto(process.env.GAME_URL || 'http://127.0.0.1:5173');
  await page.waitForFunction(()=>window.gameApp?.running);
  check('menu waits for player start',await page.evaluate(()=>!gameApp.gameStarted && gameApp.player.health===100));
  await page.waitForTimeout(800);
  check('menu does not advance match or AI',await page.evaluate(()=>gameApp.player.health===100 && gameApp.rival.health===100));
  await mkdir('output/screenshots',{recursive:true});
  await page.screenshot({path:'output/screenshots/menu-desktop.png'});
  await page.locator('[data-fighter="rook"]').click();
  check('character selection swaps both original fighters',await page.evaluate(()=>gameApp.player.profile==='rook' && gameApp.rival.profile==='kai'));
  await page.locator('#btn-how').click();check('help opens',await page.locator('#help-modal').isVisible());await page.locator('#btn-close-help').click();
  await page.locator('#btn-start-duel').click();await page.waitForFunction(()=>gameApp.countdown<=0);
  check('fight starts after countdown',await page.evaluate(()=>gameApp.gameStarted && gameApp.player.inputEnabled));
  // Isolate real keyboard hit detection from randomized CPU parries.
  await page.evaluate(()=>{
    gameApp.player.rigidBody.setTranslation({x:-.5,y:.81,z:0},true);
    gameApp.rival.rigidBody.setTranslation({x:.5,y:.81,z:0},true);
    gameApp.player.rigidBody.setLinvel({x:0,y:0,z:0},true);
    gameApp.rival.rigidBody.setLinvel({x:0,y:0,z:0},true);
    Object.assign(gameApp.player,{state:'IDLE',currentAnim:'IDLE',animTime:0,animLoop:true,isGuarding:false});
    Object.assign(gameApp.rival,{state:'GRABBED',grabbedBy:null,isGuarding:false});
  });
  await page.keyboard.press('j');await page.waitForFunction(()=>gameApp.rival.health<100);
  check('combat deals actual health damage',await page.evaluate(()=>gameApp.player.health<100 || gameApp.rival.health<100));
  await page.keyboard.press('Escape');
  const paused=await page.evaluate(()=>({x:gameApp.player.rigidBody.translation().x,y:gameApp.player.rigidBody.translation().y,hp:gameApp.player.health}));
  await page.waitForTimeout(300);
  check('pause freezes physics and damage',await page.evaluate(p=>gameApp.paused && gameApp.player.health===p.hp && Math.abs(gameApp.player.rigidBody.translation().x-p.x)<0.0001,paused));
  await page.screenshot({path:'output/screenshots/pause.png'});
  await page.locator('#btn-resume').click();
  await page.keyboard.press('r');await page.waitForFunction(()=>gameApp.countdown<=0);
  check('restart restores health and selected character',await page.evaluate(()=>gameApp.player.health===100 && gameApp.rival.health===100 && gameApp.player.profile==='rook'));
  await page.screenshot({path:'output/screenshots/fight-desktop.png'});
  // Exercise throw through real keyboard. Positioning and AI stubbing isolate it from random defense.
  await page.evaluate(()=>{
    gameApp.rival.rigidBody.setTranslation({x:.55,y:.81,z:0},true);
    gameApp.player.rigidBody.setTranslation({x:-.55,y:.81,z:0},true);
    gameApp.rival.aiDisabled=true;gameApp.rival.state='IDLE';gameApp.rival.currentAnim='IDLE';gameApp.rival.grabbedBy=null;
  });
  await page.keyboard.press('f');await page.waitForFunction(()=>gameApp.player.grapple?.phase==='CHOOSE');await page.keyboard.press('f');
  await page.waitForFunction(()=>/^[JKL]$/.test(document.querySelector('#grapple-key').textContent));
  await page.keyboard.press((await page.locator('#grapple-key').textContent()).toLowerCase());
  await page.waitForFunction(()=>gameApp.rival.health<=68);
  check('grab and throw launches rival and deals damage',await page.evaluate(()=>gameApp.rival.health<=68 && gameApp.rival.rigidBody.linvel().x>5));
  // End state boundary is deliberate test injection, not claimed as player-earned victory.
  await page.evaluate(()=>{gameApp.rival.health=0});await page.waitForFunction(()=>document.querySelector('#end-modal').classList.contains('hidden')===false);
  const hp=await page.evaluate(()=>gameApp.player.health);await page.waitForTimeout(250);
  check('knockout ends simulation and disables input',await page.evaluate(v=>gameApp.player.health===v && !gameApp.player.inputEnabled,hp));
  await page.screenshot({path:'output/screenshots/victory.png'});
  const count=await page.evaluate(()=>gameApp.world.bodies.len());
  for(let i=0;i<5;i++){await page.keyboard.press('r');await page.waitForTimeout(30)}
  check('repeated restart does not accumulate rigid bodies',await page.evaluate(n=>gameApp.world.bodies.len()<=n,count));
  await page.keyboard.press('Escape');await page.locator('#btn-menu').click();
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(250);
  check('mobile menu has no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth));
  check('mobile start button remains visible',await page.locator('#btn-start-duel').isVisible() && await page.locator('#btn-start-duel').evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight));
  await page.screenshot({path:'output/screenshots/menu-mobile.png'});
  await page.setViewportSize({width:1440,height:900});
  await page.waitForFunction(()=>Math.abs(gameApp.camera.position.z-7.8)<.08);
  await page.screenshot({path:'output/screenshots/menu-desktop.png'});
  await writeFile('output/browser-results.json',JSON.stringify({checks,errors},null,2));
  check('no browser console errors',errors.length===0);
  console.log(`${checks.length} browser checks passed.`);
} finally { await browser.close(); }
