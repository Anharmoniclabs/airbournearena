/* ===================== ozone-layer faction bases =====================
   Separate authored GLBs keep the three faction silhouettes independent.
   Each host is a THREE.LOD so the mobile tier can switch early without
   duplicating the bases as procedural primitives. */
var SKYBASE_ALT=15000;
var SKYBASE_POS={
  vanguard:new THREE.Vector3(-2400,SKYBASE_ALT,900),
  tempest:new THREE.Vector3(0,SKYBASE_ALT+1100,-1800),
  inferno:new THREE.Vector3(2400,SKYBASE_ALT,900)
};
var skyBaseHosts={};
var worldFlow={active:false,zone:'surface',faction:null,base:null,activity:'salvage',transition:null};
var worldFlowPrev=new THREE.Vector3(),worldFlowDir=new THREE.Vector3();
var SKYBASE_ASSETS={
  vanguard:['assets/vanguard-ozone-base-v1.glb','assets/vanguard-ozone-base-v1-lod1.glb'],
  tempest:['assets/tempest-ozone-base-v1.glb','assets/tempest-ozone-base-v1-lod1.glb'],
  inferno:['assets/inferno-ozone-base-v1.glb','assets/inferno-ozone-base-v1-lod1.glb']
};
function calibrateSkyBase(root,faction){
  var shell={vanguard:0x243b4a,tempest:0x174642,inferno:0x202126}[faction],
      accent={vanguard:0x159bd1,tempest:0x10a998,inferno:0xd64a1d}[faction];
  root.traverse(function(o){
    if(!o.isMesh||!o.material)return;o.material=o.material.clone();
    var name=(o.material.name||'').toLowerCase();
    if(name.indexOf('aerospace shell')>=0){o.material.color.setHex(shell);o.material.roughness=.48;}
    else if(name.indexOf('structural frame')>=0){o.material.color.setHex(0x080d12);o.material.roughness=.34;}
    else if(name.indexOf('emissive guidance')>=0){o.material.color.setHex(accent);o.material.emissive.setHex(accent);o.material.emissiveIntensity=1.35;}
    else if(name.indexOf('recessed glazing')>=0){o.material.color.setHex(0x071923);o.material.emissive.setHex(0x062330);o.material.emissiveIntensity=.5;}
    o.material.needsUpdate=true;
  });
}
Object.keys(SKYBASE_ASSETS).forEach(function(faction){
  var host=new THREE.LOD();host.name=faction+' ozone base';host.position.copy(SKYBASE_POS[faction]);
  host.userData.ready=0;scene.add(host);skyBaseHosts[faction]=host;
  function add(url,distance){
    makeGltfLoader().load(url,function(gltf){
      calibrateSkyBase(gltf.scene,faction);
      gltf.scene.traverse(function(o){if(o.isMesh){o.castShadow=!LOW;o.receiveShadow=true;}});
      host.addLevel(gltf.scene,distance);host.userData.ready++;
    },undefined,function(err){console.error(faction+' ozone base failed to load',url,err);});
  }
  add(SKYBASE_ASSETS[faction][0],0);
  add(SKYBASE_ASSETS[faction][1],LOW?700:1500);
  var beacon=new THREE.PointLight(faction==='inferno'?0xff5325:(faction==='tempest'?0x22ddc8:0x4fc3ff),
    LOW?1.2:2.4,1300);beacon.position.set(0,100,0);host.add(beacon);
});

