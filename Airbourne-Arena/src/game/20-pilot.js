/* ===================== pilot profile =====================
   Who you signed with and what your aircraft looks like, kept across sessions.
   The hangar writes it, the match reads it, and nothing else in the game needs
   to know the player is not simply blue slot zero any more. */
var LIVERIES=[
  {id:'standard', name:'STANDARD',   hull:0xe9edf0},
  {id:'nightwash',name:'NIGHT WASH', hull:0x77828e},
  {id:'desert',   name:'DESERT',     hull:0xd8c193},
  {id:'oxide',    name:'OXIDE',      hull:0xb08268}];
var ACCENTS=[0x4fc3ff,0xff6b5e,0xffb347,0x6fe3d0,0xc48cff,0xf2f5f7];
/* `team` is which of the two Arena Core flights you launch with — the league
   card is Vanguard West against Inferno East and always has been. `faction` is
   who you actually fly for, which the story needs to be one of three: the
   Tempest trial in Chapter 1 was previously unwinnable in the sense that
   mattered, because signing on afterwards could only ever record Vanguard or
   Inferno. Tempest field no Arena card of their own, so their pilots take the
   west flight as guests — which is what the league does in the fiction. */
var PILOT={team:'blue',faction:null,callsign:'YOU',livery:'standard',accent:0,
  trim:0,signed:false};
var FACTION_SIDE={vanguard:'blue',tempest:'blue',inferno:'red'};
function factionKey(){
  /* An unsigned pilot still has an arena colour, and Chapter 1 hands out
     reputation before Mission 7 has been flown, so this has to answer even
     when no team has been chosen yet. */
  return PILOT.faction||(PILOT.team==='red'?'inferno':'vanguard');
}
function setFaction(f){
  if(!FACTION_SIDE[f])return;
  PILOT.faction=f; PILOT.team=FACTION_SIDE[f]; PILOT.signed=true;
}
function livery(id){
  for(var i=0;i<LIVERIES.length;i++)if(LIVERIES[i].id===id)return LIVERIES[i];
  return LIVERIES[0];
}
function loadPilot(){
  try{
    var raw=localStorage.getItem('airbourne:pilot');
    if(!raw)return;
    var p=JSON.parse(raw);
    if(p.team==='blue'||p.team==='red')PILOT.team=p.team;
    if(FACTION_SIDE[p.faction]){PILOT.faction=p.faction;PILOT.team=FACTION_SIDE[p.faction];}
    if(typeof p.callsign==='string'&&p.callsign)PILOT.callsign=p.callsign.slice(0,10).toUpperCase();
    if(typeof p.livery==='string')PILOT.livery=livery(p.livery).id;
    if(typeof p.accent==='number')PILOT.accent=clamp(p.accent|0,0,ACCENTS.length-1);
    if(typeof p.trim==='number')PILOT.trim=clamp(p.trim,-1,1);
    PILOT.signed=!!p.signed;
  }catch(err){}
}
function savePilot(){
  try{localStorage.setItem('airbourne:pilot',JSON.stringify(PILOT));}catch(err){}
}
loadPilot();
function foeOf(team){return team==='blue'?'red':'blue';}
var _rsTo=new THREE.Vector3(),_rsFwd=new THREE.Vector3();

/* Per-slot skill, so a flight reads as four individual pilots rather than one
   AI pasted four times. Difficulty then scales the opposition on top. */
var PILOT_SKILL=[0.74,0.96,0.85,1.07];
var DIFF=[{name:'ROOKIE', aim:0.80,react:0.55,aggro:0.72,lead:0.70},
          {name:'REGULAR',aim:1.00,react:1.00,aggro:1.00,lead:1.00},
          {name:'ACE',    aim:1.14,react:1.45,aggro:1.26,lead:1.10}];
