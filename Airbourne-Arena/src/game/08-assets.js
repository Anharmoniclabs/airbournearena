/* ===================== asset loading ===================== */
/* Every loader below shares one manager so the boot cover can report real
   progress and hold the world back until it exists. Registration is what makes
   that work: TextureLoader, ImageLoader and GLTFLoader all call itemStart
   synchronously from .load(), and every .load() call in this file runs during
   this one script execution, so the total is complete before the first response
   comes back and the bar never walks backwards. */
var assetsReady=false, assetErrors=[], bootTimedOut=false;
var bootEl=document.getElementById('boot'),
    bootFill=document.getElementById('bootFill'),
    bootNote=document.getElementById('bootNote'),
    bootGo=document.getElementById('bootGo');
function bootLift(){
  if(bootEl)bootEl.classList.add('gone');
}
function bootFinish(){
  if(assetsReady)return;
  assetsReady=true;
  if(bootFill)bootFill.style.width='100%';
  if(!assetErrors.length&&!bootTimedOut){bootLift();return;}
  /* A gap in the art is a dull surface, not a dead game — so say what happened,
     then let the player walk in rather than stranding them on this screen. */
  if(bootNote){
    bootNote.className='bad';
    bootNote.textContent=bootTimedOut
      ? 'SOME ART IS STILL COMING DOWN — YOU CAN FLY WITHOUT IT'
      : assetErrors.length+(assetErrors.length===1?' FILE':' FILES')+
        ' FAILED TO LOAD — EXPECT BARE SURFACES';
  }
  if(bootGo)bootGo.classList.add('on');
}
var loadManager=new THREE.LoadingManager();
loadManager.onProgress=function(url,loaded,total){
  if(assetsReady||!total)return;
  if(bootFill)bootFill.style.width=Math.round(loaded/total*100)+'%';
  if(bootNote)bootNote.textContent='WARMING THE FLIGHT DECK — '+loaded+' / '+total;
};
/* If the watchdog gave up first and the art then turns up anyway, take the
   cover down rather than leaving a stale warning and a button to dismiss it. */
loadManager.onLoad=function(){
  if(assetsReady){ if(bootTimedOut&&!assetErrors.length)bootLift(); return; }
  bootFinish();
};
loadManager.onError=function(url){
  assetErrors.push(url);
  if(window.console&&console.warn)console.warn('airbourne: asset failed to load',url);
};
bindBtn(bootGo,bootLift);
/* A request that neither resolves nor errors — a hung connection, a proxy that
   swallows it — must not leave the player staring at a bar that never fills. */
setTimeout(function(){ if(!assetsReady){bootTimedOut=true; bootFinish();} },25000);

/* generated high-resolution material kit */
var assetLoader=new THREE.TextureLoader(loadManager);
var imageLoader=new THREE.ImageLoader(loadManager);
function tuneTexture(t){
  t.anisotropy=LOW?Math.min(2,renderer.capabilities.getMaxAnisotropy()):
    Math.min(8,renderer.capabilities.getMaxAnisotropy());
  if('encoding' in t)t.encoding=THREE.sRGBEncoding;
  return t;
}
function gameTexture(url,repeatX,repeatY){
  var t=assetLoader.load(url);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.repeat.set(repeatX||1,repeatY||1);
  return tuneTexture(t);
}
/* A pair of per-team skins packed into one image, blue on the left half and
   red on the right, read back by two textures that differ only in offset.
   Cloning the texture the loader returns does NOT work: TextureLoader attaches
   the decoded image inside its own load callback, so a clone taken on this
   line keeps image undefined for ever and the material renders untextured.
   Decode once and hand the same image to both. */
