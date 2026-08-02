/* ===================== arena small arms =====================
   Five weapons and three grenades for everything fought on foot: the lower-city
   ground war and the 4v4 arena decks both draw from this one arsenal, so a
   balance change lands in both places at once.

   The rig is deliberately not parented to the pilot's hand bone. Ground mode is
   third-person and aim lives on salvage.yaw/lookPitch, which the walk cycle
   knows nothing about — a hand-mounted weapon would point wherever the last
   footstep left the arm rather than where the player is looking. So the rig is
   its own node driven straight off the aim angles, and the shot direction is
   read from the same transform the model is drawn with. What you see pointed at
   a target is what the hitscan uses.

   Every action here is edge-triggered off the shared `keys` map rather than its
   own listener: 31-input.js already returns early for every key once
   salvage.on, so polling keeps the ground controls in one place. */
var ARENA_ARMS=[
  {id:'pistol',name:'CERAMIC SIDEARM',asset:'assets/weapon-pistol-v1.glb',
   damage:26,rpm:340,mag:14,reserve:84,reload:1.05,spread:.010,range:95,auto:false,
   grip:{x:.30,y:1.30,z:-.16,scale:1}},
  {id:'smg',name:'GRAPHITE SMG',asset:'assets/weapon-smg-v1.glb',
   damage:16,rpm:820,mag:32,reserve:192,reload:1.5,spread:.030,range:70,auto:true,
   grip:{x:.30,y:1.28,z:-.24,scale:1}},
  {id:'assault',name:'MODULAR CARBINE',asset:'assets/weapon-assault-v1.glb',
   damage:25,rpm:620,mag:30,reserve:180,reload:1.8,spread:.017,range:135,auto:true,
   grip:{x:.28,y:1.27,z:-.30,scale:1}},
  {id:'sniper',name:'ANTI-MATERIAL RIFLE',asset:'assets/weapon-sniper-v1.glb',
   damage:98,rpm:48,mag:5,reserve:30,reload:2.6,spread:.0015,range:420,auto:false,zoom:34,
   grip:{x:.27,y:1.26,z:-.38,scale:1}},
  {id:'rocket',name:'SHOULDER LAUNCHER',asset:'assets/weapon-rocket-v1.glb',
   damage:40,rpm:40,mag:1,reserve:8,reload:2.9,spread:.004,range:320,auto:false,
   splash:{radius:11,damage:135},grip:{x:.30,y:1.36,z:-.30,scale:1}}
];
var ARENA_NADES=[
  {id:'frag',name:'FRAG',asset:'assets/weapon-grenade-frag-v1.glb',fuse:2.1,
   splash:{radius:11,damage:115},colour:0xff7a3c},
  {id:'flash',name:'FLASH',asset:'assets/weapon-grenade-flash-v1.glb',fuse:1.5,
   splash:{radius:15,damage:0},stun:3.2,colour:0xfff2c0},
  {id:'smoke',name:'SMOKE',asset:'assets/weapon-grenade-smoke-v1.glb',fuse:1.4,
   splash:{radius:14,damage:0},smoke:9,colour:0xbfd6e2}
];
var arsenal={slot:2,mag:[],reserve:[],reload:0,cool:0,nade:0,pouch:[],
             ads:false,swap:0,ready:false};
(function armSupplies(){
  for(var i=0;i<ARENA_ARMS.length;i++){arsenal.mag[i]=ARENA_ARMS[i].mag;arsenal.reserve[i]=ARENA_ARMS[i].reserve;}
  for(var n=0;n<ARENA_NADES.length;n++)arsenal.pouch[n]=2;
})();

/* Driven off the aim angles every frame; see the note at the top of the file
   for why this is not on the hand bone. */
