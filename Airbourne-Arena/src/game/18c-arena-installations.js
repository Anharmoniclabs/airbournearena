/* ===================== arena masterplan and skycity landing zones =====================
   Three things live up here, all from the generated art drop.

   The masterplan is the authored Airbourne Arena layout — the skyway circuit,
   the neon navigation rings and the connecting bridges — hung across the middle
   of the flight band at 1.4 km so it is the thing you fly through rather than
   scenery you fly past. Nothing in it is solid: world collision in this game is
   the terrain height field and nothing else, and adding a mesh collider for a
   3.6 km structure would cost more per frame than the whole flight model.

   The two forward airbases are the west and east Skycities. Open World begins
   on their measured flight decks, while a run between the team bases at z=0
   still passes them rather than through them. Each is dressed with generated
   turrets, cargo and an attached tower so it reads as an aerial village rather
   than a parked prop. The marked central pad remains clear for the player.

   Everything is a THREE.LOD with an authored -lod1 variant. These are the
   largest meshes in the game and they are all visible at once from altitude. */
var SKYCITY_DECK_HEIGHT=50,SKYCITY_DECK_REACH=175,SKYCITY_WALK_REACH=150;
var ARENA_INSTALLATIONS=[
  {id:'westhaven',name:'WESTHAVEN SKYCITY',x:-1600,y:760,z:-1450,rot:.42},
  {id:'eastwatch',name:'EASTWATCH SKYCITY',x:1600,y:760,z:1450,rot:-2.24}
];
var arenaMasterplan=null,arenaAirbases=[];

function openWorldSkycityForFaction(faction){
  var installation=ARENA_INSTALLATIONS[faction==='inferno'?1:0];
  return {installation:installation,name:installation.name,
    position:new THREE.Vector3(installation.x,installation.y+SKYCITY_DECK_HEIGHT,installation.z),
    heading:installation.rot};
}
function skycityLocalPoint(x,z,installation){
  var dx=x-installation.x,dz=z-installation.z,c=Math.cos(installation.rot),s=Math.sin(installation.rot);
  return {x:dx*c-dz*s,z:dx*s+dz*c};
}
function skycityDeckAt(x,z){
  for(var i=0;i<ARENA_INSTALLATIONS.length;i++){
    var installation=ARENA_INSTALLATIONS[i],local=skycityLocalPoint(x,z,installation);
    if(Math.abs(local.x)<=SKYCITY_DECK_REACH&&Math.abs(local.z)<=SKYCITY_DECK_REACH)
      return {height:installation.y+SKYCITY_DECK_HEIGHT,surface:'skycity',installation:installation};
  }
  return null;
}
function clampToSkycityDeck(point,installation){
  if(!installation)return;
  var local=skycityLocalPoint(point.x,point.z,installation),c=Math.cos(installation.rot),s=Math.sin(installation.rot);
  local.x=clamp(local.x,-SKYCITY_WALK_REACH,SKYCITY_WALK_REACH);
  local.z=clamp(local.z,-SKYCITY_WALK_REACH,SKYCITY_WALK_REACH);
  point.x=installation.x+local.x*c+local.z*s;
  point.z=installation.z-local.x*s+local.z*c;
}

function installLod(host,url,lodUrl,distance){
  afterBoot(function(){
    loadGeneratedArt(url,function(model){host.addLevel(model,0);host.userData.ready++;});
    loadGeneratedArt(lodUrl,function(model){host.addLevel(model,distance);});
  });
}
(function buildArenaMasterplan(){
  var host=new THREE.LOD();host.name='airbourne arena masterplan';
  host.position.set(0,1400,0);host.userData.ready=0;
  /* The circuit is read from kilometres away and never walked on, so it takes
     no shadow work at all — a 3.6 km caster would swamp the flight shadow map
     the same way the world batches do (see 16-authored-world.js). */
  installLod(host,'assets/airbourne-arena-map-v1.glb',
                  'assets/airbourne-arena-map-v1-lod1.glb',LOW?2600:5200);
  host.traverse(function(o){if(o.isMesh)o.castShadow=false;});
  scene.add(host);arenaMasterplan=host;
})();

(function buildForwardAirbases(){
  ARENA_INSTALLATIONS.forEach(function(spot,index){
    var host=new THREE.LOD();host.name='forward airbase '+(index+1);
    host.position.set(spot.x,spot.y,spot.z);host.rotation.y=spot.rot;
    host.userData.ready=0;
    installLod(host,'assets/sky-base-platform-v1.glb',
                    'assets/sky-base-platform-v1-lod1.glb',LOW?900:1800);
    var tower=new THREE.LOD();tower.userData.ready=0;
    /* The platform deck is +50 m from its origin. Attach the tower outside the
       central helipad, sunk into the port edge, so it builds the village
       silhouette without occupying the Open World spawn. */
    tower.position.set(-250,-70,0);
    installLod(tower,'assets/arena-tower-v1.glb',
                     'assets/arena-tower-v1-lod1.glb',LOW?900:1800);
    host.add(tower);

    /* Deck furniture stays outside the 115 m marked landing circle and sits on
       the measured +50 m deck instead of being buried inside the platform. */
    [[-170,125],[170,125],[-170,-125],[170,-125]].forEach(function(at,i){
      afterBoot(function(){loadGeneratedArt('assets/arena-turret-v1.glb',function(turret){
        turret.position.set(at[0],SKYCITY_DECK_HEIGHT+1,at[1]);
        turret.rotation.y=i*Math.PI*.5+.4;
        turret.scale.setScalar(4.5);
        host.add(turret);
      });});
    });
    [[135,95,'crate'],[143,95,'crate'],[139,85,'ammo'],[-135,100,'crate'],[-145,92,'ammo']]
      .forEach(function(at){
        afterBoot(function(){
        loadGeneratedArt(at[2]==='crate'?'assets/arena-crate-v1.glb':'assets/arena-ammo-box-v1.glb',
          function(box){
            box.position.set(at[0],SKYCITY_DECK_HEIGHT+.4,at[1]);
            box.rotation.y=hash(at[0],at[1])*3.1;
            box.scale.setScalar(4.5);
            host.add(box);
          });});
      });

    var beacon=new THREE.PointLight(0x8fd0ff,LOW?.9:1.8,900);
    beacon.position.set(0,60,0);host.add(beacon);
    scene.add(host);arenaAirbases.push(host);
  });
})();