function atlasPair(url){
  var pair={blue:new THREE.Texture(),red:new THREE.Texture()};
  ['blue','red'].forEach(function(team,half){
    var t=pair[team];
    t.wrapS=t.wrapT=THREE.RepeatWrapping;
    t.repeat.set(.5,1);
    t.offset.set(half*.5,0);
    tuneTexture(t);
  });
  imageLoader.load(url,function(img){
    pair.blue.image=pair.red.image=img;
    pair.blue.needsUpdate=pair.red.needsUpdate=true;
  });
  return pair;
}
/* One whole image per team rather than a shared atlas. */
function teamTextures(blueUrl,redUrl){
  return {blue:tuneTexture(assetLoader.load(blueUrl)),
          red:tuneTexture(assetLoader.load(redUrl))};
}
/* The generated ground art is near-black volcanic rock. A material only ever
   multiplies its map, and no multiplier lifts a black pixel, so the exposure
   has to be fixed in the image itself: screen a grey over it to raise the
   floor, then use a 'color' pass to carry the whole thing over to warm dry
   stone. Every bit of the generated detail survives — only the light changes. */
function liftedTexture(url,repeatX,repeatY,lift,tint){
  var t=new THREE.Texture();
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.repeat.set(repeatX,repeatY);
  tuneTexture(t);
  imageLoader.load(url,function(img){
    var c=document.createElement('canvas');
    c.width=img.width; c.height=img.height;
    var x=c.getContext('2d');
    x.drawImage(img,0,0);
    x.globalCompositeOperation='screen'; x.fillStyle=lift; x.fillRect(0,0,c.width,c.height);
    x.globalCompositeOperation='color';  x.fillStyle=tint; x.fillRect(0,0,c.width,c.height);
    t.image=c; t.needsUpdate=true;
  });
  return t;
}
/* Terrain art must not contain baked structures: the ground repeats as the
   player flies, so painted buildings would duplicate and slide underneath the
   actual 3D city. All architecture now lives on real geometry below. */
var terrainSkin=liftedTexture('assets/volcanic-terrain-v2.webp',2.4,2.4,'#78787a','#c0ab86');
var caseSkin=gameTexture('assets/arena-core-skin-v2.webp',1,1);
var caseObjectiveSkin=tuneTexture(assetLoader.load('assets/arena-core-objective-v3.webp'));
var airstripSkin=teamTextures('assets/blue-airstrip-v1.webp','assets/red-airstrip-v1.webp');
var cityFacadeSkin=liftedTexture('assets/city-facades-diffusion-v1.webp',1,1,'#31383d','#9cabb2');
var cityRoofSkin=liftedTexture('assets/city-roofs-diffusion-v1.webp',1,1,'#353a3c','#899398');
var roadSkin=gameTexture('assets/road-surface-diffusion-v1.webp',1,1);
var hangarSkin=gameTexture('assets/hangar-metal-diffusion-v1.webp',1,1);
var foliageSkin=liftedTexture('assets/conifer-foliage-diffusion-v1.webp',1,1,
  '#46513d','#91a978');
var industrialSkin=gameTexture('assets/industrial-tank-diffusion-v1.webp',1,1);
var residentialSkin=liftedTexture('assets/residential-facade-diffusion-v1.webp',1,1,'#383b39','#aaa99f');
var factorySkin=liftedTexture('assets/factory-facade-diffusion-v1.webp',1,1,'#303638','#929da0');
var bunkerSkin=liftedTexture('assets/bunker-concrete-diffusion-v1.webp',1,1,'#3b3d3a','#9b9c92');
var rooftopSkin=liftedTexture('assets/rooftop-equipment-diffusion-v1.webp',1,1,'#303538','#929a9d');
var hangarFloorSkin=gameTexture('assets/hangar-floor-diffusion-4k-v1.webp',1,1);
var readyRoomSkin=gameTexture('assets/ready-room-equipment-diffusion-4k-v1.webp',1,1);
var briefingBoardSkin=tuneTexture(assetLoader.load('assets/flight-briefing-board-diffusion-4k-v1.webp'));
var vanguardSkin=gameTexture('assets/vanguard-surface-diffusion-4k-v1.webp',1,1);
var tempestSkin=gameTexture('assets/tempest-surface-diffusion-4k-v1.webp',1,1);
var infernoSkin=gameTexture('assets/inferno-surface-diffusion-4k-v1.webp',1,1);
var blackWingSkin=gameTexture('assets/black-wing-surface-diffusion-4k-v1.webp',1,1);
var kestrelSkin=gameTexture('assets/kestrel-mk1-surface-diffusion-4k-v1.webp',1,1);
var breakwaterSkin=gameTexture('assets/breakwater-field-surface-diffusion-4k-v1.webp',1,1);
var skywaySkin=gameTexture('assets/skyway-navigation-surface-diffusion-4k-v1.webp',1,1);
var oceanSkin=gameTexture('assets/starter-coast-ocean-diffusion-4k-v1.webp',18,18);
var airbaseDeckSkin=gameTexture('assets/airbase-deck-diffusion-4k-v1.webp',3,3);
var aviationHardwareSkin=gameTexture('assets/aviation-hardware-diffusion-4k-v1.webp',2,2);
var pilotAlbedoSkin=gameTexture('assets/starter-coast-pilot-albedo-diffusion-v2.png',1,1);
pilotAlbedoSkin.flipY=false;
var explosionVfxSkin=tuneTexture(assetLoader.load('assets/aviation-explosion-vfx-diffusion-4k-v1.webp'));
var stormCloudVfxSkin=tuneTexture(assetLoader.load('assets/storm-cloud-vfx-diffusion-4k-v2.webp'));
var independentPilotSkin=tuneTexture(assetLoader.load('assets/independent-pilot-rear-diffusion-4k-v1.webp'));
var maraVossSkin=tuneTexture(assetLoader.load('assets/mara-switch-voss-diffusion-4k-v1.webp'));