var armsRig=new THREE.Group();armsRig.name='arena arms';scene.add(armsRig);
var armsPivot=new THREE.Group();armsRig.add(armsPivot);
var armsModels=[],armsFlash=null;
(function loadArms(){
  ARENA_ARMS.forEach(function(arm,i){
    afterBoot(function(){loadGeneratedArt(arm.asset,function(model){
      model.position.set(arm.grip.x,arm.grip.y,arm.grip.z);
      model.scale.setScalar(arm.grip.scale);
      model.visible=(i===arsenal.slot);
      armsPivot.add(model);armsModels[i]=model;arsenal.ready=true;
    });});
  });
  var flash=new THREE.Mesh(new THREE.SphereGeometry(.14,7,6),
    new THREE.MeshBasicMaterial({color:0xffd9a0,transparent:true,opacity:0,
      blending:THREE.AdditiveBlending,depthWrite:false}));
  flash.visible=false;armsPivot.add(flash);armsFlash=flash;
})();
function currentArm(){return ARENA_ARMS[arsenal.slot];}
function equipArm(i){
  i=clamp(i|0,0,ARENA_ARMS.length-1);
  if(i===arsenal.slot||arsenal.swap>0)return;
  arsenal.slot=i;arsenal.reload=0;arsenal.swap=.34;arsenal.ads=false;
  for(var m=0;m<armsModels.length;m++)if(armsModels[m])armsModels[m].visible=(m===i);
  tone(240,.05,.05,'square',300);
  feed('<span style="color:#9fd0ff">'+ARENA_ARMS[i].name+'</span>');
}
function beginReload(){
  var arm=currentArm(),i=arsenal.slot;
  if(arsenal.reload>0||arsenal.mag[i]>=arm.mag||arsenal.reserve[i]<=0)return;
  arsenal.reload=arm.reload;tone(120,.08,.05,'square',180);
}
function finishReload(){
  var arm=currentArm(),i=arsenal.slot,
      want=Math.min(arm.mag-arsenal.mag[i],arsenal.reserve[i]);
  arsenal.mag[i]+=want;arsenal.reserve[i]-=want;
  tone(320,.06,.05,'triangle',420);
}

/* ---------- shot presentation ----------
   Pooled: a full-auto SMG puts twelve tracers a second into the world and this
   runs on phones. */
var tracerPool=[],tracerNext=0;
(function buildTracers(){
  var geo=new THREE.BoxGeometry(.045,.045,1),
      mat=new THREE.MeshBasicMaterial({color:0xffe2a8,transparent:true,opacity:.9,
        blending:THREE.AdditiveBlending,depthWrite:false});
  for(var i=0;i<(LOW?10:20);i++){
    var t=new THREE.Mesh(geo,mat.clone());t.visible=false;t.userData.life=0;
    scene.add(t);tracerPool.push(t);
  }
})();
function spawnTracer(from,dir,length){
  var t=tracerPool[tracerNext=(tracerNext+1)%tracerPool.length];
  t.position.copy(from).addScaledVector(dir,length*.5);
  t.quaternion.setFromUnitVectors(_armsZ,dir);
  t.scale.set(1,1,Math.max(.5,length));
  t.material.opacity=.9;t.visible=true;t.userData.life=.07;
}
var _armsZ=new THREE.Vector3(0,0,1),_armsDir=new THREE.Vector3(),
    _armsMuzzle=new THREE.Vector3(),_armsQuat=new THREE.Quaternion(),
    _armsTargets=[];

/* ---------- targets ----------
   The ground war's sentries and the 4v4 deck's bots are the same shape to this
   file — {x,z,hp,alive,mesh,onKill} — so one hitscan serves both loops. */
function arenaCombatTargets(hostileOnly){
  _armsTargets.length=0;
  if(groundCombat.active){
    for(var i=0;i<groundCombat.enemies.length;i++){
      var e=groundCombat.enemies[i];if(e.alive)_armsTargets.push(e);
    }
  }
  if(typeof arenaMatch!=='undefined'&&arenaMatch&&arenaMatch.active){
    for(var b=0;b<arenaMatch.bots.length;b++){
      var bot=arenaMatch.bots[b];
      if(bot.alive&&(!hostileOnly||bot.team!=='blue'))_armsTargets.push(bot);
    }
  }
  return _armsTargets;
}
function arenaHitTarget(t,damage){
  if(!t.alive)return false;
  t.hp-=damage;st.hitmark=.12;
  if(t.hp>0)return false;
  t.alive=false;if(t.mesh)t.mesh.visible=false;
  if(t.onKill)t.onKill(t);
  return true;
}
function arenaSplash(point,radius,damage){
  if(damage>0){
    var targets=arenaCombatTargets(true);
    for(var i=targets.length-1;i>=0;i--){
      var t=targets[i],d=Math.hypot(t.x-point.x,t.z-point.z);
      if(d<radius)arenaHitTarget(t,damage*(1-d/radius*.6));
    }
    var self=Math.hypot(salvage.x-point.x,salvage.z-point.z);
    /* Own ordnance hurts. Without this the launcher is a point-blank weapon
       with no cost, which is the whole reason it has a minimum range. */
    if(self<radius)damageGroundPlayer(damage*(1-self/radius)*.5);
  }
  boom(point,radius*3);
}
/* Smoke is the one effect the aircraft fx pool cannot serve: boom() is an
   additive orange flash on a 0.85 s life, and a screen a grenade is meant to
   deny needs a dull cloud that outlives it. Same sprite texture, read as an
   alpha shape instead of as light. */
