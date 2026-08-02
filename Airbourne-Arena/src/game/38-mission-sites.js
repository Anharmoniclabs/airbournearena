/* ===================== mission sites =====================
   The third primitive, and the last one the campaign needs. A site is a fixed
   installation the mission owns: a navigation tower, a Warden relay, a Black
   Wing defence platform, a section of the carrier. Two verbs cover every use
   the bible asks for across Chapters 2 to 6 —

     · BREAK it — hp, shootable, optionally shoots back
     · WORK it — hold station inside its radius for a few seconds, which is
       what scanning wreckage, restoring a tower and disabling a relay all are

   They are a separate list from `structs` for the same reason drones are a
   separate list from fighters: `structs` are league property, they respawn on
   a timer and they belong to blue or red. A mission's installations belong to
   the mission and disappear with it. */
var sites=[],_siV=new THREE.Vector3();
function makeSite(opts){
  var g=new THREE.Group();
  var hostile=opts.hostile!==false;
  var col=opts.hold?0x6fe3d0:(hostile?0x6b5f7a:0x9fb4c4);
  var h=opts.height||120, r=opts.radius||34;
  if(opts.kind==='mast'){
    var mast=new THREE.Mesh(new THREE.CylinderGeometry(r*0.16,r*0.42,h,7),steelMat);
    mast.position.y=h/2; g.add(mast);
    var dish=new THREE.Mesh(new THREE.SphereGeometry(r*0.7,12,7,0,Math.PI*2,0,Math.PI*0.5),
      new THREE.MeshPhongMaterial({map:skywaySkin,color:0xe1e2de,shininess:30,
        flatShading:true,side:THREE.DoubleSide}));
    dish.position.y=h+r*0.2; dish.rotation.x=-0.75; g.add(dish);
  } else {
    var slab=new THREE.Mesh(new THREE.BoxGeometry(r*1.9,h,r*1.9),
      new THREE.MeshPhongMaterial({map:blackWingSkin,color:col,shininess:22,flatShading:true}));
    slab.position.y=h/2; g.add(slab);
    var cap=new THREE.Mesh(new THREE.CylinderGeometry(r*0.7,r*1.0,h*0.22,8),steelMat);
    cap.position.y=h*1.06; g.add(cap);
  }
  g.userData.legacyParts=g.children.slice();
  var halo=new THREE.Sprite(new THREE.SpriteMaterial({
    map:softSprite('rgba(255,255,255,.9)','rgba(255,255,255,0)'),
    color:col,transparent:true,depthWrite:false,fog:false,
    blending:THREE.AdditiveBlending}));
  halo.scale.set(r*3.4,r*3.4,1); halo.position.y=h*1.2; g.add(halo);
  var at=opts.at;
  /* airborne sites (carrier sections, platforms) keep the y they were given;
     ground ones plant themselves on the terrain */
  g.position.set(at.x, opts.flying?at.y:ground(at.x,at.z), at.z);
  scene.add(g);
  installStorySite(g,opts,h,r);
  var o={mesh:g,pos:g.position,halo:halo,name:opts.name||'INSTALLATION',
    hp:opts.hp||300,maxHp:opts.hp||300,alive:true,hostile:hostile,
    radius:r*1.5,height:h*1.35,guns:!!opts.guns,cd:rnd(1,2.6),
    hold:opts.hold||0,holdR:opts.holdR||360,prog:0,worked:false};
  sites.push(o); return o;
}
function clearSites(){
  for(var i=0;i<sites.length;i++){scene.remove(sites[i].mesh);disposeSubtree(sites[i].mesh);}
  sites.length=0;
}
function killSite(s){
  if(!s.alive)return;
  s.alive=false; s.mesh.visible=false; boom(s.pos,240);
  feed('<span style="color:#b98cff">'+s.name+' DESTROYED</span>');
  stingSfx([392,294],.12);
}
function hurtSite(s,dmg,by){
  if(!s.alive||s.hold)return;
  s.hp-=dmg;
  if(s.hp<=0)killSite(s);
}
function stepSites(dt){
  for(var i=0;i<sites.length;i++){
    var s=sites[i];
    if(!s.alive)continue;
    if(s.hold){
      /* hold-station work: progress only accumulates while the player is
         actually inside the ring, and bleeds back off when they leave, so
         orbiting away and returning does not bank the time */
      var inside=player.alive&&player.pos.distanceTo(s.pos)<s.holdR;
      s.prog=clamp(s.prog+(inside?dt:-dt*0.5),0,s.hold);
      if(s.prog>=s.hold&&!s.worked){
        s.worked=true; stingSfx([880,1170,1320],.12);
        feed('<span style="color:#6fe3d0">'+s.name+' — DONE</span>');
      }
      s.halo.material.opacity=s.worked?.95:.3+(s.prog/s.hold)*.6;
      s.mesh.rotation.y+=dt*(inside?1.4:0.35);
      continue;
    }
    s.halo.material.opacity=.35+Math.sin(performance.now()*.004+i)*.14;
    if(!s.guns||!player.alive)continue;
    s.cd-=dt;
    var d=player.pos.distanceTo(s.pos);
    if(d<AA_RANGE&&s.cd<=0){
      s.cd=rnd(.9,1.5);
      var t=d/AA_MUZZLE;
      var aim=_siV.copy(player.pos).addScaledVector(player.vel,t).sub(s.pos);
      aim.y+=10; aim.normalize();
      var sp=.028;
      aim.set(aim.x+rnd(-sp,sp),aim.y+rnd(-sp,sp),aim.z+rnd(-sp,sp)).normalize();
      var b=bulletSpawn();
      b.p.copy(s.pos).addScaledVector(aim,30).setY(s.pos.y+s.height*.6);
      b.v.copy(aim).multiplyScalar(AA_MUZZLE);
      b.life=2.2;b.team='blackwing';b.owner=s;b.dmg=AA_DMG;
      gunSfx(earGain(s.pos)*.5);
    }
  }
}
function sitesLeft(){var n=0;for(var i=0;i<sites.length;i++)if(sites[i].alive&&!sites[i].hold)n++;return n;}
function sitesWorked(){var n=0;for(var i=0;i<sites.length;i++)if(sites[i].hold&&sites[i].worked)n++;return n;}
function sitesToWork(){var n=0;for(var i=0;i<sites.length;i++)if(sites[i].hold)n++;return n;}
function allWorked(){return sitesToWork()>0&&sitesWorked()===sitesToWork();}

