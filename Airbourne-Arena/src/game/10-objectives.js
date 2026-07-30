/* ===================== goals, bases, core ===================== */
/* Blue against red is the worst pair for the two most common kinds of colour
   blindness. Blue against amber survives all three, so the whole arena can be
   recoloured at runtime rather than adding shape badges to everything. */
/* Story canon names the three Arena League teams Vanguard, Tempest and Inferno
   (STORY-BIBLE §7). An Arena Core match is fought between two of them, and the
   palette decides which two this one is: Vanguard is blue/white/cyan, Inferno
   is red/black/heated orange. 'blue' and 'red' stay as the internal keys — they
   index every mesh, base, goal and material list in the file — and FACTION is
   the display name everywhere a pilot can read it. Tempest (teal) joins when
   the match supports a third flight. */
var FACTION={blue:'VANGUARD',red:'INFERNO',
  vanguard:'VANGUARD',tempest:'TEMPEST',inferno:'INFERNO'};
function factionName(team){return FACTION[team]||String(team).toUpperCase();}
var TEAM_BASE={blue:0x4fc3ff,red:0xff6b5e},TEAM_CB={blue:0x4aa8ff,red:0xffa32e};
/* blackwing is not a league side and never repaints with the palette, but it
   has to be in here: a drone that kills you goes through tag(), which reads
   this map to colour the name in the feed. */
var TEAM_COL={blue:0x4fc3ff,red:0xff6b5e,blackwing:0xb98cff};
var teamMats={blue:[],red:[]};
function teamMat(team,mat){teamMats[team].push(mat);return mat;}
function teamHex(team){return '#'+('00000'+TEAM_COL[team].toString(16)).slice(-6);}
function applyTeamPalette(){
  var src=cfg.cb?TEAM_CB:TEAM_BASE;
  TEAM_COL.blue=src.blue; TEAM_COL.red=src.red;
  ['blue','red'].forEach(function(t){
    for(var i=0;i<teamMats[t].length;i++)teamMats[t][i].color.setHex(TEAM_COL[t]);
  });
}

var goalVisuals=[];
function buildGoal(team){
  var g=new THREE.Group();
  var ring=new THREE.Mesh(new THREE.TorusGeometry(GOAL_R,5,8,44),
    teamMat(team,new THREE.MeshBasicMaterial({color:TEAM_COL[team],transparent:true,opacity:.55})));
  ring.rotation.x=Math.PI/2; g.add(ring);
  /* Do not fill the scoring volume with a transparent cylinder. From inside
     or above it, the near faces cover half the viewport like a colored wall. */
  /* A former square portal card became a kilometer-wide translucent box when
     viewed from above. The torus is the goal silhouette from every angle and
     the light cylinder supplies depth, so no camera-facing texture is needed. */
  goalVisuals.push(ring);
  g.position.copy(GOALS[team]); scene.add(g); return g;
}
var goalGroups={blue:buildGoal('blue'),red:buildGoal('red')};

/* ===================== late-round escalation =====================
   The ring closes over the last ninety seconds. A stalemate cannot be ridden
   out on the approach that worked in the opening minute, and the defenders
   get a smaller box to cover in exchange — so the endgame reads differently
   from the midgame without changing a single rule. `goalR` is the live radius
   everything else scores and draws against; GOAL_R stays the built size. */
var GOAL_CLOSE=90,GOAL_MIN=0.62,goalR=GOAL_R;
function stepGoalRings(dt){
  var k=clamp((GOAL_CLOSE-st.time)/GOAL_CLOSE,0,1);
  var scale=1-(1-GOAL_MIN)*k;
  goalR=GOAL_R*scale;
  /* x/z only: the ring narrows, it does not get shorter */
  goalGroups.blue.scale.set(scale,1,scale);
  goalGroups.red.scale.set(scale,1,scale);
  if(k>0&&!st.ringWarned&&!st.over){st.ringWarned=true;banner('RINGS CLOSING',1.6);}
}

/* --- home bases: four aircraft launch from each, facing midfield --- */
function buildBase(team){
  var p=BASES[team], gy=ground(p.x,p.z), side=(team==='blue'?1:-1);
  var deck=new THREE.MeshPhongMaterial({map:airbaseDeckSkin,
    color:team==='blue'?0xa6c7d5:0xd2aaa3,shininess:8,flatShading:true});
  var wall=new THREE.MeshPhongMaterial({map:hangarSkin,color:0xb8bec0,shininess:10,flatShading:true});
  var roof=new THREE.MeshPhongMaterial({map:cityRoofSkin,
    color:team==='blue'?0xa9c6d8:0xd0aaa6,shininess:12,flatShading:true});
  var dark=new THREE.MeshPhongMaterial({map:aviationHardwareSkin,
    color:0x7f8993,shininess:20,flatShading:true});
  var tankMat=new THREE.MeshPhongMaterial({map:industrialSkin,color:0xffffff,shininess:24});
  function put(mesh,x,y,z){mesh.position.set(p.x+x,gy+y,p.z+z);scene.add(mesh);return mesh;}

  put(new THREE.Mesh(new THREE.CylinderGeometry(215,240,10,32),deck),0,5,0);
  /* The airstrip art is a circular pad drawn inside a square image, and the
     deck it lands on is 215 across, so read back the inscribed circle: a
     square plane of the same half-width would hang its corners 64 out past
     the rim with nothing under them. The runway runs the full diameter along
     the image's horizontal, which is the base-to-midfield axis. */
  var pad=new THREE.Mesh(new THREE.CircleGeometry(215,48),
    new THREE.MeshBasicMaterial({map:airstripSkin[team],
      color:0xffffff,side:THREE.DoubleSide}));
  pad.rotation.x=-Math.PI/2;
  put(pad,0,10.7,0);
  /* two hangars */
  [-118,118].forEach(function(dz){
    put(new THREE.Mesh(new THREE.BoxGeometry(46,20,30),wall),side*-60,20,dz);
    put(new THREE.Mesh(new THREE.BoxGeometry(50,4,34),roof),side*-60,31,dz);
  });
  [-1,1].forEach(function(rz){
    put(new THREE.Mesh(new THREE.CylinderGeometry(15,15,24,20),tankMat),side*128,17,rz*92);
    put(new THREE.Mesh(new THREE.CylinderGeometry(10,10,18,18),tankMat),side*162,14,rz*72);
  });
  /* control tower */
  put(new THREE.Mesh(new THREE.BoxGeometry(12,46,12),wall),side*70,33,-60);
  put(new THREE.Mesh(new THREE.BoxGeometry(20,8,20),dark),side*70,58,-60);
  /* team beacon so you can find home from across the valley */
  var beaconMat=teamMat(team,new THREE.MeshBasicMaterial({color:TEAM_COL[team],transparent:true,
    opacity:.30,side:THREE.DoubleSide,depthWrite:false}));
  put(new THREE.Mesh(new THREE.CylinderGeometry(6,6,300,10,1,true),beaconMat),0,160,0);
  var halo=new THREE.Sprite(teamMat(team,new THREE.SpriteMaterial({map:softSprite('rgba(255,255,255,.9)','rgba(255,255,255,0)'),
    color:TEAM_COL[team],transparent:true,depthWrite:false,fog:false,blending:THREE.AdditiveBlending})));
  halo.scale.set(120,120,1); put(halo,0,310,0);
}
buildBase('blue'); buildBase('red');

