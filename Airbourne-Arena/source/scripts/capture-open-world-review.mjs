import { chromium, devices } from 'playwright';
import fs from 'node:fs/promises';

const executablePath=process.env.AIRBOURNE_CHROME||'/home/codespace/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const base=process.env.AIRBOURNE_URL||'http://127.0.0.1:4173/index.html?capture=1';
const out=process.env.AIRBOURNE_REVIEW_DIR||'/tmp/airbourne-open-world';
const headful=process.env.AIRBOURNE_HEADFUL==='1';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath,headless:!headful,args:headful?
  ['--no-sandbox','--disable-dev-shm-usage','--disable-gpu-sandbox']:
  ['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const failures=[];
async function canvasPng(page,path){
  const data=await page.evaluate(()=>window.__AIRBOURNE_CAPTURE__.renderer.domElement.toDataURL('image/png'));
  await fs.writeFile(path,Buffer.from(data.split(',')[1],'base64'));
}
async function pageFor(context,label){
  const page=await context.newPage();page.setDefaultTimeout(60000);
  page.on('pageerror',e=>failures.push(label+': '+e.message));
  page.on('console',m=>{if(m.type()==='error')failures.push(label+': '+m.text());});
  await page.goto(base,{waitUntil:'load'});await page.waitForFunction(()=>window.__AIRBOURNE_CAPTURE__);
  await page.waitForTimeout(2400);return page;
}
const desktop=await browser.newContext({viewport:{width:1280,height:720}});
const sky=await pageFor(desktop,'sky base');
await sky.evaluate(()=>{const c=window.__AIRBOURNE_CAPTURE__;c.startOpenWorld();document.querySelector('#boot')?.classList.add('gone');c.settleFlightCamera();});
await sky.waitForTimeout(2400);await canvasPng(sky,out+'/open-world-sky-base-desktop.png');await sky.close();
const ground=await pageFor(desktop,'ground war');
await ground.evaluate(()=>{const c=window.__AIRBOURNE_CAPTURE__;c.placeGroundReview('groundwar');document.querySelector('#boot')?.classList.add('gone');});
await ground.waitForFunction(()=>window.__AIRBOURNE_CAPTURE__.getGroundEnemies().some(e=>e.mesh.userData.runtimeReady));
await ground.waitForTimeout(1600);await canvasPng(ground,out+'/ground-war-desktop.png');
const diagnostic=await ground.evaluate(()=>{const c=window.__AIRBOURNE_CAPTURE__;return {phase:c.getPhase(),salvage:c.getSalvage(),ready:c.getGroundEnemies().filter(e=>e.mesh.userData.runtimeReady).length,triangles:c.renderer.info.render.triangles,calls:c.renderer.info.render.calls};});
await ground.close();await desktop.close();
const mobile=await browser.newContext({...devices['iPhone 13'],viewport:{width:780,height:360},screen:{width:780,height:360},deviceScaleFactor:1});
const phone=await pageFor(mobile,'ground war mobile');
await phone.evaluate(()=>{const c=window.__AIRBOURNE_CAPTURE__;c.placeGroundReview('groundwar');document.querySelector('#boot')?.classList.add('gone');});
await phone.waitForTimeout(2400);await canvasPng(phone,out+'/ground-war-mobile.png');await phone.close();await mobile.close();
await browser.close();
await fs.writeFile(out+'/runtime-report.json',JSON.stringify({diagnostic,failures},null,2)+'\n');
if(failures.length)throw new Error(failures.join('\n'));
console.log(JSON.stringify(diagnostic));