var smokePool=[],smokeLive=[];
function arenaSmoke(x,y,z,life){
  var s=smokePool.pop();
  if(!s){
    s=new THREE.Sprite(new THREE.SpriteMaterial({map:explosionVfxSkin,transparent:true,
      depthWrite:false,fog:false,color:0x9fb0bc}));
    scene.add(s);
  }
  s.visible=true;s.material.opacity=.62;s.position.set(x,y,z);s.scale.set(9,9,1);
  smokeLive.push({s:s,t:0,life:life});
}
function stepArenaSmoke(dt){
  for(var i=smokeLive.length-1;i>=0;i--){
    var p=smokeLive[i];p.t+=dt;
    var k=p.t/p.life,sz=9+k*16;
    p.s.scale.set(sz,sz,1);p.s.position.y+=dt*.55;
    p.s.material.opacity=.62*Math.max(0,1-k*k);
    if(k>=1){p.s.visible=false;smokePool.push(p.s);smokeLive.splice(i,1);}
  }
}
/* ---------- firing ---------- */
function armsMuzzleTransform(){
  armsPivot.getWorldQuaternion(_armsQuat);
  _armsDir.set(0,0,-1).applyQuaternion(_armsQuat);
  armsPivot.getWorldPosition(_armsMuzzle);
  _armsMuzzle.addScaledVector(_armsDir,.55);
  return _armsDir;
}
function fireArm(){
  var arm=currentArm(),i=arsenal.slot;
  if(arsenal.cool>0||arsenal.reload>0||arsenal.swap>0)return;
  if(arsenal.mag[i]<=0){beginReload();return;}
  arsenal.mag[i]--;arsenal.cool=60/arm.rpm;
  var dir=armsMuzzleTransform(),spread=arm.spread*(arsenal.ads?.35:1);
  dir.x+=(hash(i,arsenal.mag[i])-.5)*spread*2;
  dir.y+=(hash(arsenal.mag[i],i+7)-.5)*spread*2;
  dir.normalize();
  armsFlash.visible=true;armsFlash.material.opacity=.85;
  shake=Math.max(shake,arm.splash?.3:.08);
  tone(arm.splash?90:(arm.id==='sniper'?140:190),arm.splash?.14:.05,.07,'sawtooth',
       arm.splash?55:110);

  if(arm.splash){launchRocket(_armsMuzzle,dir,arm);return;}

  /* Hitscan against target cylinders. Ground combat is fought on decks and
     streets at under 400 m, so a closest-approach test against a radius beats
     raycasting meshes and costs nothing per frame. */
  var targets=arenaCombatTargets(true),best=null,bestD=arm.range;
  for(var t=0;t<targets.length;t++){
    var e=targets[t],dx=e.x-_armsMuzzle.x,dz=e.z-_armsMuzzle.z,
        along=dx*dir.x+dz*dir.z;
    if(along<=0||along>bestD)continue;
    var offX=dx-dir.x*along,offZ=dz-dir.z*along,
        offY=(e.y!==undefined?e.y+1.1:_armsMuzzle.y)-(_armsMuzzle.y+dir.y*along);
    if(Math.hypot(offX,offZ)<(e.radius||1.5)&&Math.abs(offY)<(e.height||2.2)){best=e;bestD=along;}
  }
  spawnTracer(_armsMuzzle,dir,best?bestD:arm.range);
  if(!best)return;
  if(arenaHitTarget(best,arm.damage))tone(520,.09,.06,'triangle',300);
}

/* ---------- rockets and grenades ----------
   One pool covers both: a rocket is a thrown object with no gravity and a very
   short fuse, so splitting them would be two copies of the same integrator. */
