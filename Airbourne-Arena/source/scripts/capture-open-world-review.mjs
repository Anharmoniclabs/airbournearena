import { chromium, devices } from 'playwright';
import fs from 'node:fs/promises';

const executablePath=process.env.AIRBOURNE_CHROME||'/home/codespace/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const base=process.env.AIRBOURNE_URL||'http://127.0.0.1:4173/index.html?capture=1';
const out=process.env.AIRBOURNE_REVIEW_DIR||'/tmp/airbourne-open-world';
const headful=process.env.AIRBOURNE_HEADFUL==='1';
const diagnosticOnly=process.env.AIRBOURNE_DIAGNOSTIC_ONLY==='1';
const captureStage=process.env.AIRBOURNE_CAPTURE_STAGE||'all';
const reviewLow=process.env.AIRBOURNE_REVIEW_LOW==='1';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath,headless:!headful,args:headful?
  ['--no-sandbox','--disable-dev-shm-usage','--disable-gpu-sandbox']:
  ['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const failures=[];
async function canvasPng(page,path){
  // Render and read in one browser task. WebGL may clear its back buffer after
  // presenting, so a later toDataURL call can produce a false all-black frame.
  const data=await page.evaluate(()=>{
    const c=window.__AIRBOURNE_CAPTURE__;
    c.renderer.setPixelRatio(.25);
    c.renderer.setSize(innerWidth,innerHeight,false);
    c.renderer.shadowMap.enabled=false;
    c.renderer.render(c.scene,c.camera);
    return c.renderer.domElement.toDataURL('image/png');
  });
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
if(reviewLow)await desktop.addInitScript(()=>localStorage.setItem('airbourne:settings',JSON.stringify({sens:180,invert:false,pad:true,vol:70,engine:true,hud:100,diff:1,cb:false,motion:true,coach:true,gfx:0})));
if(captureStage!=='ground'){
  const sky=await pageFor(desktop,'sky base');
  await sky.evaluate(()=>{const c=window.__AIRBOURNE_CAPTURE__;c.startOpenWorld();document.querySelector('#boot')?.classList.add('gone');c.settleFlightCamera();});
  if(diagnosticOnly){
    await sky.waitForFunction(()=>window.__AIRBOURNE_CAPTURE__.getAuthoredDistrictReady()>=3);
    const diagnostic=await sky.evaluate(()=>{const c=window.__AIRBOURNE_CAPTURE__;return {districtsReady:c.getAuthoredDistrictReady(),districts:c.getWorldDistricts().map(d=>d.name),skyBases:Object.keys(c.getSkyBases()),phase:c.getPhase(),triangles:c.renderer.info.render.triangles,calls:c.renderer.info.render.calls};});
    console.log(JSON.stringify(diagnostic));await sky.close();await desktop.close();await browser.close();process.exit(failures.length?1:0);
  }
  await sky.waitForTimeout(2400);await canvasPng(sky,out+'/open-world-sky-base-desktop.png');await sky.close();
  if(captureStage==='sky'){
    await desktop.close();await browser.close();
    console.log(JSON.stringify({stage:'sky',failures}));process.exit(failures.length?1:0);
  }
}
const ground=await pageFor(desktop,'ground war');
await ground.evaluate(()=>{const c=window.__AIRBOURNE_CAPTURE__;c.placeGroundReview('groundwar');document.querySelector('#boot')?.classList.add('gone');});
await ground.waitForFunction(()=>window.__AIRBOURNE_CAPTURE__.getGroundEnemies().some(e=>e.mesh.userData.runtimeReady));
const diagnostic=await ground.evaluate(()=>{const c=window.__AIRBOURNE_CAPTURE__,dir=new THREE.Vector3();c.camera.getWorldDirection(dir);const groups=c.scene.children.map(root=>{let meshes=0,triangles=0;root.traverse(o=>{if(!o.visible||!o.isMesh||!o.geometry)return;meshes++;const count=o.geometry.index?o.geometry.index.count:o.geometry.attributes.position?.count||0;triangles+=count/3*(o.isInstancedMesh?o.count:1);});return {name:root.name||root.type,meshes,triangles:Math.round(triangles)};}).filter(g=>g.meshes).sort((a,b)=>b.triangles-a.triangles).slice(0,12);return {phase:c.getPhase(),salvage:c.getSalvage(),camera:{position:c.camera.position.toArray(),direction:dir.toArray(),near:c.camera.near,far:c.camera.far},districtsReady:c.getAuthoredDistrictReady(),districtVisible:c.scene.getObjectByName('open world districts')?.visible,ready:c.getGroundEnemies().filter(e=>e.mesh.userData.runtimeReady).length,triangles:c.renderer.info.render.triangles,calls:c.renderer.info.render.calls,groups};});
if(diagnosticOnly){
  console.log(JSON.stringify(diagnostic));await ground.close();await desktop.close();await browser.close();process.exit(failures.length?1:0);
}
await ground.waitForTimeout(1600);await canvasPng(ground,out+'/ground-war-desktop.png');
await ground.close();await desktop.close();
if(captureStage==='ground'){
  await browser.close();await fs.writeFile(out+'/runtime-report.json',JSON.stringify({diagnostic,failures},null,2)+'\n');
  console.log(JSON.stringify(diagnostic));process.exit(failures.length?1:0);
}
const mobile=await browser.newContext({...devices['iPhone 13'],viewport:{width:780,height:360},screen:{width:780,height:360},deviceScaleFactor:1});
const phone=await pageFor(mobile,'ground war mobile');
await phone.evaluate(()=>{const c=window.__AIRBOURNE_CAPTURE__;c.placeGroundReview('groundwar');document.querySelector('#boot')?.classList.add('gone');});
await phone.waitForTimeout(2400);await canvasPng(phone,out+'/ground-war-mobile.png');await phone.close();await mobile.close();
await browser.close();
await fs.writeFile(out+'/runtime-report.json',JSON.stringify({diagnostic,failures},null,2)+'\n');
if(failures.length)throw new Error(failures.join('\n'));
console.log(JSON.stringify(diagnostic));
