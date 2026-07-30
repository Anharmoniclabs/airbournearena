/* ===================== bullets ===================== */
var B_MAX=480,bPos=new Float32Array(B_MAX*6),bullets=[];
var bGeo=new THREE.BufferGeometry();
bGeo.setAttribute('position',new THREE.BufferAttribute(bPos,3));
var bulletMesh=new THREE.LineSegments(bGeo,new THREE.LineBasicMaterial(
  {color:0xffd9a0,transparent:true,opacity:.95,fog:false,depthWrite:false}));
bulletMesh.frustumCulled=false; scene.add(bulletMesh);
var MUZZLE=780,BULLET_DMG=14,HIT_RADIUS=14;
/* Magnetic aim only rewards a shot the player has already lined up. The
   initial pull closes part of an eight-degree error; the tracer may then bend
   a few more degrees during its first half-second. It cannot U-turn, chase an
   off-screen lock or keep steering all the way to impact. */
var ASSIST_CONE=.9903,ASSIST_PULL=.38,GUIDE_FIRE_CONE=.9703;
var GUIDE_TIME=.62,GUIDE_TURN=1.35,GUIDE_TRACK_CONE=.9455;

function fire(f){
  if(f.cannonCd>0||!f.alive)return;
  f.cannonCd=.085/(f.gunRate||1);
  var fwd=new THREE.Vector3(0,0,-1).applyQuaternion(f.quat);
  var spread=(f.isPlayer?.0032:f.spread)*(f.gunSpread||1);
  var d=fwd.clone(),guide=null;
  var assist=f.isPlayer&&lockOn.target&&targetAlive(lockOn.target)&&
    (lockOn.assisted||lockOn.manual);
  if(assist){
    var at=interceptTime(f,lockOn.target);
    interceptAim(f,lockOn.target,at,_aimV);
    var aimDot=_aimV.dot(fwd);
    if(aimDot>ASSIST_CONE)d.lerp(_aimV,ASSIST_PULL).normalize();
    if(aimDot>GUIDE_FIRE_CONE)guide=lockOn.target;
  }
  d.x+=rnd(-spread,spread);d.y+=rnd(-spread,spread);d.z+=rnd(-spread,spread);
  d.normalize();
  bullets.push({p:f.pos.clone().addScaledVector(fwd,6.4),
    v:d.multiplyScalar(MUZZLE).add(f.vel),   /* rounds carry the aircraft's velocity */
    life:1.6,team:f.team,owner:f,dmg:BULLET_DMG*(f.gunDmg||1),
    guide:guide,guideT:guide?GUIDE_TIME:0});
  gunSfx(f.isPlayer?1:earGain(f.pos)*.75);
  if(f.isPlayer){shake=Math.min(0.5,shake+0.05);sortie.shots++;}
}

/* ===================== fx ===================== */
var fxTex=explosionVfxSkin,fx=[],shake=0;
function boom(pos,scale){
  var s=new THREE.Sprite(new THREE.SpriteMaterial({map:fxTex,transparent:true,depthWrite:false,
    fog:false,blending:THREE.AdditiveBlending}));
  s.position.copy(pos); s.scale.set(20,20,1); scene.add(s);
  fx.push({s:s,t:0,life:.85,scale:scale||90});
  bangSfx(earGain(pos)*Math.min(1.1,(scale||90)/200));
}
function stepFx(dt){
  for(var i=fx.length-1;i>=0;i--){
    var e=fx[i]; e.t+=dt; var k=e.t/e.life;
    var sz=20+e.scale*k; e.s.scale.set(sz,sz,1);
    e.s.material.opacity=Math.max(0,1-k);
    /* one SpriteMaterial per explosion, and a busy sortie makes hundreds.
       Removing the sprite from the scene never freed the material — the map is
       the shared explosion skin and stays. */
    if(k>=1){scene.remove(e.s);e.s.material.dispose();fx.splice(i,1);}
  }
  shake=Math.max(0,shake-dt*2.2);
}