var sunLight=new THREE.DirectionalLight(0xffffff,1.1); scene.add(sunLight,sunLight.target);
var moonLight=new THREE.DirectionalLight(0x9fb8ff,0); scene.add(moonLight,moonLight.target);
var hemi=new THREE.HemisphereLight(0x9ec7e8,0x3a3524,.45); scene.add(hemi);

var skyU={top:{value:new THREE.Color(0x2b6fc9)},bottom:{value:new THREE.Color(0xa9d6f2)},
  sunDir:{value:new THREE.Vector3(0,1,0)},sunCol:{value:new THREE.Color(0xfff3d6)},
  glow:{value:1},cover:{value:.1},time:{value:0}};
var sky=new THREE.Mesh(new THREE.SphereGeometry(14000,32,20),new THREE.ShaderMaterial({
  uniforms:skyU,side:THREE.BackSide,depthWrite:false,fog:false,
  vertexShader:'varying vec3 vD;void main(){vD=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:'uniform vec3 top,bottom,sunDir,sunCol;uniform float glow,cover,time;varying vec3 vD;'+
   'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}'+
   'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}'+
   'void main(){float h=clamp(vD.y*.5+.5,0.,1.);vec3 c=mix(bottom,top,pow(h,.78));'+
   'float horizon=pow(1.-abs(vD.y),7.);c=mix(c,bottom*1.08,horizon*.46);'+
   'float d=max(dot(vD,normalize(sunDir)),0.);c+=sunCol*pow(d,240.)*3.0;c+=sunCol*pow(d,7.)*.28*glow;'+
   'vec2 cp=vD.xz/max(.12,vD.y+.38)*2.4+vec2(time*.004,time*.0015);'+
   'float cirrus=noise(cp)+.52*noise(cp*2.07+4.1);cirrus=smoothstep(1.02,1.46,cirrus)*smoothstep(.42,.72,vD.y);'+
   'c=mix(c,mix(bottom,vec3(1.),.28),cirrus*(.06+cover*.18));'+
   'gl_FragColor=vec4(c,1.);}'
})); scene.add(sky);

var STAR_N=LOW?520:1300;
var starGeo=new THREE.BufferGeometry(),spArr=new Float32Array(STAR_N*3);
for(var i0=0;i0<STAR_N;i0++){var uu=Math.random()*2-1,th0=Math.random()*6.283,rr0=Math.sqrt(1-uu*uu);
  spArr[i0*3]=Math.cos(th0)*rr0*12000;spArr[i0*3+1]=Math.abs(uu)*12000;spArr[i0*3+2]=Math.sin(th0)*rr0*12000;}
starGeo.setAttribute('position',new THREE.BufferAttribute(spArr,3));
var stars=new THREE.Points(starGeo,new THREE.PointsMaterial({color:0xdfeaff,size:2.2,
  sizeAttenuation:false,transparent:true,opacity:0,fog:false,depthWrite:false})); scene.add(stars);

