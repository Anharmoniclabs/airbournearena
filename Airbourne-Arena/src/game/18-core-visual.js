var coreGroup=new THREE.Group(); scene.add(coreGroup);
/* the objective: the Arena Core, a hardened carry with a decaying cell */
var coreMesh=(function buildCase(){
  var g=new THREE.Group();
  var shell=new THREE.MeshPhongMaterial({map:caseSkin,color:0xffffff,shininess:40,flatShading:true});
  var steel=new THREE.MeshPhongMaterial({map:aviationHardwareSkin,
    color:0xe0e5e6,shininess:110,flatShading:true});
  var glow=new THREE.MeshPhongMaterial({color:0xffb347,emissive:0xff8a1e,
    emissiveIntensity:1.6,shininess:80,flatShading:true});
  g.add(new THREE.Mesh(new THREE.BoxGeometry(17,12,5.4),shell));
  /* corner armour */
  [[-8.5,-6],[8.5,-6],[-8.5,6],[8.5,6]].forEach(function(c){
    var m=new THREE.Mesh(new THREE.BoxGeometry(2.4,2.4,6),steel);
    m.position.set(c[0],c[1],0); g.add(m);
  });
  /* seam and latches — the element leaks light through the joint */
  var seam=new THREE.Mesh(new THREE.BoxGeometry(17.4,1.1,5.8),glow);
  g.add(seam);
  [-5,5].forEach(function(x){
    var l=new THREE.Mesh(new THREE.BoxGeometry(2.6,2.2,6.2),steel);
    l.position.set(x,0,0); g.add(l);
  });
  /* handle */
  var handle=new THREE.Mesh(new THREE.TorusGeometry(3.1,.65,6,16,Math.PI),steel);
  handle.position.y=6; g.add(handle);
  return g;
})();
coreMesh.visible=false;
coreGroup.add(coreMesh);
var coreCaseSprite=new THREE.Sprite(new THREE.SpriteMaterial({map:caseObjectiveSkin,transparent:true,
  alphaTest:.06,depthWrite:false,fog:true}));
coreCaseSprite.scale.set(11.5,5.75,1);
coreCaseSprite.renderOrder=3;
coreGroup.add(coreCaseSprite);
var coreGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:softSprite('rgba(255,220,150,.95)','rgba(255,150,40,.4)'),
  transparent:true,depthWrite:false,fog:false,blending:THREE.AdditiveBlending}));
coreGlow.scale.set(48,48,1); coreGroup.add(coreGlow);
var coreBeam=new THREE.Mesh(new THREE.CylinderGeometry(9,9,1600,10,1,true),
  new THREE.MeshBasicMaterial({color:0xffb347,transparent:true,opacity:.14,side:THREE.DoubleSide,depthWrite:false}));
coreGroup.add(coreBeam);
var CASE_GRAB=85;
var core={pos:new THREE.Vector3(0,600,0),vel:new THREE.Vector3(),carrier:null,
  lockout:null,lockT:0,charge:100};

