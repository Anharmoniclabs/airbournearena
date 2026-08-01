/* ===================== lower-city world dressing =====================
   The terrain, roads and hero architecture remain the authored Blender world.
   This layer adds gameplay-scale rigid landmarks, wreckage, navigation lights
   and extraction pads. Repetition is instanced and each landmark uses a LOD. */
var WORLD_DISTRICTS=[
  {id:'crashyard',name:'CRASHYARD',x:-1120,z:-760,color:0xff7b3a},
  {id:'civic',name:'CIVIC COLLAPSE',x:80,z:1180,color:0x6fe3d0},
  {id:'floodworks',name:'FLOODED WORKS',x:1180,z:-620,color:0x58a9ff}
];
var CITY_ENTRY_LANES={vanguard:{x:-920,z:1450},tempest:{x:0,z:1450},inferno:{x:920,z:1450}};
var DISTRICT_COLLISION_ASSET='assets/lower-city-districts-authored-v1-collision.glb';
var worldDistrictGroup=new THREE.Group();worldDistrictGroup.name='open world districts';worldDistrictGroup.visible=false;scene.add(worldDistrictGroup);
var worldDistrictFallback=new THREE.Group();worldDistrictFallback.name='procedural district fallback';worldDistrictGroup.add(worldDistrictFallback);
var authoredDistrictHosts={},authoredDistrictReady=0;
var districtBeacons=[];
var districtShell=new THREE.MeshPhongMaterial({map:bunkerSkin,color:0x777b79,shininess:4,flatShading:true});
var districtMetal=new THREE.MeshPhongMaterial({map:aviationHardwareSkin,color:0x49535b,shininess:34,flatShading:true});

function districtBox(parent,name,x,y,z,w,h,d,mat,rz){
  var o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);o.name=name;o.position.set(x,y,z);o.rotation.z=rz||0;o.castShadow=!LOW;o.receiveShadow=true;parent.add(o);return o;
}
function nearestWorldDistrict(x,z){
  var best=null,dist=1e9;
  for(var i=0;i<WORLD_DISTRICTS.length;i++){
    var d=WORLD_DISTRICTS[i],range=Math.hypot(x-d.x,z-d.z);if(range<dist){best=d;dist=range;}
  }
  return {district:best,distance:dist};
}
function cityEntryLane(faction){return CITY_ENTRY_LANES[faction]||CITY_ENTRY_LANES.vanguard;}
function aircraftMayEnterCity(fighter){return !!(worldFlow.active&&fighter&&fighter.alive&&fighter.isPlayer);}
function districtObstacleHeightAt(x,z){
  var bounds={crashyard:[42,32],civic:[38,43],floodworks:[46,38]};
  for(var i=0;i<WORLD_DISTRICTS.length;i++){
    var d=WORLD_DISTRICTS[i],b=bounds[d.id];
    if(Math.hypot(x-d.x,z-d.z)<b[0])return ground(d.x,d.z)+b[1];
  }
  return null;
}
function buildDistrictLandmark(def,lod){
  var root=new THREE.Group(),detail=lod===0;
  if(def.id==='crashyard'){
    var hull=new THREE.Mesh(new THREE.CylinderGeometry(4.8,7.2,52,detail?14:8),districtMetal);
    hull.name='crashed transport fuselage';hull.rotation.z=Math.PI/2;hull.position.set(0,6,0);root.add(hull);
    districtBox(root,'broken port wing',-2,5,0,38,1.3,9,districtShell,-.16);
    districtBox(root,'broken starboard wing',10,4,2,25,1.1,8,districtShell,.23);
    if(detail){districtBox(root,'severed tail',24,8,0,9,16,4,districtMetal,-.26);districtBox(root,'cargo wreck',-20,2,15,13,4,7,districtMetal,.08);}
  }else if(def.id==='civic'){
    districtBox(root,'civic arch left',-18,13,0,7,26,9,districtShell,-.08);
    districtBox(root,'civic arch right',18,13,0,7,26,9,districtShell,.08);
    districtBox(root,'fractured civic lintel',0,28,0,43,6,9,districtShell,.06);
    districtBox(root,'fallen civic slab',4,3,-17,31,4,16,districtShell,.18);
    if(detail){for(var ci=0;ci<5;ci++)districtBox(root,'memorial rib',-12+ci*6,10,-3,2.2,18,2.2,districtMetal,(ci-2)*.035);}
  }else{
    for(var ti=0;ti<(detail?3:2);ti++){
      var tank=new THREE.Mesh(new THREE.CylinderGeometry(10,11,23,detail?16:9),districtMetal);
      tank.name='floodworks pressure tank';tank.position.set((ti-1)*27,12,(ti%2)*9);root.add(tank);
    }
    districtBox(root,'floodworks pipe bridge',0,25,-8,62,4,4,districtShell,0);
    districtBox(root,'floodworks pump hall',0,7,22,42,14,21,districtShell,-.04);
  }
  root.traverse(function(o){if(o.isMesh){o.castShadow=!LOW;o.receiveShadow=true;}});return root;
}

