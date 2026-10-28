/** Gameplay scenarios use test fixtures to isolate outcomes from randomized AI defense. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{})});
const page=await browser.newPage({viewport:{width:1440,height:900}});const checks=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.log(m.text())}});
const check=(name,condition)=>{assert.ok(condition,name);checks.push(name);console.log('PASS',name)};
async function fixture(){
 await page.evaluate(()=>{
  gameApp.resetGame();gameApp.countdown=0;gameApp.player.inputEnabled=true;gameApp.rival.aiDisabled=true;
  gameApp.player.rigidBody.setTranslation({x:-.48,y:.81,z:0},true);gameApp.rival.rigidBody.setTranslation({x:.48,y:.81,z:0},true);
  for(const f of [gameApp.player,gameApp.rival]){f.rigidBody.setLinvel({x:0,y:0,z:0},true);Object.assign(f,{state:'IDLE',currentAnim:'IDLE',animTime:0,animLoop:true,isGuarding:false})}
 });
}
async function promptKey(){await page.waitForFunction(()=>/^[JKL]$/.test(document.querySelector('#grapple-key').textContent));return (await page.locator('#grapple-key').textContent()).toLowerCase()}
async function cpuGrab(){await page.evaluate(async()=>{const {beginGrapple}=await import('./src/grapple.js');beginGrapple(gameApp.rival,gameApp.player,{rng:()=>.1})});await page.locator('#grapple-hud').waitFor({state:'visible'})}
try{
 await page.goto(process.env.GAME_URL||'http://127.0.0.1:5173');await page.waitForFunction(()=>window.gameApp?.running);
 await page.locator('#btn-start-duel').click();await page.waitForFunction(()=>gameApp.countdown<=0);
 await fixture();await page.keyboard.press('k');
 check('K starts a visible roundhouse kick',await page.evaluate(()=>gameApp.player.currentAnim==='ROUNDHOUSE_KICK'));
 await page.waitForFunction(()=>gameApp.rival.health<100);check('roundhouse deals kick damage',await page.evaluate(()=>gameApp.rival.health<=76));
 await fixture();await page.keyboard.down('s');await page.keyboard.press('k');await page.keyboard.up('s');
 check('S+K starts a low sweep',await page.evaluate(()=>gameApp.player.currentAnim==='SWEEP'));
 await page.waitForFunction(()=>gameApp.rival.health<100);check('sweep knocks the rival down',await page.evaluate(()=>gameApp.rival.state==='KNOCKDOWN'));
 await fixture();await page.keyboard.press('f');await page.locator('#grapple-hud').waitFor({state:'visible'});
 check('F creates a timed clinch with contextual mapping',await page.locator('#grapple-detail').textContent().then(t=>t.includes('J: punch')&&t.includes('K: knee')));
 await page.keyboard.press('j');const key=await promptKey();
 await mkdir('output/screenshots',{recursive:true});await page.screenshot({path:'output/screenshots/clinch-prompt.png'});
 await page.keyboard.press(key);await page.waitForFunction(()=>gameApp.rival.health<=92);
 check('correct prompt lands the free-hand clinch punch',await page.evaluate(()=>gameApp.player.grapple?.strikes===1 && Math.abs(gameApp.player.joints.leftArm.rotation.x+1.2)<.01));
 await page.waitForFunction(()=>gameApp.player.grapple?.phase==='CHOOSE');await page.keyboard.press('f');await page.keyboard.press(await promptKey());
 await page.waitForFunction(()=>gameApp.rival.health<=60);check('confirmed clinch throw releases and launches the rival',await page.evaluate(()=>!gameApp.player.grapple && gameApp.rival.state==='BEING_THROWN'));
 await fixture();await page.keyboard.press('f');await page.keyboard.press('k');await page.keyboard.press(await promptKey());
 await page.waitForFunction(()=>gameApp.rival.health<=89);check('K in a clinch lands a knee strike',await page.evaluate(()=>gameApp.player.grapple?.strikes===1));
 await fixture();await page.keyboard.press('f');await page.keyboard.press('f');await promptKey();
 await page.keyboard.press('h');await page.locator('#help-modal').waitFor({state:'visible'});
 const left=await page.evaluate(()=>gameApp.player.grapple.remaining);await page.waitForTimeout(250);
 check('H opens the full control guide and freezes the QTE',await page.evaluate(v=>gameApp.paused && gameApp.player.grapple.remaining===v,left));
 await page.keyboard.press('h');check('closing the guide resumes the same clinch',await page.evaluate(()=>!gameApp.paused && !!gameApp.player.grapple));
 await fixture();await cpuGrab();await page.keyboard.press(await promptKey());
 await page.waitForFunction(()=>gameApp.rival.health<=68);check('fast correct defense counterthrows the CPU',await page.evaluate(()=>gameApp.player.health===100 && gameApp.rival.state==='BEING_THROWN'));
 await page.screenshot({path:'output/screenshots/clinch-reversal.png'});
 await fixture();await cpuGrab();const slowKey=await promptKey();await page.waitForFunction(()=>gameApp.player.grapple?.elapsed>.6);await page.keyboard.press(slowKey);
 check('slower correct defense escapes without taking damage',await page.evaluate(()=>!gameApp.player.grapple && gameApp.player.health===100 && gameApp.rival.health===100));
 await fixture();await cpuGrab();await page.waitForFunction(()=>gameApp.player.health<100);
 check('missing the escape prompt allows the CPU throw',await page.evaluate(()=>gameApp.player.health<=68 && !gameApp.player.grapple));
 await fixture();await page.keyboard.press('f');await page.keyboard.press('f');const wrong=(await promptKey())==='j'?'k':'j';await page.keyboard.press(wrong);
 check('wrong attack confirmation allows escape or reversal',await page.evaluate(()=>!gameApp.player.grapple));
 await fixture();await page.keyboard.press('f');await page.keyboard.press('r');
 check('restart clears the clinch and its HUD',await page.evaluate(()=>!gameApp.player.grapple && document.querySelector('#grapple-hud').classList.contains('hidden')));
 await fixture();await page.evaluate(()=>{gameApp.rival.aiDisabled=false});await page.waitForFunction(()=>gameApp.rival.aiMemory?.history.length>=4,{},{timeout:20000});
 const history=await page.evaluate(()=>gameApp.rival.aiMemory.history);
 check('live CPU uses kicks and more than one attack type',history.some(t=>t==='ROUNDHOUSE'||t==='SWEEP')&&new Set(history).size>=2);
 check('no browser console errors',errors.length===0);
 await writeFile('output/clinch-browser-results.json',JSON.stringify({checks,errors,aiAttackHistory:history},null,2));
 console.log(`${checks.length} clinch and kick browser checks passed.`);
}finally{await browser.close()}