function softSprite(a,b){
  var c=document.createElement('canvas');c.width=c.height=128;var x=c.getContext('2d');
  var g=x.createRadialGradient(64,64,0,64,64,64);
  g.addColorStop(0,a);g.addColorStop(.45,b);g.addColorStop(1,'rgba(255,255,255,0)');
  x.fillStyle=g;x.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);
}
var moon=new THREE.Sprite(new THREE.SpriteMaterial({map:softSprite('rgba(255,255,255,1)','rgba(210,225,255,.35)'),
  transparent:true,depthWrite:false,fog:false,opacity:0})); moon.scale.set(900,900,1); scene.add(moon);

/* terrain */
/* How far the built-up area reaches from midfield. The terrain shading needs
   it as much as the buildings do — the ground under the city is paved. */
var CITY_REACH=1750,CITY_BLOCK=134,CITY_TOP=225,ROAD_RING_R=905;
var SIZE=7000,SEG=LOW?62:104,STEP=SIZE/SEG;
var tGeo=new THREE.PlaneGeometry(SIZE,SIZE,SEG,SEG); tGeo.rotateX(-Math.PI/2);
tGeo.setAttribute('color',new THREE.BufferAttribute(new Float32Array(tGeo.attributes.position.count*3),3));
var terrain=new THREE.Mesh(tGeo,new THREE.MeshPhongMaterial({map:terrainSkin,vertexColors:true,
  flatShading:false,shininess:1,color:0xdedacb}));
scene.add(terrain);
/* Dry, high-key country rather than the old dark volcanic palette: pale sand
   at the water line, sun-bleached scrub above it, light stone on the ridges. */
var SAND=new THREE.Color(0xe6d6ae),GRASS=new THREE.Color(0xa8b681),PINE=new THREE.Color(0x7d9163),
    ROCK=new THREE.Color(0xb5ad9c),SNOW=new THREE.Color(0xf3f7fa),
    TARMAC=new THREE.Color(0x9d9a92);
var tmpC=new THREE.Color(),lastOx=1e9,lastOz=1e9;
function updateTerrain(px,pz){
  var ox=Math.round(px/STEP)*STEP,oz=Math.round(pz/STEP)*STEP;
  if(ox===lastOx&&oz===lastOz)return;
  lastOx=ox;lastOz=oz;terrain.position.set(ox,0,oz);
  var p=tGeo.attributes.position,c=tGeo.attributes.color;
  for(var i=0;i<p.count;i++){
    var wx2=p.getX(i)+ox,wz2=p.getZ(i)+oz,h=terrainHeight(wx2,wz2);
    p.setY(i,h);
    var m=hash(wx2*.013,wz2*.013)*.13-.065;
    if(h<4)tmpC.copy(SAND);
    else if(h<70)tmpC.copy(GRASS).lerp(PINE,Math.min(1,h/70));
    else if(h<190)tmpC.copy(PINE).lerp(ROCK,(h-70)/120);
    else tmpC.copy(ROCK).lerp(SNOW,Math.min(1,(h-190)/95));
    /* the ground the city stands on is paved, not scrub */
    if(h>=4){
      var urban=1-smooth(CITY_REACH*.5,CITY_REACH*1.08,Math.sqrt(wx2*wx2+wz2*wz2));
      if(urban>0)tmpC.lerp(TARMAC,urban*.7);
    }
    c.setXYZ(i,tmpC.r+m,tmpC.g+m,tmpC.b+m);
  }
  p.needsUpdate=true;c.needsUpdate=true;
  /* Lighting must follow the displaced landscape. Without refreshed normals,
     hills retain the original flat-plane lighting and read like a texture
     draped over cardboard. */
  tGeo.computeVertexNormals();
  tGeo.attributes.normal.needsUpdate=true;
}
var sea=new THREE.Mesh(new THREE.PlaneGeometry(40000,40000),
  new THREE.MeshPhongMaterial({map:oceanSkin,color:0x7f9ead,shininess:110,
    transparent:true,opacity:.94}));
sea.rotation.x=-Math.PI/2;sea.position.y=SEA_LEVEL;scene.add(sea);

