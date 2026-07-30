/* ===================== mission entities =====================
   Two primitives cover every Chapter 1 objective: a ring you fly through, and
   a simple aircraft that is either hostile, passive cargo, or a rival. They
   reuse the drone entity already built for the Blackout rather than adding a
   third kind of flying thing. */
var gates=[],convoy=[];
function makeGate(x,y,z,r){
  var g=new THREE.Mesh(new THREE.TorusGeometry(r||60,3.2,8,32),
    new THREE.MeshBasicMaterial({color:0x6fe3d0,transparent:true,opacity:.55}));
  g.position.set(x,y,z); scene.add(g);
  var glow=new THREE.Sprite(new THREE.SpriteMaterial({
    map:softSprite('rgba(111,227,208,.9)','rgba(111,227,208,0)'),
    transparent:true,depthWrite:false,fog:false,blending:THREE.AdditiveBlending}));
  glow.scale.set((r||60)*2.6,(r||60)*2.6,1); g.add(glow);
  var o={mesh:g,pos:g.position,r:r||60,passed:false};
  gates.push(o); return o;
}
function clearGates(){
  for(var i=0;i<gates.length;i++){scene.remove(gates[i].mesh);disposeSubtree(gates[i].mesh);}
  gates.length=0;
  gateNext=null; sweep.has=false;
}
/* The nearest checkpoint still owed, kept here so the objective panel and the
   minimap can both point at the same one. */
var gateNext=null;
/* Last frame's player position, for the swept test below. `has` is false for
   the first frame after a mission starts, because the aircraft is teleported to
   its start point then and a segment drawn from wherever it used to be would
   sweep across the whole map and trip every ring at once. */
var sweep={has:false,p:new THREE.Vector3()};
var _sgA=new THREE.Vector3(),_sgB=new THREE.Vector3();
/* Did the path from a to b pass within r of c? */
function segNear(a,b,c,r){
  _sgA.copy(b).sub(a);
  var L2=_sgA.lengthSq();
  var t=L2<1e-9?0:clamp(_sgB.copy(c).sub(a).dot(_sgA)/L2,0,1);
  _sgB.copy(a).addScaledVector(_sgA,t);
  return _sgB.distanceTo(c)<r;
}
function stepGates(dt){
  if(!gates.length){gateNext=null;return;}
  /* Checkpoints are counted in any order.

     They used to be a strict chain — ring N did nothing until ring N-1 had been
     flown — with no marker saying which one was live. The first mission's five
     rings zig-zag either side of the run in, so taking them out of order is the
     normal outcome rather than an edge case, and the result was a lap that
     could not be completed and a panel that never changed to explain why.
     Anybody who flies through every ring has done the job; the order they did
     it in was never what the objective was about. */
  var best=null,bd=Infinity;
  for(var i=0;i<gates.length;i++){
    var g=gates[i];
    if(g.passed)continue;
    var d=player.pos.distanceTo(g.pos);
    if(d<bd){bd=d;best=g;}
  }
  gateNext=best;
  for(var j=0;j<gates.length;j++){
    var gj=gates[j];
    gj.mesh.rotation.z+=dt*.5;
    /* the one you are going for is bright and pulses; the rest are visible but
       plainly secondary, so "which ring next" is answerable at a glance */
    gj.mesh.material.opacity=gj.passed?.10
      :(gj===gateNext?.62+Math.sin(performance.now()*.006)*.28:.26);
    var s=gj===gateNext?1.06+Math.sin(performance.now()*.006)*.05:1;
    gj.mesh.scale.setScalar(s);
    if(gj.passed||!player.alive)continue;
    /* Swept, not sampled. A point test only asks where the aircraft happens to
       be on each frame; at 300 m/s a slow frame steps far enough to land on
       both sides of a 70 m ring without ever being inside it, and a checkpoint
       you flew through but did not get credit for is unrecoverable. */
    var hit=sweep.has?segNear(sweep.p,player.pos,gj.pos,gj.r)
                     :player.pos.distanceTo(gj.pos)<gj.r;
    if(hit){
      gj.passed=true;
      stingSfx([880,1170],.10);
      banner('CHECKPOINT '+(gates.length-gatesLeft())+' / '+gates.length,1.1);
      toast('CHECKPOINT '+(gates.length-gatesLeft())+' OF '+gates.length,1.4);
    }
  }
  if(player.alive){sweep.p.copy(player.pos);sweep.has=true;} else sweep.has=false;
}
function gatesLeft(){var n=0;for(var i=0;i<gates.length;i++)if(!gates[i].passed)n++;return n;}

/* Cargo, transports and rivals all fly the same waypoint mover. */
function spawnFlier(opts){
  var g=new THREE.Group();
  var col=opts.hostile?0x5b5f6b:(opts.tint||0x9fb4c4);
  var body=new THREE.Mesh(new THREE.CylinderGeometry(opts.big?3.4:1.8,opts.big?4.2:2.4,opts.big?18:10,7),
    new THREE.MeshPhongMaterial({map:opts.hostile?blackWingSkin:kestrelSkin,
      color:col,shininess:36,flatShading:true}));
  body.rotation.x=Math.PI/2; g.add(body);
  var wing=new THREE.Mesh(new THREE.BoxGeometry(opts.big?26:15,.4,opts.big?4:2.4),
    new THREE.MeshPhongMaterial({color:col,shininess:24,flatShading:true}));
  g.add(wing);
  g.userData.legacyParts=[body,wing];
  var bea=new THREE.Sprite(new THREE.SpriteMaterial({
    map:softSprite('rgba(255,255,255,.9)','rgba(255,255,255,0)'),
    color:opts.hostile?0xb98cff:0x8fe6ff,transparent:true,depthWrite:false,
    fog:false,blending:THREE.AdditiveBlending}));
  bea.scale.set(34,34,1); g.add(bea);
  scene.add(g);
  installStoryCraft(g,opts.hostile?'Blackwing_Fighter':'Cargo_Transport',
    opts.big?58:(opts.hostile?48:38));
  var o={mesh:g,pos:g.position,vel:new THREE.Vector3(),hp:opts.hp||120,maxHp:opts.hp||120,
    alive:true,speed:opts.speed||95,path:opts.path||[],leg:0,name:opts.name||'CONTACT',
    hostile:!!opts.hostile,passive:!opts.hostile,team:opts.hostile?'blackwing':'civil',
    kills:0,cd:rnd(.5,1.8),arrived:false};
  o.pos.copy(opts.at);
  convoy.push(o); return o;
}
function clearConvoy(){
  for(var i=0;i<convoy.length;i++){scene.remove(convoy[i].mesh);disposeSubtree(convoy[i].mesh);}
  convoy.length=0;
}
