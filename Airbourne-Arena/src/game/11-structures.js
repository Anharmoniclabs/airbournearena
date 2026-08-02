/* ===================== ground structures =====================
   Two kinds of building that shoot back at the match rather than at you.

   RADAR MASTS pay for the fog of war. While a team still has one standing, its
   minimap shows every enemy contact; knock both down and that team is back to
   eyes, forward cone and eight seconds of stale ghosts. This is the reason to
   fly low and the reason to defend something that cannot defend itself.

   AA BATTERIES ring each goal. Every scoring ring sits deep in the other
   team's half, so the side that scores there has to fly through guns to do it
   — a lone carrier can no longer run a straight line at the ring, and escort
   becomes a job instead of a formation. Both come back after a while, so
   strafing them buys a window rather than deleting the defence for good.   */
var structs=[],TOWER_HP=260,AA_HP=140,AA_RANGE=780,AA_MUZZLE=560,AA_DMG=9;
var _stV=new THREE.Vector3(),_stV2=new THREE.Vector3();
var steelMat=new THREE.MeshPhongMaterial({map:aviationHardwareSkin,
  color:0xd2d7d7,shininess:24,flatShading:true});

function addStruct(o){
  o.hp=o.maxHp; o.alive=true; o.respawnT=0; o.cd=0; o.kills=0;
  scene.add(o.mesh); structs.push(o); return o;
}
function buildTower(team,x,z){
  var g=new THREE.Group(); g.position.set(x,ground(x,z),z);
  /* tall on purpose: it has to stand clear of the skyline to read as a
     landmark, and clear of the bots' hard deck to be strafeable at all */
  var mast=new THREE.Mesh(new THREE.CylinderGeometry(5,13,150,7),steelMat);
  mast.position.y=75; g.add(mast);
  var dish=new THREE.Mesh(new THREE.SphereGeometry(26,14,8,0,Math.PI*2,0,Math.PI*0.5),
    new THREE.MeshPhongMaterial({map:skywaySkin,color:0xe1e2de,shininess:30,
      flatShading:true,side:THREE.DoubleSide}));
  dish.position.set(0,162,0); dish.rotation.x=-0.75; g.add(dish);
  var halo=new THREE.Sprite(teamMat(team,new THREE.SpriteMaterial({
    map:softSprite('rgba(255,255,255,.9)','rgba(255,255,255,0)'),color:TEAM_COL[team],
    transparent:true,depthWrite:false,fog:false,blending:THREE.AdditiveBlending})));
  halo.scale.set(90,90,1); halo.position.y=190; g.add(halo);
  return addStruct({kind:'radar',team:team,name:'RADAR',mesh:g,pos:g.position,
    maxHp:TOWER_HP,respawn:34,radius:46,height:200});
}
function buildAA(team,x,z){
  var g=new THREE.Group(); g.position.set(x,ground(x,z),z);
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(15,19,13,10),steelMat));
  var turret=new THREE.Mesh(new THREE.BoxGeometry(15,10,15),
    teamMat(team,new THREE.MeshPhongMaterial({map:aviationHardwareSkin,
      color:TEAM_COL[team],shininess:24,flatShading:true})));
  turret.position.y=17; g.add(turret);
  var barrel=new THREE.Mesh(new THREE.CylinderGeometry(1.9,2.4,30,7),steelMat);
  barrel.position.set(0,12,0); barrel.rotation.x=-0.9; turret.add(barrel);
  return addStruct({kind:'aa',team:team,name:'AA',mesh:g,pos:g.position,turret:turret,
    maxHp:AA_HP,respawn:26,radius:30,height:40});
}
/* Masts sit outside the city so the skyline cannot hide them, and forward of
   the base so taking one means crossing into defended air. */
buildTower('blue',-2000,-780); buildTower('blue',-2000,780);
buildTower('red',  2000,-780); buildTower('red',  2000,780);
/* GOALS.blue is the ring blue scores in, and it stands in red's half — so the
   guns around it are red's. Same the other way. */
['blue','red'].forEach(function(scorer){
  var g=GOALS[scorer],owner=(scorer==='blue'?'red':'blue');
  for(var i=0;i<3;i++){
    var a=Math.PI*2*i/3+0.4;
    buildAA(owner,g.x+Math.cos(a)*250,g.z+Math.sin(a)*250);
  }
});

function teamHasRadar(team){
  for(var i=0;i<structs.length;i++)
    if(structs[i].alive&&structs[i].kind==='radar'&&structs[i].team===team)return true;
  return false;
}
function hurtStruct(s,dmg,by){
  if(!s.alive)return;
  s.hp-=dmg;
  if(s.hp>0)return;
  s.alive=false; s.mesh.visible=false; s.respawnT=s.respawn;
  boom(s.pos,s.kind==='radar'?230:150);
  if(s.kind==='radar'){
    feed('<span style="color:'+teamHex(s.team)+'">'+factionName(s.team)+' RADAR DOWN</span>');
    if(s.team===player.team&&!teamHasRadar(s.team))banner('RADAR OFFLINE — CONTACTS LOST',1.6);
    else if(s.team!==player.team&&!teamHasRadar(s.team))banner('ENEMY RADAR BLIND',1.4);
  } else feed('<span style="color:'+teamHex(s.team)+'">'+factionName(s.team)+' AA SILENCED</span>');
}
function aaFire(s,tgt){
  /* one refinement pass on time of flight is plenty of lead for a gun that is
     meant to be threatening rather than lethal */
  var t=_stV.copy(tgt.pos).sub(s.pos).length()/AA_MUZZLE;
  t=_stV.copy(tgt.pos).addScaledVector(tgt.vel,t).sub(s.pos).length()/AA_MUZZLE;
  var aim=_stV2.copy(tgt.pos).addScaledVector(tgt.vel,t).sub(s.pos);
  aim.y+=14; aim.normalize();
  var sp=0.030;
  aim.set(aim.x+rnd(-sp,sp),aim.y+rnd(-sp,sp),aim.z+rnd(-sp,sp)).normalize();
  if(s.turret)s.turret.rotation.y=Math.atan2(aim.x,aim.z);
  var b=bulletSpawn();
  b.p.copy(s.pos).addScaledVector(aim,24).setY(s.pos.y+22);
  b.v.copy(aim).multiplyScalar(AA_MUZZLE);
  b.life=2.2;b.team=s.team;b.owner=s;b.dmg=AA_DMG;
  gunSfx(earGain(s.pos)*0.5);
}
function stepStructs(dt){
  for(var i=0;i<structs.length;i++){
    var s=structs[i];
    if(!s.alive){
      s.respawnT-=dt;
      if(s.respawnT<=0&&!st.over){s.alive=true;s.hp=s.maxHp;s.mesh.visible=true;}
      continue;
    }
    if(s.kind==='radar'){s.mesh.rotation.y+=dt*0.7; continue;}
    s.cd-=dt;
    var tgt=null,bd=AA_RANGE;
    for(var j=0;j<fighters.length;j++){
      var f=fighters[j];
      if(!f.alive||f.team===s.team||f.invuln>0)continue;
      var d=f.pos.distanceTo(s.pos);
      /* the carrier is worth shooting at from further out than anyone else */
      if(f.carrying)d*=0.7;
      if(d<bd){bd=d;tgt=f;}
    }
    if(!tgt)continue;
    if(s.cd<=0){s.cd=tgt.carrying?0.60:1.00; aaFire(s,tgt);}
  }
}

