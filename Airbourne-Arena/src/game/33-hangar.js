/* ===================== the hangar =====================
   Everything before the sortie happens here: a room you walk around in rather
   than a menu you click through. Two airframes on the deck, one contract each,
   a board on the back wall with the situation on it. Signing with a side is
   walking up to its aircraft and taking it.

   It renders from its own scene and camera, so nothing in it can disturb the
   match that is already built and waiting behind it.                       */
var hangarScene=new THREE.Scene();
hangarScene.background=new THREE.Color(0x080e15);
hangarScene.fog=new THREE.FogExp2(0x080e15,0.0075);
/* A 72-degree rectilinear lens pulled both aircraft apart at the screen edges
   and made their wings/fuselages look horizontally stretched. The hangar uses
   a more natural walk-around lens; flight keeps its wider action camera. */
var hangarCam=new THREE.PerspectiveCamera(IS_TOUCH?65:58,innerWidth/innerHeight,0.1,700);
var HW=46,HD=34,HH=15;                        /* half width, half depth, height */
var hangarBays={blue:new THREE.Vector3(-17,0,-9),red:new THREE.Vector3(17,0,-9)};
var BOARD_POS=new THREE.Vector3(0,7.1,-33.2);
var MARA_POS=new THREE.Vector3(10,0,-27);

