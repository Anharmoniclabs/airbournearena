#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire(import.meta.url);
const THREE=require('three');
const flightPath=path.resolve(here,'../../src/game/21-flight-model.js');
const source=fs.readFileSync(flightPath,'utf8').split('/* ===================== turn governor')[0];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const context={THREE,windVec:new THREE.Vector3(),cfg:{},clamp,
  smooth:(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);}};
vm.createContext(context);
vm.runInContext(source,context,{filename:flightPath});
const mesh=new THREE.Object3D();
const fighter={mesh,quat:mesh.quaternion,pos:new THREE.Vector3(0,800,0),
  vel:new THREE.Vector3(0,0,-135),alpha:0,carrying:false,dmgEng:0,dmgAil:0,
  trimAgile:1,trimThrust:1,abRamp:0};
const dt=1/60,samples=[];
function input(t){
  if(t<2)return {pitch:0,roll:0,yaw:0,throttle:0.75,burner:false};
  if(t<5)return {pitch:0.38,roll:-0.42,yaw:0.08,throttle:1,burner:false};
  if(t<8)return {pitch:-0.16,roll:0.25,yaw:-0.04,throttle:1,burner:true};
  return {pitch:0.05,roll:0,yaw:0,throttle:0.62,burner:false};
}
for(let frame=0;frame<600;frame++){
  context.stepFlight(fighter,input(frame*dt),dt);
  if((frame+1)%60===0)samples.push({
    t:(frame+1)/60,
    position:fighter.pos.toArray().map(x=>+x.toFixed(6)),
    velocity:fighter.vel.toArray().map(x=>+x.toFixed(6)),
    alpha:+fighter.alpha.toFixed(8),
    speed:+fighter.speed.toFixed(6),
    gLoad:+fighter.gLoad.toFixed(8)
  });
}
const result={schemaVersion:1,source:'src/game/21-flight-model.js',
  fixedDeltaTime:dt,
  initial:{position:[0,800,0],velocity:[0,0,-135]},samples};
if(process.argv.includes('--check')){
  const golden=JSON.parse(fs.readFileSync(path.resolve(here,'../../../docs/data/flight-golden.json')));
  if(JSON.stringify(golden)!==JSON.stringify(result))throw new Error('Flight golden values changed');
  console.log('Flight golden values match');
}else{
  const destination=path.resolve(here,'../../../docs/data/flight-golden.json');
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  fs.writeFileSync(destination,JSON.stringify(result,null,2)+'\n');
  console.log(`Wrote ${path.relative(process.cwd(),destination)}`);
}
