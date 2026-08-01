/* ===================== ground combat encounter =====================
   Hostiles are deliberately temporary rigid sentry-drone fillers. They provide
   complete combat timing, damage, objective and extraction mechanics while the
   final enemy character/vehicle art remains a separate production asset pass. */
var groundCombat={active:false,kills:0,goal:0,shotCd:0,hurtCd:0,enemies:[]};
var groundEnemyGroup=new THREE.Group();groundEnemyGroup.name='ground combat fillers';scene.add(groundEnemyGroup);

function makeGroundSentry(i){
  var host=new THREE.LOD(),root=new THREE.Group(),dark=new THREE.MeshPhongMaterial({color:0x242a31,shininess:48}),
      hostile=new THREE.MeshPhongMaterial({color:0x7d1919,emissive:0xff2e19,emissiveIntensity:.24});
  var body=new THREE.Mesh(new THREE.CylinderGeometry(1.05,1.35,2.3,8),dark);body.position.y=2.15;root.add(body);
  var eye=new THREE.Mesh(new THREE.BoxGeometry(1.45,.34,.3),hostile);eye.position.set(0,2.45,-1.05);root.add(eye);
  var legs=new THREE.Mesh(new THREE.CylinderGeometry(.72,1.65,1.1,6),dark);legs.position.y=.65;root.add(legs);
  host.userData.legacy=root;host.userData.runtimeReady=false;host.add(root);
  host.visible=false;groundEnemyGroup.add(host);
  return {mesh:host,x:0,z:0,hp:50,cd:.5+i*.12,alive:false};
}
(function(){for(var i=0;i<(LOW?6:9);i++)groundCombat.enemies.push(makeGroundSentry(i));})();

/* Load each rigid render asset once, then clone it across encounter instances.
   Combat collision remains the independent 1.42 m numeric body represented by
   ground-sentry-drone-v1-collision.glb in the source asset contract. */
function installGroundSentryLevel(url,distance,isPrimary){
  makeGltfLoader().load(url,function(gltf){
    for(var i=0;i<groundCombat.enemies.length;i++){
      var host=groundCombat.enemies[i].mesh,model=gltf.scene.clone(true);
      model.traverse(function(o){if(o.isMesh){o.castShadow=!LOW;o.receiveShadow=true;}});
      host.addLevel(model,distance);
      if(isPrimary){host.userData.runtimeReady=true;host.userData.legacy.visible=false;}
    }
  },undefined,function(err){console.error('Ground sentry asset failed to load.',url,err);});
}
installGroundSentryLevel('assets/ground-sentry-drone-v1.glb',0,true);
installGroundSentryLevel('assets/ground-sentry-drone-v1-lod1.glb',LOW?42:75,false);

function beginGroundEncounter(){
  if(groundCombat.active)return;
  groundCombat.active=true;groundCombat.kills=0;groundCombat.goal=LOW?4:6;groundCombat.shotCd=0;groundCombat.hurtCd=0;
  for(var i=0;i<groundCombat.enemies.length;i++){
    var e=groundCombat.enemies[i],a=(i/groundCombat.enemies.length)*Math.PI*2+.35,r=42+(i%3)*18;
    e.x=clamp(salvage.x+Math.cos(a)*r,-CITY_REACH+15,CITY_REACH-15);
    e.z=clamp(salvage.z+Math.sin(a)*r,-CITY_REACH+15,CITY_REACH-15);
    e.hp=50;e.cd=.45+i*.09;e.alive=i<groundCombat.goal;e.mesh.visible=e.alive;
    e.mesh.position.set(e.x,ground(e.x,e.z),e.z);
  }
  banner('GROUND WAR · CLEAR '+groundCombat.goal+' SENTRIES · EXTRACT',2.5);
}
function endGroundEncounter(){
  groundCombat.active=false;
  for(var i=0;i<groundCombat.enemies.length;i++)groundCombat.enemies[i].mesh.visible=false;
}
function damageGroundPlayer(amount){
  if(groundCombat.hurtCd>0)return;
  groundCombat.hurtCd=.22;
  var absorbed=Math.min(salvage.shield,amount);salvage.shield-=absorbed;player.hp-=amount-absorbed;
  st.dmgFlash=Math.max(st.dmgFlash,.45);shake=Math.max(shake,.22);
  if(player.hp<=0){
    player.hp=Math.max(35,player.maxHp*.5);salvage.shield=0;
    salvage.x=player.pos.x;salvage.z=player.pos.z+7;
    banner('DOWNED · RECOVERED AT AIRCRAFT',2.2);
  }
}
function fireGroundWeapon(){
  if(groundCombat.shotCd>0)return;
  groundCombat.shotCd=.16;tone(155,.045,.07,'sawtooth',95);
  var fx=-Math.sin(salvage.yaw),fz=-Math.cos(salvage.yaw),best=null,bestScore=1e9;
  for(var i=0;i<groundCombat.enemies.length;i++){
    var e=groundCombat.enemies[i];if(!e.alive)continue;
    var dx=e.x-salvage.x,dz=e.z-salvage.z,d=Math.hypot(dx,dz);if(d>125)continue;
    var ahead=(dx*fx+dz*fz)/Math.max(1,d),off=Math.abs(dx*fz-dz*fx);
    if(ahead>.93&&off<3.6&&d<bestScore){best=e;bestScore=d;}
  }
  if(!best)return;
  best.hp-=25;st.hitmark=.12;
  if(best.hp<=0){
    best.alive=false;best.mesh.visible=false;groundCombat.kills++;
    salvage.parts+=2;feed('<span style="color:#ff8b72">SENTRY DISABLED · 2 PARTS</span>');
    if(groundCombat.kills>=groundCombat.goal)banner('BLOCK SECURE · RETURN TO AIRCRAFT AND EXTRACT',2.5);
  }
}
function stepGroundCombat(dt){
  if(!groundCombat.active||salvage.surface==='skybase')return;
  groundCombat.shotCd=Math.max(0,groundCombat.shotCd-dt);groundCombat.hurtCd=Math.max(0,groundCombat.hurtCd-dt);
  if(keys.Space||mouseDown||touchIn.fire||padIn.fire)fireGroundWeapon();
  var nearest=1e9;
  for(var i=0;i<groundCombat.enemies.length;i++){
    var e=groundCombat.enemies[i];if(!e.alive)continue;
    var dx=salvage.x-e.x,dz=salvage.z-e.z,d=Math.hypot(dx,dz);nearest=Math.min(nearest,d);
    if(d>13){var speed=d>35?3.8:2.1;e.x+=dx/d*speed*dt;e.z+=dz/d*speed*dt;}
    e.mesh.position.set(e.x,ground(e.x,e.z),e.z);e.mesh.rotation.y=Math.atan2(dx,dz);
    e.cd-=dt;
    if(d<48&&e.cd<=0){e.cd=1.1+hash(i,groundCombat.kills+17)*.75;damageGroundPlayer(d<20?12:7);}
  }
  if(groundCombat.kills<groundCombat.goal){
    updateSalvageHud('GROUND WAR '+groundCombat.kills+'/'+groundCombat.goal+' · SPACE/CLICK FIRE · HOSTILE '+Math.round(nearest)+' M');
  }else{
    var back=Math.hypot(salvage.x-player.pos.x,salvage.z-player.pos.z);
    updateSalvageHud(back<13?'BLOCK SECURE · [G] BOARD AND EXTRACT':'BLOCK SECURE · RETURN TO AIRCRAFT');
  }
}
