/* --- the city on the valley floor ---
   The ground between the two airbases is a built-up grid: dense downtown over
   midfield, thinning to low-rise out toward each base, streets running along
   the run so the skyline reads as depth while you are lining a pass up.

   The whole thing is one InstancedMesh — a few hundred buildings for a single
   draw call, which is what keeps it affordable on a phone. Nothing here is a
   collision volume. At combat altitude you are well over the roofs, and
   hanging hard bodies on several hundred boxes would turn every low pass into
   a coin flip; the terrain underneath is still the thing that kills you. */
var cityMat=null,cityRoofMat=null,cityNightMats=[];
/* Legacy instanced blocks remain available only if the authored world fails.
   Per-instance box scaling cannot preserve meter-accurate UV density, and the
   old terrain-center placement left pale roof slabs where towers intersected
   hills. Keep the fallback recoverable without layering it over approved
   Blender architecture. */
var proceduralCity=new THREE.Group();scene.add(proceduralCity);
(function buildCity(){
  var lots=[],span=Math.round(CITY_REACH/CITY_BLOCK);
  for(var ix=-span;ix<=span;ix++){
    for(var iz=-span;iz<=span;iz++){
      if(ix%5===0||iz%5===0)continue;              /* every fifth line is an avenue */
      if(LOW&&((ix+iz)&1))continue;                /* half the density on a phone */
      var x=ix*CITY_BLOCK+(hash(ix*1.7,iz*2.3)-.5)*36,
          z=iz*CITY_BLOCK+(hash(ix*3.1,iz*1.9)-.5)*36,
          d=Math.sqrt(x*x+z*z);
      if(d>CITY_REACH)continue;
      if(Math.abs(x)<820&&Math.abs(z)<820)continue; /* authored hero district */
      if(Math.abs(d-ROAD_RING_R)<88)continue;       /* civic ring reservation */
      /* ix/iz multiples of five are the avenue reservations. Lot jitter stays
         inside the remaining block instead of wandering over a road. */
      var gy=terrainHeight(x,z);
      if(gy<8)continue;                            /* below the water line */
      /* nothing gets built on ground it could not stand on */
      if(Math.max(Math.abs(terrainHeight(x+58,z)-gy),Math.abs(terrainHeight(x,z+58)-gy))>30)continue;
      lots.push([x,z,gy,1-smooth(280,CITY_REACH,d)]);
    }
  }
  var geo=new THREE.BoxGeometry(1,1,1);
  geo.translate(0,.5,0);                           /* stand the box on the ground */
  var officeGeo=new THREE.CylinderGeometry(.64,.72,1,10,1,false);officeGeo.translate(0,.5,0);
  var factoryGeo=new THREE.BoxGeometry(1,1,1,2,1,2);factoryGeo.translate(0,.5,0);
  var bunkerGeo=new THREE.CylinderGeometry(.68,.82,1,8,1,false);bunkerGeo.translate(0,.5,0);
  cityMat=new THREE.MeshPhongMaterial({map:residentialSkin,flatShading:true,
    shininess:10,color:0xffffff});
  var officeMat=new THREE.MeshPhongMaterial({map:cityFacadeSkin,flatShading:true,
    shininess:12,color:0xffffff});
  var factoryMat=new THREE.MeshPhongMaterial({map:factorySkin,flatShading:true,
    shininess:9,color:0xffffff});
  var bunkerMat=new THREE.MeshPhongMaterial({map:bunkerSkin,flatShading:true,
    shininess:3,color:0xffffff});
  cityRoofMat=new THREE.MeshPhongMaterial({map:cityRoofSkin,flatShading:true,
    shininess:7,color:0xffffff});
  cityNightMats=[cityMat,officeMat,factoryMat,bunkerMat];
  var families=[[],[],[],[]],roofProps=[],upperTiers=[],windowBands=[];
  var TONES=[0xc9b99d,0x9fb4bd,0xd2c4a8,0x96aaa3,0xb9a58e,0x929fac];
  for(var i=0;i<lots.length;i++){
    var L=lots[i],r1=hash(L[0]*.071,L[1]*.113),r2=hash(L[1]*.091,L[0]*.053);
    var type=r2<.48?0:(r2<.72?1:(r2<.90?2:3));
    var w=50+r2*46,d2=50+r1*46,h=24+L[3]*CITY_TOP*(.28+.72*r1*r1);
    if(type===2){w*=1.38;d2*=1.25;h=Math.min(h,62);} /* factories spread out */
    if(type===3){w*=1.15;d2*=1.15;h=Math.min(h,34);} /* bunkers stay low */
    var tone=TONES[(i*3+((r2*97)|0))%TONES.length];
    families[type].push([L[0],L[1],L[2]-5,w,h,d2,tone,.84+r1*.28]);
    if(type<2){
      var floors=Math.min(10,Math.max(2,Math.floor(h/18)));
      for(var fl=1;fl<floors;fl++){
        var fy=L[2]-5+fl*h/floors;
        windowBands.push([L[0],L[1]-d2*.505,fy,w*.82,1.8,.8]);
        windowBands.push([L[0],L[1]+d2*.505,fy,w*.82,1.8,.8]);
      }
    }
    /* Taller office/residential blocks step inward instead of ending as one
       giant box. The second mass creates real rooflines and changing parallax. */
    if(type<2&&h>82)upperTiers.push([L[0],L[1],L[2]-5+h,w*.68,h*.28,d2*.68,tone,.92]);
    if(type!==3&&hash(L[0]*.13,L[1]*.17)>.72)
      roofProps.push([L[0]+(r2-.5)*w*.3,L[1]+(r1-.5)*d2*.3,L[2]-5+h,
        10+r1*15,4+r2*6,9+r2*13]);
  }
  var walls=[cityMat,officeMat,factoryMat,bunkerMat];
  var familyGeo=[geo,officeGeo,factoryGeo,bunkerGeo];
  var m=new THREE.Matrix4(),q=new THREE.Quaternion(),
      pos=new THREE.Vector3(),scl=new THREE.Vector3(),col=new THREE.Color();
  for(var fi=0;fi<families.length;fi++){
    var list=families[fi],wall=walls[fi];
    /* Each district family has a different physical footprint. Office and
       bunker profiles break the previous all-box skyline. */
    var city=new THREE.InstancedMesh(familyGeo[fi],
      fi===0||fi===2?[wall,wall,cityRoofMat,wall,wall,wall]:[wall,cityRoofMat,wall],list.length);
    city.frustumCulled=false;
    for(var bi=0;bi<list.length;bi++){
      var B=list[bi];pos.set(B[0],B[2],B[1]);scl.set(B[3],B[4],B[5]);
      m.compose(pos,q,scl);city.setMatrixAt(bi,m);
      col.setHex(B[6]).multiplyScalar(B[7]);city.setColorAt(bi,col);
    }
    city.instanceMatrix.needsUpdate=true;
    if(city.instanceColor)city.instanceColor.needsUpdate=true;
    proceduralCity.add(city);
  }
  var tierMats=[officeMat,officeMat,cityRoofMat,officeMat,officeMat,officeMat];
  var tiers=new THREE.InstancedMesh(geo,tierMats,upperTiers.length);
  tiers.frustumCulled=false;
  for(var ti=0;ti<upperTiers.length;ti++){
    var U=upperTiers[ti];pos.set(U[0],U[2],U[1]);scl.set(U[3],U[4],U[5]);
    m.compose(pos,q,scl);tiers.setMatrixAt(ti,m);
    col.setHex(U[6]).multiplyScalar(U[7]);tiers.setColorAt(ti,col);
  }
  tiers.instanceMatrix.needsUpdate=true;
  if(tiers.instanceColor)tiers.instanceColor.needsUpdate=true;
  proceduralCity.add(tiers);
  /* Dark recessed glazing bands are actual geometry. They preserve detail at
     oblique angles and night lighting instead of asking one facade bitmap to
     represent every differently proportioned tower. */
  var glassMat=new THREE.MeshPhongMaterial({color:0x182937,emissive:0x08131d,
    shininess:96,flatShading:false});
  var bands=new THREE.InstancedMesh(geo,glassMat,windowBands.length);
  for(var wi=0;wi<windowBands.length;wi++){
    var W=windowBands[wi];pos.set(W[0],W[2],W[1]);scl.set(W[3],W[4],W[5]);
    m.compose(pos,q,scl);bands.setMatrixAt(wi,m);
  }
  bands.instanceMatrix.needsUpdate=true;bands.frustumCulled=false;proceduralCity.add(bands);
  /* Rooftop HVAC/generator boxes are separate geometry and keep their own
     texel scale, so the equipment reads as hardware instead of painted roofs. */
  var propMat=new THREE.MeshPhongMaterial({map:rooftopSkin,color:0xffffff,shininess:25});
  var props=new THREE.InstancedMesh(geo,propMat,roofProps.length);
  for(var pi=0;pi<roofProps.length;pi++){
    var P=roofProps[pi];pos.set(P[0],P[2],P[1]);scl.set(P[3],P[4],P[5]);
    m.compose(pos,q,scl);props.setMatrixAt(pi,m);
  }
  props.instanceMatrix.needsUpdate=true;props.frustumCulled=false;proceduralCity.add(props);
})();