WORLD_DISTRICTS.forEach(function(def){
  var host=new THREE.LOD();host.name=def.name+' fallback landmark';host.position.set(def.x,ground(def.x,def.z),def.z);host.addLevel(buildDistrictLandmark(def,0),0);host.addLevel(buildDistrictLandmark(def,1),LOW?260:520);worldDistrictFallback.add(host);
  var authoredHost=new THREE.LOD();authoredHost.name=def.name+' authored landmark';authoredHost.position.set(def.x,ground(def.x,def.z),def.z);worldDistrictGroup.add(authoredHost);authoredDistrictHosts[def.id]=authoredHost;
  var beaconMat=new THREE.MeshBasicMaterial({color:def.color,transparent:true,opacity:.32,depthWrite:false});
  var beam=new THREE.Mesh(new THREE.CylinderGeometry(1.5,5,190,10,1,true),beaconMat);
  beam.name=def.name+' navigation beacon';beam.position.set(def.x,ground(def.x,def.z)+95,def.z);worldDistrictGroup.add(beam);
  var ring=new THREE.Mesh(new THREE.RingGeometry(18,22,32),new THREE.MeshBasicMaterial({color:def.color,side:THREE.DoubleSide,transparent:true,opacity:.78}));
  ring.name=def.name+' extraction pad';ring.rotation.x=-Math.PI/2;ring.position.set(def.x,ground(def.x,def.z)+1.4,def.z);worldDistrictGroup.add(ring);
  districtBeacons.push({beam:beam,ring:ring,phase:hash(def.x,def.z)*Math.PI*2});
});

(function buildDistrictDressing(){
  var debrisCount=LOW?42:90,lightCount=LOW?18:36,m=new THREE.Matrix4(),q=new THREE.Quaternion(),p=new THREE.Vector3(),s=new THREE.Vector3();
  var debris=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),districtMetal,debrisCount);
  for(var i=0;i<debrisCount;i++){
    var d=WORLD_DISTRICTS[i%WORLD_DISTRICTS.length],a=hash(i,31)*Math.PI*2,r=35+hash(i,47)*115,x=d.x+Math.cos(a)*r,z=d.z+Math.sin(a)*r;
    p.set(x,ground(x,z)+1.2,z);q.setFromEuler(new THREE.Euler(hash(i,7)*.4,a,hash(i,9)*.5));s.set(3+hash(i,3)*10,1+hash(i,5)*3,2+hash(i,11)*7);m.compose(p,q,s);debris.setMatrixAt(i,m);
  }
  debris.instanceMatrix.needsUpdate=true;debris.castShadow=!LOW;debris.receiveShadow=true;worldDistrictFallback.add(debris);
  var postGeo=new THREE.CylinderGeometry(.18,.25,6,6),postMat=new THREE.MeshPhongMaterial({color:0x252d32,emissive:0x294b55,emissiveIntensity:.3});
  var posts=new THREE.InstancedMesh(postGeo,postMat,lightCount);
  for(var j=0;j<lightCount;j++){
    var dd=WORLD_DISTRICTS[j%3],ang=j*.92,r2=52+(j%6)*18,x2=dd.x+Math.cos(ang)*r2,z2=dd.z+Math.sin(ang)*r2;
    p.set(x2,ground(x2,z2)+3,z2);q.identity();s.set(1,1,1);m.compose(p,q,s);posts.setMatrixAt(j,m);
  }
  posts.instanceMatrix.needsUpdate=true;worldDistrictFallback.add(posts);
})();

