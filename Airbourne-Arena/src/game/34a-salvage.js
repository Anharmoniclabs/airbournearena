/* ===================== lower-city salvage free roam =====================
   The flight aircraft is the landing/boarding anchor. A separate instance of
   the production skinned pilot lives in the world scene; it is never replaced
   by a primitive stand-in while the GLB is loading. */
var groundAvatar=new THREE.Group(),groundMixer=null,groundActions={},groundAction='';
groundAvatar.visible=false;scene.add(groundAvatar);
characterLoader.load('assets/starter-coast-pilot-rig-v1.glb',function(gltf){
  groundAvatar.add(gltf.scene);prepareCharacter(gltf.scene,0x5d83b4);
  groundMixer=new THREE.AnimationMixer(gltf.scene);
  groundActions=characterActions(groundMixer,gltf.animations);
  groundAvatar.visible=salvage.on&&!!groundActions.Idle;
},undefined,function(err){console.error('Free-roam pilot GLB failed to load.',err);});
function setGroundAction(name){
  if(!groundActions[name]||groundAction===name)return;
  if(groundActions[groundAction])groundActions[groundAction].fadeOut(.16);
  groundActions[name].reset().fadeIn(.16).play();groundAction=name;
}
var salvage={on:false,landed:false,surface:null,x:0,z:0,yaw:0,face:0,moving:0,parts:0,health:0,armor:0,shield:0,banked:0};
var loot=[],lootGroup=new THREE.Group();scene.add(lootGroup);
(function buildSalvage(){
  var kindCol={parts:0xffb347,health:0x6fe3d0,armor:0x78a9ff};
  for(var i=0;i<(LOW?24:42);i++){
    var a=hash(i,81)*Math.PI*2,r=260+hash(i,93)*(CITY_REACH-340);
    var x=Math.cos(a)*r,z=Math.sin(a)*r;
    if(i%2)x=Math.round(x/670)*670+(hash(i,12)-.5)*70;
    else z=Math.round(z/670)*670+(hash(i,14)-.5)*70;
    var kind=i%5===0?'health':(i%5===1?'armor':'parts'),g=new THREE.Group();
    var box=new THREE.Mesh(new THREE.BoxGeometry(3.4,1.9,2.5),new THREE.MeshPhongMaterial({
      color:0x323b40,emissive:kindCol[kind],emissiveIntensity:.18,shininess:34}));
    box.position.y=1;g.add(box);
    var band=new THREE.Mesh(new THREE.BoxGeometry(3.55,.35,2.62),new THREE.MeshBasicMaterial({color:kindCol[kind]}));
    band.position.y=1.05;g.add(band);
    var lamp=new THREE.PointLight(kindCol[kind],.75,18);lamp.position.y=2.7;g.add(lamp);
    g.position.set(x,ground(x,z),z);lootGroup.add(g);loot.push({kind:kind,pos:g.position,mesh:g,taken:false});
  }
})();
function updateSalvageHud(msg){
  var stock=document.getElementById('salvageStock'),prompt=document.getElementById('salvagePrompt');
  if(stock)stock.innerHTML='<b>PARTS '+salvage.parts+'</b> · HEALTH '+Math.ceil(player.hp)+' · ARMOR '+Math.ceil(salvage.shield)+
    (salvage.banked?' · BASE STORES '+salvage.banked:'');
  if(prompt)prompt.textContent=msg||'WASD MOVE · SHIFT RUN · [G] BOARD AIRCRAFT';
}
function enterGroundMode(){
  if(salvage.on||!player.alive||st.phase==='hangar')return;
  if(!salvage.landed){banner('TOUCH DOWN FIRST · G EXITS AFTER LANDING',1.8);return;}
  salvage.on=true;st.phase='ground';document.body.classList.add('ground');
  salvage.x=player.pos.x;salvage.z=player.pos.z+7;salvage.yaw=Math.atan2(player.vel.x,-player.vel.z);
  player.pos.y=ground(player.pos.x,player.pos.z)+3.2;player.vel.set(0,0,0);player.speed=0;player.throttle=0;
  var sy=worldSurfaceAt(salvage.x,salvage.z);
  groundAvatar.visible=!!groundActions.Idle;groundAvatar.position.set(salvage.x,sy,salvage.z);
  setGroundAction('Idle');
  if(salvage.surface!=='skybase'&&worldFlow.activity==='groundwar')beginGroundEncounter();
  banner(salvage.surface==='skybase'?'OZONE BASE FLIGHT DECK':'LOWER CITY · SALVAGE RUN',2);updateSalvageHud();
}
function leaveGroundMode(){
  if(!salvage.on)return;
  if(Math.hypot(salvage.x-player.pos.x,salvage.z-player.pos.z)>13){banner('RETURN TO YOUR AIRCRAFT',1.4);return;}
  salvage.on=false;st.phase='flight';document.body.classList.remove('ground');groundAvatar.visible=false;
  if(salvage.surface==='skybase'){
    player.pos.y=worldSurfaceAt(player.pos.x,player.pos.z)+3.2;player.vel.set(0,0,0);player.speed=0;
    banner('AIRCRAFT BOARDED · W TO LAUNCH',1.5);
  }else{
    endGroundEncounter();
    salvage.landed=false;player.pos.y=ground(player.pos.x,player.pos.z)+9;
    player.vel.set(0,0,-28).applyQuaternion(player.quat);player.speed=28;
    banner('AIRCRAFT BOARDED · THROTTLE UP',1.5);
  }
}
function settleAircraft(floorHeight,surface){
  if(salvage.landed||salvage.on)return;
  var heading=Math.atan2(player.vel.x,-player.vel.z);
  if(player.speed<2){axes(player);heading=Math.atan2(_f.x,-_f.z);}
  salvage.landed=true;
  salvage.surface=surface||'ground';
  player.pos.y=(floorHeight===undefined?ground(player.pos.x,player.pos.z):floorHeight)+3.2;
  player.vel.set(0,0,0);player.speed=0;player.throttle=0;
  player.quat.setFromEuler(new THREE.Euler(0,heading,0));
  burner.lit=false;
  banner('LANDED · PRESS G TO EXIT',2.4);
  updateSalvageHud('[G] EXIT AIRCRAFT');
}
function groundControl(dt){
  var analogX=padIn.aimX||(stick.active?stick.dx:0),analogY=padIn.aimY||(stick.active?stick.dy:0);
  var turn=((keys.KeyD||keys.ArrowRight)?1:0)-((keys.KeyA||keys.ArrowLeft)?1:0)+analogX;
  salvage.yaw-=turn*dt*2.25;
  var fwd=((keys.KeyW||keys.ArrowUp)?1:0)-((keys.KeyS||keys.ArrowDown)?1:0)-analogY;
  var side=(keys.KeyE?1:0)-(keys.KeyQ?1:0),run=keys.ShiftLeft||keys.ShiftRight;
  var mx=-Math.sin(salvage.yaw)*fwd+Math.cos(salvage.yaw)*side;
  var mz=-Math.cos(salvage.yaw)*fwd-Math.sin(salvage.yaw)*side,ml=Math.hypot(mx,mz),sp=run?18:10;
  if(ml>.01){mx/=ml;mz/=ml;salvage.x+=mx*sp*dt;salvage.z+=mz*sp*dt;salvage.face=Math.atan2(-mx,-mz);}
  if(salvage.surface==='skybase'){
    var bp=worldFlow.base,limX=worldFlow.faction==='tempest'?265:335,limZ=worldFlow.faction==='tempest'?265:86;
    salvage.x=clamp(salvage.x,bp.x-limX,bp.x+limX);salvage.z=clamp(salvage.z,bp.z-limZ,bp.z+limZ);
  }else{
    salvage.x=clamp(salvage.x,-CITY_REACH,CITY_REACH);salvage.z=clamp(salvage.z,-CITY_REACH,CITY_REACH);
  }
  salvage.moving+=((ml>.01?1:0)-salvage.moving)*Math.min(1,dt*12);
  var surfaceY=worldSurfaceAt(salvage.x,salvage.z);
  groundAvatar.position.set(salvage.x,surfaceY,salvage.z);groundAvatar.rotation.y=salvage.face;
  setGroundAction(ml<.01?'Idle':(run?'Run':'Walk'));if(groundMixer)groundMixer.update(dt);
  if(salvage.surface==='skybase'){
    var shipD=Math.hypot(salvage.x-player.pos.x,salvage.z-player.pos.z);
    updateSalvageHud(shipD<13?'[G] BOARD AIRCRAFT':'[F] OPERATIONS · RETURN TO AIRCRAFT TO BOARD');
    var tp=document.getElementById('tPass');if(tp)tp.textContent=shipD<13?'BOARD':'OPS';
    var sf=new THREE.Vector3(-Math.sin(salvage.yaw),0,-Math.cos(salvage.yaw));
    camera.position.set(salvage.x,surfaceY+5.6,salvage.z).addScaledVector(sf,-10);
    camera.lookAt(salvage.x,surfaceY+2.3,salvage.z);camera.up.set(0,1,0);return;
  }
  var nearest=null,nearD=1e9;
  for(var i=0;i<loot.length;i++){
    var L=loot[i];if(L.taken)continue;L.mesh.rotation.y+=dt*.5;
    var d=Math.hypot(salvage.x-L.pos.x,salvage.z-L.pos.z);if(d<nearD){nearD=d;nearest=L;}
    if(d<4.5){L.taken=true;L.mesh.visible=false;salvage[L.kind]++;
      if(L.kind==='health')player.hp=Math.min(player.maxHp,player.hp+28);
      if(L.kind==='armor')salvage.shield=Math.min(100,salvage.shield+35);
      feed('<span style="color:#ffb347">SALVAGED '+L.kind.toUpperCase()+'</span>');tone(740,.12,.1,'triangle',980);}
  }
  var home=BASES[player.team],homeD=Math.hypot(salvage.x-home.x,salvage.z-home.z);
  if(homeD<245&&salvage.parts){salvage.banked+=salvage.parts;salvage.parts=0;feed('<span style="color:#6fe3d0">PARTS SECURED AT '+factionName(player.team)+' BASE</span>');}
  var back=Math.hypot(salvage.x-player.pos.x,salvage.z-player.pos.z);
  var msg=back<13?'[G] BOARD AIRCRAFT':(nearD<45?nearest.kind.toUpperCase()+' CACHE · '+Math.round(nearD)+' M':'SCAVENGE THE RUINED BLOCKS · RETURN PARTS TO BASE');
  updateSalvageHud(msg);
  var tp=document.getElementById('tPass');if(tp)tp.textContent=back<13?'BOARD':'USE';
  stepGroundCombat(dt);
  var cf=new THREE.Vector3(-Math.sin(salvage.yaw),0,-Math.cos(salvage.yaw));
  camera.position.set(salvage.x,surfaceY+5.6,salvage.z).addScaledVector(cf,-10);
  camera.lookAt(salvage.x,surfaceY+2.3,salvage.z);camera.up.set(0,1,0);
}