function aiSkill(f){
  var d=DIFF[clamp(cfg.diff|0,0,2)];
  var base=PILOT_SKILL[f.slot]||1;
  /* Difficulty is about the opposition. Your own wingmen hold steady so that
     turning it down does not quietly nerf your side of the fight as well. */
  var foe=f.team==='red';
  var aim=base*(foe?d.aim:1);
  return {
    spread:clamp(.0195/aim,.0034,.030),   /* the honest difficulty lever */
    lead:foe?d.lead:1,                    /* under-leading is why rookies miss */
    react:base*(foe?d.react:1),
    aggro:base*(foe?d.aggro:1)
  };
}

var authoredPlaneTemplate=null,authoredPlaneLod1Template=null,authoredPlaneHosts=[];
function styleAuthoredPlane(model,team,isPlayer){
  var hullMaterial=null;
  model.traverse(function(o){
    if(!o.isMesh||!o.material)return;
    o.castShadow=true;o.receiveShadow=true;
    o.material=o.material.clone();
    var name=o.material.name||'';
    if(name.indexOf('Vanguard ceramic armor')>=0||
       name.indexOf('Vanguard clean ceramic armor')>=0){
      /* Preserve the generated micro-panel albedo on broad skin while tinting
         the physical ceramic response per faction. The clean ceramic meshes
         remain texture-free so the silhouette does not dissolve into noise. */
      o.material.color.setHex(isPlayer?0xe2e7e9:(team==='blue'?0xd3e0e5:0xe0d0cc));
      o.material.metalness=.48;o.material.roughness=.34;
      if(o.material.emissive){
        o.material.emissive.setHex(0x111820);o.material.emissiveIntensity=.10;
      }
      o.material.needsUpdate=true;
      hullMaterial=o.material;
    }else if(name.indexOf('Vanguard cobalt armor')>=0){
      o.material.color.setHex(TEAM_COL[team]);
      if(o.material.emissive){
        o.material.emissive.setHex(TEAM_COL[team]);o.material.emissiveIntensity=.18;
      }
    }else if(name.indexOf('Vanguard energy channel')>=0){
      o.material.color.setHex(0xbfeeff);o.material.emissive.setHex(TEAM_COL[team]);
      o.material.emissiveIntensity=3.2;
    }else if(name.indexOf('Graphite mechanical structure')>=0||
             name.indexOf('Engine interior')>=0){
      o.material.color.setHex(0x18212b);o.material.metalness=.74;o.material.roughness=.28;
    }else if(name.indexOf('Heat shield metal')>=0){
      o.material.color.setHex(0x56616d);o.material.metalness=.88;o.material.roughness=.27;
    }
  });
  return hullMaterial;
}
function installAuthoredPlaneLod1(host,team,isPlayer){
  var lod=host.userData.authoredPlane;
  if(!lod||!authoredPlaneLod1Template||host.userData.authoredPlaneLod1)return;
  var farModel=authoredPlaneLod1Template.clone(true);
  styleAuthoredPlane(farModel,team,isPlayer);
  lod.addLevel(farModel,260);
  host.userData.authoredPlaneLod1=farModel;
}
function installAuthoredPlane(host,team,isPlayer){
  if(!authoredPlaneTemplate||host.userData.authoredPlane)return;
  (host.userData.legacyParts||[]).forEach(function(part){part.visible=false;});
  var model=authoredPlaneTemplate.clone(true);
  var hullMaterial=styleAuthoredPlane(model,team,isPlayer);
  var lod=new THREE.LOD();
  lod.name='Vanguard Interceptor runtime LOD';
  lod.addLevel(model,0);
  host.add(lod);host.userData.authoredPlane=lod;
  installAuthoredPlaneLod1(host,team,isPlayer);
  if(hullMaterial)host.userData.hull=hullMaterial;
}
makeGltfLoader().load('assets/vanguard-interceptor-v4.glb',function(gltf){
  authoredPlaneTemplate=gltf.scene;
  for(var i=0;i<authoredPlaneHosts.length;i++){
    var h=authoredPlaneHosts[i];installAuthoredPlane(h.host,h.team,h.isPlayer);
  }
},undefined,function(err){console.error('Vanguard Interceptor LOD0 failed to load.',err);});
makeGltfLoader().load('assets/vanguard-interceptor-v4-lod1.glb',function(gltf){
  authoredPlaneLod1Template=gltf.scene;
  for(var i=0;i<authoredPlaneHosts.length;i++){
    var h=authoredPlaneHosts[i];
    installAuthoredPlane(h.host,h.team,h.isPlayer);
    installAuthoredPlaneLod1(h.host,h.team,h.isPlayer);
  }
},undefined,function(err){console.error('Vanguard Interceptor LOD1 failed to load.',err);});

