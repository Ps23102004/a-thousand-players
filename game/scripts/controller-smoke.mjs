/** Virtual standard-mapped DualSense fixture. Does not claim a physical device test. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{})});
const page=await browser.newPage({viewport:{width:1440,height:900}}),checks=[],errors=[];
page.on('pageerror',e=>{errors.push(e.message);console.log('BROWSER ERROR',e.message)});page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
const check=(name,condition)=>{assert.ok(condition,name);checks.push(name);console.log('PASS',name)};
await page.addInitScript(()=>{
 window.virtualPad={index:2,id:'DualSense Wireless Controller (virtual test fixture)',mapping:'standard',connected:true,axes:[0,0,0,0],buttons:Array.from({length:18},()=>({pressed:false,value:0}))};
 Object.defineProperty(navigator,'getGamepads',{value:()=>window.virtualPad.connected?[null,null,window.virtualPad]:[]});
});
async function press(i){await page.evaluate(i=>{virtualPad.buttons[i]={pressed:true,value:1}},i);await page.waitForTimeout(70);await page.evaluate(i=>{virtualPad.buttons[i]={pressed:false,value:0}},i);await page.waitForTimeout(45)}
async function fixture(){await page.evaluate(()=>{
 gameApp.resetGame();gameApp.countdown=0;gameApp.rival.aiDisabled=true;gameApp.player.inputEnabled=true;gameApp.moveTrace=[];const old=gameApp.player.onAttackStart;gameApp.player.onAttackStart=name=>{old(name);gameApp.moveTrace.push(name)};
 for(const[f,x]of [[gameApp.player,-.48],[gameApp.rival,.48]]){f.rigidBody.setTranslation({x,y:.81,z:0},true);f.rigidBody.setLinvel({x:0,y:0,z:0},true)}
 virtualPad.axes=[0,0,0,0];virtualPad.buttons.forEach(b=>{b.pressed=false;b.value=0});
 });await page.waitForTimeout(90)}
async function confirm(){const code=await page.evaluate(()=>{const f=gameApp.player;return f.mount?.requiredKey||f.grapple?.requiredKey||f.ground?.requiredKey});assert.ok(code,'QTE must have a required key');await press({KeyJ:2,KeyK:3,KeyL:1}[code])}
try{
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');await page.waitForFunction(()=>window.gameApp?.running);await page.locator('#story-modal').click({position:{x:1300,y:500}});
 await page.waitForFunction(()=>document.body.dataset.input==='controller');
 check('virtual DualSense at index 2 connects and enables PS button hints',await page.locator('#controller-status').textContent().then(t=>t.includes('CONNECTED')));
 await page.evaluate(()=>document.querySelector('#btn-start-duel').focus());
 await page.evaluate(()=>virtualPad.axes[0]=.9);await page.waitForTimeout(90);await page.evaluate(()=>virtualPad.axes[0]=0);await page.waitForTimeout(50);
 check('left stick can change the selected fighter from the menu',await page.evaluate(()=>gameApp.selectedFighter==='rook'));
 await press(0);await page.waitForFunction(()=>gameApp.countdown<=0);check('cross starts a match without keyboard input',await page.evaluate(()=>gameApp.gameStarted));
 await fixture();for(let i=0;i<4;i++)await press(2);await page.waitForFunction(()=>gameApp.moveTrace.length>=4);
 check('square executes the complete four-punch chain',await page.evaluate(()=>gameApp.moveTrace.slice(0,4).join(',')==='JAB,CROSS,HOOK,UPPERCUT'));
 await fixture();for(let i=0;i<3;i++)await press(3);await page.waitForFunction(()=>gameApp.moveTrace.length>=3);
 check('triangle executes roundhouse, high kick and back kick',await page.evaluate(()=>gameApp.moveTrace.slice(0,3).join(',')==='ROUNDHOUSE_KICK,HIGH_KICK,BACK_KICK'));
 await fixture();await page.evaluate(()=>virtualPad.buttons[4]={pressed:true,value:1});await page.waitForTimeout(60);await press(2);check('L1 + square performs the low body jab',await page.evaluate(()=>gameApp.player.currentAnim==='BODY_JAB'));
 await fixture();await page.evaluate(()=>virtualPad.buttons[4]={pressed:true,value:1});await page.waitForTimeout(60);await press(3);check('L1 + triangle performs a sweep',await page.evaluate(()=>gameApp.player.currentAnim==='SWEEP'));
 await fixture();await page.evaluate(()=>virtualPad.buttons[6]={pressed:false,value:.8});await page.waitForTimeout(90);check('analog L2 holds a standing guard',await page.evaluate(()=>gameApp.player.isGuarding&&gameApp.player.state==='BLOCK'));
 await fixture();await press(1);check('circle performs a timed parry',await page.evaluate(()=>gameApp.player.currentAnim==='PARRY'));
 await fixture();await press(0);check('cross jumps with real physics',await page.evaluate(()=>gameApp.player.rigidBody.translation().y>1));
 await fixture();await page.evaluate(()=>virtualPad.axes=[.8,.8,0,0]);await page.waitForTimeout(240);await page.evaluate(()=>virtualPad.axes=[0,0,0,0]);
 check('left stick moves in lateral and depth directions',await page.evaluate(()=>gameApp.player.rigidBody.translation().x>-.3&&gameApp.player.rigidBody.translation().z>.3));
 await fixture();await page.keyboard.down('a');await page.evaluate(()=>virtualPad.axes[0]=-.9);await page.waitForTimeout(90);await page.evaluate(()=>virtualPad.axes[0]=0);await page.waitForTimeout(90);
 check('releasing controller movement preserves a physically held keyboard key',await page.evaluate(()=>gameApp.player.rigidBody.linvel().x< -2));await page.keyboard.up('a');
 await fixture();await press(5);check('R1 starts a clinch and displays PS action labels',await page.evaluate(()=>!!gameApp.player.grapple)&&await page.locator('#grapple-detail').textContent().then(t=>t.includes('□: punch')&&t.includes('R1: throw')));
 await press(2);check('clinch timing prompt shows a PlayStation face button',await page.locator('#grapple-key').textContent().then(t=>['□','△','○'].includes(t)));await confirm();await page.waitForFunction(()=>gameApp.rival.health<=92);check('matching the controller prompt lands a clinch punch',await page.evaluate(()=>gameApp.player.grapple.strikes===1));
 await page.waitForFunction(()=>gameApp.player.grapple?.phase==='CHOOSE');await press(5);await confirm();check('R1 chooses and confirms a physical throw',await page.evaluate(()=>gameApp.rival.health<=60&&!gameApp.player.grapple));
 await fixture();await page.evaluate(async()=>{const{startKnockdown}=await import('./src/ground.js');startKnockdown(gameApp.rival)});await page.waitForFunction(()=>gameApp.rival.ground?.phase==='DOWNED');await press(5);await press(3);await confirm();await page.waitForFunction(()=>gameApp.rival.health===90);
 check('R1 mounts and triangle confirms a ground body punch',await page.evaluate(()=>gameApp.player.mount?.strikes===1));
 await page.waitForFunction(()=>gameApp.player.mount?.phase==='CHOOSE');await press(5);check('R1 stands up and restores solid physics bodies',await page.evaluate(()=>!gameApp.player.mount&&!gameApp.player.collider.isSensor()));
 await fixture();await page.evaluate(async()=>{const{startKnockdown}=await import('./src/ground.js');startKnockdown(gameApp.player)});await page.waitForFunction(()=>gameApp.player.ground?.phase==='DOWNED');await confirm();await page.waitForFunction(()=>!gameApp.player.ground);check('controller face button completes the get-up prompt',await page.evaluate(()=>gameApp.player.state==='IDLE'));
 await fixture();await page.evaluate(()=>virtualPad.buttons[2]={pressed:true,value:1});await page.waitForTimeout(650);check('holding square does not auto-repeat attacks',await page.evaluate(()=>gameApp.moveTrace.length===1));await page.evaluate(()=>virtualPad.buttons[2]={pressed:false,value:0});await page.waitForTimeout(60);
 await press(9);const hp=await page.evaluate(()=>gameApp.player.health);await page.waitForTimeout(100);check('Options pauses gameplay',await page.evaluate(v=>gameApp.paused&&gameApp.player.health===v,hp));await press(9);check('Options resumes gameplay',await page.evaluate(()=>!gameApp.paused));
 await press(8);check('Create opens the complete PS5 guide and pauses',await page.evaluate(()=>gameApp.paused)&&await page.locator('.controller-guide').isVisible());
 await mkdir('output/screenshots',{recursive:true});await page.screenshot({path:'output/screenshots/controller-guide.png'});await press(1);check('circle closes the guide and resumes',await page.evaluate(()=>!gameApp.paused&&document.querySelector('#help-modal').classList.contains('hidden')));
 await fixture();await page.evaluate(()=>virtualPad.axes[0]=.9);await page.waitForTimeout(70);await page.evaluate(()=>virtualPad.connected=false);await page.waitForTimeout(100);check('disconnect automatically pauses and clears held input',await page.evaluate(()=>gameApp.paused)&&await page.locator('#pause-modal').innerText().then(t=>t.includes('disconnected')));
 await page.evaluate(()=>{virtualPad.connected=true;virtualPad.axes=[0,0,0,0]});await page.waitForTimeout(100);await press(0);check('reconnected controller resumes with cross',await page.evaluate(()=>!gameApp.paused));
 await press(11);check('R3 restarts with clean health and no lingering contest',await page.evaluate(()=>gameApp.countdown>0&&gameApp.player.health===100&&!gameApp.player.grapple&&!gameApp.player.mount));
 await page.setViewportSize({width:390,height:844});await press(8);check('controller guide fits portrait width',await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth));await page.screenshot({path:'output/screenshots/controller-guide-mobile.png'});
 check('no browser errors during virtual-controller scenarios',errors.length===0);
 await writeFile('output/controller-browser-results.json',JSON.stringify({device:'Virtual standard-mapped DualSense, index 2',physicalHardwareTested:false,checks,errors},null,2));console.log(`${checks.length} controller browser checks passed.`);
}finally{await browser.close()}