function calibrateDistrictAsset(root){
  root.traverse(function(o){
    if(!o.isMesh||!o.material)return;o.castShadow=!LOW;o.receiveShadow=true;o.material=o.material.clone();
    var n=(o.material.name||'').toLowerCase();
    if(n.indexOf('bunker concrete')>=0)o.material.map=authoredScaledMap(bunkerSkin);
    else if(n.indexOf('aviation hardware')>=0)o.material.map=authoredScaledMap(aviationHardwareSkin);
    else if(n.indexOf('safety orange')>=0){o.material.map=authoredScaledMap(aviationHardwareSkin);o.material.emissive.setHex(0x471000);o.material.emissiveIntensity=.48;}
    else if(n.indexOf('recessed glazing')>=0){o.material.color.setHex(0x102d3b);o.material.emissive.setHex(0x062233);o.material.emissiveIntensity=.7;}
    o.material.needsUpdate=true;
  });
}
function installAuthoredDistricts(url,lodDistance,lodTag){
  makeGltfLoader().load(url,function(gltf){
    var installed=0;
    for(var i=0;i<WORLD_DISTRICTS.length;i++){
      var d=WORLD_DISTRICTS[i],node=gltf.scene.getObjectByName('DISTRICT_'+d.id+'__'+lodTag);
      if(!node)continue;if(node.parent)node.parent.remove(node);node.position.set(0,0,0);calibrateDistrictAsset(node);
      authoredDistrictHosts[d.id].addLevel(node,lodDistance);installed++;
    }
    if(installed===WORLD_DISTRICTS.length){authoredDistrictReady+=installed;worldDistrictFallback.visible=false;}
  },undefined,function(err){console.error('Authored lower-city districts failed to load.',url,err);});
}
if(LOW)installAuthoredDistricts('assets/lower-city-districts-authored-v1-lod1.glb',0,'lod1');
else{
  installAuthoredDistricts('assets/lower-city-districts-authored-v1.glb',0,'lod0');
  installAuthoredDistricts('assets/lower-city-districts-authored-v1-lod1.glb',720,'lod1');
}

var worldEntryFx=new THREE.Group();worldEntryFx.visible=false;scene.add(worldEntryFx);
(function(){
  var mat=new THREE.MeshBasicMaterial({color:0x7ce8ff,transparent:true,opacity:.32,depthWrite:false});
  for(var i=0;i<5;i++){var r=new THREE.Mesh(new THREE.TorusGeometry(28+i*12,.8,6,32),mat.clone());r.rotation.x=Math.PI/2;r.userData.phase=i/5;worldEntryFx.add(r);}
})();
function stepWorldDistricts(dt){
  worldDistrictGroup.visible=st.mode==='world';
  var now=performance.now()*.001;
  for(var i=0;i<districtBeacons.length;i++){
    var b=districtBeacons[i],pulse=.62+Math.sin(now*2.2+b.phase)*.22;b.beam.material.opacity=pulse*.34;b.ring.rotation.z+=dt*.16;
  }
  worldEntryFx.visible=!!(worldFlow.active&&worldFlow.transition);
  if(worldEntryFx.visible){
    worldEntryFx.position.copy(player.pos);
    for(var ri=0;ri<worldEntryFx.children.length;ri++){
      var ring=worldEntryFx.children[ri],phase=(worldFlow.transition.t/worldFlow.transition.duration+ring.userData.phase)%1;
      ring.position.y=-70+phase*140;ring.scale.setScalar(.45+phase*1.8);ring.material.opacity=(1-phase)*.34;
    }
  }
}
