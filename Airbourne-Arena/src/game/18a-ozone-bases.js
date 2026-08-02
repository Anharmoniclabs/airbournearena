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
var worldFlow={active:false,zone:'surface',faction:null,base:null,skycity:null,activity:'salvage',transition:null};
var worldFlowPrev=new THREE.Vector3(),worldFlowDir=new THREE.Vector3();
var SKYBASE_ASSETS={
  vanguard:['assets/vanguard-ozone-base-v3.glb','assets/vanguard-ozone-base-v3-lod1.glb'],
  tempest:['assets/tempest-ozone-base-v3.glb','assets/tempest-ozone-base-v3-lod1.glb'],
  inferno:['assets/inferno-ozone-base-v3.glb','assets/inferno-ozone-base-v3-lod1.glb']
};
function calibrateSkyBase(root,faction){
  /* The v3 bases carry their own tiled diffusion surfaces, so calibration
     only tunes light response and emissive energy — repainting base colors
     here would tint the authored textures into mud. */
  root.traverse(function(o){
    if(!o.isMesh||!o.material)return;o.material=o.material.clone();
    var name=(o.material.name||'').toLowerCase();
    if(name.indexOf('hull plating')>=0||name.indexOf('deck surface')>=0){
      /* no environment map in the scene: high metalness reads as soot */
      o.material.metalness=Math.min(o.material.metalness,.38);o.material.roughness=.6;
    }else if(name.indexOf('structural frame')>=0){o.material.metalness=.55;o.material.roughness=.4;}
    else if(name.indexOf('emissive guidance')>=0){o.material.emissiveIntensity=1.5;}
    else if(name.indexOf('lift beam')>=0){
      o.material.emissiveIntensity=2.2;o.material.transparent=true;o.material.opacity=.82;
      o.material.blending=THREE.AdditiveBlending;o.material.depthWrite=false;
    }else if(name.indexOf('recessed glazing')>=0){o.material.emissiveIntensity=1.1;}
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
  var skycity=typeof skycityDeckAt==='function'?skycityDeckAt(x,z):null;
  if(skycity)return skycity;
  for(var faction in SKYBASE_POS){
    var p=SKYBASE_POS[faction],dx=x-p.x,dz=z-p.z;
    var inside=faction==='tempest'?(dx*dx+dz*dz<300*300):(Math.abs(dx)<360&&Math.abs(dz)<105);
    if(inside)return {height:p.y+10,faction:faction,surface:'skybase'};
  }
  return null;
}
function worldSurfaceAt(x,z){
  /* A live CQC deck is the floor for everything standing on it — the pilot, a
     bouncing grenade, a smoke cloud. It is asked first because three of those
     decks hang beside the ozone bases, where the island terrain height under
     them is 15 km away and meaningless. */
  var cqc=arenaDeckAt(x,z);
  if(cqc!==null&&cqc!==undefined)return cqc;
  var deck=st.mode==='world'?skyDeckAt(x,z):null;
  return deck?deck.height:ground(x,z);
}
function isOperationsDeck(surface){return surface==='skybase'||surface==='skycity';}
function stepWorldFlow(dt){
  if(!worldFlow.active)return;
  worldFlow.zone=salvage.surface==='skycity'&&(salvage.landed||salvage.on)?'skycity':
    (player.pos.y>8000?'ozone':(player.pos.y>1800?'descent':'surface'));
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
  if(aircraftMayEnterCity(player)&&salvage.landed&&!salvage.on&&isOperationsDeck(salvage.surface)&&
     (keys.KeyW||keys.ShiftLeft||keys.ShiftRight||touchIn.thrUp||padIn.thrUp||padIn.boost)){
    if(salvage.surface==='skycity'){
      salvage.landed=false;salvage.surface=null;
      worldFlowDir.set(0,0,-1).applyQuaternion(player.quat).normalize();
      player.pos.y+=9;player.throttle=.58;player.vel.copy(worldFlowDir).multiplyScalar(55);player.vel.y=14;player.speed=player.vel.length();
      camLookReady=false;banner('LAUNCHED · SKYCITY AIRSPACE · FREE FLIGHT',2.2);return;
    }
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
  parkArena(true);salvage.on=false;salvage.landed=true;salvage.surface='skycity';document.body.classList.remove('ground','hangar');
  var faction=factionKey(),landing=openWorldSkycityForFaction(faction),base=landing.position;
  worldFlow.active=true;worldFlow.zone='skycity';worldFlow.faction=faction;worldFlow.base=base;worldFlow.skycity=landing.installation;
  worldFlow.activity='salvage';worldFlow.transition=null;
  player.maxHp=Number.isFinite(player.maxHp)?player.maxHp:100;
  player.alive=true;player.mesh.visible=true;player.hp=player.maxHp;
  /* The generated platform's broad marked helipad is centred at its origin.
     Its tower and deck furniture are deliberately staged outside this circle. */
  player.pos.copy(base).add(new THREE.Vector3(0,3.2,0));
  player.quat.setFromEuler(new THREE.Euler(0,landing.heading,0));player.vel.set(0,0,0);player.speed=0;player.throttle=0;
  st.camMode=0;camLookReady=false;el.brief.classList.add('gone');el.hud.classList.add('live');
  document.body.classList.add('playing');sortie.startedAt=performance.now();
  emit('match_start',{mode:'open_world'});banner(landing.name+' · LANDING ZONE · G EXIT · W LAUNCH',3);
  audioInit();audioResume();if(!IS_TOUCH)lock();
}
