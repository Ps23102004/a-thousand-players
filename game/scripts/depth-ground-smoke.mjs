/** Isolated scenarios exercise real keyboard input plus deterministic floor/AI fixtures. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{})});
const page=await browser.newPage({viewport:{width:1440,height:900}}),checks=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log('PASS',name)};
async function fixture(){await page.evaluate(()=>{
 gameApp.resetGame();gameApp.countdown=0;gameApp.player.inputEnabled=true;gameApp.rival.aiDisabled=true;
 gameApp.moveTrace=[];const original=gameApp.player.onAttackStart;gameApp.player.onAttackStart=name=>{original(name);gameApp.moveTrace.push(name)};
 for(const [f,x]of [[gameApp.player,-.48],[gameApp.rival,.48]]){f.rigidBody.setTranslation({x,y:.81,z:0},true);f.rigidBody.setLinvel({x:0,y:0,z:0},true)}
})}
async function down(which){await page.evaluate(async side=>{const {startKnockdown}=await import('./src/ground.js');startKnockdown(gameApp[side],{rng:()=>.8})},which);await page.waitForFunction(side=>gameApp[side].ground?.phase==='DOWNED',which)}
async function key(){await page.waitForFunction(()=>/^[JKL]$/.test(document.querySelector('#grapple-key').textContent));return(await page.locator('#grapple-key').textContent()).toLowerCase()}
async function cpuMount(){await page.evaluate(async()=>{const {beginMount}=await import('./src/ground.js');beginMount(gameApp.rival,gameApp.player,{rng:()=>.1})})}
try{
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');await page.waitForFunction(()=>window.gameApp?.running);await page.locator('#btn-start-duel').click();await page.waitForFunction(()=>gameApp.countdown<=0);
 await fixture();await page.waitForTimeout(650);
 const camera=await page.evaluate(async()=>{const THREE=await import('three'),a=gameApp;const bottom=new THREE.Vector3(-.48,0,0).project(a.camera),top=new THREE.Vector3(-.48,1.95,0).project(a.camera);return {x:a.camera.position.x,z:a.camera.position.z,height:(bottom.y-top.y)*-.5}});
 check('closer angled camera makes a fighter occupy over 40% of desktop height',camera.x>.8 && camera.z<6 && camera.height>.40);
 await mkdir('output/screenshots',{recursive:true});await page.screenshot({path:'output/screenshots/depth-camera.png'});
 const z=await page.evaluate(()=>gameApp.player.rigidBody.translation().z);await page.keyboard.down('v');await page.waitForTimeout(300);await page.keyboard.up('v');
 check('V sidesteps through real depth and the mesh follows its body',await page.evaluate(old=>gameApp.player.rigidBody.translation().z>old+.4 && gameApp.player.mesh.position.z>old+.4,z));
 await page.keyboard.down('v');await page.waitForTimeout(1200);await page.keyboard.up('v');check('depth boundary prevents leaving the arena',await page.evaluate(()=>gameApp.player.rigidBody.translation().z<1.7));
 await fixture();for(let i=0;i<4;i++)await page.keyboard.press('j');await page.waitForFunction(()=>gameApp.moveTrace.length>=4);
 check('four quick J taps execute jab, cross, hook and uppercut in order',await page.evaluate(()=>gameApp.moveTrace.slice(0,4).join(',')==='JAB,CROSS,HOOK,UPPERCUT'));
 await fixture();for(let i=0;i<3;i++)await page.keyboard.press('k');
 await page.waitForFunction(()=>gameApp.player.currentAnim==='HIGH_KICK'&&gameApp.player.animTime>.25);await page.evaluate(()=>{gameApp.paused=true;gameApp.renderer.render(gameApp.scene,gameApp.camera)});await page.screenshot({path:'output/screenshots/high-kick.png'});await page.evaluate(()=>{gameApp.paused=false});
 await page.waitForFunction(()=>gameApp.player.currentAnim==='BACK_KICK'&&gameApp.player.animTime>.31);
 check('three K taps execute a high kick and a rotating back kick',await page.evaluate(()=>gameApp.moveTrace.slice(0,3).join(',')==='ROUNDHOUSE_KICK,HIGH_KICK,BACK_KICK'&&gameApp.player.joints.hips.rotation.y>2.4));
 await page.evaluate(()=>{gameApp.paused=true;gameApp.renderer.render(gameApp.scene,gameApp.camera)});await page.screenshot({path:'output/screenshots/back-kick.png'});await page.evaluate(()=>{gameApp.paused=false});
 await fixture();await page.keyboard.down('s');await page.keyboard.press('j');await page.waitForFunction(()=>gameApp.rival.health<100);await page.keyboard.up('s');
 check('S+J lowers the whole body and connects a body jab',await page.evaluate(()=>gameApp.player.currentAnim==='BODY_JAB'&&gameApp.player.joints.hips.position.y<.80&&gameApp.rival.health===91));
 await fixture();await down('rival');await page.screenshot({path:'output/screenshots/knockdown.png'});await page.keyboard.press('f');
 check('F mounts a downed rival and shows ground controls',await page.evaluate(()=>gameApp.player.mount?.top===gameApp.player)&&await page.locator('#grapple-title').textContent().then(t=>t==='GROUND CONTROL'));
 await page.keyboard.press('j');await page.keyboard.press(await key());await page.waitForFunction(()=>gameApp.rival.health===92);
 check('confirmed head punch damages once during a downward animation',await page.evaluate(()=>gameApp.player.mount?.strikes===1));await page.evaluate(()=>{gameApp.paused=true;gameApp.renderer.render(gameApp.scene,gameApp.camera)});await page.screenshot({path:'output/screenshots/ground-strike.png'});await page.evaluate(()=>{gameApp.paused=false});
 await page.waitForFunction(()=>gameApp.player.mount?.phase==='CHOOSE');await page.keyboard.press('k');await key();await page.keyboard.press('h');const remaining=await page.evaluate(()=>gameApp.player.mount.remaining);await page.waitForTimeout(200);
 check('control guide freezes the ground contest timer',await page.evaluate(v=>gameApp.paused&&gameApp.player.mount.remaining===v,remaining));await page.keyboard.press('h');await page.keyboard.press(await key());await page.waitForFunction(()=>gameApp.rival.health===82);
 check('K on top confirms a distinct body strike',await page.evaluate(()=>gameApp.player.mount?.strikes===2));
 await page.waitForFunction(()=>gameApp.player.mount?.phase==='CHOOSE');await page.keyboard.press('f');
 check('standing up restores solid colliders and normal gravity',await page.evaluate(()=>!gameApp.player.mount&&!gameApp.player.collider.isSensor()&&gameApp.player.rigidBody.gravityScale()===1));
 await fixture();await down('player');await page.keyboard.press(await key());await page.waitForFunction(()=>!gameApp.player.ground);
 check('shown get-up key completes a quick rise into guard',await page.evaluate(()=>gameApp.player.state==='IDLE'&&gameApp.player.recoveryInvulnerability>0));
 await fixture();await down('player');await cpuMount();await page.keyboard.press(await key());
 check('fast defensive timing reverses a CPU mount into player control',await page.evaluate(()=>gameApp.player.mount?.top===gameApp.player));
 await fixture();await down('player');await cpuMount();const escapeKey=await key();await page.waitForFunction(()=>gameApp.player.mount?.elapsed>.55);await page.keyboard.press(escapeKey);
 check('slower correct mount defense escapes without damage',await page.evaluate(()=>!gameApp.player.mount&&gameApp.player.health===100));
 await fixture();await down('player');await cpuMount();await page.waitForFunction(()=>gameApp.player.health<100);
 check('missing mount defense allows one CPU strike and another prompt',await page.evaluate(()=>gameApp.player.health===92&&gameApp.player.mount?.strikes===1));
 await page.keyboard.press('r');check('restart removes mount, floor state and sensor overrides',await page.evaluate(()=>!gameApp.player.mount&&!gameApp.player.ground&&!gameApp.rival.mount&&!gameApp.player.collider.isSensor()));
 const audio=await page.evaluate(async()=>{
  const {synthesizeSound}=await import('./src/audio.js'),result={};
  for(const type of ['punch','kick','body','slam','block','parry','whoosh','step','cheer']){
   const ctx=new OfflineAudioContext(2,48000,48000);synthesizeSound(ctx,ctx.destination,type,{pan:.3,volume:.7});const buffer=await ctx.startRendering(),data=buffer.getChannelData(0);let sum=0,peak=0,tail=0,last=0;
   for(let i=0;i<data.length;i++){if(!Number.isFinite(data[i]))throw Error('non-finite PCM');sum+=data[i]*data[i];peak=Math.max(peak,Math.abs(data[i]));if(Math.abs(data[i])>.003)last=i/48000;if(i>47000)tail=Math.max(tail,Math.abs(data[i]))}
   result[type]={rms:Math.sqrt(sum/data.length),peak,tail,last};
  }return result;
 });
 console.log('Audio levels',JSON.stringify(audio));
 check('nine audio cues render finite audible PCM below clipping',Object.values(audio).every(a=>a.rms>.001&&a.peak<1&&a.peak>.02));
 check('kick and slam have longer decays than a punch',audio.kick.last>audio.punch.last&&audio.slam.last>audio.kick.last);
 await page.setViewportSize({width:390,height:844});await fixture();await page.waitForTimeout(800);
 check('portrait framing and expanded controls have no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth));
 await page.keyboard.press('h');check('mobile help lists depth, chains and ground actions',await page.locator('#help-modal').innerText().then(t=>t.includes('Sidestep')&&t.includes('Mount')&&t.includes('spinning back kick')));await page.screenshot({path:'output/screenshots/controls-mobile.png'});
 check('no browser errors in depth, animation, ground or audio scenarios',errors.length===0);
 await writeFile('output/depth-ground-browser-results.json',JSON.stringify({checks,errors,camera,audio},null,2));console.log(`${checks.length} depth / ground / audio checks passed.`);
}finally{await browser.close()}