var arenaOrdnance=[];
function ordnanceSlot(){
  for(var i=0;i<arenaOrdnance.length;i++)if(!arenaOrdnance[i].live)return arenaOrdnance[i];
  var o={live:false,mesh:null,vel:new THREE.Vector3(),pos:new THREE.Vector3(),
         fuse:0,gravity:0,splash:null,spin:0,kind:null};
  arenaOrdnance.push(o);return o;
}
function launchRocket(from,dir,arm){
  var o=ordnanceSlot();
  o.live=true;o.kind='rocket';o.pos.copy(from);o.vel.copy(dir).multiplyScalar(78);
  o.fuse=arm.range/78;o.gravity=0;o.splash=arm.splash;o.spin=0;
  if(!o.mesh){
    o.mesh=new THREE.Mesh(new THREE.SphereGeometry(.22,8,6),
      new THREE.MeshBasicMaterial({color:0xffb066}));
    scene.add(o.mesh);
  }
  o.mesh.visible=true;o.mesh.position.copy(o.pos);
}
/* The authored grenade bodies, thrown rather than represented by a marker.
   GRENADE_READ scales them up: these are 140 mm objects and the chase camera
   sits 10 m back, so at true size the throw is invisible and the only thing the
   player can read is the blast. */
var GRENADE_READ=2.4;
var nadeModels={};
ARENA_NADES.forEach(function(nade){
  afterBoot(function(){
    loadGeneratedArt(nade.asset,function(model){
      model.scale.setScalar(GRENADE_READ);nadeModels[nade.id]=model;
    });
  });
});
function throwGrenade(){
  var nade=ARENA_NADES[arsenal.nade];
  if(arsenal.pouch[arsenal.nade]<=0||arsenal.swap>0)return;
  arsenal.pouch[arsenal.nade]--;arsenal.swap=.5;
  var dir=armsMuzzleTransform(),o=ordnanceSlot();
  o.live=true;o.kind=nade.id;o.pos.copy(_armsMuzzle);
  o.vel.copy(dir).multiplyScalar(21);o.vel.y+=5.5;
  o.fuse=nade.fuse;o.gravity=19;o.splash=nade.splash;o.spin=6;o.def=nade;
  if(!o.mesh){o.mesh=new THREE.Group();scene.add(o.mesh);}
  /* A pooled slot is reused by whichever grenade is thrown next, so the body
     is swapped rather than the slot being typed to one. */
  if(o.body!==nade.id){
    while(o.mesh.children.length)o.mesh.remove(o.mesh.children[0]);
    var art=nadeModels[nade.id];
    o.mesh.add(art?art.clone(true)
      :new THREE.Mesh(new THREE.SphereGeometry(.11,7,6),
        new THREE.MeshBasicMaterial({color:nade.colour})));
    /* A live grenade has to be findable on a cluttered deck. */
    var pip=new THREE.Mesh(new THREE.SphereGeometry(.34,7,6),
      new THREE.MeshBasicMaterial({color:nade.colour,transparent:true,opacity:.45,
        blending:THREE.AdditiveBlending,depthWrite:false}));
    o.mesh.add(pip);
    o.body=nade.id;
  }
  o.mesh.visible=true;o.mesh.position.copy(o.pos);
  tone(300,.05,.05,'triangle',210);
  feed('<span style="color:#ffd08a">'+nade.name+' OUT</span>');
}
function stepOrdnance(dt){
  for(var i=0;i<arenaOrdnance.length;i++){
    var o=arenaOrdnance[i];if(!o.live)continue;
    o.vel.y-=o.gravity*dt;
    o.pos.addScaledVector(o.vel,dt);
    var floor=worldSurfaceAt(o.pos.x,o.pos.z);
    if(o.pos.y<=floor+.1){
      o.pos.y=floor+.1;
      if(o.kind==='rocket'){o.fuse=0;}
      else{o.vel.y=Math.abs(o.vel.y)*.32;o.vel.x*=.6;o.vel.z*=.6;}
    }
    o.mesh.position.copy(o.pos);
    if(o.spin)o.mesh.rotation.y+=o.spin*dt;
    o.fuse-=dt;
    if(o.fuse>0)continue;
    o.live=false;o.mesh.visible=false;
    var stun=o.def&&o.def.stun,smoke=o.def&&o.def.smoke;
    arenaSplash(o.pos,o.splash.radius,o.splash.damage);
    if(stun){
      var targets=arenaCombatTargets(true);
      for(var t=0;t<targets.length;t++){
        var e=targets[t];
        if(Math.hypot(e.x-o.pos.x,e.z-o.pos.z)<o.splash.radius)e.stun=stun;
      }
      if(Math.hypot(salvage.x-o.pos.x,salvage.z-o.pos.z)<o.splash.radius)st.dmgFlash=Math.max(st.dmgFlash,.9);
    }
    if(smoke)for(var p=0;p<(LOW?4:8);p++){
      var a=p/(LOW?4:8)*Math.PI*2;
      arenaSmoke(o.pos.x+Math.cos(a)*3,o.pos.y+1.4,o.pos.z+Math.sin(a)*3,smoke);
    }
    o.def=null;
  }
}

