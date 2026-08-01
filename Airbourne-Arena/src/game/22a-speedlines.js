/* ===================== speed lines =====================
   The airframe had no way to tell you how fast it was going. Airspeed lived in
   a HUD number, the terrain is 7km across so the ground barely slides, and at
   altitude there is nothing in frame to move against at all — 180 knots and 400
   looked identical out of the canopy.

   These are the air itself: short streaks seeded ahead of the camera in a tube
   around the flight path, drifting backwards at the aircraft's own speed and
   recycled once they fall behind. Because they move with the airflow rather
   than on a timer, they read as the medium going past rather than as an overlay
   — and they thin out to nothing when you slow down, which is what makes the
   bottom of the envelope feel slow.

   Same construction as the rain: one LineSegments, one buffer, points held in
   local space with the mesh parked on the camera each frame, so there is no
   per-streak object and no allocation once this file has run.          */
var SPD_N=LOW?90:220;
var SPD_ON=140,          /* airspeed where streaks begin to show */
    SPD_FULL=430,        /* where they reach full length and opacity */
    SPD_RADIUS=95,       /* tube radius around the flight axis */
    SPD_INNER=17,        /* nothing closer than this, or it strobes the centre */
    SPD_NEAR=24,         /* how far behind the camera a streak is recycled */
    SPD_SPAN=230;        /* how far ahead they are seeded */
var spdPos=new Float32Array(SPD_N*6),spdPt=[],spdSeeded=false;
for(var si=0;si<SPD_N;si++)spdPt.push(new THREE.Vector3());
var spdGeo=new THREE.BufferGeometry();
spdGeo.setAttribute('position',new THREE.BufferAttribute(spdPos,3));
var speedLines=new THREE.LineSegments(spdGeo,new THREE.LineBasicMaterial(
  {color:0xdff3ff,transparent:true,opacity:0,fog:false,depthWrite:false,
   blending:THREE.AdditiveBlending}));
speedLines.frustumCulled=false; speedLines.visible=false; scene.add(speedLines);

var _spD=new THREE.Vector3(),_spR2=new THREE.Vector3(),_spU2=new THREE.Vector3(),
    _spW=new THREE.Vector3();

/* A stable pair of axes across the flight direction. Straight up degenerates
   when you are pointing at the zenith, which a zero-point aircraft does. */
function spdBasis(dir){
  _spU2.set(0,1,0);
  if(Math.abs(dir.y)>0.94)_spU2.set(1,0,0);
  _spR2.crossVectors(dir,_spU2).normalize();
  _spU2.crossVectors(_spR2,dir).normalize();
}
function spdSeed(p,dir,ahead){
  var th=Math.random()*6.28318,
      rad=SPD_INNER+Math.sqrt(Math.random())*(SPD_RADIUS-SPD_INNER);
  p.copy(dir).multiplyScalar(ahead)
   .addScaledVector(_spR2,Math.cos(th)*rad)
   .addScaledVector(_spU2,Math.sin(th)*rad);
}
function stepSpeedLines(dt,subject){
  var spd=subject?subject.speed||0:0;
  /* Reduced motion keeps a hint of the cue rather than losing the speed read
     entirely — this is the effect most likely to bother someone. */
  var k=smooth(SPD_ON,SPD_FULL,spd)*(cfg.motion?.3:1);
  if(spd<1||k<=0.002){speedLines.visible=false;return;}
  speedLines.visible=true;
  speedLines.material.opacity=k*.42;
  speedLines.position.copy(camera.position);

  _spD.copy(subject.vel).multiplyScalar(1/spd);
  spdBasis(_spD);
  /* The points are declared at the origin, which is the camera — left alone,
     the first frame draws every streak on top of the reticle before they drift
     apart. Nothing knows the flight direction until here, so the initial spread
     has to happen on the first step rather than at construction. */
  if(!spdSeeded){
    for(var j=0;j<SPD_N;j++)
      spdSeed(spdPt[j],_spD,-SPD_NEAR+Math.random()*(SPD_NEAR+SPD_SPAN));
    spdSeeded=true;
  }
  var len=7+k*44, travel=spd*dt;
  for(var i=0;i<SPD_N;i++){
    var p=spdPt[i];
    p.addScaledVector(_spD,-travel);
    /* split the offset into along-axis and across-axis so a hard turn, which
       swings the axis out from under the whole field, recycles the strays */
    var along=p.dot(_spD);
    _spW.copy(p).addScaledVector(_spD,-along);
    if(along<-SPD_NEAR||_spW.length()>SPD_RADIUS*1.7)
      spdSeed(p,_spD,SPD_NEAR+Math.random()*SPD_SPAN);
    var o=i*6;
    spdPos[o]=p.x;   spdPos[o+1]=p.y;   spdPos[o+2]=p.z;
    spdPos[o+3]=p.x-_spD.x*len;
    spdPos[o+4]=p.y-_spD.y*len;
    spdPos[o+5]=p.z-_spD.z*len;
  }
  spdGeo.attributes.position.needsUpdate=true;
}