function buildPlane(team,isPlayer){
  var g=new THREE.Group();
  /* One physical airframe is used in the hangar, the match and every camera.
     Earlier builds covered the flight model with a top-down PNG, which made
     the aircraft collapse into a card as soon as the camera moved off-axis.
     Generated 4K surface atlases now wrap the actual Kestrel/faction geometry. */
  var factionSurface=team==='blue'?vanguardSkin:infernoSkin;
  var hull=new THREE.MeshPhongMaterial({map:isPlayer?kestrelSkin:factionSurface,
    color:isPlayer?0xffffff:0xe9edf0,shininess:68,flatShading:false});
  var trim=teamMat(team,new THREE.MeshPhongMaterial({
    map:isPlayer?kestrelSkin:factionSurface,color:TEAM_COL[team],shininess:52,flatShading:false}));
  /* Black Wing's generated surface is reserved for its own later drone family;
     using it for every landing rail and intake leaked the antagonist identity
     into the player's starting Kestrel. */
  var dark=new THREE.MeshPhongMaterial({map:aviationHardwareSkin,
    color:0x69727b,shininess:28,flatShading:true});
  var glass=new THREE.MeshPhongMaterial({color:0x70c7ea,emissive:0x071b29,
    shininess:145,transparent:true,opacity:.72});

  /* Smooth lofted fuselage: elliptical stations define one continuous shell
     from radome to exhaust deck, with shared normals and cylindrical UVs. */
  function loftBody(stations,radial,mat){
    var pp=[],uv=[],ii=[];
    for(var s=0;s<stations.length;s++){
      var S=stations[s];
      for(var r=0;r<radial;r++){
        var a=r/radial*Math.PI*2;
        pp.push(Math.cos(a)*S[1],Math.sin(a)*S[2]+S[3],S[0]);
        uv.push(r/radial,s/(stations.length-1));
      }
    }
    for(var z=0;z<stations.length-1;z++)for(var j=0;j<radial;j++){
      var nj=(j+1)%radial,a0=z*radial+j,a1=z*radial+nj,
          b0=(z+1)*radial+j,b1=(z+1)*radial+nj;
      ii.push(a0,b0,a1,a1,b0,b1);
    }
    var bg=new THREE.BufferGeometry();
    bg.setAttribute('position',new THREE.Float32BufferAttribute(pp,3));
    bg.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    bg.setIndex(ii);bg.computeVertexNormals();
    var mesh=new THREE.Mesh(bg,mat);g.add(mesh);return mesh;
  }
  loftBody([[-6.25,.05,.05,0],[-5.75,.38,.30,.02],[-4.65,.72,.58,.05],
    [-2.8,1.03,.78,.08],[-.4,1.08,.72,.03],[2.0,.92,.62,0],
    [4.15,.70,.52,0],[4.8,.48,.40,0]],24,hull);
  var cp=new THREE.Mesh(new THREE.SphereGeometry(.84,24,14),glass);
  cp.scale.set(1,.62,1.85);cp.position.set(0,.68,-1.65);g.add(cp);

  /* swept lifting surfaces: real silhouette from every view, not a rectangle */
  function surface(points,mat,y,thickness){
    var sh=new THREE.Shape();
    sh.moveTo(points[0][0],points[0][1]);
    for(var si=1;si<points.length;si++)sh.lineTo(points[si][0],points[si][1]);
    sh.closePath();
    thickness=thickness||.16;
    var geo=new THREE.ExtrudeGeometry(sh,{depth:thickness,bevelEnabled:true,
      bevelSegments:1,bevelSize:.045,bevelThickness:.045,curveSegments:2});
    geo.translate(0,0,-thickness*.5);
    var m=new THREE.Mesh(geo,mat);
    m.rotation.x=Math.PI/2;m.position.y=y;m.material.side=THREE.DoubleSide;g.add(m);return m;
  }
  surface([[-.45,-2.3],[-7.15,.15],[-6.15,1.55],[-1.0,1.05],
           [1.0,1.05],[6.15,1.55],[7.15,.15],[.45,-2.3]],hull,.12,.24);
  surface([[-.45,2.2],[-3.25,3.75],[-3.0,4.55],[0,3.85],
           [3.0,4.55],[3.25,3.75],[.45,2.2]],hull,.18,.20);
  surface([[-6.7,.15],[-4.7,.78],[4.7,.78],[6.7,.15],[4.8,-.2],[-4.8,-.2]],trim,.28,.10);

  /* twin engine nacelles, intakes and exhaust cans */
  [-2.05,2.05].forEach(function(x){
    var pod=new THREE.Mesh(new THREE.CylinderGeometry(.5,.63,4.45,20),hull);
    pod.rotation.x=Math.PI/2;pod.position.set(x,-.03,1.05);g.add(pod);
    var intake=new THREE.Mesh(new THREE.TorusGeometry(.53,.12,10,24),dark);
    intake.position.set(x,-.03,-1.18);g.add(intake);
    var can=new THREE.Mesh(new THREE.CylinderGeometry(.43,.53,.7,20),dark);
    can.rotation.x=Math.PI/2;can.position.set(x,-.03,3.48);g.add(can);
  });

  /* tail, control surfaces and visible armament hardpoints */
  var tv=new THREE.Mesh(new THREE.BoxGeometry(.18,2.25,2.15),trim);
  tv.position.set(0,1.15,3.05);tv.rotation.x=-.18;g.add(tv);
  [-4.25,4.25].forEach(function(x){
    var rail=new THREE.Mesh(new THREE.CylinderGeometry(.1,.14,2.35,6),dark);
    rail.rotation.x=Math.PI/2;rail.position.set(x,-.18,.55);g.add(rail);
    var tip=new THREE.Mesh(new THREE.ConeGeometry(.14,.48,6),dark);
    tip.rotation.x=-Math.PI/2;tip.position.set(x,-.18,-.86);g.add(tip);
  });
  var gun=new THREE.Mesh(new THREE.CylinderGeometry(.075,.075,1.8,6),dark);
  gun.rotation.x=Math.PI/2;gun.position.set(.34,-.08,-5.35);g.add(gun);
  /* Cockpit framing, dorsal avionics and paired under-wing stores add readable
     scale in the hangar and a distinct silhouette during close passes. */
  [-.72,.72].forEach(function(x){
    var frame=new THREE.Mesh(new THREE.BoxGeometry(.055,.07,2.5),dark);
    frame.position.set(x*.58,.94,-1.5);frame.rotation.x=-.08;g.add(frame);
  });
  var avionics=new THREE.Mesh(new THREE.BoxGeometry(.72,.28,1.35),dark);
  avionics.position.set(0,.48,2.15);g.add(avionics);
  [-3.2,3.2].forEach(function(x){
    var store=new THREE.Mesh(new THREE.CylinderGeometry(.15,.20,2.2,8),dark);
    store.rotation.x=Math.PI/2;store.position.set(x,-.34,.85);g.add(store);
    var nose=new THREE.Mesh(new THREE.ConeGeometry(.15,.55,8),trim);
    nose.rotation.x=-Math.PI/2;nose.position.set(x,-.34,-.52);g.add(nose);
  });
  /* Everything constructed above is a load-error fallback. Once Blender's GLB
     arrives, these parts are hidden as a unit while gameplay, exhausts,
     beacons and collision state remain attached to the stable host group. */
  g.userData.legacyParts=g.children.slice();
  var exhausts=[];
  [-1.65,1.65].forEach(function(x){
    var ex=new THREE.Sprite(teamMat(team,new THREE.SpriteMaterial({
      map:softSprite('rgba(255,255,255,.98)','rgba(80,180,255,.42)'),
      color:TEAM_COL[team],transparent:true,depthWrite:false,fog:false,
      opacity:.36,blending:THREE.AdditiveBlending})));
    ex.position.set(x,.05,5.3);ex.scale.set(1.35,3.10,1);g.add(ex);exhausts.push(ex);
  });
  g.userData.exhausts=exhausts;
  var bea=new THREE.Sprite(new THREE.SpriteMaterial({map:softSprite('rgba(255,255,255,.9)','rgba(255,255,255,0)'),
    color:TEAM_COL[team],transparent:true,depthWrite:false,fog:false,blending:THREE.AdditiveBlending}));
  /* Identification light, not a substitute silhouette. At 26 units the
     additive sprite was wider than the authored aircraft and the bloom pass
     turned normal flight into a white disc with wings. */
  bea.scale.set(16,16,1); g.add(bea); g.userData.beacon=bea;
  /* kept so fit-out repaints this exact shared material across every physical
     hull panel without changing the faction texture or any other aircraft */
  g.userData.hull=hull; g.userData.trim=trim;
  g.userData.factionSurface=factionSurface;
  authoredPlaneHosts.push({host:g,team:team,isPlayer:isPlayer});
  installAuthoredPlane(g,team,isPlayer);
  scene.add(g); return g;
}
function makeFighter(team,idx,isPlayer){
  var f={team:team,slot:idx,name:NAMES[team][idx],isPlayer:!!isPlayer,mesh:buildPlane(team,isPlayer),
    vel:new THREE.Vector3(),speed:0,alpha:0,gLoad:1,stalled:false,
    hp:100,alive:true,respawnT:0,invuln:3,throttle:.8,cannonCd:0,
    kills:0,caps:0,carrying:false,aiJink:0,boundT:0,spread:.0105,
    roll:{t:0,dir:0,cd:0},evade:0,lastSeen:null,lastSeenT:0,
    dmgEng:0,dmgAil:0,ailSign:1,strike:null,strikeTarget:null,strikeT:0,ceilT:0};
  f.pos=f.mesh.position; f.quat=f.mesh.quaternion;
  respawnFighter(f,true); fighters.push(f); return f;
}
function respawnFighter(f,instant){
  if(f.isPlayer&&typeof burner!=='undefined'){burner.fuel=1;burner.lit=false;burner.cool=0;}
  f.abRamp=0;
  /* launch line abreast off your own base, nose already pointed at midfield */
  var b=BASES[f.team];
  var lane=(f.slot-1.5)*105;
  f.pos.set(b.x+rnd(-30,30), b.y+f.slot*26-40, b.z+lane);
  /* Object3D.lookAt aims +Z at the target for a mesh, but the flight model
     flies down -Z, so aiming at midfield launched every aircraft on both teams
     facing away from the fight — on the opening launch and on every respawn.
     Build the orientation from the forward vector we actually want. */
  _rsTo.set(0,f.pos.y,f.pos.z*0.30).sub(f.pos).normalize();
  f.mesh.quaternion.setFromUnitVectors(_rsFwd.set(0,0,-1),_rsTo);
  var fwd=new THREE.Vector3(0,0,-1).applyQuaternion(f.quat);
  f.vel.copy(fwd).multiplyScalar(185);
  f.speed=185; f.hp=100; f.alive=true; f.throttle=.85; f.invuln=instant?2:3;
  f.mesh.visible=true; f.carrying=false; f.boundT=0; f.stalled=false;
  f.dmgEng=0; f.dmgAil=0;      /* a fresh airframe is a repaired airframe */
  f.strike=null; f.strikeTarget=null; f.strikeT=0; f.ceilT=0;
}
