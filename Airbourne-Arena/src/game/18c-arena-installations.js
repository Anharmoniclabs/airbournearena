/* ===================== arena masterplan and forward airbases =====================
   Three things live up here, all from the generated art drop.

   The masterplan is the authored Airbourne Arena layout — the skyway circuit,
   the neon navigation rings and the connecting bridges — hung across the middle
   of the flight band at 1.4 km so it is the thing you fly through rather than
   scenery you fly past. Nothing in it is solid: world collision in this game is
   the terrain height field and nothing else, and adding a mesh collider for a
   3.6 km structure would cost more per frame than the whole flight model.

   The two forward airbases sit off the base axis, so a run between the team
   bases at z=0 passes them rather than through them. Each is dressed with the
   generated turrets and cargo so it reads as a working installation instead of
   a parked platform, and each carries a tower for a silhouette that survives
   being seen from 3 km out.

   Everything is a THREE.LOD with an authored -lod1 variant. These are the
   largest meshes in the game and they are all visible at once from altitude. */
var ARENA_INSTALLATIONS=[
  {x:-1600,y:760,z:-1450,rot:.42},
  {x:1600,y:760,z:1450,rot:-2.24}
];
var arenaMasterplan=null,arenaAirbases=[];

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
    /* The platform's origin is its centre and it is 460 m deep, so the tower
       goes below the deck to read as the mast it is rising through. */
    tower.position.set(0,-150,0);
    installLod(tower,'assets/arena-tower-v1.glb',
                     'assets/arena-tower-v1-lod1.glb',LOW?900:1800);
    host.add(tower);

    /* Deck furniture. Placed by hand rather than scattered: four gun positions
       on the corners of the pad and the cargo grouped where a deck crew would
       stage it, which is what separates a base from a prop. */
    [[-52,34],[52,34],[-52,-34],[52,-34]].forEach(function(at,i){
      afterBoot(function(){loadGeneratedArt('assets/arena-turret-v1.glb',function(turret){
        turret.position.set(at[0],14,at[1]);
        turret.rotation.y=i*Math.PI*.5+.4;
        turret.scale.setScalar(4.5);
        host.add(turret);
      });});
    });
    [[18,-8,'crate'],[24,-8,'crate'],[21,-14,'ammo'],[-30,12,'crate'],[-34,16,'ammo']]
      .forEach(function(at){
        afterBoot(function(){
        loadGeneratedArt(at[2]==='crate'?'assets/arena-crate-v1.glb':'assets/arena-ammo-box-v1.glb',
          function(box){
            box.position.set(at[0],14,at[1]);
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