function skyDeckAt(x,z){
  for(var faction in SKYBASE_POS){
    var p=SKYBASE_POS[faction],dx=x-p.x,dz=z-p.z;
    var inside=faction==='tempest'?(dx*dx+dz*dz<300*300):(Math.abs(dx)<360&&Math.abs(dz)<105);
    if(inside)return {height:p.y+10,faction:faction};
  }
  return null;
}
function worldSurfaceAt(x,z){
  var deck=st.mode==='world'?skyDeckAt(x,z):null;
  return deck?deck.height:ground(x,z);
}
function stepWorldFlow(dt){
  if(!worldFlow.active)return;
  worldFlow.zone=player.pos.y>8000?'ozone':(player.pos.y>1800?'descent':'surface');
  if(worldFlow.transition){
    var tr=worldFlow.transition;tr.t=Math.min(tr.duration,tr.t+dt);
    var u=tr.t/tr.duration,ease=u*u*(3-2*u);
    worldFlowPrev.copy(player.pos);player.pos.lerpVectors(tr.from,tr.to,ease);
    player.pos.y+=Math.sin(Math.PI*u)*520;
    worldFlowDir.copy(player.pos).sub(worldFlowPrev);
    if(worldFlowDir.lengthSq()>.01){
      worldFlowDir.normalize();player.speed=360+Math.sin(Math.PI*u)*150;
      player.vel.copy(worldFlowDir).multiplyScalar(player.speed);
      player.quat.setFromUnitVectors(new THREE.Vector3(0,0,-1),worldFlowDir);
    }
    player.throttle=.72;
    if(!tr.weatherCalled&&u>.28){tr.weatherCalled=true;banner('ATMOSPHERIC INSERTION · LOWER CITY AHEAD',2);}
    if(u>=1){
      worldFlow.transition=null;worldFlow.zone='surface';
      player.pos.copy(tr.to);player.vel.set(0,-12,-155);player.speed=155;player.throttle=.62;
      player.quat.setFromUnitVectors(new THREE.Vector3(0,0,-1),player.vel.clone().normalize());
      camLookReady=false;banner((worldFlow.activity==='groundwar'?'GROUND WAR':'SALVAGE')+' AO · FLIGHT CONTROL RETURNED',2.5);
    }
    return;
  }
  if(aircraftMayEnterCity(player)&&salvage.landed&&!salvage.on&&salvage.surface==='skybase'&&
     (keys.KeyW||keys.ShiftLeft||keys.ShiftRight||touchIn.thrUp||padIn.thrUp||padIn.boost)){
    salvage.landed=false;salvage.surface=null;
    var entry=cityEntryLane(worldFlow.faction),lane=entry.x,entryZ=entry.z;
    worldFlow.transition={t:0,duration:7,from:player.pos.clone(),
      to:new THREE.Vector3(lane,ground(lane,entryZ)+1050,entryZ),weatherCalled:false};
    player.pos.y+=9;player.throttle=.72;player.vel.set(0,-1,0);player.speed=1;
    banner('LAUNCHED · INSERTION ROUTE LOCKED',2.2);
  }
}

function startOpenWorld(){
  abandonMission();st.mode='world';st.phase='flight';st.started=true;st.over=false;
  if(typeof applyLoadout==='function')applyLoadout();
  parkArena(true);salvage.on=false;salvage.landed=true;salvage.surface='skybase';document.body.classList.remove('ground','hangar');
  var faction=factionKey(),base=SKYBASE_POS[faction]||SKYBASE_POS.vanguard;
  worldFlow.active=true;worldFlow.zone='ozone';worldFlow.faction=faction;worldFlow.base=base;
  worldFlow.activity='salvage';worldFlow.transition=null;
  player.maxHp=Number.isFinite(player.maxHp)?player.maxHp:100;
  player.alive=true;player.mesh.visible=true;player.hp=player.maxHp;
  /* Every island sits on the negative-X half of its deck. Spawn on the clear
     runway end so Inferno never starts inside its command tower. */
  player.pos.copy(base).add(new THREE.Vector3(250,13.2,0));
  player.quat.identity();player.vel.set(0,0,0);player.speed=0;player.throttle=0;
  st.camMode=0;camLookReady=false;el.brief.classList.add('gone');el.hud.classList.add('live');
  document.body.classList.add('playing');sortie.startedAt=performance.now();
  emit('match_start',{mode:'open_world'});banner(factionName(faction)+' OZONE BASE · G EXIT · W LAUNCH',3);
  audioInit();audioResume();if(!IS_TOUCH)lock();
}