(function buildHangar(){
  var concrete=new THREE.MeshPhongMaterial({
    map:gameTexture('assets/hangar-floor-diffusion-4k-v1.webp',6,4.5),
    color:0xffffff,shininess:4,flatShading:true});
  var wallPanel=new THREE.MeshPhongMaterial({
    map:gameTexture('assets/breakwater-field-surface-diffusion-4k-v1.webp',6,1),
    color:0x9ca3a5,shininess:8,flatShading:true});
  var sidePanel=new THREE.MeshPhongMaterial({
    map:gameTexture('assets/breakwater-field-surface-diffusion-4k-v1.webp',4.5,1),
    color:0x9ca3a5,shininess:8,flatShading:true});
  var roofPanel=new THREE.MeshPhongMaterial({
    map:gameTexture('assets/breakwater-field-surface-diffusion-4k-v1.webp',6,4.5),
    color:0x747c80,shininess:6,flatShading:true});
  var beam=new THREE.MeshPhongMaterial({map:aviationHardwareSkin,
    color:0x58616a,shininess:14,flatShading:true});

  var floor=new THREE.Mesh(new THREE.BoxGeometry(HW*2,.35,HD*2),concrete);
  floor.position.y=-.18;hangarScene.add(floor);
  var roof=new THREE.Mesh(new THREE.BoxGeometry(HW*2,.45,HD*2),roofPanel);
  roof.position.y=HH+.2;hangarScene.add(roof);
  var back=new THREE.Mesh(new THREE.BoxGeometry(HW*2,HH,.55),wallPanel);
  back.position.set(0,HH/2,-HD);hangarScene.add(back);
  [-1,1].forEach(function(s){
    var wall=new THREE.Mesh(new THREE.BoxGeometry(.55,HH,HD*2),sidePanel);
    wall.position.set(s*HW,HH/2,0);hangarScene.add(wall);
  });
  /* roof trusses, which are what actually sell the size of the room */
  for(var t=-3;t<=3;t++){
    var tr=new THREE.Mesh(new THREE.BoxGeometry(HW*2,.7,.7),beam);
    tr.position.set(0,HH-.8,t*9); hangarScene.add(tr);
    [-1,1].forEach(function(s){
      var brace=new THREE.Mesh(new THREE.BoxGeometry(1.2,.42,13),beam);
      brace.position.set(s*HW*.48,HH-3.7,t*9);brace.rotation.z=s*.72;
      hangarScene.add(brace);
    });
  }
  /* Repeated wall ribs, service pipes and a raised maintenance catwalk turn
     the shell into architecture with depth instead of a textured room box. */
  for(var rz=-27;rz<=27;rz+=9)[-1,1].forEach(function(s){
    var rib=new THREE.Mesh(new THREE.BoxGeometry(.9,HH,.85),beam);
    rib.position.set(s*(HW-.7),HH/2,rz);hangarScene.add(rib);
  });
  var pipeMat=new THREE.MeshPhongMaterial({map:aviationHardwareSkin,color:0x8a5a35,shininess:24});
  [-1,1].forEach(function(s){
    var pipe=new THREE.Mesh(new THREE.CylinderGeometry(.24,.24,HD*1.65,10),pipeMat);
    pipe.rotation.x=Math.PI/2;pipe.position.set(s*(HW-1.1),11,0);hangarScene.add(pipe);
    var walkDeck=new THREE.Mesh(new THREE.BoxGeometry(2.6,.22,HD*1.35),beam);
    walkDeck.position.set(s*(HW-2.1),8.2,-3);hangarScene.add(walkDeck);
  });
  /* bay markings and a lamp over each */
  ['blue','red'].forEach(function(tm){
    var b=hangarBays[tm];
    var mark=new THREE.Mesh(new THREE.RingGeometry(11,12.2,44),
      teamMat(tm,new THREE.MeshBasicMaterial({color:TEAM_COL[tm],transparent:true,
        opacity:.34,side:THREE.DoubleSide})));
    mark.rotation.x=-Math.PI/2; mark.position.set(b.x,.04,b.z); hangarScene.add(mark);
    var lamp=new THREE.PointLight(0xfff2d8,1.5,64); lamp.position.set(b.x,HH-2.2,b.z);
    hangarScene.add(lamp);
    var housing=new THREE.Mesh(new THREE.BoxGeometry(6.5,.32,2.1),beam);
    housing.position.set(b.x,HH-1.22,b.z); hangarScene.add(housing);
    var diffuser=new THREE.Mesh(new THREE.PlaneGeometry(5.5,1.25),
      new THREE.MeshBasicMaterial({color:0xd6a45f,transparent:true,opacity:.34,
        side:THREE.DoubleSide}));
    diffuser.rotation.x=Math.PI/2;diffuser.position.set(b.x,HH-1.42,b.z);
    hangarScene.add(diffuser);
  });
  /* barracks end: bunks and lockers down the left wall */
  var bunkMat=new THREE.MeshPhongMaterial({map:readyRoomSkin,color:0x8c9298,shininess:6,flatShading:true});
  var sheetMat=new THREE.MeshPhongMaterial({map:readyRoomSkin,color:0x8995a7,shininess:3,flatShading:true});
  for(var bk=0;bk<4;bk++){
    var z=-24+bk*7;
    for(var tier=0;tier<2;tier++){
      var frame=new THREE.Mesh(new THREE.BoxGeometry(6,.35,2.6),bunkMat);
      frame.position.set(-HW+3.6,1.1+tier*2.2,z); hangarScene.add(frame);
      var mat2=new THREE.Mesh(new THREE.BoxGeometry(5.6,.4,2.3),sheetMat);
      mat2.position.set(-HW+3.6,1.4+tier*2.2,z); hangarScene.add(mat2);
    }
    var locker=new THREE.Mesh(new THREE.BoxGeometry(1.6,5,2.4),bunkMat);
    locker.position.set(-HW+1.2,2.5,z+3.4); hangarScene.add(locker);
  }
  /* Generated board hardware behind live, editable briefing copy. */
  var board=new THREE.Mesh(new THREE.PlaneGeometry(15,15),
    new THREE.MeshBasicMaterial({map:briefingBoardSkin}));
  board.position.copy(BOARD_POS); hangarScene.add(board);
  var bc=document.createElement('canvas'); bc.width=1024; bc.height=1024;
  var bx=bc.getContext('2d');
  bx.fillStyle='#6fe3d0'; bx.font='600 44px ui-monospace,monospace';
  bx.fillText('ARENA LEAGUE — CORE RUN', 64, 175);
  bx.fillStyle='rgba(223,243,255,.62)'; bx.font='400 25px ui-monospace,monospace';
  [ 'Two league flights. One Arena Core adrift at midfield.',
    'Deliver it through the scoring ring in the opposing half.',
    '',
    'THE CORE loses charge while carried. Keep it moving,',
    'pass through pressure, and arrive with charge remaining.',
    '',
    'THE MASTS feed your side its picture of the sky. Lose both and',
    'you are down to your own eyes and eight seconds of memory.',
    '',
    'THE GUNS around each ring belong to whoever owns that half.',
    'Nobody makes the run alone.' ].forEach(function(line,i){
    bx.fillText(line, 52, 258+i*51);
  });
  var boardTex=new THREE.CanvasTexture(bc);
  /* The generated board art carries its own frame, so the copy has to sit
     inside that frame rather than across the whole plane — at full width the
     last two lines fell off the bottom of the panel and onto the wall. */
  var boardCopy=new THREE.Mesh(new THREE.PlaneGeometry(11.7,11.7),
    new THREE.MeshBasicMaterial({map:boardTex,transparent:true,depthWrite:false}));
  boardCopy.position.copy(BOARD_POS);boardCopy.position.z+=.025;hangarScene.add(boardCopy);

  /* Canon faction recruitment displays. Generated materials provide the
     physical identity; live canvas labels keep names and philosophy editable
     without baking unreliable text into image generation. */
  function factionPanel(tex,name,motto,z){
    var display=new THREE.Mesh(new THREE.PlaneGeometry(10.5,11.5),
      new THREE.MeshPhongMaterial({map:tex,color:0xffffff,shininess:28}));
    display.rotation.y=-Math.PI/2;display.position.set(HW-.06,7,z);hangarScene.add(display);
    var lc=document.createElement('canvas');lc.width=768;lc.height=192;
    var lx=lc.getContext('2d');lx.fillStyle='rgba(2,7,12,.82)';lx.fillRect(0,0,768,192);
    lx.fillStyle='#e8f5ff';lx.font='700 56px ui-monospace,monospace';lx.textAlign='center';
    lx.fillText(name,384,74);lx.fillStyle='rgba(223,243,255,.72)';
    lx.font='400 25px ui-monospace,monospace';lx.fillText(motto,384,128);
    var label=new THREE.Mesh(new THREE.PlaneGeometry(9.8,2.45),
      new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(lc),transparent:true}));
    label.rotation.y=-Math.PI/2;label.position.set(HW-.11,3,z);hangarScene.add(label);
  }
  factionPanel(vanguardSkin,'VANGUARD','NO ONE SURVIVES ALONE',-20);
  factionPanel(tempestSkin,'TEMPEST','THE SKY BELONGS TO THOSE WHO MOVE',0);
  factionPanel(infernoSkin,'INFERNO','STRENGTH PREVENTS SURRENDER',20);

  /* The open end. Without something bright behind you the room reads as a
     sealed box and you lose all sense of which way the flight line is. */
  var doorGlow=new THREE.Mesh(new THREE.PlaneGeometry(HW*2-14,HH-2),
    new THREE.MeshBasicMaterial({color:0x9ec7e8,fog:false}));
  doorGlow.position.set(0,(HH-2)/2,HD-.4); doorGlow.rotation.y=Math.PI;
  hangarScene.add(doorGlow);
  [-1,1].forEach(function(s){
    var jamb=new THREE.Mesh(new THREE.BoxGeometry(7,HH,1.2),sidePanel);
    jamb.position.set(s*(HW-3.5),HH/2,HD-.4); hangarScene.add(jamb);
  });
  var lintel=new THREE.Mesh(new THREE.BoxGeometry(HW*2,2,1.2),wallPanel);
  lintel.position.set(0,HH-1,HD-.4); hangarScene.add(lintel);

  hangarScene.add(new THREE.AmbientLight(0x4d5866,.85));
  var doorLight=new THREE.DirectionalLight(0xbcd9f2,.7);
  doorLight.position.set(0,10,40); hangarScene.add(doorLight,doorLight.target);
})();
makeGltfLoader().load(
  'assets/breakwater-hangar-detail-authored-v1.glb',
  function(gltf){
    calibrateAuthoredEnvironment(gltf.scene,true);
    hangarScene.add(gltf.scene);
  },undefined,function(err){console.error('Authored Breakwater hangar failed to load.',err);}
);

