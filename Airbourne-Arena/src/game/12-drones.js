/* ===================== the blackout =====================
   STORY-BIBLE section 11, Mission 10. Late in a Core Run the arena loses
   power, the masts go dark, and unmarked aircraft come in under sensor
   masking. They belong to nobody: their rounds hurt both league flights, both
   sets of guns, and the masts.

   Drones are deliberately NOT fighters. Everything in `fighters` assumes two
   sides — scoring, rosters, bases, goals, palette — and a third entry there
   would have to be special-cased in a dozen places. A separate list with its
   own step and its own collision costs less and breaks nothing.

   Mechanically the raid is built out of parts that already exist: it drops
   every mast, which is exactly the fog-of-war penalty the radar rule already
   models, so the sky goes quiet without a single new rule to explain.      */
var drones=[],raid={on:false,fired:false,t:0};
var DRONE_HP=46,DRONE_SPEED=118,DRONE_RANGE=620,DRONE_DMG=7,RAID_N=4,RAID_TIME=45;
var _drV=new THREE.Vector3(),_drV2=new THREE.Vector3();

function buildDrone(){
  var g=new THREE.Group();
  var body=new THREE.Mesh(new THREE.ConeGeometry(2.6,11,4),
    new THREE.MeshPhongMaterial({map:blackWingSkin,color:0x5b5f6b,shininess:44,flatShading:true}));
  body.rotation.x=-Math.PI/2; g.add(body);
  var wing=new THREE.Mesh(new THREE.BoxGeometry(15,.3,2.2),
    new THREE.MeshPhongMaterial({map:blackWingSkin,color:0x4a4e58,shininess:30,flatShading:true}));
  wing.position.z=1.2; g.add(wing);
  g.userData.legacyParts=[body,wing];
  /* the only thing you can actually see coming in the dark */
  var eye=new THREE.Sprite(new THREE.SpriteMaterial({
    map:softSprite('rgba(190,150,255,.95)','rgba(140,90,230,0)'),
    color:0xb98cff,transparent:true,depthWrite:false,fog:false,
    blending:THREE.AdditiveBlending}));
  eye.scale.set(20,20,1); eye.position.z=-5; g.add(eye);
  scene.add(g);
  installStoryCraft(g,'Blackwing_Drone',18);
  return g;
}
function startRaid(){
  if(raid.on||raid.fired||st.over)return;
  raid.on=raid.fired=true; raid.t=0;
  /* arena systems shut down: every mast drops at once, which is the blackout
     the player actually feels — the map empties */
  for(var i=0;i<structs.length;i++){
    var s=structs[i];
    if(s.kind!=='radar'||!s.alive)continue;
    s.alive=false; s.mesh.visible=false; s.respawnT=s.respawn*1.6;
    boom(s.pos,180);
  }
  for(var d=0;d<RAID_N;d++){
    var ang=Math.PI*2*d/RAID_N+0.7;
    var g=buildDrone();
    g.position.set(Math.cos(ang)*2100,rnd(900,1250),Math.sin(ang)*1500);
    drones.push({mesh:g,pos:g.position,vel:new THREE.Vector3(),hp:DRONE_HP,
      alive:true,cd:rnd(.4,1.6),team:'blackwing',name:'BLACK WING',kills:0});
  }
  banner('ARENA POWER LOST',2.2);
  feed('<span style="color:#b98cff">UNIDENTIFIED AIRCRAFT — SENSOR MASKED</span>');
  tone(70,1.6,.26,'sawtooth',44);
}
function killDrone(dr){
  if(!dr.alive)return;
  dr.alive=false; dr.mesh.visible=false;
  boom(dr.pos,140);
  feed('<span style="color:#b98cff">BLACK WING DRONE DOWN</span>');
}
function stepDrones(dt){
  /* the raid arrives once a match, on the clock or at match point */
  if(!raid.fired&&st.started&&!st.over&&
     (st.time<70||st.scoreB>=TARGET_SCORE-1||st.scoreR>=TARGET_SCORE-1))startRaid();
  if(!drones.length)return;
  /* The raid is an event, not a new permanent state. It withdraws on its own
     clock — which is also what stops a drone nobody manages to shoot from
     harassing the arena for the rest of the match. */
  if(raid.on){
    raid.t+=dt;
    if(raid.t>RAID_TIME){
      for(var w=0;w<drones.length;w++)if(drones[w].alive){drones[w].alive=false;drones[w].mesh.visible=false;}
    }
  }
  var live=0;
  for(var i=0;i<drones.length;i++){
    var dr=drones[i];
    if(!dr.alive)continue;
    live++;
    /* the carrier first, then anyone flying, then the guns */
    var tgt=null,bd=1e9;
    for(var j=0;j<fighters.length;j++){
      var f=fighters[j];
      if(!f.alive||f.invuln>0)continue;
      var d=f.pos.distanceTo(dr.pos);
      if(f.carrying)d*=0.5;
      if(d<bd){bd=d;tgt=f;}
    }
    if(!tgt){
      for(var k=0;k<structs.length;k++){
        var s=structs[k];
        if(!s.alive)continue;
        var ds=s.pos.distanceTo(dr.pos);
        if(ds<bd){bd=ds;tgt=s;}
      }
    }
    if(tgt){
      _drV.copy(tgt.pos).sub(dr.pos);
      if(tgt.pos.y<400)_drV.y+=180;          /* do not chase anyone into a hill */
      var dist=_drV.length();
      if(dist>1e-3)_drV.multiplyScalar(1/dist);
      /* hold off rather than ram, so they circle and shoot */
      var want=dist<300?-0.5:1;
      dr.vel.lerp(_drV2.copy(_drV).multiplyScalar(DRONE_SPEED*want),Math.min(1,dt*1.1));
      dr.cd-=dt;
      if(dist<DRONE_RANGE&&dr.cd<=0){
        dr.cd=rnd(.7,1.25);
        var aim=_drV2.copy(tgt.pos).addScaledVector(tgt.vel||_drV2.set(0,0,0),
          dist/MUZZLE).sub(dr.pos).normalize();
        var sp=.026;
        aim.set(aim.x+rnd(-sp,sp),aim.y+rnd(-sp,sp),aim.z+rnd(-sp,sp)).normalize();
        bullets.push({p:dr.pos.clone().addScaledVector(aim,7),
          v:aim.clone().multiplyScalar(MUZZLE*.82),life:1.7,
          team:'blackwing',owner:dr,dmg:DRONE_DMG});
        gunSfx(earGain(dr.pos)*.42);
      }
    }
    dr.pos.addScaledVector(dr.vel,dt);
    var gh=ground(dr.pos.x,dr.pos.z)+60;
    if(dr.pos.y<gh){dr.pos.y=gh;if(dr.vel.y<0)dr.vel.y=0;}
    if(dr.pos.y>CEIL_MAX)dr.pos.y=CEIL_MAX;
    if(dr.vel.lengthSq()>1e-4)dr.mesh.lookAt(_drV.copy(dr.pos).add(dr.vel));
  }
  if(raid.on&&live===0){
    raid.on=false;
    banner('AIRSPACE CLEAR',1.8);
    feed('<span style="color:#b98cff">RAID BROKEN — THEY GOT WHAT THEY CAME FOR</span>');
  }
}
function clearDrones(){
  for(var i=0;i<drones.length;i++){scene.remove(drones[i].mesh);disposeSubtree(drones[i].mesh);}
  drones.length=0; raid.on=false; raid.fired=false; raid.t=0;
}

