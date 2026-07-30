/* ===================== weather ===================== */
var WX={clear:{name:'CLEAR',fog:.00012,cover:.10,rain:0,wind:8,gust:2},
  fair:{name:'SCATTERED CLOUD',fog:.00024,cover:.42,rain:0,wind:16,gust:5},
  overcast:{name:'OVERCAST',fog:.00046,cover:.92,rain:0,wind:24,gust:8},
  rain:{name:'RAIN',fog:.0008,cover:1,rain:.55,wind:32,gust:12},
  storm:{name:'THUNDERSTORM',fog:.0012,cover:1,rain:1,wind:52,gust:24}};
var ORDER=['clear','fair','overcast','rain','storm'];
var wxKey='fair',wx={fog:.00024,cover:.42,rain:0,wind:16,gust:5},wxTimer=80;
var windAngle=Math.random()*6.283,windVec=new THREE.Vector3();

var puffTex=(function(){
  var c=document.createElement('canvas');c.width=c.height=256;var x=c.getContext('2d');
  for(var i=0;i<26;i++){var px=128+(Math.random()-.5)*120,py=128+(Math.random()-.5)*110,r=28+Math.random()*52;
    var g=x.createRadialGradient(px,py,0,px,py,r);
    g.addColorStop(0,'rgba(255,255,255,0.30)');g.addColorStop(1,'rgba(255,255,255,0)');
    x.fillStyle=g;x.beginPath();x.arc(px,py,r,0,7);x.fill();}
  return new THREE.CanvasTexture(c);
})();
/* Generated cloud cards were still visibly planar against the open sky.
   Weather now uses fog, light, wind and rain only; no cloud billboards. */
var CLOUD_N=0,SPAN=5400,clouds=[];
for(var ci=0;ci<CLOUD_N;ci++){
  var cspr=new THREE.Sprite(new THREE.SpriteMaterial({map:stormCloudVfxSkin,
    transparent:true,alphaTest:.012,depthWrite:false,opacity:.46,
    blending:THREE.NormalBlending}));
  var sc=340+Math.random()*640; cspr.scale.set(sc,sc*.55,1);
  cspr.material.rotation=rnd(-.08,.08);
  cspr.position.set(rnd(-SPAN/2,SPAN/2),rnd(450,1250),rnd(-SPAN/2,SPAN/2));
  scene.add(cspr); clouds.push(cspr);
}
var ceilTex=puffTex.clone(); ceilTex.needsUpdate=true;
ceilTex.wrapS=ceilTex.wrapT=THREE.RepeatWrapping; ceilTex.repeat.set(9,9);
var ceiling=new THREE.Mesh(new THREE.PlaneGeometry(17000,17000),new THREE.MeshBasicMaterial(
  {map:ceilTex,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide,fog:false}));
ceiling.rotation.x=Math.PI/2; ceiling.position.y=1400; scene.add(ceiling);
ceiling.visible=false;

var RAIN_N=LOW?460:2400,rainPos=new Float32Array(RAIN_N*6),rainPt=[];
for(var ri=0;ri<RAIN_N;ri++)rainPt.push(new THREE.Vector3(rnd(-130,130),rnd(-70,150),rnd(-130,130)));
var rainGeo=new THREE.BufferGeometry();
rainGeo.setAttribute('position',new THREE.BufferAttribute(rainPos,3));
var rain=new THREE.LineSegments(rainGeo,new THREE.LineBasicMaterial(
  {color:0xbcd9f2,transparent:true,opacity:0,fog:false,depthWrite:false}));
rain.frustumCulled=false; scene.add(rain);