/* ---------- per-frame ---------- */
var armsPrev={};
function armsPressed(code){
  var down=!!keys[code],was=!!armsPrev[code];
  armsPrev[code]=down;
  return down&&!was;
}
function armsReadout(){
  if(!arsenal.ready)return '';
  var arm=currentArm(),nade=ARENA_NADES[arsenal.nade];
  return ' · '+arm.name+' '+(arsenal.reload>0?'RELOADING':
    arsenal.mag[arsenal.slot]+'/'+arsenal.reserve[arsenal.slot])+
    ' · '+nade.name+' x'+arsenal.pouch[arsenal.nade];
}
function stepArenaArms(dt){
  arsenal.cool=Math.max(0,arsenal.cool-dt);
  arsenal.swap=Math.max(0,arsenal.swap-dt);
  if(arsenal.reload>0){
    arsenal.reload-=dt;
    if(arsenal.reload<=0){arsenal.reload=0;finishReload();}
  }
  if(armsFlash&&armsFlash.visible){
    armsFlash.material.opacity-=dt*14;
    if(armsFlash.material.opacity<=0)armsFlash.visible=false;
  }
  for(var i=0;i<tracerPool.length;i++){
    var t=tracerPool[i];if(!t.visible)continue;
    t.userData.life-=dt;t.material.opacity=Math.max(0,t.userData.life*13);
    if(t.userData.life<=0)t.visible=false;
  }
  stepOrdnance(dt);
  stepArenaSmoke(dt);

  var surface=worldSurfaceAt(salvage.x,salvage.z);
  armsRig.visible=salvage.on;
  armsRig.position.set(salvage.x,surface,salvage.z);
  armsRig.rotation.y=salvage.yaw;
  armsPivot.rotation.x=salvage.lookPitch;
  if(!salvage.on)return;

  for(var d=0;d<ARENA_ARMS.length;d++)if(armsPressed('Digit'+(d+1)))equipArm(d);
  if(armsPressed('KeyR'))beginReload();
  if(armsPressed('KeyB'))throwGrenade();
  if(armsPressed('KeyN')){
    arsenal.nade=(arsenal.nade+1)%ARENA_NADES.length;
    feed('<span style="color:#ffd08a">'+ARENA_NADES[arsenal.nade].name+' SELECTED</span>');
  }
  arsenal.ads=!!(mouseRight||padIn.zoom||touchIn.zoom);
  /* camWork() does not run on foot (49-loop.js), so the ground camera keeps
     whatever FOV it is given — which is what makes a scope possible here at
     all, and why leaving on foot has to hand it back. */
  var arm=currentArm(),wantFov=arsenal.ads&&arm.zoom?arm.zoom:70;
  if(Math.abs(camera.fov-wantFov)>.05){
    camera.fov+=(wantFov-camera.fov)*Math.min(1,dt*9);
    camera.updateProjectionMatrix();
  }
  /* Semi-automatics fire on the press, not on the hold — otherwise the sniper
     empties its magazine in half a second on a held mouse button. */
  var firing=keys.Space||mouseDown||touchIn.fire||padIn.fire;
  if(firing&&(arm.auto||!armsPrev.trigger))fireArm();
  armsPrev.trigger=firing;
}
/* Called by every route back off foot. Three things outlive the on-foot step if
   this is skipped: the weapon rig keeps floating where the pilot was, a thrown
   grenade freezes mid-arc because nothing integrates it any more, and the
   flight camera inherits the scope's narrow FOV. */
function armsHolster(){
  arsenal.ads=false;armsRig.visible=false;
  for(var i=0;i<arenaOrdnance.length;i++){
    var o=arenaOrdnance[i];
    if(!o.live)continue;
    o.live=false;if(o.mesh)o.mesh.visible=false;
  }
  if(Math.abs(camera.fov-70)>.05){camera.fov=70;camera.updateProjectionMatrix();}
}
