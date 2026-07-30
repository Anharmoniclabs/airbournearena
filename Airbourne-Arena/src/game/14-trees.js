/* --- 3D conifer belts ---
   Each tree has a trunk and three offset foliage masses. This keeps one-digit
   draw calls through instancing but breaks the old single-cone silhouette. */
(function buildForest(){
  var spots=[];
  for(var x=-3200;x<=3200;x+=125)for(var z=-1450;z<=1450;z+=125){
    var jitterX=(hash(x*.021,z*.017)-.5)*82,jitterZ=(hash(z*.019,x*.023)-.5)*82;
    var tx=x+jitterX,tz=z+jitterZ,d=Math.hypot(tx,tz),h=ground(tx,tz);
    if(d<CITY_REACH*1.05||h<12||h>185||arenaDistance(tx,tz)>ARENA_RADIUS-90)continue;
    if(Math.min(Math.abs(tz),Math.abs(tz-900),Math.abs(tz+900))<92)continue;
    if(Math.min(Math.abs(tx),Math.abs(tx-1200),Math.abs(tx+1200))<92)continue;
    if(Math.min(Math.hypot(tx-BASE_X,tz),Math.hypot(tx+BASE_X,tz))<430)continue;
    if(hash(tx*.031,tz*.037)<(LOW?.57:.34))continue;
    spots.push([tx,tz,h,18+hash(tx*.043,tz*.029)*24]);
  }
  var geo=new THREE.DodecahedronGeometry(1,1);
  var mat=new THREE.MeshPhongMaterial({map:foliageSkin,color:0xb7c99c,shininess:0,flatShading:false});
  var forest=new THREE.InstancedMesh(geo,mat,spots.length*3);
  var trunkGeo=new THREE.CylinderGeometry(1,1,1,7);trunkGeo.translate(0,.5,0);
  var trunkMat=new THREE.MeshPhongMaterial({map:aviationHardwareSkin,color:0x5d4b36,shininess:0});
  var trunks=new THREE.InstancedMesh(trunkGeo,trunkMat,spots.length);
  var m=new THREE.Matrix4(),q=new THREE.Quaternion(),pos=new THREE.Vector3(),scl=new THREE.Vector3();
  var up=new THREE.Vector3(0,1,0);
  for(var i=0;i<spots.length;i++){
    var T=spots[i],r=T[3]*.32,rot=hash(T[0],T[1])*6.283;
    q.setFromAxisAngle(up,rot);
    pos.set(T[0],T[2]-2,T[1]);scl.set(r*.18,T[3]*.72,r*.18);
    m.compose(pos,q,scl);trunks.setMatrixAt(i,m);
    for(var crown=0;crown<3;crown++){
      var spread=1-crown*.20,side=(hash(T[0]+crown*13,T[1]-crown*17)-.5)*r*.22;
      pos.set(T[0]+Math.cos(rot)*side,T[2]+T[3]*(.34+crown*.22),T[1]+Math.sin(rot)*side);
      scl.set(r*spread,T[3]*(.25-crown*.025),r*spread);
      m.compose(pos,q,scl);forest.setMatrixAt(i*3+crown,m);
    }
  }
  forest.instanceMatrix.needsUpdate=true;forest.frustumCulled=false;scene.add(forest);
  trunks.instanceMatrix.needsUpdate=true;trunks.frustumCulled=false;scene.add(trunks);
})();