/* Collapse scars, barricades and rubble make the lower city read as a place
   that failed, not a clean collection of occupied tower blocks. These remain
   separate from terrain collision so streets stay reliably traversable. */
(function buildRuinedStreets(){
  var ruinMat=new THREE.MeshPhongMaterial({map:bunkerSkin,color:0x756f67,flatShading:true,shininess:2});
  var rustMat=new THREE.MeshPhongMaterial({map:aviationHardwareSkin,color:0x704a38,flatShading:true,shininess:8});
  var slabGeo=new THREE.BoxGeometry(1,1,1),m=new THREE.Matrix4(),q=new THREE.Quaternion(),
      p=new THREE.Vector3(),s=new THREE.Vector3(),up=new THREE.Vector3(0,1,0),count=LOW?90:190;
  var rubble=new THREE.InstancedMesh(slabGeo,ruinMat,count*3);
  for(var i=0;i<count;i++){
    var a=hash(i*2.7,4.1)*Math.PI*2,r=240+hash(i*7.3,9.2)*(CITY_REACH-300);
    var x=Math.cos(a)*r,z=Math.sin(a)*r,gy=ground(x,z);
    for(var j=0;j<3;j++){
      p.set(x+(hash(i,j*4.2)-.5)*24,gy+1.2+j*.35,z+(hash(j*8.4,i)-.5)*24);
      q.setFromEuler(new THREE.Euler((hash(i,j)-.5)*.45,a+j*1.7,(hash(j,i)-.5)*.55));
      s.set(5+hash(i,j+2)*12,1.2+hash(j,i+8)*3,3+hash(i+5,j)*9);
      m.compose(p,q,s);rubble.setMatrixAt(i*3+j,m);
    }
  }
  rubble.instanceMatrix.needsUpdate=true;rubble.frustumCulled=false;scene.add(rubble);
  var barriers=new THREE.InstancedMesh(new THREE.BoxGeometry(8,2.2,1.1),rustMat,LOW?26:54);
  for(var k=0;k<(LOW?26:54);k++){
    var lane=(k%2?670:-670),along=-1500+k*59;
    p.set(along,ground(along,lane)+1.1,lane+(hash(k,22)-.5)*18);
    q.setFromAxisAngle(up,(hash(k,33)-.5)*.45);s.set(1,1,1);m.compose(p,q,s);barriers.setMatrixAt(k,m);
  }
  barriers.instanceMatrix.needsUpdate=true;barriers.frustumCulled=false;scene.add(barriers);
})();
