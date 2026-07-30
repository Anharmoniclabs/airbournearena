/* ===================== arena ===================== */
/* Objectives stay concentrated around the two bases, but the world itself is
   open. arenaDistance remains useful for AI/object placement only; it never
   damages or turns the player around. */
var ARENA=3400, ARENA_RUN=2350, ARENA_RADIUS=1550, BASE_X=2500;
var BASES={blue:new THREE.Vector3(-BASE_X,460,0), red:new THREE.Vector3(BASE_X,460,0)};
var GOALS={blue:new THREE.Vector3(BASE_X,380,0), red:new THREE.Vector3(-BASE_X,380,0)};
var GOAL_R=185, MATCH_TIME=300, TARGET_SCORE=3, RESPAWN=10;
function arenaDistance(x,z){
  var cx=clamp(x,-ARENA_RUN,ARENA_RUN);
  return Math.hypot(x-cx,z);
}

var SN=0.00075,SEA_LEVEL=0,SEABED_LEVEL=-32;
/* Starter Coast v2 uses the same deterministic island mask in Blender and in
   the flight runtime. That keeps collision, grounded objectives and the
   authored GLB on one coastline instead of flying over a repeating height
   field that merely resembles the source scene. */
var LAND_LOBES=[
  [0,0,1250,1120,1],[-2760,0,900,900,.82],[2760,0,900,900,.82],
  [0,2100,930,760,1.16],[0,-2200,1080,830,.72],
  [-1500,1300,980,820,.86],[1550,1300,980,820,.92],
  [-1550,-1300,1030,860,.78],[1650,-1250,1030,850,.84]
];
var SITE_PLATEAUS=[
  [-2100,-1200,260],[2100,-900,260],[1200,1800,260],[-1400,1600,260],
  [-1800,-1600,250],[1900,-1400,250],[1700,1500,250],[-1600,1700,250],
  [1500,-400,230],[-900,-1500,230],[600,1600,230],[2225,-525,240]
];
function islandMask(x,z){
  var best=0,edge=(fbm(x*.0016+18.1,z*.0016+3.7,4)-.48)*.16;
  for(var i=0;i<LAND_LOBES.length;i++){
    var l=LAND_LOBES[i],rad=Math.hypot((x-l[0])/l[2],(z-l[1])/l[3]);
    best=Math.max(best,1-smooth(.78+edge,1.04+edge,rad));
  }
  for(var j=0;j<SITE_PLATEAUS.length;j++){
    var p=SITE_PLATEAUS[j],d=Math.hypot(x-p[0],z-p[1]);
    best=Math.max(best,1-smooth(p[2]*.68,p[2],d));
  }
  return clamp(best,0,1);
}
function terrainBaseHeight(x,z){
  var mask=islandMask(x,z);
  if(mask<=.001)return SEABED_LEVEL;
  var base=Math.pow(fbm(x*.00072,z*.00072,5),1.72);
  var ridge=1-Math.abs(vnoise(x*.0018+31.3,z*.0018+17.7)*2-1);
  var h=18+base*210+ridge*ridge*105;
  for(var i=0;i<LAND_LOBES.length;i++){
    var l=LAND_LOBES[i],rad=Math.hypot((x-l[0])/l[2],(z-l[1])/l[3]);
    h+=Math.max(0,1-rad)*34*l[4];
  }
  var urban=1-smooth(650,1050,Math.hypot(x,z));
  h+=(24-h)*urban;
  for(var side=-1;side<=1;side+=2){
    var field=1-smooth(250,520,Math.hypot(x-side*2760,z));
    h+=(34-h)*field;
  }
  var harbor=1-smooth(360,720,Math.hypot(x,z+2200));
  h+=(16-h)*harbor;
  for(var j=0;j<SITE_PLATEAUS.length;j++){
    var p=SITE_PLATEAUS[j],pad=1-smooth(p[2]*.55,p[2],Math.hypot(x-p[0],z-p[1]));
    if(pad>0){
      var target=34+hash(p[0]*.01,p[1]*.01)*24;
      h+=(target-h)*pad;
    }
  }
  return SEABED_LEVEL+(h-SEABED_LEVEL)*smooth(.02,.82,mask);
}
/* Engineered pads are shared with the Blender source as
   [centerX,centerZ,halfWidth,halfDepth,feather]. Their targets are sampled
   once from the natural landscape, then the occupied footprint is made truly
   planar. Buildings no longer balance on a single center-point height while
   their corners float over or disappear into a hill. */
var CONSTRUCTION_PADS=[
  [0,2100,285,220,110],
  [-430,-410,65,52,70],[430,-410,62,50,70],
  [-430,410,62,50,70],[430,410,64,52,70],
  [-1560,1300,72,55,85],[-1360,1380,65,51,80],
  [1630,1205,190,150,120],[-1520,-1303,175,125,110],
  [2225,-525,67,54,85],[0,-2150,68,53,70],
  [-280,-2070,112,67,90],[280,-2070,112,67,90]
];
for(var cp=0;cp<CONSTRUCTION_PADS.length;cp++){
  CONSTRUCTION_PADS[cp].push(
    terrainBaseHeight(CONSTRUCTION_PADS[cp][0],CONSTRUCTION_PADS[cp][1])
  );
}
function terrainHeight(x,z){
  var h=terrainBaseHeight(x,z);
  for(var i=0;i<CONSTRUCTION_PADS.length;i++){
    var p=CONSTRUCTION_PADS[i],
        dx=Math.max(Math.abs(x-p[0])-p[2],0),
        dz=Math.max(Math.abs(z-p[1])-p[3],0),
        weight=1-smooth(0,p[4],Math.hypot(dx,dz));
    if(weight>0)h+=(p[5]-h)*weight;
  }
  return h;
}
function ground(x,z){return Math.max(terrainHeight(x,z),SEA_LEVEL);}

