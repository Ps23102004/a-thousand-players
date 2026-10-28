import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{})});
const page=await browser.newPage({viewport:{width:1366,height:768}});const errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
try{
 await page.goto('http://127.0.0.1:5173/dist/');await page.waitForFunction(()=>window.gameApp?.running);
 assert.equal(await page.locator('#btn-start-duel').isEnabled(),true);console.log('PASS built game loads under a project subdirectory');
 await page.locator('#btn-start-duel').click();await page.waitForFunction(()=>gameApp.countdown<=0);assert.equal(await page.locator('#hud-overlay').isVisible(),true);console.log('PASS built game starts a playable match');
 await page.goto('http://127.0.0.1:5173/CSCI310_Project2_Slides.html');
 assert.equal(await page.locator('section').count(),8);await page.screenshot({path:'output/screenshots/presentation.png'});
 await page.keyboard.press('n');assert.equal(await page.locator('section.active .notes').isVisible(),true);
 await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#counter').textContent(),'02 / 08');
 console.log('PASS 8-slide presentation, speaker notes and keyboard navigation');
 assert.deepEqual(errors,[]);console.log('PASS delivery pages have no browser errors');
}finally{await browser.close()}
